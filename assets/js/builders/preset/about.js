// "About this preset": its name, how it is sent, its display scripts, its own
// styles, the extra request fields, taking it elsewhere, and deleting it
// (Aetheria's PresetSheet.js and src/sheets/PresetScripts.js). A script's
// "Try it on" runs the real engine (stRegex.js) and the passage's style
// lifting (passageStyles.js); the result is drawn through a small sanitising
// reader, since Aetheria's markdown renderer is a React component.
import { esc } from '../../ui.js';
import { core } from './core.js';
import {
  button, card, field, fold, iconButton, marginNote, meta, row, segmented, toggle,
} from './bits.js';
import { SAMPLE } from './sample.js';

/* ── display scripts ──────────────────────────────────────────────────────── */

export const SCRIPT_KINDS = [
  { id: 'shows', label: 'How it looks', title: 'Change how a reply looks', aside: 'what you read; the story and the model keep the words' },
  { id: 'sends', label: 'What is sent', title: 'Change what is sent', aside: 'the model reads it so; the page is untouched' },
  { id: 'rewrites', label: 'The message', title: 'Rewrite the message itself', aside: 'as it arrives; kept that way' },
];
export const scriptKindOf = (script) => (script?.markdownOnly ? 'shows' : script?.promptOnly ? 'sends' : 'rewrites');
export const kindPatch = (kind) => ({ markdownOnly: kind === 'shows', promptOnly: kind === 'sends' });
const placementsOf = (script) => (Array.isArray(script?.placement) ? script.placement.map(Number) : []);
export const onWhose = (script) => {
  const p = placementsOf(script);
  if (p.includes(1) && p.includes(2)) return 'both';
  return p.includes(1) ? 'user' : 'ai';
};
const ON_WHOSE = [{ id: 'ai', label: 'Replies' }, { id: 'user', label: 'Yours' }, { id: 'both', label: 'Both' }];
const hasDepth = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(Number(v));

export function describeScript(script) {
  const whose = { ai: 'replies', user: 'yours', both: 'replies and yours' }[onWhose(script)];
  const older = hasDepth(script.minDepth) && Number(script.minDepth) > 0 ? `older than ${script.minDepth} messages` : '';
  const newer = hasDepth(script.maxDepth) && Number(script.maxDepth) >= 0 ? `the newest ${Number(script.maxDepth) + 1} messages` : '';
  const broken = script.findRegex && !core.regex.regexFromString(script.findRegex) ? 'its pattern does not read' : '';
  return [whose, older, newer, broken].filter(Boolean).join(' · ');
}

export const splitRegex = (findRegex) => {
  const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(String(findRegex || ''));
  return m ? { pattern: m[1], flags: m[2] } : { pattern: String(findRegex || ''), flags: 'g' };
};
const FLAGS = [['g', 'Every match'], ['i', 'Any case'], ['m', 'Line by line'], ['s', 'Dot takes new lines']];

/** A new script: a display script that does nothing until it is given a pattern. */
export const newScript = () => ({
  id: `script_${Date.now().toString(36)}`,
  scriptName: 'New script',
  findRegex: '',
  replaceString: '',
  trimStrings: [],
  placement: [2],
  disabled: false,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
});

export const scriptListOf = (draft) => {
  const list = Array.isArray(draft.regexScripts) ? draft.regexScripts : draft.extensions?.regex_scripts;
  return Array.isArray(list) ? list : [];
};

function scriptsCard(app) {
  const scripts = scriptListOf(app.S.draft);
  if (!scripts.length) {
    return card({
      title: 'Display scripts',
      aside: 'none yet',
      body: '<p class="ps-meta">Scripts change what a reply looks like (a tag the model writes, drawn as a card or coloured speech), what is sent of it, or the message itself. Add one, or bring a preset in that has them.</p>',
    });
  }
  const counts = SCRIPT_KINDS.map((k) => [k, scripts.filter((s) => scriptKindOf(s) === k.id).length]).filter(([, n]) => n);
  return card({
    title: 'Display scripts',
    aside: `${scripts.length} · ${counts.map(([k, n]) => `${n} ${{ shows: 'change how a reply looks', sends: 'change what is sent', rewrites: 'rewrite the message' }[k.id]}`).join(', ')}`,
    body: `<div class="ps-find"><input class="input" type="search" placeholder="Find a script…" aria-label="Find a script" value="${esc(app.S.scriptFind)}" data-act="script-find" data-focus="script-find" autocomplete="off"></div>
      <div data-live="script-list">${scriptRows(app)}</div>`,
    cls: 'ps-card-scripts',
  });
}

