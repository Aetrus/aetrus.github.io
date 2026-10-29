// The Workshop's Preset builder: Aetheria's Preset sheet (src/sheets/
// PresetSheet.js) on the web. Four sections as Aetheria has them (What it
// says, How it feels, What it remembers, About this preset); a block, a dial,
// a panel, a script or a variable opens beneath its row; the inspector shows
// the request the preset would put together for a sample story. Aetheria's
// own logic does the work: importing, normalising, ordering, assembling,
// macros, scripts and the export, so files round-trip with Aetheria and
// SillyTavern. Nothing here asks a model.
import { esc, toast, download, copyText, store } from '../ui.js';
import { take } from '../handoff.js';
import {
  sheetFrame, indexItem, sheetSection, showSection, wireIndex, bindSheet, saver, draftShelf,
  draftsHtml, draftSelectHtml, wireDrafts, pickFile, sayError, setBadge, clone,
} from '../builders/sheet.js';
import {
  core, uuid, validateAndFixPreset, storytellerDraft, blankDraft, importFile, importJson, exportJson, exportName, derive,
} from '../builders/preset/core.js';
import * as says from '../builders/preset/says.js';
import * as extras from '../builders/preset/extras.js';
import * as feel from '../builders/preset/feel.js';
import * as about from '../builders/preset/about.js';
import * as preview from '../builders/preset/preview.js';
import { SAMPLE } from '../builders/preset/sample.js';
import { ICON } from '../builders/preset/bits.js';

