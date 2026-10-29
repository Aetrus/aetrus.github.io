// The Preset sheet's dials, panels, "When it's sent" and "What it remembers",
// after Aetheria's src/sheets/PresetDials.js, PresetPanels.js, BlockWhen.js
// and PresetRemembers.js. Each opens in the sheet beneath its row.
import { esc } from '../../ui.js';
import { core } from './core.js';
import {
  button, card, field, fold, iconButton, meta, row, segmented, toggle,
} from './bits.js';

/* ── dials ──────────────────────────────────────────────────────────────── */

/** A dial's control, as the sheet shows it. `where` keeps the card's and the editor's apart. */
export function dialControl(dial, value, where) {
  const data = { name: dial.name };
  const focus = `dialv:${where}:${dial.name}`;
  if (dial.kind === 'pick') {
    if (dial.options.length <= 4) {
      return segmented({ act: 'dial-value', value, options: dial.options.map((o) => ({ id: o, label: o })), data, label: dial.label, focus });
    }
    return `<select class="select ps-dial-select" aria-label="${esc(dial.label)}" data-act="dial-value" data-name="${esc(dial.name)}" data-focus="${esc(focus)}">${dial.options.map((o) => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  if (dial.kind === 'switch') return toggle({ checked: Boolean(value), label: dial.label, act: 'dial-value', data, focus });
  if (dial.kind === 'number') {
    return `<span class="ps-dial-number"><input type="range" class="range" aria-label="${esc(dial.label)}" min="${esc(dial.min)}" max="${esc(dial.max)}" step="${esc(dial.step)}" value="${esc(value)}" data-act="dial-value" data-name="${esc(dial.name)}" data-focus="${esc(focus)}"><output class="mono" data-live="dialv:${esc(dial.name)}">${esc(dial.unit ? `${value} ${dial.unit}` : value)}</output></span>`;
  }
  return `<input class="input ps-dial-text" aria-label="${esc(dial.label)}" value="${esc(value)}" data-act="dial-value" data-name="${esc(dial.name)}" data-focus="${esc(focus)}" autocomplete="off">`;
}

export function dialsCardHtml(app) {
  const d = app.d();
  if (!d.dials.length) return '';
  const read = app.read();
  const readIn = Object.fromEntries(read.variables.filter((v) => v.dial).map((v) => [v.name, v.readIn.length]));
  const rows = d.dials.map((dial) => {
    const used = readIn[dial.name] || 0;
    const open = app.isOpen('dial', dial.name);
    return `<div class="ps-item${open ? ' is-open' : ''}" data-dial="${esc(dial.name)}">${row({
      labelHtml: `<span${open ? ' class="is-current"' : ''}>${esc(dial.label)}</span>`,
      hint: [dial.line, used ? `Read in ${used} ${used === 1 ? 'block' : 'blocks'}.` : 'No block reads it yet.'].filter(Boolean).join(' '),
      control: `<span class="ps-ctl-pair">${dialControl(dial, dial.value, 'card')}${iconButton({ icon: 'edit', label: `Change the dial ${dial.label}`, act: 'dial-open', data: { name: dial.name }, current: open, focus: `dial-open:${dial.name}` })}</span>`,
    })}${open ? dialEditor(app, dial, read) : ''}</div>`;
  }).join('');
  return card({
    title: 'Dials',
    aside: `${d.dials.length} · read by the blocks below`,
    body: `<p class="ps-meta">Settings this preset offers, at their starting values. A block reads one where it says {{.name}}; each story can set its own in its Story Index.</p>${rows}`,
    cls: 'ps-card-dials',
  });
}

function dialEditor(app, dial, read) {
  const usedIn = read.variables.find((v) => v.name === dial.name)?.readIn || [];
  const options = dial.options || [];
  const out = [`<header class="ps-editor-head"><div><p class="panel-sub">A dial</p><h4 class="ps-editor-title">${esc(dial.label)}</h4>${dial.line ? `<p class="ps-meta">${esc(dial.line)}</p>` : ''}</div>${iconButton({ icon: 'close', label: 'Close this dial', act: 'dial-open', data: { name: dial.name }, focus: `dial-close:${dial.name}` })}</header>`];
  out.push(field({ label: 'Shown as', control: `<input class="input" value="${esc(dial.label)}" data-act="dial-label" data-name="${esc(dial.name)}" data-focus="dial-label:${esc(dial.name)}" autocomplete="off">` }));
  out.push(field({
    label: 'Written in a block as',
    hint: usedIn.length ? 'Blocks that read it are changed to the new name with it.' : 'Type it into any block, or use “Insert a dial” above a block’s text.',
    control: `<input class="input mono" value="${esc(`{{.${dial.name}}}`)}" data-act="dial-name" data-name="${esc(dial.name)}" data-focus="dial-name:${esc(dial.name)}" autocomplete="off" spellcheck="false">`,
  }));
  out.push(field({ label: 'Kind', group: true, control: segmented({ act: 'dial-kind', value: dial.kind, options: core.dials.DIAL_KINDS, data: { name: dial.name }, label: 'Kind', focus: `dial-kind:${dial.name}` }) }));
  if (dial.kind === 'pick') {
    out.push(`<div class="ps-list" role="group" aria-label="Its answers"><p class="ps-meta">Its answers</p>${options.map((o, i) => `<div class="ps-list-row">
      <input class="input" aria-label="Answer ${i + 1}" value="${esc(o)}" data-act="dial-option" data-name="${esc(dial.name)}" data-i="${i}" data-focus="dial-opt:${esc(dial.name)}:${i}" autocomplete="off">
      ${iconButton({ icon: 'close', label: `Remove the answer ${o}`, act: 'dial-option-remove', data: { name: dial.name, i: String(i) }, disabled: options.length < 2 })}
    </div>`).join('')}<div>${button({ text: 'Add an answer', act: 'dial-option-add', data: { name: dial.name }, cls: 'btn-ghost' })}</div></div>`);
  }
  if (dial.kind === 'number') {
    const num = (act, label, value, extra = '') => field({ label, control: `<input class="input mono ps-num" type="number" inputmode="decimal" value="${esc(value)}" data-act="${act}" data-name="${esc(dial.name)}" data-focus="${act}:${esc(dial.name)}"${extra}>` });
    out.push(`<div class="ps-inline">${num('dial-min', 'From', dial.min)}${num('dial-max', 'To', dial.max)}${num('dial-step', 'In steps of', dial.step)}
      ${field({ label: 'Unit', hint: 'Said after the number', control: `<input class="input ps-num" value="${esc(dial.unit || '')}" placeholder="words" data-act="dial-unit" data-name="${esc(dial.name)}" data-focus="dial-unit:${esc(dial.name)}" autocomplete="off">` })}</div>`);
  }
  out.push(field({ label: 'Starts as', hint: 'Where a story begins unless it sets its own.', group: true, control: `<div class="ps-ctl-line">${dialControl(dial, dial.value, 'editor')}</div>` }));
  out.push(field({ label: 'Its line', hint: 'Shown under the dial, here and in a story.', control: `<input class="input" value="${esc(dial.line || '')}" data-act="dial-line" data-name="${esc(dial.name)}" data-focus="dial-line:${esc(dial.name)}" autocomplete="off">` }));
  out.push(toggle({ checked: dial.perStory !== false, label: 'Each story can set its own', text: 'Each story can set its own', act: 'dial-perstory', data: { name: dial.name } }),
    '<span class="field-hint ps-under-toggle">In the Story Index, under the preset’s name. Off, every story uses the value here.</span>');
  out.push(`<div class="ps-list"><p class="ps-meta">${esc(usedIn.length ? `Read in ${usedIn.length} ${usedIn.length === 1 ? 'block' : 'blocks'}` : 'No block reads it yet')}</p>${usedIn.map((b) => `<button type="button" class="ps-answer" data-act="goto-block" data-key="${esc(b.key)}"><span>${esc(b.name)}</span><span class="ps-answer-on">${b.on ? 'open' : 'off · open'}</span></button>`).join('')}</div>`);
  out.push(app.S.confirm === `dial:${dial.name}`
    ? `<div class="ps-confirm" role="alertdialog" aria-label="${esc(`Delete ${dial.label}?`)}"><p><strong>${esc(`Delete ${dial.label}?`)}</strong> Blocks that waited for it are sent every time then; a block that reads it reads nothing.</p><div class="btn-row">${button({ text: 'Delete', act: 'dial-delete', data: { name: dial.name }, cls: 'btn-danger' })}${button({ text: 'Cancel', act: 'ask-cancel', cls: 'btn-ghost' })}</div></div>`
    : `<div class="btn-row">${button({ text: 'Duplicate', act: 'dial-dup', data: { name: dial.name } })}${button({ text: 'Delete', act: 'ask', data: { ask: `dial:${dial.name}` }, cls: 'btn-danger' })}</div>`);
  return `<div class="ps-editor" data-editor="dial:${esc(dial.name)}">${out.join('')}</div>`;
}

/** A new dial, named from its label so no two share a name (PresetDials.newDial). */
export const newDial = (dials) => core.dials.normalizeDial({
  name: core.dials.dialNameFor('New dial', dials.map((x) => x.name)),
  label: 'New dial',
  kind: 'switch',
  value: true,
  line: '',
});

/** A change to one dial; with `renameTo`, its name too, in every block that uses it. */
export function changeDial(app, name, patch, renameTo = null) {
  const { dials: dl } = core;
  const draft = app.S.draft;
  draft.dials = dl.dialsOf(draft).map((x) => (x.name === name ? (dl.normalizeDial({ ...x, ...patch, ...(renameTo ? { name: renameTo } : {}) }) || x) : x));
  if (renameTo) {
    draft.prompts = dl.renameVariable(draft.prompts, name, renameTo);
    if (app.S.open?.kind === 'dial' && app.S.open.key === name) app.S.open.key = renameTo;
  }
}

/* ── panels ─────────────────────────────────────────────────────────────── */

const WHERE = [{ id: 'end', label: 'After the reply' }, { id: 'start', label: 'Before it' }];

/** A panel in a line: its tag, fields, place, look and what the model reads. */
export function describePanel(panel, dials = []) {
  const shown = core.panels.PANEL_SHOWN.find((s) => s.id === panel.shown)?.label.toLowerCase();
  const keep = { newest: 'the model reads the newest only', three: 'the model reads the last 3', all: 'the model reads every one' }[panel.keep];
  const when = core.dials.describeWhen(panel, dials);
  return [
    `<${panel.tag}>`,
    `${panel.fields.length} ${panel.fields.length === 1 ? 'field' : 'fields'}`,
    panel.where === 'start' ? 'before each reply' : 'after each reply',
    panel.shown === 'folded' && panel.summary.length ? `folded to ${panel.summary.join(' and ')}` : shown,
    keep,
    when,
  ].filter(Boolean).join(' · ');
}

export function panelsCardHtml(app) {
  const d = app.d();
  if (!d.panels.length) return '';
  const rows = d.panels.map((panel) => {
    const open = app.isOpen('panel', panel.id);
    return `<div class="ps-item${open ? ' is-open' : ''}" data-panel="${esc(panel.id)}">${row({
      labelHtml: `<span${open ? ' class="is-current"' : ''}>${esc(panel.name)}</span>`,
      hint: describePanel(panel, d.dials),
      control: `<span class="ps-ctl-pair">${toggle({ checked: panel.enabled, label: `Send ${panel.name}`, act: 'panel-toggle', data: { id: panel.id } })}${iconButton({ icon: 'edit', label: `Change ${panel.name}`, act: 'panel-open', data: { id: panel.id }, current: open, focus: `panel-open:${panel.id}` })}</span>`,
    })}${open ? panelEditor(app, panel) : ''}</div>`;
  }).join('');
  return card({
    title: 'Panels',
    aside: `${d.panels.length} · written by the model each reply`,
    body: `<p class="ps-meta">Trackers the model keeps in its replies. Aetheria tells it the format, draws each as a card by the passage, and leaves older ones out of what is sent.</p>${rows}`,
    cls: 'ps-card-panels',
  });
}

function panelEditor(app, panel) {
  const { panels: pn } = core;
  const id = panel.id;
  const out = [`<header class="ps-editor-head"><div><p class="panel-sub">A panel</p><h4 class="ps-editor-title" data-live="panel-title:${esc(id)}">${esc(panel.name)}</h4><p class="ps-meta">${esc(`Written as <${panel.tag}> … </${panel.tag}>`)}</p></div>${iconButton({ icon: 'close', label: 'Close this panel', act: 'panel-open', data: { id }, focus: `panel-close:${id}` })}</header>`];
  out.push(`<div class="ps-inline">
    ${field({ label: 'Its name', control: `<input class="input" value="${esc(panel.name)}" data-act="panel-name" data-id="${esc(id)}" data-focus="panel-name:${esc(id)}" autocomplete="off">` })}
    ${field({ label: 'Its tag', hint: 'What the model wraps it in. Replies written before a change keep the old one.', control: `<input class="input mono" value="${esc(panel.tag)}" data-act="panel-tag" data-id="${esc(id)}" data-focus="panel-tag:${esc(id)}" autocomplete="off" spellcheck="false">` })}
  </div>`);
  out.push(`<div class="ps-list" role="group" aria-label="Its fields"><p class="ps-meta">Its fields, in the order the model writes them</p>${panel.fields.map((f, i) => `<div class="ps-pfield">
      <input class="input" aria-label="Field ${i + 1}, its name" value="${esc(f.name)}" data-act="pfield-name" data-id="${esc(id)}" data-i="${i}" data-focus="pfield-name:${esc(id)}:${i}" autocomplete="off">
      <select class="select" aria-label="${esc(`${f.name}, its kind`)}" data-act="pfield-kind" data-id="${esc(id)}" data-i="${i}" data-focus="pfield-kind:${esc(id)}:${i}">${pn.FIELD_KINDS.map((k) => `<option value="${k.id}"${k.id === f.kind ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}</select>
      <span class="ps-pfield-tools">
        ${iconButton({ icon: 'up', label: `Move ${f.name} up`, act: 'pfield-move', data: { id, i: String(i), by: '-1' }, disabled: i === 0 })}
        ${iconButton({ icon: 'down', label: `Move ${f.name} down`, act: 'pfield-move', data: { id, i: String(i), by: '1' }, disabled: i === panel.fields.length - 1 })}
        ${iconButton({ icon: 'close', label: `Remove ${f.name}`, act: 'pfield-remove', data: { id, i: String(i) }, disabled: panel.fields.length < 2 })}
      </span>
      <input class="input ps-pfield-hint" aria-label="${esc(`${f.name}, what the model writes there`)}" placeholder="What the model writes there" value="${esc(f.hint)}" data-act="pfield-hint" data-id="${esc(id)}" data-i="${i}" data-focus="pfield-hint:${esc(id)}:${i}" autocomplete="off">
      ${f.kind === 'meter' ? `<label class="ps-meta ps-pfield-max">From 0 to <input class="input mono ps-num" type="number" min="1" max="20" aria-label="${esc(`${f.name}, its top`)}" value="${esc(f.max)}" data-act="pfield-max" data-id="${esc(id)}" data-i="${i}"></label>` : ''}
    </div>`).join('')}<div>${button({ text: 'Add a field', act: 'pfield-add', data: { id }, cls: 'btn-ghost' })}</div></div>`);
  out.push(field({ label: 'Written', group: true, control: segmented({ act: 'panel-where', value: panel.where, options: WHERE, data: { id }, label: 'Written' }) }));
  out.push(field({ label: 'On the page', group: true, hint: 'Folded, it is one line: the fields chosen below. Hidden, the model still keeps it. Each story can choose its own in its Story Index.', control: segmented({ act: 'panel-shown', value: panel.shown, options: pn.PANEL_SHOWN, data: { id }, label: 'On the page' }) }));
  out.push(field({ label: 'Its folded line shows', group: true, hint: panel.summary.length ? '' : 'None chosen: its first two fields.', control: `<div class="chip-row">${panel.fields.map((f) => `<button type="button" class="chip" aria-pressed="${panel.summary.includes(f.name)}" data-act="panel-summary" data-id="${esc(id)}" data-field="${esc(f.name)}">${esc(f.name)}</button>`).join('')}</div>` }));
  out.push(field({ label: 'The model reads it', group: true, hint: 'Older panels leave what is sent, whole; the story keeps them on the page.', control: segmented({ act: 'panel-keep', value: panel.keep, options: pn.PANEL_KEEPS, data: { id }, label: 'The model reads it' }) }));
  out.push(fold({ title: 'What the model is told', aside: 'made from the fields', body: `<pre class="ps-pre">${esc(pn.instructionFor(panel))}</pre>` }));
  out.push(blockWhenHtml(app, panel, `panel:${id}`));
  out.push(app.S.confirm === `panel:${id}`
    ? `<div class="ps-confirm" role="alertdialog" aria-label="${esc(`Delete ${panel.name}?`)}"><p><strong>${esc(`Delete ${panel.name}?`)}</strong> The model is no longer asked for it; replies that hold one show it as written.</p><div class="btn-row">${button({ text: 'Delete', act: 'panel-delete', data: { id }, cls: 'btn-danger' })}${button({ text: 'Cancel', act: 'ask-cancel', cls: 'btn-ghost' })}</div></div>`
    : `<div class="btn-row">${button({ text: 'Duplicate', act: 'panel-dup', data: { id } })}${button({ text: 'Delete', act: 'ask', data: { ask: `panel:${id}` }, cls: 'btn-danger' })}</div>`);
  return `<div class="ps-editor" data-editor="panel:${esc(id)}">${out.join('')}</div>`;
}

export function changePanel(app, id, patch) {
  const { panels: pn } = core;
  const draft = app.S.draft;
  draft.panels = pn.panelsOf(draft).map((x) => (x.id === id ? (pn.normalizePanel({ ...x, ...patch }) || x) : x));
}

/* ── when it's sent (BlockWhen) ──────────────────────────────────────────── */

const answersOf = (dial) => {
  if (dial.kind === 'switch') return [{ id: 'on', label: 'on' }, { id: 'off', label: 'off' }];
  if (dial.kind === 'pick') return dial.options.map((o) => ({ id: o, label: o }));
  if (dial.kind === 'text') return [{ id: 'filled', label: 'filled in' }, { id: 'empty', label: 'empty' }];
  return [{ id: 'at least', label: 'at least' }, { id: 'below', label: 'below' }];
};

export const firstWhen = (dial) => ({ dial: dial.name, is: answersOf(dial)[0].id, ...(dial.kind === 'number' ? { than: dial.value } : {}) });

/**
 * "When it's sent": while a dial says so, on some kinds of request only, and
 * only with characters that carry a tag. `target` is "block:<key>" or
 * "panel:<id>"; the tags offered are the sample character's.
 */
export function blockWhenHtml(app, prompt, target) {
  const { dials: dl } = core;
  const dials = app.d().dials;
  const when = prompt.send_when && prompt.send_when.dial ? prompt.send_when : null;
  const dial = when ? dials.find((x) => x.name === when.dial) : null;
  const kinds = dl.requestKindsOf(prompt);
  const tags = Array.isArray(prompt.character_tag_trigger) ? prompt.character_tag_trigger : [];
  const offered = app.sampleTags().filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 8);
  const data = { target };
  const out = ['<p class="ps-when-title">When it’s sent</p>'];
  out.push(field({ label: 'With a dial', group: true, control: segmented({ act: 'when-mode', value: when ? 'dial' : 'always', options: [{ id: 'always', label: 'Always' }, { id: 'dial', label: 'When a dial says so' }], data, label: 'With a dial', disabled: !dials.length, focus: `when-mode:${target}` }) }));
  if (!dials.length) out.push(meta('This preset has no dials yet. Add one above the blocks to send this only when it says so.'));
  if (when) {
    out.push(`<div class="ps-inline">
      ${field({ label: 'Dial', control: `<select class="select" data-act="when-dial" data-target="${esc(target)}" data-focus="when-dial:${esc(target)}">${!dial ? `<option value="" disabled selected>${esc(`${when.dial} (gone)`)}</option>` : ''}${dials.map((x) => `<option value="${esc(x.name)}"${dial && x.name === dial.name ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>` })}
      ${dial ? field({ label: 'Is', control: `<select class="select" data-act="when-is" data-target="${esc(target)}" data-focus="when-is:${esc(target)}">${answersOf(dial).map((a) => `<option value="${esc(a.id)}"${String(when.is) === String(a.id) ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>` }) : ''}
      ${dial?.kind === 'number' ? field({ label: dial.unit ? `Than (${dial.unit})` : 'Than', control: `<input class="input mono ps-num" type="number" value="${esc(when.than ?? dial.value)}" data-act="when-than" data-target="${esc(target)}" data-focus="when-than:${esc(target)}">` }) : ''}
    </div>`);
  }
  out.push(field({
    label: 'Kinds of request',
    group: true,
    hint: kinds.length ? 'Only on these kinds of request.' : 'Every kind of request. Choose some to keep it to those.',
    control: `<div class="chip-row">${dl.REQUEST_KINDS.map((k) => `<button type="button" class="chip" aria-pressed="${kinds.includes(k.id)}" data-act="when-kind" data-target="${esc(target)}" data-kind="${esc(k.id)}" data-focus="when-kind:${esc(target)}:${esc(k.id)}">${esc(k.label)}</button>`).join('')}</div>`,
  }));
  out.push(field({
    label: 'Only for characters tagged',
    group: true,
    hint: tags.length ? 'Any of these tags.' : 'Left empty, it goes with every character.',
    control: `<div class="chip-row ps-tags">${tags.map((t) => `<button type="button" class="chip" aria-pressed="true" aria-label="${esc(`Remove the tag ${t}`)}" data-act="when-tag-remove" data-target="${esc(target)}" data-tag="${esc(t)}">${esc(`${t} ×`)}</button>`).join('')}<input class="input ps-tag-input" placeholder="Add a tag…" aria-label="Add a tag" data-act="when-tag-input" data-target="${esc(target)}" data-focus="when-tag:${esc(target)}" autocomplete="off"></div>`,
  }));
  if (offered.length) {
    out.push(`<div class="chip-row ps-offered"><span class="ps-meta">On the sample character:</span>${offered.map((t) => `<button type="button" class="chip" data-act="when-tag-add" data-target="${esc(target)}" data-tag="${esc(t)}" aria-label="${esc(`Add the tag ${t}`)}">${esc(t)}</button>`).join('')}</div>`);
  }
  return `<div class="ps-when">${out.join('')}</div>`;
}

/* ── what it remembers ──────────────────────────────────────────────────── */

/** A value as the row shows it: quoted and short, or "empty". */
export const shortValue = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'empty';
  return text.length > 60 ? `“${text.slice(0, 57)}…”` : `“${text}”`;
};

const blockNames = (blocks) => blocks.map((b) => (b.on ? b.name : `${b.name} (off)`)).join(', ');

const valueOf = (v, story) => {
  if (!story) return null;
  if (v.dial) return core.dials.dialShown(v.dial, story.dialValues[v.dial.name]);
  return story.variables[v.name];
};

export function remembersHead(app) {
  const read = app.read();
  const dialCount = read.variables.filter((v) => v.dial).length;
  return {
    eyebrow: 'What it remembers',
    sub: esc(`${read.variables.length} ${read.variables.length === 1 ? 'variable' : 'variables'} · ${dialCount} ${dialCount === 1 ? 'dial' : 'dials'} · ${read.issues.length} worth a look`),
  };
}

export function remembersBody(app) {
  const read = app.read();
  const story = app.story();
  return `<p class="ps-meta">${esc(story
    ? `What the blocks keep and read back as each reply is put together, and what each holds in the sample request (${story.name}). Choose one to see every block that sets or reads it.`
    : 'What the blocks keep and read back as each reply is put together. Choose one to see every block that sets or reads it.')}</p>
    ${read.variables.length === 0
    ? meta('This preset keeps nothing: no block sets or reads a variable, and it has no dials.')
    : `<div class="ps-find"><input class="input" type="search" placeholder="Find a variable or a block…" aria-label="Find a variable or a block" value="${esc(app.S.varFind)}" data-act="var-find" data-focus="var-find" autocomplete="off"></div><div data-live="var-list">${remembersList(app)}</div>`}`;
}

export function remembersList(app) {
  const read = app.read();
  const story = app.story();
  const wanted = app.S.varFind.trim().toLowerCase();
  const matches = (v) => !wanted
    || v.name.toLowerCase().includes(wanted)
    || (v.dial && v.dial.label.toLowerCase().includes(wanted))
    || [...v.setIn, ...v.readIn].some((b) => b.name.toLowerCase().includes(wanted));
  const shown = read.variables.filter(matches);
  const groups = [
    { key: 'dials', title: 'Dials', aside: 'you set these', list: shown.filter((v) => v.dial) },
    { key: 'kept', title: 'Kept by the blocks', aside: 'set as each reply is put together', list: shown.filter((v) => !v.dial && !v.fromStory) },
    { key: 'story', title: 'From the story', aside: 'held by the story; the preset never names them', list: shown.filter((v) => v.fromStory) },
  ];
  const rowOf = (v) => {
    const open = app.isOpen('var', v.name);
    return `<div class="ps-item${open ? ' is-open' : ''}">${row({
      labelHtml: `<button type="button" class="ps-var-name${v.dial ? '' : ' mono'}" data-act="var-open" data-name="${esc(v.name)}" aria-expanded="${open}" data-focus="var:${esc(v.name)}">${esc(v.dial ? v.dial.label : v.name)}</button>`,
      hint: [
        v.setIn.length ? `set in ${blockNames(v.setIn)}` : (v.dial ? 'set by the dial' : (v.fromStory ? 'set by the story' : 'never set')),
        v.readIn.length ? `read in ${blockNames(v.readIn)}` : 'never read',
      ].join(' · '),
      control: story ? `<span class="ps-meta ps-var-value">${esc(shortValue(valueOf(v, story)))}</span>` : '',
    })}${open ? variableDetail(app, v, story) : ''}</div>`;
  };
  const kept = read.variables.filter((v) => !v.dial && !v.fromStory).length;
  const dialCount = read.variables.filter((v) => v.dial).length;
  return [
    read.issues.length && !wanted ? card({
      title: 'Worth a look',
      aside: String(read.issues.length),
      body: read.issues.map((issue) => row({
        labelHtml: `<span class="mono">${esc(issue.name)}</span>`,
        hint: issue.kind === 'never-set' ? `Read in ${blockNames(issue.blocks)}, but nothing sets it: it is always empty there.` : `Set in ${blockNames(issue.blocks)}, but nothing reads it.`,
        control: button({ text: 'Open', act: 'var-open-only', data: { name: issue.name }, cls: 'btn-ghost' }),
      })).join(''),
      cls: 'ps-card-issues',
    }) : '',
    ...groups.filter((g) => g.list.length).map((g) => card({ title: g.title, aside: `${g.list.length} · ${g.aside}`, body: g.list.map(rowOf).join('') })),
    wanted && !shown.length ? meta(`Nothing here matches “${app.S.varFind.trim()}”.`) : '',
    !wanted && kept === 0 && dialCount > 0 ? meta('The blocks keep nothing of their own; only the dials.') : '',
  ].join('');
}

function variableDetail(app, variable, story) {
  const value = valueOf(variable, story);
  const lists = [['Set in', variable.setIn], ['Read in', variable.readIn]];
  return `<div class="ps-editor" data-editor="var:${esc(variable.name)}">
    <header class="ps-editor-head"><div><p class="panel-sub">${variable.dial ? 'A dial' : 'A variable'}</p><h4 class="ps-editor-title${variable.dial ? '' : ' mono'}">${esc(variable.dial ? variable.dial.label : variable.name)}</h4>${variable.dial ? `<p class="ps-meta mono">${esc(`{{.${variable.name}}}`)}</p>` : ''}</div>${iconButton({ icon: 'close', label: 'Close this variable', act: 'var-open', data: { name: variable.name } })}</header>
    <div><p class="ps-meta">${esc(story ? `In the sample request (${story.name})` : 'No sample is put together')}</p>${story ? `<p class="ps-body mono ps-var-full">${esc(String(value ?? '') || 'empty')}</p>` : ''}</div>
    ${lists.map(([label, list]) => `<div class="ps-list"><p class="ps-meta">${label}</p>${list.length ? list.map((b) => `<button type="button" class="ps-answer" data-act="goto-block" data-key="${esc(b.key)}"><span>${esc(b.name)}</span><span class="ps-answer-on">${b.on ? 'open' : 'off · open'}</span></button>`).join('') : `<p class="ps-body">${esc(label === 'Set in' && variable.dial ? 'The dial itself, and each story that sets its own.' : label === 'Set in' && variable.fromStory ? 'The story, or a card’s scripts; no block of this preset.' : 'Nowhere.')}</p>`}</div>`).join('')}
    ${variable.dial
    ? `<div>${button({ text: 'Change the dial', act: 'goto-dial', data: { name: variable.name } })}</div>`
    : `<div>${button({ text: 'Make it a dial', act: 'var-make-dial', data: { name: variable.name } })}</div><p class="ps-meta">A dial sets it before the first block is read and holds it there: a block that sets it is no longer heeded, and its text stays as it is. Each story can then choose its own.</p>`}
  </div>`;
}