export function scriptRows(app) {
  const scripts = scriptListOf(app.S.draft);
  const query = app.S.scriptFind.trim().toLowerCase();
  const rows = scripts.map((script, index) => ({ script, index }))
    .filter(({ script }) => !query || `${script.scriptName || ''} ${script.folder || ''}`.toLowerCase().includes(query));
  const rowOf = ({ script, index }) => {
    const open = app.isOpen('script', String(index));
    const name = script.scriptName || 'A script without a name';
    return `<div class="ps-item${open ? ' is-open' : ''}" data-script="${index}">${row({
      labelHtml: `<span data-live="script-name:${index}"${open ? ' class="is-current"' : ''}>${esc(name)}</span>`,
      hint: describeScript(script),
      control: `<span class="ps-ctl-pair">${toggle({ checked: !script.disabled, label: `${name} on`, act: 'script-on', data: { i: String(index) }, focus: `script-on:${index}` })}${iconButton({ icon: 'edit', label: `Change ${name}`, act: 'script-open', data: { i: String(index) }, current: open, focus: `script-open:${index}` })}</span>`,
    })}${open ? scriptEditor(app, script, index) : ''}</div>`;
  };
  const out = SCRIPT_KINDS.map((kind) => {
    const ofKind = rows.filter(({ script }) => scriptKindOf(script) === kind.id);
    if (!ofKind.length) return '';
    const folders = [...new Set(ofKind.map(({ script }) => script.folder || ''))];
    const inner = folders.length === 1 && !folders[0] ? ofKind.map(rowOf).join('') : folders.map((folder) => {
      const inFolder = ofKind.filter(({ script }) => (script.folder || '') === folder);
      const on = inFolder.filter(({ script }) => !script.disabled).length;
      const opened = Boolean(query) || inFolder.some(({ index }) => app.isOpen('script', String(index))) || app.S.folds[`folder:${kind.id}:${folder}`];
      return fold({ title: folder || 'Not in a folder', aside: `${on} of ${inFolder.length} on`, body: inFolder.map(rowOf).join(''), open: opened, id: `folder:${kind.id}:${folder}`, cls: 'ps-fold-inner' });
    }).join('');
    return `<p class="sheet-group-label ps-kind-label">${esc(kind.title)}</p><p class="ps-meta">${esc(kind.aside)}</p>${inner}`;
  }).join('');
  return out + (query && !rows.length ? meta('No script is called that.') : '');
}