const SECTIONS = [
  { id: 'says', label: 'What it says', hint: 'The instructions, by what they do' },
  { id: 'feel', label: 'How it feels', hint: 'How bold, how long, how far it reads' },
  { id: 'remembers', label: 'What it remembers', hint: 'Its dials and variables, and where each is used' },
  { id: 'about', label: 'About this preset', hint: 'Its name, how it is sent, its scripts and styles' },
];
const REMEMBER = 'aetheria.preset.section';
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export async function render(main, _arg, { setTitle }) {
  setTitle('Preset builder');
  const shelf = draftShelf('preset');

  /* ── state ─────────────────────────────────────────────────────────────── */
  const S = {
    id: null,
    draft: null,
    section: 'says',
    starting: false,
    open: null,
    confirm: null,
    askFocus: null,
    openedOn: null,
    exact: { bold: false, reply: false, reach: false },
    allChoices: false,
    sample: 'dilys',
    seed: 1,
    expanded: new Set(),
    varFind: '',
    scriptFind: '',
    scriptSamples: {},
    styleSample: null,
    previewFor: 'openrouter',
    folds: {},
    notice: null,
    version: 0,
    run: null,
    items: [],
  };

  let derived = null;
  let derivedAt = -1;
  let readCache = null;
  let readAt = '';

  const app = {
    S,
    d() {
      if (derivedAt !== S.version || !derived) { derived = derive(S.draft, S.openedOn); derivedAt = S.version; }
      return derived;
    },
    read() {
      const stamp = `${S.version}:${S.run ? S.run.stamp : ''}`;
      if (readAt !== stamp || !readCache) {
        readCache = core.dials.readPresetVariables(S.draft, { keys: app.d().keys, storyVariables: app.story()?.variables });
        readAt = stamp;
      }
      return readCache;
    },
    story() {
      if (!S.run || S.run.error) return null;
      return { name: S.run.sampleName === 'no character' ? 'no character' : S.run.sampleName, variables: S.run.variables || {}, dialValues: core.dials.dialValuesFor(S.draft, null) };
    },
    sampleTags: () => SAMPLE.character.tags || [],
    isOpen: (kind, key) => Boolean(S.open && S.open.kind === kind && S.open.key === key),
    touch() { S.version += 1; save.poke(); schedulePreview(); },
    setPrompts(next, opts = {}) { S.draft.prompts = next; app.touch(); redraw(['says'], opts); },
    patchBlock,
  };

  /* ── the page ──────────────────────────────────────────────────────────── */
  S.items = await shelf.list();
  main.innerHTML = `<div class="page page-wide">${sheetFrame({
    id: 'preset-sheet',
    eyebrow: 'Preset',
    title: 'Preset',
    index: SECTIONS.map((s) => indexItem({ id: s.id, label: s.label, hint: s.hint })).join(''),
    indexFoot: `<div data-live="drafts"></div>`,
    toolbar: `<span data-live="draft-select"></span>
      <button type="button" class="btn btn-sm btn-ghost" data-act="import" data-focus="tb-import">${ICON.file}Bring one in</button>
      <button type="button" class="btn btn-sm" data-act="export" data-focus="tb-export" data-live="tb-export">Export</button>
      <button type="button" class="btn btn-sm btn-ghost ps-to-request" data-act="to-request" data-focus="tb-request">The request ↓</button>
      <span class="spacer"></span>
      <span class="save-status" data-live="status" aria-live="polite"></span>`,
    body: `${SECTIONS.map((s) => `<section class="sheet-section" data-section-body="${s.id}" hidden role="tabpanel"></section>`).join('')}
      <section class="sheet-section ps-start" data-start hidden aria-label="Begin a preset"></section>`,
    inspector: '<div data-live="preview"></div>',
    inspectorLabel: 'What would be sent',
  })}</div>`;
  const root = main.querySelector('#preset-sheet');
  const live = (name) => root.querySelector(`[data-live="${CSS.escape(name)}"]`);
  const save = saver(async () => {
    if (!S.draft || !S.id) return;
    const kept = validateAndFixPreset({ ...clone(S.draft), updated_at: new Date().toISOString() });
    await shelf.put(S.id, S.draft.name || 'Untitled', kept);
    shelf.current.set(S.id);
    S.items = await shelf.list();
    drawDrafts();
  }, { status: live('status') });

  /* ── drawing ───────────────────────────────────────────────────────────── */
  const presetName = () => (S.draft?.name || 'Untitled');
  const HEADS = { says: says.saysHead, feel: feel.feelHead, remembers: extras.remembersHead, about: about.aboutHead };
  const BODIES = { says: says.saysBody, feel: feel.feelBody, remembers: extras.remembersBody, about: about.aboutBody };

  function sectionHtml(id) {
    const h = HEADS[id](app);
    return sheetSection({ id, eyebrow: h.eyebrow, title: presetName(), sub: h.sub, actions: h.actions || '', body: BODIES[id](app), active: S.section === id && !S.starting });
  }

  /** Redraw sections, keeping the focus (and a text field's caret) where it was. */
  function redraw(ids = [S.section], { focus = null, scroll = false, reveal = null } = {}) {
    if (!S.draft) return;
    const active = document.activeElement;
    const fid = focus || (root.contains(active) ? active?.dataset?.focus : null);
    let sel = null;
    try { sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null; } catch { sel = null; }
    const list = ids === 'all' ? SECTIONS.map((s) => s.id) : ids;
    list.forEach((id) => {
      const old = root.querySelector(`[data-section-body="${id}"]`);
      if (!old) return;
      const tpl = document.createElement('template');
      tpl.innerHTML = sectionHtml(id).trim();
      old.replaceWith(tpl.content.firstElementChild);
    });
    drawChrome();
    const target = reveal || fid;
    if (target) {
      const el = root.querySelector(`[data-focus="${CSS.escape(target)}"]`);
      if (el) {
        el.focus({ preventScroll: !(scroll || reveal) });
        if (reveal) el.scrollIntoView({ block: 'center', behavior: motion() });
        if (sel && !focus && !reveal && el === document.activeElement && typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ }
        }
      }
    }
  }

  function drawChrome() {
    const name = presetName();
    root.querySelector('[data-sheet-title]').textContent = S.draft ? name : 'Presets';
    if (S.draft) {
      const d = app.d();
      setBadge(root, 'says', d.totalTokens ? `~${fmtK(d.totalTokens)}` : '');
      const issues = app.read().issues.length;
      setBadge(root, 'remembers', issues ? String(issues) : '');
    }
    live('tb-export').disabled = !S.draft;
  }

  function drawDrafts() {
    live('drafts').innerHTML = draftsHtml(S.items, S.starting ? null : S.id, { noun: 'preset' });
    live('draft-select').innerHTML = S.items.length ? draftSelectHtml(S.items, S.starting ? '__new' : S.id) : '';
  }

  function drawStart() {
    const el = root.querySelector('[data-start]');
    el.hidden = !S.starting;
    for (const s of root.querySelectorAll('[data-section-body]')) s.hidden = S.starting || s.dataset.sectionBody !== S.section;
    for (const i of root.querySelectorAll('.sheet-index-item')) {
      i.setAttribute('aria-selected', String(!S.starting && i.dataset.section === S.section));
      i.disabled = !S.draft;
    }
    if (!S.starting) return;
    el.innerHTML = `<header class="sheet-section-head"><div><p class="panel-sub">A new preset</p><h2 class="sheet-section-title">Begin a preset</h2><p class="sheet-section-sub">Start from Aetheria’s own, from nothing, or from a preset you already have. It is kept in this browser as you work.</p></div>
      ${S.draft ? `<div class="btn-row"><button type="button" class="btn btn-sm btn-ghost" data-act="start-back" data-focus="start-back">Back to ${esc(presetName())}</button></div>` : ''}</header>
      <div class="ps-starts">
        <article class="ps-start-card">
          <p class="panel-sub">Aetheria’s house preset</p>
          <h3>The Storyteller</h3>
          <p>The third edition: a narrator for every character but yours, twelve choices (whose eyes, how long, how fast, the mood and the rest), any number of tones, and a short reminder at the end of each turn.</p>
          <button type="button" class="btn btn-gilt" data-act="start-storyteller" data-focus="start-storyteller">Start from the Storyteller</button>
        </article>
        <article class="ps-start-card">
          <p class="panel-sub">Nothing written yet</p>
          <h3>Blank</h3>
          <p>An empty main prompt, the markers that place the card, the lorebook and the chat, and the slot for a card’s own post-history instructions.</p>
          <button type="button" class="btn" data-act="start-blank" data-focus="start-blank">Start blank</button>
        </article>
        <label class="dropzone ps-start-drop" data-start-drop>
          <input type="file" accept=".json,application/json" aria-label="Bring in a preset file">
          ${ICON.file}
          <strong>Bring one in</strong>
          <span>A chat-completion preset from SillyTavern, Lumiverse or Aetheria. Drop it here, or choose the file.</span>
          <small>.json</small>
        </label>
      </div>`;
    const drop = el.querySelector('[data-start-drop]');
    const input = drop.querySelector('input');
    input.addEventListener('change', () => { if (input.files[0]) bringIn(input.files[0]); input.value = ''; });
  }

  function drawAll() {
    if (S.draft) redraw('all');
    drawStart();
    drawChrome();
    drawDrafts();
    drawPreview();
  }

  /* ── the request (inspector) ───────────────────────────────────────────── */
  let previewTimer = 0;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(drawPreview, 220); }
  function drawPreview() {
    clearTimeout(previewTimer);
    const host = live('preview');
    if (!S.draft) { host.innerHTML = preview.previewHtml(app, null); return; }
    try {
      S.run = { ...preview.assemble(S.draft, { which: S.sample, seed: S.seed }), stamp: `${S.version}:${S.sample}:${S.seed}` };
    } catch (err) {
      console.warn(err);
      S.run = { error: err?.message || String(err), stamp: String(S.version) };
    }
    const scroller = root.querySelector('.sheet-inspector-body');
    const top = scroller?.scrollTop || 0;
    const active = document.activeElement;
    const fid = host.contains(active) ? active?.dataset?.focus : null;
    host.innerHTML = preview.previewHtml(app, S.run);
    if (scroller) scroller.scrollTop = top;
    if (fid) host.querySelector(`[data-focus="${CSS.escape(fid)}"]`)?.focus({ preventScroll: true });
    if (S.section === 'remembers' && live('var-list')) live('var-list').innerHTML = extras.remembersList(app);
  }

  function revealLit() {
    const lit = live('preview').querySelector('[data-lit]');
    const scroller = root.querySelector('.sheet-inspector-body');
    if (!lit || !scroller || matchMedia('(max-width: 1240px)').matches) return;
    const box = scroller.getBoundingClientRect();
    const r = lit.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) scroller.scrollTop += r.top - box.top - 24;
  }

  /* ── keystroke patches ─────────────────────────────────────────────────── */
  function patchBlock(key) {
    const d = app.d();
    const index = d.indexOfKey(key);
    if (index < 0) return;
    const rowEl = root.querySelector(`[data-row="${CSS.escape(key)}"]:not(.ps-block-detached)`);
    const parts = says.rowParts(app, index);
    if (rowEl) {
      rowEl.querySelector('.ps-block-name').textContent = parts.name;
      rowEl.querySelector('.ps-block-hint').textContent = parts.hint;
      rowEl.querySelector('.ps-block-cost').textContent = parts.cost;
    }
    const p = d.chain[index];
    const tokens = live(`tokens:${key}`);
    if (tokens) tokens.textContent = says.tokensLabel(p.content);
    const title = root.querySelector(`[data-editor="block:${CSS.escape(key)}"] [data-live="editor-title"]`);
    if (title && !core.assembler.aetheriaBlockOf(p)) title.textContent = says.nameOf(p);
    for (const o of root.querySelectorAll(`select[data-act="choose"] option[value="${CSS.escape(key)}"]`)) o.textContent = says.nameOf(p);
    patchSaysLive();
  }

  function patchSaysLive() {
    const sec = root.querySelector('[data-section-body="says"]');
    if (!sec || !S.draft) return;
    const d = app.d();
    const sub = sec.querySelector('.sheet-section-sub');
    if (sub) sub.textContent = says.saysSub(app);
    const meter = sec.querySelector('[data-live="meter"]');
    if (meter) {
      const tpl = document.createElement('template');
      tpl.innerHTML = says.meterHtml(d).trim();
      if (tpl.content.firstElementChild) meter.replaceWith(tpl.content.firstElementChild);
    }
    d.shape.sections.forEach((s) => {
      const aside = sec.querySelector(`[data-live="${CSS.escape(`aside:${says.groupId(app, s)}`)}"]`);
      if (aside) aside.textContent = says.groupAside(app, s);
    });
    drawChrome();
  }

  function patchTitles() {
    const name = presetName();
    for (const t of root.querySelectorAll('.sheet-section-title')) if (!t.closest('[data-start]')) t.textContent = name;
    drawChrome();
  }

  /* ── changes that wait for the pointer ─────────────────────────────────── */
  // A text field's change fires on blur, before the click that blurred it
  // lands and before the focus reaches the next field; a redraw then would
  // swallow that click, or pull the focus back. So it waits for both.
  let pointerIsDown = false;
  let settled = [];
  const onPointerDown = () => { pointerIsDown = true; };
  const onPointerUp = () => { pointerIsDown = false; setTimeout(() => { const run = settled; settled = []; run.forEach((fn) => fn()); }, 0); };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  const settle = (fn) => { if (pointerIsDown) settled.push(fn); else setTimeout(fn, 0); };

  /* ── opening, making and keeping drafts ────────────────────────────────── */
  function adopt(id, draft, { section = null } = {}) {
    S.id = id;
    S.draft = draft;
    S.starting = false;
    S.open = null;
    S.confirm = null;
    S.notice = null;
    S.allChoices = false;
    S.exact = { bold: false, reply: false, reach: false };
    S.scriptSamples = {};
    S.expanded = new Set();
    S.run = null;
    S.openedOn = new Set((Array.isArray(draft.prompts) ? draft.prompts : []).filter((p) => p && p.enabled !== false).map((p) => p.identifier));
    S.version += 1;
    if (section) S.section = section;
    shelf.current.set(id);
    drawAll();
  }

  async function openDraft(id) {
    if (id === S.id && !S.starting) return;
    await save.flush();
    const item = await shelf.get(id);
    if (!item?.data) { toast('That preset could not be read.'); return; }
    adopt(id, validateAndFixPreset(item.data));
    save.say('');
  }

  async function keepNew(draft, { section = 'says', message = '' } = {}) {
    await save.flush();
    const id = draft.id || uuid();
    draft.id = id;
    await shelf.put(id, draft.name || 'Untitled', draft);
    S.items = await shelf.list();
    adopt(id, draft, { section });
    showSection(root, S.section, { remember: REMEMBER });
    save.say('Saved in this browser');
    if (message) toast(message);
    root.querySelector('.sheet-main')?.scrollIntoView({ block: 'start', behavior: motion() });
  }

  async function bringIn(file) {
    try {
      const draft = await importFile(file, uuid());
      await keepNew(draft, { message: `${draft.name} is in, from ${file.name}.` });
    } catch (err) { sayError(err, 'That preset could not be read.'); }
  }

  function startNew() {
    save.flush();
    S.starting = true;
    S.open = null;
    drawStart();
    drawDrafts();
    root.querySelector('[data-focus="start-storyteller"]')?.focus({ preventScroll: true });
  }

  /* ── targets for "When it's sent" ──────────────────────────────────────── */
  function promptForTarget(target) {
    const [kind, ...rest] = target.split(':');
    const key = rest.join(':');
    const d = app.d();
    if (kind === 'block') return d.prompts[d.keys.indexOf(key)] || null;
    return d.panels.find((p) => p.id === key) || null;
  }
  function patchTarget(target, patch) {
    const [kind, ...rest] = target.split(':');
    const key = rest.join(':');
    if (kind === 'block') says.setBlock(app, key, patch);
    else { extras.changePanel(app, key, patch); app.touch(); redraw(['says']); }
  }
  function addTag(target, tag) {
    const t = String(tag || '').trim();
    const p = promptForTarget(target);
    if (!t || !p) return false;
    const tags = Array.isArray(p.character_tag_trigger) ? p.character_tag_trigger : [];
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return false;
    patchTarget(target, { character_tag_trigger: [...tags, t] });
    return true;
  }

  /* ── going to a block from elsewhere ───────────────────────────────────── */
  function gotoBlock(key) {
    S.open = { kind: 'block', key };
    S.confirm = null;
    S.section = 'says';
    S.starting = false;
    showSection(root, 'says', { remember: REMEMBER });
    redraw(['says']);
    drawPreview();
    const row = root.querySelector(`[data-row="${CSS.escape(key)}"]`);
    row?.scrollIntoView({ block: 'start', behavior: motion() });
    row?.querySelector('[data-focus^="open:"], [data-focus^="close:"]')?.focus({ preventScroll: true });
  }

  /* ── what each control does ────────────────────────────────────────────── */
  const dialOf = (name) => app.d().dials.find((x) => x.name === name);
  const scripts = () => about.scriptListOf(S.draft);
  const setScripts = (next) => { S.draft.regexScripts = next; app.touch(); };
  const changeScript = (i, patch) => setScripts(scripts().map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const fields = () => core.request.requestFieldsOf(S.draft);
  const setFields = (next) => { S.draft.requestFields = next; app.touch(); };
  const askFrom = (el) => { S.askFocus = el.dataset.focus || null; };

  function patchScript(i) {
    const script = scripts()[i];
    if (!script) return;
    const name = script.scriptName || 'A script without a name';
    const t = live(`script-title:${i}`);
    if (t) t.textContent = name;
    const n = live(`script-name:${i}`);
    if (n) n.textContent = name;
    const { pattern, flags } = about.splitRegex(script.findRegex);
    let err = '';
    if (pattern) { try { new RegExp(pattern, flags); } catch (e) { err = `This pattern does not read: ${e.message}`; } }
    const e = live(`script-err:${i}`);
    if (e) e.textContent = err;
    const tryEl = live(`script-try:${i}`);
    if (tryEl) tryEl.innerHTML = about.scriptTry(app, script, i);
    const style = live('style-try');
    if (style) style.innerHTML = about.stylePreview(app);
  }

  function patchFields() {
    const list = fields();
    list.forEach((f, i) => {
      const note = live(`rf-note:${i}`);
      if (!note) return;
      const problem = f.key || f.value ? core.request.fieldProblem(f) : '';
      note.textContent = problem || (f.from ? `From ${f.from}.` : '');
      note.classList.toggle('ps-error', Boolean(problem));
    });
    const body = live('rf-body');
    if (body) body.textContent = about.requestBody(app);
    const aside = root.querySelector('[data-fold="request"] .ps-fold-aside');
    if (aside) aside.textContent = list.length ? `${list.filter((f) => f.enabled && !core.request.fieldProblem(f)).length} of ${list.length} on` : 'none';
  }

  /** A block's depth or order set where it is, without drawing the sheet anew. */
  function placeBlock(key, patch) {
    const d = app.d();
    const at = d.keys.indexOf(key);
    if (at < 0) return;
    d.prompts[at] = { ...d.prompts[at], ...patch };
    app.touch();
    patchBlock(key);
  }

  /** What a panel tells the model, read again. */
  function patchPanelTold(id) {
    const panel = app.d().panels.find((p) => p.id === id);
    const pre = root.querySelector(`[data-editor="panel:${CSS.escape(id)}"] .ps-pre`);
    if (panel && pre) pre.textContent = core.panels.instructionFor(panel);
  }

  /** A script's row hint, read again. */
  function patchScriptHint(i) {
    const script = scripts()[i];
    const hint = root.querySelector(`[data-script="${i}"] > .ps-row .ps-row-hint`);
    if (script && hint) hint.textContent = about.describeScript(script);
  }

  /** Click handlers: buttons, radios and chips. */
  const CLICK = {
    // the chain
    'block-open': (el) => {
      const key = el.dataset.key;
      S.open = app.isOpen('block', key) ? null : { kind: 'block', key };
      S.confirm = null;
      redraw(['says'], { focus: S.open ? null : `open:${key}` });
      drawPreview();
      revealLit();
    },
    'block-open-keep': (el) => { S.open = { kind: 'block', key: el.dataset.key }; S.confirm = null; redraw(['says']); drawPreview(); revealLit(); },
    'choices-all': () => { S.allChoices = !S.allChoices; redraw(['says']); },
    'block-step': (el) => {
      const d = app.d();
      const from = d.indexOfKey(el.dataset.key);
      const to = says.stepFor(d, from, Number(el.dataset.dir));
      says.move(app, from, to, { scroll: true });
    },
    'block-add': () => {
      if (S.section !== 'says') { S.section = 'says'; showSection(root, 'says', { remember: REMEMBER }); }
      says.addBlock(app);
    },
    'block-dup': (el) => says.duplicateBlock(app, el.dataset.key),
    'block-delete': (el) => says.deleteBlock(app, el.dataset.key),
    'block-sent': (el) => {
      const key = el.dataset.key;
      const p = app.d().prompts[app.d().keys.indexOf(key)];
      says.setBlock(app, key, { injection_position: el.dataset.value === 'chat' ? 1 : 0, injection_depth: p?.injection_depth ?? 4 });
    },
    'aetheria-show': () => app.setPrompts(core.assembler.withAetheriaBlocks(S.draft.prompts)),
    'aetheria-cast': () => app.setPrompts(core.assembler.withAetheriaBlocks(S.draft.prompts, { includeCast: true })),
    'to-list': () => { S.draft = core.builder.toListBuilder(S.draft); app.touch(); redraw('all'); },
    'goto-remembers': () => { S.section = 'remembers'; showSection(root, 'remembers', { remember: REMEMBER }); redraw(['remembers']); root.querySelector('.sheet-main')?.scrollIntoView({ block: 'start', behavior: motion() }); },
    'goto-block': (el) => gotoBlock(el.dataset.key),
    ask: (el) => { askFrom(el); S.confirm = el.dataset.ask; redraw(); root.querySelector('.ps-confirm .btn-ghost')?.focus({ preventScroll: true }); },
    'ask-cancel': () => { S.confirm = null; redraw([S.section], { focus: S.askFocus }); },

    // dials
    'dial-add': () => {
      const dial = extras.newDial(app.d().dials);
      S.draft.dials = [...app.d().dials, dial];
      S.open = { kind: 'dial', key: dial.name };
      app.touch();
      redraw(['says'], { reveal: `dial-label:${dial.name}` });
    },
    'dial-open': (el) => { const { name } = el.dataset; S.open = app.isOpen('dial', name) ? null : { kind: 'dial', key: name }; S.confirm = null; redraw(['says']); },
    'dial-value': (el) => { if (el.getAttribute('role') !== 'radio') return; extras.changeDial(app, el.dataset.name, { value: el.dataset.value }); app.touch(); redraw(['says']); },
    'dial-kind': (el) => {
      const dial = dialOf(el.dataset.name);
      const kind = el.dataset.value;
      extras.changeDial(app, dial.name, { kind, ...(kind === 'pick' && !(dial.options || []).length ? { options: ['First', 'Second'] } : {}) });
      app.touch();
      redraw(['says']);
    },
    'dial-option-remove': (el) => {
      const dial = dialOf(el.dataset.name);
      const next = dial.options.filter((_, j) => j !== Number(el.dataset.i));
      extras.changeDial(app, dial.name, { options: next, value: next.includes(dial.value) ? dial.value : next[0] });
      app.touch(); redraw(['says']);
    },
    'dial-option-add': (el) => {
      const dial = dialOf(el.dataset.name);
      const next = [...dial.options, `Answer ${dial.options.length + 1}`];
      extras.changeDial(app, dial.name, { options: next, value: dial.value });
      app.touch(); redraw(['says'], { reveal: `dial-opt:${dial.name}:${next.length - 1}` });
    },
    'dial-dup': (el) => {
      const dials = app.d().dials;
      const original = dials.find((x) => x.name === el.dataset.name);
      if (!original) return;
      const fresh = extras.newDial(dials);
      const copy = core.dials.normalizeDial({ ...fresh, ...original, name: fresh.name, label: `${original.label} (copy)` });
      S.draft.dials = [...dials, copy];
      S.open = { kind: 'dial', key: copy.name };
      app.touch(); redraw(['says'], { reveal: `dial-label:${copy.name}` });
    },
    'dial-delete': (el) => {
      const { name } = el.dataset;
      S.draft.dials = app.d().dials.filter((x) => x.name !== name);
      S.draft.prompts = S.draft.prompts.map((p) => (p?.send_when?.dial === name ? { ...p, send_when: undefined } : p));
      S.open = null; S.confirm = null;
      app.touch(); redraw(['says']);
      toast('The dial is deleted. Blocks that waited for it are sent every time now.');
    },
    'goto-dial': (el) => {
      S.section = 'says'; S.open = { kind: 'dial', key: el.dataset.name };
      showSection(root, 'says', { remember: REMEMBER }); redraw(['says']);
      root.querySelector(`[data-dial="${CSS.escape(el.dataset.name)}"]`)?.scrollIntoView({ block: 'center', behavior: motion() });
    },

    // panels
    'panel-add': () => {
      const panel = core.panels.newPanel(app.d().panels);
      S.draft.panels = [...app.d().panels, panel];
      S.open = { kind: 'panel', key: panel.id };
      app.touch(); redraw(['says'], { reveal: `panel-name:${panel.id}` });
    },
    'panel-open': (el) => { const { id } = el.dataset; S.open = app.isOpen('panel', id) ? null : { kind: 'panel', key: id }; S.confirm = null; redraw(['says']); },
    'pfield-move': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i); const to = i + Number(el.dataset.by);
      if (!panel || to < 0 || to >= panel.fields.length) return;
      const next = panel.fields.slice(); const [moved] = next.splice(i, 1); next.splice(to, 0, moved);
      extras.changePanel(app, panel.id, { fields: next }); app.touch();
      redraw(['says'], { focus: `pfield-name:${panel.id}:${to}` });
    },
    'pfield-remove': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i);
      const f = panel.fields[i];
      extras.changePanel(app, panel.id, { fields: panel.fields.filter((_, j) => j !== i), summary: panel.summary.filter((n) => n !== f.name) });
      app.touch(); redraw(['says']);
    },
    'pfield-add': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      let n = panel.fields.length + 1;
      while (panel.fields.some((f) => f.name.toLowerCase() === `field ${n}`)) n += 1;
      extras.changePanel(app, panel.id, { fields: [...panel.fields, { name: `Field ${n}`, kind: 'line', hint: '' }] });
      app.touch(); redraw(['says'], { reveal: `pfield-name:${panel.id}:${panel.fields.length}` });
    },
    'panel-where': (el) => { extras.changePanel(app, el.dataset.id, { where: el.dataset.value }); app.touch(); redraw(['says']); },
    'panel-shown': (el) => { extras.changePanel(app, el.dataset.id, { shown: el.dataset.value }); app.touch(); redraw(['says']); },
    'panel-keep': (el) => { extras.changePanel(app, el.dataset.id, { keep: el.dataset.value }); app.touch(); redraw(['says']); },
    'panel-summary': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const name = el.dataset.field;
      const summary = panel.summary.includes(name) ? panel.summary.filter((n) => n !== name) : panel.fields.map((f) => f.name).filter((n) => n === name || panel.summary.includes(n));
      extras.changePanel(app, panel.id, { summary }); app.touch(); redraw(['says']);
    },
    'panel-dup': (el) => {
      const panels = app.d().panels;
      const original = panels.find((x) => x.id === el.dataset.id);
      if (!original) return;
      const tag = core.panels.panelTagFor(`${original.tag}_copy`, panels.map((x) => x.tag));
      const copy = core.panels.normalizePanel({ ...original, id: `${tag}_${Date.now().toString(36)}`, tag, name: `${original.name} (copy)` });
      S.draft.panels = [...panels, copy];
      S.open = { kind: 'panel', key: copy.id };
      app.touch(); redraw(['says'], { reveal: `panel-name:${copy.id}` });
    },
    'panel-delete': (el) => {
      S.draft.panels = app.d().panels.filter((x) => x.id !== el.dataset.id);
      S.open = null; S.confirm = null;
      app.touch(); redraw(['says']);
      toast('The panel is deleted. The model is no longer asked for it.');
    },

    // when it's sent
    'when-mode': (el) => {
      const dials = app.d().dials;
      patchTarget(el.dataset.target, { send_when: el.dataset.value === 'dial' && dials.length ? extras.firstWhen(dials[0]) : undefined });
    },
    'when-kind': (el) => {
      const p = promptForTarget(el.dataset.target);
      const kinds = core.dials.requestKindsOf(p);
      const id = el.dataset.kind;
      const next = kinds.includes(id) ? kinds.filter((k) => k !== id) : [...kinds, id];
      patchTarget(el.dataset.target, { injection_trigger: core.dials.triggerFor(next) });
    },
    'when-tag-remove': (el) => {
      const p = promptForTarget(el.dataset.target);
      const tags = (p?.character_tag_trigger || []).filter((x) => x !== el.dataset.tag);
      patchTarget(el.dataset.target, { character_tag_trigger: tags });
    },
    'when-tag-add': (el) => { addTag(el.dataset.target, el.dataset.tag); },

    // what it remembers
    'var-open': (el) => { const { name } = el.dataset; S.open = app.isOpen('var', name) ? null : { kind: 'var', key: name }; redraw(['remembers']); },
    'var-open-only': (el) => { S.open = { kind: 'var', key: el.dataset.name }; S.varFind = ''; redraw(['remembers'], { reveal: `var:${el.dataset.name}` }); },
    'var-make-dial': (el) => {
      const { name } = el.dataset;
      if (app.d().dials.some((x) => x.name === name)) return;
      const dial = core.dials.dialFromVariable(S.draft, name, app.story()?.variables?.[name]);
      if (!dial) { toast('That name cannot be a dial: it needs to start with a letter.'); return; }
      S.draft.dials = [...app.d().dials, dial];
      app.touch(); redraw(['remembers', 'says']);
      toast(`${dial.label} is a dial now, at the top of What it says.`);
    },

    // how it feels
    'feel-step': (el) => { feel.pickStep(app, el.dataset.which, el.dataset.value); app.touch(); redraw(['feel']); },

    // about this preset
    'rf-remove': (el) => { setFields(fields().filter((_, j) => j !== Number(el.dataset.i))); live('request-fields').innerHTML = about.requestFieldsHtml(app); },
    'rf-add': () => {
      setFields([...fields(), { key: '', value: '', to: 'all', enabled: true }]);
      S.folds.request = true;
      live('request-fields').innerHTML = about.requestFieldsHtml(app);
      root.querySelector(`[data-focus="rf-key:${fields().length - 1}"]`)?.focus();
    },
    'script-add': () => {
      const list = scripts();
      setScripts([...list, about.newScript()]);
      S.open = { kind: 'script', key: String(list.length) };
      S.scriptFind = '';
      if (S.section !== 'about') { S.section = 'about'; showSection(root, 'about', { remember: REMEMBER }); }
      redraw(['about'], { reveal: `script-name:${list.length}` });
    },
    'script-open': (el) => { const { i } = el.dataset; S.open = app.isOpen('script', i) ? null : { kind: 'script', key: i }; S.confirm = null; redraw(['about']); },
    'script-kind': (el) => { changeScript(Number(el.dataset.i), about.kindPatch(el.dataset.value)); redraw(['about']); },
    'script-whose': (el) => {
      const i = Number(el.dataset.i);
      const whose = el.dataset.value;
      const placement = Array.isArray(scripts()[i].placement) ? scripts()[i].placement.map(Number) : [];
      const others = placement.filter((p) => p !== 1 && p !== 2);
      changeScript(i, { placement: [...(whose === 'ai' ? [2] : whose === 'user' ? [1] : [1, 2]), ...others] });
      redraw(['about']);
    },
    'script-flag': (el) => {
      const i = Number(el.dataset.i);
      const { pattern, flags } = about.splitRegex(scripts()[i].findRegex);
      const f = el.dataset.flag;
      const next = flags.includes(f) ? flags.replace(f, '') : `${flags}${f}`;
      changeScript(i, { findRegex: pattern ? `/${pattern}/${next}` : '' });
      redraw(['about']);
    },
    'script-dup': (el) => {
      const i = Number(el.dataset.i);
      const list = scripts();
      const original = list[i];
      const copy = { ...original, id: `script_${Date.now().toString(36)}`, scriptName: `${original.scriptName || 'Script'} (copy)` };
      setScripts([...list.slice(0, i + 1), copy, ...list.slice(i + 1)]);
      S.open = { kind: 'script', key: String(i + 1) };
      redraw(['about'], { reveal: `script-name:${i + 1}` });
    },
    'script-delete': (el) => {
      const i = Number(el.dataset.i);
      setScripts(scripts().filter((_, j) => j !== i));
      S.open = null; S.confirm = null;
      redraw(['about']);
      toast('The script is deleted.');
    },
    export: () => {
      if (!S.draft) return;
      try {
        download(exportJson(S.draft), exportName(S.draft), 'application/json');
        S.notice = { error: false, text: 'The preset was exported as a chat-completion preset.' };
      } catch (err) {
        S.notice = { error: true, text: `The preset was not exported: ${err?.message || 'the file could not be written.'}` };
      }
      if (S.section === 'about') redraw(['about']);
    },
    duplicate: async () => {
      const copy = validateAndFixPreset({ ...clone(S.draft), id: uuid(), name: `${S.draft.name || 'Preset'} (Copy)`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await save.flush();
      await shelf.put(copy.id, copy.name, copy);
      S.items = await shelf.list();
      drawDrafts();
      S.notice = { error: false, text: 'A copy is with your presets.' };
      redraw(['about']);
    },
    'preset-delete': async () => {
      const gone = S.id;
      const name = presetName();
      S.confirm = null;
      await shelf.remove(gone);
      S.items = await shelf.list();
      S.id = null; S.draft = null;
      toast(`${name} is deleted from this browser.`);
      const next = S.items[0];
      if (next) await openDraft(next.id);
      else { S.starting = true; drawAll(); }
    },

    // the toolbar and the start
    import: async () => { const file = await pickFile('.json,application/json'); if (file) bringIn(file); },
    'start-storyteller': () => keepNew(storytellerDraft(uuid()), { message: 'The Storyteller is yours to change.' }),
    'start-blank': () => keepNew(blankDraft(uuid())),
    'start-back': () => { S.starting = false; drawStart(); drawDrafts(); showSection(root, S.section, { remember: REMEMBER }); },

    // the request
    'to-request': () => {
      const fold = root.querySelector('.sheet-inspector-fold');
      if (fold) fold.open = true;
      root.querySelector('.sheet-inspector')?.scrollIntoView({ block: 'start', behavior: motion() });
    },
    sample: (el) => { S.sample = el.dataset.value; drawPreview(); if (S.section === 'remembers') redraw(['remembers']); },
    roll: () => { S.seed += 1; drawPreview(); },
    'msg-more': (el) => { const id = el.dataset.msg; if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id); drawPreview(); },
    'copy-request': () => { if (S.run && !S.run.error) copyText(preview.requestJson(S.run), 'The messages are copied'); },
  };

  /** Change handlers: switches, selects, and text fields once they are left. */
  const CHANGE = {
    'block-toggle': (el) => says.setBlock(app, el.dataset.key, { enabled: el.checked }),
    'block-chosen': (el) => {
      const d = app.d();
      const index = d.indexOfKey(el.dataset.key);
      const choice = d.choiceOf(index);
      if (choice) says.choose(app, d.entries[choice.heading].key, el.checked ? el.dataset.key : null);
    },
    choose: (el) => { if (el.value !== 'several') says.choose(app, el.dataset.heading, el.value || null); },
    'block-role': (el) => says.setBlock(app, el.dataset.key, { role: el.value }),
    'block-depth': (el) => placeBlock(el.dataset.key, { injection_depth: Math.max(0, Number(el.value) || 0) }),
    'block-order': (el) => placeBlock(el.dataset.key, { injection_order: Number(el.value) || 0 }),
    'insert-dial': (el) => {
      const ta = root.querySelector(`[data-editor="block:${CSS.escape(el.dataset.key)}"] textarea[data-path="content"]`);
      says.insertDial(app, el.dataset.key, el.value, ta);
      el.value = '';
    },
    'dial-value': (el) => {
      if (el.getAttribute('role') === 'radio') return;
      const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      extras.changeDial(app, el.dataset.name, { value });
      app.touch();
      settle(() => redraw(['says']));
    },
    'dial-label': (el) => settle(() => {
      const name = el.dataset.name;
      const dial = dialOf(name);
      if (!dial) return;
      const label = el.value;
      const usedIn = app.read().variables.find((v) => v.name === name)?.readIn || [];
      const taken = app.d().dials.filter((x) => x.name !== name).map((x) => x.name);
      const follows = !usedIn.length && label.trim() ? core.dials.dialNameFor(label, taken) : null;
      extras.changeDial(app, name, { label }, follows && follows !== name ? follows : null);
      app.touch();
      const now = follows && follows !== name ? follows : name;
      redraw(['says'], { focus: document.activeElement?.dataset?.focus === `dial-label:${name}` ? `dial-label:${now}` : null });
    }),
    'dial-name': (el) => settle(() => {
      const name = el.dataset.name;
      const wanted = el.value.replace(/^\{\{\s*\.?|\s*\}\}$/g, '').trim();
      const taken = app.d().dials.filter((x) => x.name !== name).map((x) => x.name);
      if (wanted && wanted !== name) {
        const to = core.dials.dialNameFor(wanted, taken);
        extras.changeDial(app, name, {}, to);
        app.touch();
        redraw(['says']);
      } else el.value = `{{.${name}}}`;
    }),
    'dial-option': (el) => settle(() => {
      const dial = dialOf(el.dataset.name);
      const i = Number(el.dataset.i);
      const o = dial.options[i];
      const text = el.value.trim();
      if (!text || text === o) { el.value = o; return; }
      extras.changeDial(app, dial.name, { options: dial.options.map((x, j) => (j === i ? text : x)), value: dial.value === o ? text : dial.value });
      app.touch(); redraw(['says']);
    }),
    'dial-min': (el) => settle(() => { extras.changeDial(app, el.dataset.name, { min: Number(el.value) }); app.touch(); redraw(['says']); }),
    'dial-max': (el) => settle(() => { extras.changeDial(app, el.dataset.name, { max: Number(el.value) }); app.touch(); redraw(['says']); }),
    'dial-step': (el) => settle(() => { extras.changeDial(app, el.dataset.name, { step: Number(el.value) }); app.touch(); redraw(['says']); }),
    'dial-unit': (el) => settle(() => redraw(['says'])),
    'dial-line': (el) => settle(() => redraw(['says'])),
    'dial-perstory': (el) => { extras.changeDial(app, el.dataset.name, { perStory: el.checked }); app.touch(); redraw(['says']); },
    'panel-toggle': (el) => { extras.changePanel(app, el.dataset.id, { enabled: el.checked }); app.touch(); redraw(['says']); },
    'panel-name': () => {},
    'panel-tag': (el) => settle(() => {
      const panels = app.d().panels;
      const panel = panels.find((p) => p.id === el.dataset.id);
      const wanted = el.value.replace(/[<>/\s]/g, '');
      if (!wanted || wanted === panel.tag) { el.value = panel.tag; return; }
      extras.changePanel(app, panel.id, { tag: core.panels.panelTagFor(wanted, panels.filter((p) => p.id !== panel.id).map((p) => p.tag)) });
      app.touch(); redraw(['says']);
    }),
    'pfield-name': (el) => settle(() => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i);
      const was = panel.fields[i].name;
      const clean = el.value.replace(/[^\w\s'’-]/g, '').trim();
      if (!clean || clean === was || panel.fields.some((f, j) => j !== i && f.name.toLowerCase() === clean.toLowerCase())) { el.value = was; return; }
      extras.changePanel(app, panel.id, { fields: panel.fields.map((f, j) => (j === i ? { ...f, name: clean } : f)), summary: panel.summary.map((n) => (n === was ? clean : n)) });
      app.touch(); redraw(['says']);
    }),
    'pfield-kind': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i);
      extras.changePanel(app, panel.id, { fields: panel.fields.map((f, j) => (j === i ? { ...f, kind: el.value } : f)) });
      app.touch(); redraw(['says']);
    },
    'pfield-hint': () => {},
    'pfield-max': (el) => settle(() => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i);
      extras.changePanel(app, panel.id, { fields: panel.fields.map((f, j) => (j === i ? { ...f, max: Number(el.value) } : f)) });
      app.touch(); redraw(['says']);
    }),
    'when-dial': (el) => {
      const next = app.d().dials.find((x) => x.name === el.value);
      if (next) patchTarget(el.dataset.target, { send_when: extras.firstWhen(next) });
    },
    'when-is': (el) => {
      const p = promptForTarget(el.dataset.target);
      patchTarget(el.dataset.target, { send_when: { ...p.send_when, is: el.value } });
    },
    'when-than': (el) => settle(() => {
      const p = promptForTarget(el.dataset.target);
      patchTarget(el.dataset.target, { send_when: { ...p.send_when, than: Number(el.value) } });
    }),
    'when-tag-input': (el) => settle(() => { if (el.value.trim()) { const focus = el.dataset.focus; if (addTag(el.dataset.target, el.value)) redraw(['says'], { focus }); } }),
    'feel-num': () => settle(() => redraw(['feel'])),
    'list-builder': (el) => { S.draft = el.checked ? core.builder.toListBuilder(S.draft) : core.builder.toClassicBuilder(S.draft); app.touch(); redraw('all'); },
    names: (el) => { S.draft.names_behavior = Number(el.value); app.touch(); },
    squash: (el) => { S.draft.squash_system_messages = el.checked; app.touch(); },
    effort: (el) => { S.draft.reasoning_effort = el.value; app.touch(); },
    'rf-to': (el) => { const i = Number(el.dataset.i); setFields(fields().map((f, j) => (j === i ? core.request.normalizeRequestField({ ...f, to: el.value }) : f))); patchFields(); },
    'rf-on': (el) => { const i = Number(el.dataset.i); setFields(fields().map((f, j) => (j === i ? core.request.normalizeRequestField({ ...f, enabled: el.checked }) : f))); patchFields(); },
    'rf-preview': (el) => { S.previewFor = el.value; patchFields(); },
    'script-on': (el) => { changeScript(Number(el.dataset.i), { disabled: !el.checked }); redraw(['about']); },
    'script-min': (el) => { const i = Number(el.dataset.i); changeScript(i, { minDepth: el.value === '' ? null : Number(el.value) }); patchScriptHint(i); },
    'script-folder': () => settle(() => redraw(['about'])),
    'script-pattern': (el) => patchScriptHint(Number(el.dataset.i)),
  };

  /** Input handlers: what changes with every keystroke, drawn in place. */
  const INPUT = {
    'dial-value': (el) => {
      if (el.type !== 'range') return;
      extras.changeDial(app, el.dataset.name, { value: Number(el.value) });
      const dial = dialOf(el.dataset.name);
      for (const o of root.querySelectorAll(`[data-live="dialv:${CSS.escape(el.dataset.name)}"]`)) o.textContent = dial.unit ? `${dial.value} ${dial.unit}` : String(dial.value);
      for (const r of root.querySelectorAll(`input[type="range"][data-act="dial-value"][data-name="${CSS.escape(el.dataset.name)}"]`)) if (r !== el) r.value = el.value;
      app.touch();
    },
    'dial-label': (el) => {
      const editor = el.closest('.ps-editor');
      editor?.querySelector('.ps-editor-title') && (editor.querySelector('.ps-editor-title').textContent = el.value);
    },
    'dial-unit': (el) => { extras.changeDial(app, el.dataset.name, { unit: el.value }); app.touch(); },
    'dial-line': (el) => { extras.changeDial(app, el.dataset.name, { line: el.value }); app.touch(); },
    'panel-name': (el) => {
      extras.changePanel(app, el.dataset.id, { name: el.value });
      app.touch();
      const t = live(`panel-title:${el.dataset.id}`);
      if (t) t.textContent = el.value;
      const label = root.querySelector(`[data-panel="${CSS.escape(el.dataset.id)}"] > .ps-row .ps-row-label span`);
      if (label) label.textContent = el.value;
      patchPanelTold(el.dataset.id);
    },
    'pfield-hint': (el) => {
      const panel = app.d().panels.find((p) => p.id === el.dataset.id);
      const i = Number(el.dataset.i);
      extras.changePanel(app, panel.id, { fields: panel.fields.map((f, j) => (j === i ? { ...f, hint: el.value } : f)) });
      app.touch();
      patchPanelTold(panel.id);
    },
    'var-find': (el) => { S.varFind = el.value; live('var-list').innerHTML = extras.remembersList(app); },
    'feel-num': (el) => {
      if (el.value === '' || !Number.isFinite(Number(el.value))) return;
      const key = el.dataset.key;
      S.draft[key] = Number(el.value);
      const out = live(`num:${key}`);
      if (out) out.textContent = String(S.draft[key]);
      for (const other of root.querySelectorAll(`[data-act="feel-num"][data-key="${CSS.escape(key)}"]`)) if (other !== el) other.value = el.value;
      const aside = root.querySelector('[data-fold="numbers"] > summary .ps-fold-aside');
      if (aside) aside.textContent = feel.numbersAside(feel.values(S.draft));
      app.touch();
    },
    'feel-stops': (el) => { S.draft.stop_sequences = el.value.split('\n').filter((l) => l.length).map(feel.readSeq); app.touch(); },
    'rf-key': (el) => { const i = Number(el.dataset.i); setFields(fields().map((f, j) => (j === i ? core.request.normalizeRequestField({ ...f, key: el.value.trim() }) : f))); patchFields(); },
    'rf-value': (el) => { const i = Number(el.dataset.i); setFields(fields().map((f, j) => (j === i ? core.request.normalizeRequestField({ ...f, value: el.value }) : f))); patchFields(); },
    'script-find': (el) => { S.scriptFind = el.value; live('script-list').innerHTML = about.scriptRows(app); },
    'script-name': (el) => { changeScript(Number(el.dataset.i), { scriptName: el.value }); patchScript(Number(el.dataset.i)); },
    'script-folder': (el) => { changeScript(Number(el.dataset.i), { folder: el.value || undefined }); },
    'script-pattern': (el) => {
      const i = Number(el.dataset.i);
      const { flags } = about.splitRegex(scripts()[i].findRegex);
      changeScript(i, { findRegex: el.value ? `/${el.value}/${flags || 'g'}` : '' });
      patchScript(i);
    },
    'script-replace': (el) => { changeScript(Number(el.dataset.i), { replaceString: el.value }); patchScript(Number(el.dataset.i)); },
    'script-sample': (el) => { S.scriptSamples[Number(el.dataset.i)] = el.value; patchScript(Number(el.dataset.i)); },
    'style-sample': (el) => { S.styleSample = el.value; live('style-try').innerHTML = about.stylePreview(app); },
  };

  /* ── wiring ────────────────────────────────────────────────────────────── */
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    const fn = CLICK[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => sayError(err));
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = CHANGE[el.dataset.act];
    if (fn) Promise.resolve(fn(el, e)).catch((err) => sayError(err));
  });
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = INPUT[el.dataset.act];
    if (fn) fn(el, e);
  });
  root.addEventListener('keydown', (e) => {
    const el = e.target;
    // A grip moves its block with ↑ and ↓, and keeps the focus wherever the row lands.
    if (el.matches?.('[data-grip-key]') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const d = app.d();
      const key = el.dataset.gripKey;
      const from = d.indexOfKey(key);
      const to = says.stepFor(d, from, e.key === 'ArrowUp' ? -1 : 1);
      if (to == null) return;
      if (says.move(app, from, to)) {
        const grip = root.querySelector(`[data-grip-key="${CSS.escape(key)}"]`);
        grip?.focus({ preventScroll: true });
        grip?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    // A segmented choice moves with the arrows, as radios do.
    if (el.getAttribute?.('role') === 'radio' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const group = [...el.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]:not([disabled])')];
      const at = group.indexOf(el);
      const next = group[(at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + group.length) % group.length];
      if (next) { e.preventDefault(); next.click(); root.querySelector(`[data-focus="${CSS.escape(next.dataset.focus)}"]`)?.focus(); }
      return;
    }
    if (el.matches?.('[data-act="when-tag-input"]') && (e.key === 'Enter' || e.key === ',')) {
      e.preventDefault();
      const focus = el.dataset.focus;
      if (addTag(el.dataset.target, el.value)) redraw(['says'], { focus });
      return;
    }
    if (e.key === 'Escape' && S.open && root.querySelector('.sheet-main')?.contains(el)) {
      const { kind, key } = S.open;
      S.open = null; S.confirm = null;
      const back = { block: `open:${key}`, dial: `dial-open:${key}`, panel: `panel-open:${key}`, script: `script-open:${key}`, var: `var:${key}` }[kind];
      redraw([S.section], { focus: back });
      drawPreview();
    }
  });
  root.addEventListener('focusin', (e) => {
    if (e.target.matches?.('textarea[data-path="content"]')) e.target.dataset.caret = '1';
  });
  root.addEventListener('toggle', (e) => {
    const f = e.target.closest?.('[data-fold]');
    if (f) S.folds[f.dataset.fold] = f.open;
  }, true);

  bindSheet(root, {
    get: () => S.draft,
    onChange: (path, value, el) => {
      app.touch();
      if (path === 'name') { patchTitles(); return; }
      if (/^prompts\.\d+\.(content|name)$/.test(path)) { patchBlock(el.dataset.key); return; }
      if (path === 'styles') {
        const note = live('styles-note');
        if (note) note.textContent = about.stylesNote(value);
        const t = live('style-try');
        if (t) t.innerHTML = about.stylePreview(app);
      }
    },
  });

  wireIndex(root, {
    remember: REMEMBER,
    onShow: (id) => {
      if (!S.draft) { drawStart(); return; }
      const changed = S.section !== id || S.starting;
      S.section = id;
      if (S.starting) { S.starting = false; drawStart(); drawDrafts(); }
      if (changed) {
        S.open = null; S.confirm = null; redraw([id]); drawPreview();
        const mainEl = root.querySelector('.sheet-main');
        if (mainEl && mainEl.getBoundingClientRect().top < 0 && !matchMedia('(max-width: 900px)').matches) mainEl.scrollIntoView({ block: 'start' });
      }
    },
  });
  wireDrafts(root, { onOpen: (id) => openDraft(id).catch((err) => sayError(err)), onNew: startNew });

  // A preset file dropped anywhere on the sheet is brought in.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const onDragEnter = (e) => { if (!hasFiles(e)) return; dragDepth += 1; root.classList.add('is-dropping'); };
  const onDragLeave = (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove('is-dropping'); };
  root.addEventListener('dragenter', onDragEnter);
  root.addEventListener('dragleave', onDragLeave);
  root.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  root.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    root.classList.remove('is-dropping');
    const file = [...e.dataTransfer.files].find((f) => /\.json$/i.test(f.name) || f.type === 'application/json') || e.dataTransfer.files[0];
    if (file) bringIn(file);
  });

  /* ── dragging a row by its grip (mouse, pen and touch) ─────────────────── */
  root.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip-key]');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const key = grip.dataset.gripKey;
    const from = app.d().indexOfKey(key);
    const rowEl = grip.closest('[data-row]');
    const startY = e.clientY;
    let moved = false;
    let over = null;
    let lastY = e.clientY;
    let raf = 0;
    try { grip.setPointerCapture(e.pointerId); } catch { /* */ }
    const clear = () => { for (const r of root.querySelectorAll('.drop-before, .drop-after')) r.classList.remove('drop-before', 'drop-after'); };
    const scrollLoop = () => {
      if (!moved) return;
      const edge = 90;
      if (lastY < edge) window.scrollBy(0, -Math.ceil((edge - lastY) / 6));
      else if (lastY > innerHeight - edge) window.scrollBy(0, Math.ceil((lastY - (innerHeight - edge)) / 6));
      raf = requestAnimationFrame(scrollLoop);
    };
    const onMove = (ev) => {
      lastY = ev.clientY;
      if (!moved && Math.abs(ev.clientY - startY) < 5) return;
      if (!moved) { moved = true; rowEl?.classList.add('is-dragging'); root.classList.add('is-sorting'); raf = requestAnimationFrame(scrollLoop); }
      clear();
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-row][data-index]:not(.ps-block-detached)');
      over = null;
      if (under && root.contains(under) && under !== rowEl) {
        over = Number(under.dataset.index);
        under.classList.add(over < from ? 'drop-before' : 'drop-after');
      }
    };
    const onUp = () => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      clear();
      rowEl?.classList.remove('is-dragging');
      root.classList.remove('is-sorting');
      if (moved && over != null && over !== from) {
        says.move(app, from, over);
        root.querySelector(`[data-grip-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
      } else if (!moved) grip.focus();
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  });

  const onHide = () => { if (document.visibilityState === 'hidden') save.flush(); };
  document.addEventListener('visibilitychange', onHide);

  /* ── the first draft ───────────────────────────────────────────────────── */
  const handed = take('preset');
  let opened = false;
  if (handed && (handed.json || handed.file)) {
    try {
      const draft = handed.file ? await importFile(handed.file, uuid()) : importJson(handed.json, handed.name, uuid());
      await shelf.put(draft.id, draft.name || 'Untitled', draft);
      S.items = await shelf.list();
      S.section = 'says';
      adopt(draft.id, draft);
      toast(`${draft.name} is in.`);
      opened = true;
    } catch (err) { sayError(err, 'That preset could not be read.'); }
  }
  if (!opened) {
    const current = shelf.current.get();
    const pick = S.items.find((x) => x.id === current) || S.items[0];
    const item = pick ? await shelf.get(pick.id) : null;
    if (item?.data) {
      const remembered = store.get(REMEMBER);
      S.section = SECTIONS.some((s) => s.id === remembered) ? remembered : 'says';
      adopt(pick.id, validateAndFixPreset(item.data));
    } else {
      S.starting = true;
      drawAll();
    }
  }
  if (!S.starting) showSection(root, S.section, { remember: REMEMBER });
  drawStart();

  return () => {
    save.flush();
    clearTimeout(previewTimer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('visibilitychange', onHide);
  };
}