function scriptEditor(app, script, index) {
  const { pattern, flags } = splitRegex(script.findRegex);
  const kind = scriptKindOf(script);
  const folders = [...new Set(scriptListOf(app.S.draft).map((x) => x?.folder).filter(Boolean))];
  const i = String(index);
  const asking = app.S.confirm === `script:${index}`;
  return `<div class="ps-editor" data-editor="script:${index}">
    <header class="ps-editor-head"><div><p class="panel-sub">A display script</p><h4 class="ps-editor-title" data-live="script-title:${index}">${esc(script.scriptName || 'A script without a name')}</h4></div>${iconButton({ icon: 'close', label: 'Close this script', act: 'script-open', data: { i }, focus: `script-close:${index}` })}</header>
    ${toggle({ checked: !script.disabled, label: 'On', text: 'On', act: 'script-on', data: { i }, focus: `script-on-ed:${index}` })}
    ${field({ label: 'The script’s name', control: `<input class="input" value="${esc(script.scriptName || '')}" data-act="script-name" data-i="${i}" data-focus="script-name:${index}" autocomplete="off">` })}
    ${field({ label: 'Its folder', hint: 'Scripts in one folder sit together in the list.', control: `<input class="input" value="${esc(script.folder || '')}" list="preset-script-folders" data-act="script-folder" data-i="${i}" data-focus="script-folder:${index}" autocomplete="off"><datalist id="preset-script-folders">${folders.map((f) => `<option value="${esc(f)}"></option>`).join('')}</datalist>` })}
    ${field({ label: 'What it does', group: true, control: segmented({ act: 'script-kind', value: kind, options: SCRIPT_KINDS, data: { i }, label: 'What it does' }) })}
    <div class="ps-inline">
      ${field({ label: 'On', group: true, control: segmented({ act: 'script-whose', value: onWhose(script), options: ON_WHOSE, data: { i }, label: 'On' }) })}
      ${field({ label: 'Only older than', hint: 'Messages from the end; empty is every one', control: `<input class="input mono ps-num" type="number" min="0" placeholder="·" value="${esc(hasDepth(script.minDepth) ? script.minDepth : '')}" data-act="script-min" data-i="${i}" data-focus="script-min:${index}">` })}
    </div>
    ${field({ label: 'Find', hint: 'A regular expression', control: `<input class="input mono" value="${esc(pattern)}" data-act="script-pattern" data-i="${i}" data-focus="script-pattern:${index}" autocomplete="off" spellcheck="false">` })}
    <p class="ps-meta ps-error" role="alert" data-live="script-err:${index}">${esc(patternError(pattern, flags))}</p>
    <div class="chip-row">${FLAGS.map(([f, label]) => `<button type="button" class="chip" aria-pressed="${flags.includes(f)}" data-act="script-flag" data-i="${i}" data-flag="${f}" data-focus="script-flag:${index}:${f}">${esc(label)}</button>`).join('')}</div>
    ${field({ label: 'Replace with', hint: '$1, $2… for what it caught; {{match}} for all of it; {{char}} and {{user}} too', control: `<textarea class="textarea mono" rows="4" data-act="script-replace" data-i="${i}" data-focus="script-replace:${index}" spellcheck="false">${esc(script.replaceString || '')}</textarea>` })}
    ${field({ label: 'Try it on', hint: 'A reply as the model writes it. Nothing here is kept.', control: `<textarea class="textarea" rows="3" data-act="script-sample" data-i="${i}" data-focus="script-sample:${index}">${esc(app.S.scriptSamples[index] || '')}</textarea>` })}
    <div data-live="script-try:${index}">${scriptTry(app, script, index)}</div>
    ${asking
    ? `<div class="ps-confirm" role="alertdialog" aria-label="${esc(`Delete ${script.scriptName || 'the script'}?`)}"><p><strong>${esc(`Delete ${script.scriptName || 'the script'}?`)}</strong> Passages show what it changed as the model wrote it.</p><div class="btn-row">${button({ text: 'Delete', act: 'script-delete', data: { i }, cls: 'btn-danger' })}${button({ text: 'Cancel', act: 'ask-cancel', cls: 'btn-ghost' })}</div></div>`
    : `<div class="btn-row">${button({ text: 'Duplicate', act: 'script-dup', data: { i } })}${button({ text: 'Delete', act: 'ask', data: { ask: `script:${index}` }, cls: 'btn-danger' })}</div>`}
  </div>`;
}

function patternError(pattern, flags) {
  if (!pattern) return '';
  try { new RegExp(pattern, flags); return ''; } catch (e) { return `This pattern does not read: ${e.message}`; }
}

/** "Try it on": the script run on the sample, as it reads (shows) or as it becomes (sends, rewrites). */
export function scriptTry(app, script, index) {
  const sample = app.S.scriptSamples[index] || '';
  const { pattern, flags } = splitRegex(script.findRegex);
  if (!sample || patternError(pattern, flags)) return '';
  const kind = scriptKindOf(script);
  const out = core.regex.runRegexScript({ ...script, disabled: false }, sample, { macroContext: { user: 'You', char: 'Them' } });
  if (kind !== 'shows') {
    return `<p class="ps-meta">As it becomes</p><pre class="ps-pre ps-try-box">${esc(out)}</pre>`;
  }
  const scope = `[data-script-try="${index}"]`;
  const lifted = core.styles.extractPassageStyles(out);
  const css = lifted.css ? offline(core.styles.scopePassageCss(lifted.css, scope)) : '';
  return `<p class="ps-meta">As it reads</p><div class="ps-try-box ps-passage" data-script-try="${index}">${css ? `<style>${css.replace(/<\/style/gi, '')}</style>` : ''}${passageHtml(lifted.html)}</div>`;
}

/* ── its own styles ───────────────────────────────────────────────────────── */

const DEFAULT_STYLE_SAMPLE = core.macros.substituteMacros(SAMPLE.character.first_mes.split('\n\n').slice(-3).join('\n\n'), { user: SAMPLE.persona.name, char: SAMPLE.character.name });

function stylesCard(app) {
  const styles = core.request.stylesOf(app.S.draft);
  return card({
    title: 'Its own styles',
    aside: 'CSS for its passages, kept to them',
    body: `<label class="field ps-field"><span class="sr-only">Its own styles</span><textarea class="textarea mono ps-styles" rows="6" data-path="styles" data-kind="text" aria-label="Its own styles" placeholder="${esc('.hud { border-left: 2px solid var(--accent-strong); }\n@keyframes glow { 50% { opacity: 0.6; } }')}" data-focus="styles" spellcheck="false">${esc(styles)}</textarea></label>
      <p class="ps-meta" data-live="styles-note">${esc(stylesNote(styles))}</p>
      ${fold({
    title: 'A passage, as it reads',
    aside: 'its display scripts and styles',
    id: 'style-try',
    open: app.S.folds['style-try'],
    body: `<label class="field ps-field"><span class="field-label">A reply to try them on</span><textarea class="textarea" rows="4" data-act="style-sample" data-focus="style-sample">${esc(app.S.styleSample ?? DEFAULT_STYLE_SAMPLE)}</textarea><span class="field-hint">Nothing here is kept. The preset’s display scripts for replies run first, then its styles.</span></label>
          <div data-live="style-try">${stylePreview(app)}</div>`,
  })}`,
    cls: 'ps-card-styles',
  });
}

export const stylesNote = (styles) => {
  const kept = styles.trim() ? core.styles.scopePassageCss(styles, '.passage') : '';
  return styles.trim() && !kept
    ? 'Nothing here is kept: each rule needs a selector and a { … } body.'
    : 'Applied to the passages of stories told with this preset, and never to the app around them. Pictures only from https; @import and fonts are left out.';
};

/** The sample reply with the preset's reply display scripts run over it and its styles kept to it. */
export function stylePreview(app) {
  const text = app.S.styleSample ?? DEFAULT_STYLE_SAMPLE;
  if (!text.trim()) return '';
  const scripts = scriptListOf(app.S.draft);
  const shown = core.regex.applyRegexScripts(text, scripts, { kind: 'display', placement: core.regex.REGEX_PLACEMENT.AI_OUTPUT, depth: 0, macroContext: { user: SAMPLE.persona.name, char: SAMPLE.character.name } });
  const lifted = core.styles.extractPassageStyles(shown);
  const scope = '[data-style-try]';
  const css = offline([lifted.css ? core.styles.scopePassageCss(lifted.css, scope) : '', core.styles.scopePassageCss(core.request.stylesOf(app.S.draft), scope)].filter(Boolean).join('\n'));
  return `<div class="ps-try-box ps-passage" data-style-try>${css ? `<style>${css.replace(/<\/style/gi, '')}</style>` : ''}${passageHtml(lifted.html)}</div>`;
}

/* ── extra request fields ─────────────────────────────────────────────────── */

export function requestFieldsHtml(app) {
  const { request: rq } = core;
  const fields = rq.requestFieldsOf(app.S.draft);
  const on = fields.filter((f) => f.enabled && !rq.fieldProblem(f)).length;
  const brought = fields.filter((f) => f.from && !f.enabled).length;
  const rows = fields.map((f, i) => {
    const problem = f.key || f.value ? rq.fieldProblem(f) : '';
    const name = f.key || `Field ${i + 1}`;
    return `<div class="ps-rf" data-rf="${i}">
      <div class="ps-rf-pair">
        <input class="input mono" aria-label="Field ${i + 1}, its name" placeholder="service_tier" value="${esc(f.key)}" data-act="rf-key" data-i="${i}" data-focus="rf-key:${i}" autocomplete="off" spellcheck="false">
        <input class="input mono" aria-label="${esc(`${name}, its value`)}" placeholder="&quot;flex&quot;" value="${esc(f.value)}" data-act="rf-value" data-i="${i}" data-focus="rf-value:${i}" autocomplete="off" spellcheck="false">
      </div>
      <div class="ps-rf-line">
        <select class="select" aria-label="${esc(`${name}, sent to`)}" data-act="rf-to" data-i="${i}" data-focus="rf-to:${i}">${rq.FIELD_TARGETS.map((t) => `<option value="${t.id}"${t.id === f.to ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
        ${toggle({ checked: f.enabled, label: `Send ${f.key || `field ${i + 1}`}`, act: 'rf-on', data: { i: String(i) } })}
        <span class="spacer"></span>
        ${iconButton({ icon: 'close', label: `Remove ${f.key || `field ${i + 1}`}`, act: 'rf-remove', data: { i: String(i) } })}
      </div>
      <p class="ps-meta${problem ? ' ps-error' : ''}"${problem ? ' role="alert"' : ''} data-live="rf-note:${i}">${esc(problem || (f.from ? `From ${f.from}.` : ''))}</p>
    </div>`;
  }).join('');
  return fold({
    title: 'Extra request fields',
    aside: fields.length ? `${on} of ${fields.length} on` : 'none',
    id: 'request',
    open: app.S.folds.request ?? fields.length > 0,
    body: `<p class="ps-meta">Added to a story reply’s request as they are, for settings a provider takes that Aetheria has no switch for. A value is JSON: "flex", 0.5, true, or an object.${brought ? ` ${brought} came with the preset when it was brought in, switched off until you turn them on.` : ''}</p>
      ${rows}
      <div>${button({ text: 'Add a field', act: 'rf-add', cls: 'btn-ghost' })}</div>
      ${fields.length ? `<div class="ps-rf-preview">${field({ label: 'What a request to this provider carries', control: `<select class="select" data-act="rf-preview" data-focus="rf-preview">${rq.FIELD_TARGETS.filter((t) => t.id !== 'all').map((t) => { const v = t.id === 'local' ? 'ollama' : t.id; return `<option value="${v}"${v === app.S.previewFor ? ' selected' : ''}>${esc(t.label)}</option>`; }).join('')}</select>` })}
        <pre class="ps-pre" data-live="rf-body">${esc(requestBody(app))}</pre>
        <p class="ps-meta">${esc(`Aetheria always sends ${rq.PROTECTED_FIELDS.join(', ')} itself; a field named for one of them is not sent.`)}</p></div>` : ''}`,
    cls: 'ps-fold-request',
  });
}

export function requestBody(app) {
  const sent = core.request.extraBodyFor({ requestFields: core.request.requestFieldsOf(app.S.draft) }, app.S.previewFor);
  return Object.keys(sent).length ? JSON.stringify(sent, null, 2) : 'Nothing extra.';
}

/* ── the section ─────────────────────────────────────────────────────────── */

const REASONING = [['auto', 'Auto'], ['minimal', 'Minimal'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
const REASONING_MORE = { xhigh: 'Extra high', max: 'Max' };

export function aboutHead() {
  return {
    eyebrow: 'About this preset',
    sub: 'Its name, how it is sent, its scripts and styles, and taking it elsewhere.',
    actions: button({ text: 'Add a script', act: 'script-add' }),
  };
}

export function aboutBody(app) {
  const draft = app.S.draft;
  const stMode = core.assembler.isSillyTavernPreset(draft);
  const effort = draft.reasoning_effort || 'auto';
  const issues = core.stPreset.validatePreset(draft).issues;
  const sentRows = [
    row({
      label: 'Use the list builder',
      hint: stMode
        ? 'Blocks are sent in list order with their roles, macros and depth injections (exactly as chat-completion presets expect), and Aetheria’s own context sits in the order as blocks you can move.'
        : 'The classic builder arranges blocks by position, depth and order into one system prompt. Turning this on keeps that order and moves the preset to the list builder.',
      control: toggle({ checked: stMode, label: 'Use the list builder', act: 'list-builder' }),
    }),
  ];
  if (stMode) {
    sentRows.push(
      row({ label: 'Speaker names', hint: 'How names are added to chat messages', control: `<select class="select ps-select" aria-label="Speaker names" data-act="names" data-focus="names">${[['-1', 'Never'], ['0', 'Only in group stories'], ['2', 'Always, inside the message']].map(([v, l]) => `<option value="${v}"${String(draft.names_behavior ?? 0) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` }),
      row({ label: 'Merge consecutive system blocks', hint: 'squash_system_messages, in the preset file', control: toggle({ checked: draft.squash_system_messages === true, label: 'Merge consecutive system blocks', act: 'squash' }) }),
      row({ label: 'Reasoning effort', hint: 'Sent to providers that support it', control: `<select class="select ps-select" aria-label="Reasoning effort" data-act="effort" data-focus="effort">${REASONING.map(([v, l]) => `<option value="${v}"${v === effort ? ' selected' : ''}>${l}</option>`).join('')}${!REASONING.some(([v]) => v === effort) ? `<option value="${esc(effort)}" selected>${esc(REASONING_MORE[effort] || effort)}</option>` : ''}</select>` }),
      `<label class="field ps-field"><span class="field-label">Assistant prefill</span><textarea class="textarea" rows="2" data-path="assistant_prefill" data-kind="text" data-focus="prefill">${esc(draft.assistant_prefill || '')}</textarea><span class="field-hint">Starts the reply with this text (Claude models only; the margin says which)</span></label>`,
    );
  }
  sentRows.push(`<div data-live="request-fields">${requestFieldsHtml(app)}</div>`);

  const notice = app.S.notice ? `<p class="ps-meta${app.S.notice.error ? ' ps-error' : ''}" role="${app.S.notice.error ? 'alert' : 'status'}">${esc(app.S.notice.text)}</p>` : '';
  const asking = app.S.confirm === 'preset';
  const notes = `<div class="ps-notes" aria-label="About this preset">
    ${marginNote('Exported', 'The file is a chat-completion preset, which other chat apps that take such presets read. Aetheria’s own blocks are left out; the card’s picture goes with it and comes back on import into Aetheria.')}
    ${stMode ? marginNote('The prefill', 'Sent only to Claude, through Anthropic or an Anthropic-format proxy (not through OpenRouter), and not to Claude models from 4.6 on, which refuse it (Haiku still takes it).') : ''}
    ${marginNote('Kept here', 'This preset lives in this browser until you export it. Bring the file into Aetheria, or into any app that reads chat-completion presets.')}
  </div>`;

  return `<div class="ps-room"><div class="ps-room-main">
    ${card({ title: 'Its name', body: `<input class="input ps-name" aria-label="Name" data-path="name" data-kind="text" value="${esc(draft.name || '')}" placeholder="Aetheria Storyteller" data-focus="preset-name" autocomplete="off">` })}
    ${card({ title: 'How it is sent', body: sentRows.join('') })}
    ${scriptsCard(app)}
    ${stylesCard(app)}
    ${card({
    title: 'Export and copy',
    aside: 'chat-completion format',
    body: `<div class="btn-row">${button({ text: 'Export preset', act: 'export', cls: 'btn-gilt' })}${button({ text: 'Duplicate', act: 'duplicate' })}</div>${notice}
      ${issues.length ? `<div class="ps-issues" role="status"><p class="ps-meta">Worth a look before it goes:</p><ul>${issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`,
  })}
    ${card({
    title: 'Danger zone',
    cls: 'ps-card-danger',
    body: `<p class="ps-meta">Deleting a preset here removes it from this browser. Stories in Aetheria that already used it are not altered.</p>
      ${asking ? `<div class="ps-confirm" role="alertdialog" aria-label="${esc(`Delete ${draft.name || 'this preset'}?`)}"><p><strong>${esc(`Delete ${draft.name || 'this preset'}?`)}</strong> This cannot be undone. Export it first to keep a copy.</p><div class="btn-row">${button({ text: 'Delete', act: 'preset-delete', cls: 'btn-danger' })}${button({ text: 'Cancel', act: 'ask-cancel', cls: 'btn-ghost' })}</div></div>`
    : `<div>${button({ text: 'Delete preset', act: 'ask', data: { ask: 'preset' }, cls: 'btn-danger' })}</div>`}`,
  })}
  </div>${notes}</div>`;
}

/* ── a passage's HTML, drawn safely ───────────────────────────────────────── */

const BLOCK_START = /^<\/?(div|details|summary|p|blockquote|ul|ol|li|table|thead|tbody|tr|section|pre|h[1-6]|hr|figure|center|article|header|footer|dl|style)\b/i;

function inline(text) {
  return text.split(/(<[^>]+>)/g).map((part, i) => (i % 2 ? part : part
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>'))).join('');
}

/** A little of what a markdown reader does: paragraphs, emphasis, code, headings, quotes and lists. */
export function miniMarkdown(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => {
    const t = block.trim();
    if (!t) return '';
    if (BLOCK_START.test(t)) return t;
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h && !t.includes('\n')) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    if (/^>/.test(t)) return `<blockquote>${inline(t.replace(/^>\s?/gm, '')).replace(/\n/g, '<br>')}</blockquote>`;
    const lines = t.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${inline(t).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'span', 'div', 'details', 'summary', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'small', 'sub', 'sup', 'mark', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'img', 'q', 'abbr', 'font', 'center', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'ruby', 'rt', 'rp', 'dl', 'dt', 'dd', 'kbd', 'var', 'cite', 'big', 'tt', 'wbr']);
const DROPPED = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option', 'noscript', 'template', 'svg', 'math', 'audio', 'video', 'source', 'canvas', 'title', 'head']);
const ATTRS = new Set(['class', 'style', 'title', 'open', 'colspan', 'rowspan', 'align', 'color', 'face', 'size', 'alt', 'width', 'height', 'lang', 'dir', 'data-passage-var', 'start', 'reversed', 'type']);

/** Nothing is fetched while trying a preset: a picture from the web in its CSS is left out here. */
export const offline = (css) => String(css || '').replace(/url\(\s*(?!['"]?data:)[^)]*\)/gi, 'none');

const safeStyle = (style) => core.styles.widenPassageCard(offline(String(style)
  .replace(/expression\s*\(/gi, 'blocked(')
  .replace(/behavior\s*:[^;]*;?/gi, '')
  .replace(/-moz-binding\s*:[^;]*;?/gi, '')
  .replace(/position\s*:\s*fixed/gi, 'position:absolute')));

function clean(node, doc) {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === 8) { child.remove(); return; }
    if (child.nodeType !== 1) return;
    const tag = child.tagName.toLowerCase();
    if (DROPPED.has(tag)) { child.remove(); return; }
    clean(child, doc);
    if (!ALLOWED.has(tag)) { child.replaceWith(...child.childNodes); return; }
    [...child.attributes].forEach((a) => {
      const name = a.name.toLowerCase();
      if (!ATTRS.has(name) && !(tag === 'img' && name === 'src')) { child.removeAttribute(a.name); return; }
      if (name === 'style') child.setAttribute('style', safeStyle(a.value));
      // Only pictures carried in the text itself: nothing is fetched from the web here.
      if (name === 'src' && !/^data:image\//i.test(a.value.trim())) child.removeAttribute('src');
    });
    if (tag === 'img') { child.setAttribute('loading', 'lazy'); child.setAttribute('referrerpolicy', 'no-referrer'); }
  });
}

/** A passage's HTML (a display script's output) as the page may show it: read as markdown, then sanitised. */
export function passageHtml(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${miniMarkdown(html)}</body>`, 'text/html');
  clean(doc.body, doc);
  return doc.body.innerHTML;
}
