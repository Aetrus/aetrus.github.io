// The sheet every Workshop builder is made on, after Aetheria's own sheets:
// an index of sections on the left, one section of the sheet at a time in the
// middle, and an inspector (a live card, an activation test, a request preview)
// on the right. On phones the index becomes a row of tabs and the inspector
// folds under the sheet.
//
// Fields carry data-path (a dotted path into the draft) and data-kind (how to
// read the value back). bindSheet() writes edits straight into the draft.
import { esc, store, toast } from '../ui.js';
import { estTokens, fmtTokens } from '../lib/card.js';

export const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const isIndex = (k) => /^\d+$/.test(k);

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[isIndex(k) ? Number(k) : k]), obj);
}
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    const key = isIndex(k) ? Number(k) : k;
    if (o[key] == null || typeof o[key] !== 'object') o[key] = isIndex(keys[i + 1]) ? [] : {};
    o = o[key];
  });
  const last = keys[keys.length - 1];
  o[isIndex(last) ? Number(last) : last] = value;
}

const idFor = (path) => `f-${String(path).replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
const hintHtml = (hint) => (hint ? `<span class="field-hint">${hint}</span>` : '');

// ── Frame ──────────────────────────────────────────────────────────────────

/**
 * The three-pane sheet. `index` is indexItem() buttons (plus anything else for
 * the rail, such as a drafts list); `body` is sheetSection() blocks.
 */
export function sheetFrame({ id, eyebrow, title, index = '', indexFoot = '', toolbar = '', body = '', inspector = '', inspectorLabel = 'Inspector' }) {
  return `<div class="sheet" id="${esc(id)}">
    <nav class="sheet-index glass" aria-label="Sections">
      <div class="sheet-index-head"><p class="panel-sub">${esc(eyebrow)}</p><h1 class="sheet-title" data-sheet-title>${esc(title)}</h1></div>
      <div class="sheet-index-list" role="tablist" aria-orientation="vertical">${index}</div>
      ${indexFoot ? `<div class="sheet-index-foot">${indexFoot}</div>` : ''}
    </nav>
    <section class="sheet-main" aria-live="polite">
      ${toolbar ? `<div class="sheet-toolbar">${toolbar}</div>` : ''}
      <div class="sheet-body">${body}</div>
    </section>
    <aside class="sheet-inspector" aria-label="${esc(inspectorLabel)}">
      <details class="sheet-inspector-fold glass" open>
        <summary><span class="panel-sub">${esc(inspectorLabel)}</span></summary>
        <div class="sheet-inspector-body">${inspector}</div>
      </details>
    </aside>
  </div>`;
}

export function indexItem({ id, label, hint = '', num = '', badge = '', active = false }) {
  return `<button type="button" class="sheet-index-item" role="tab" data-section="${esc(id)}" aria-selected="${active}">
    ${num !== '' ? `<span class="sii-num">${esc(num)}</span>` : ''}
    <span class="sii-text"><strong>${esc(label)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    ${badge !== '' ? `<span class="sii-badge" data-badge="${esc(id)}">${esc(badge)}</span>` : `<span class="sii-badge" data-badge="${esc(id)}" hidden></span>`}
  </button>`;
}

/** One section of the sheet. Only the active one is shown. */
export function sheetSection({ id, eyebrow = '', title, sub = '', actions = '', body = '', active = false }) {
  return `<section class="sheet-section" data-section-body="${esc(id)}"${active ? '' : ' hidden'} role="tabpanel">
    <header class="sheet-section-head">
      <div>${eyebrow ? `<p class="panel-sub">${esc(eyebrow)}</p>` : ''}<h2 class="sheet-section-title">${esc(title)}</h2>${sub ? `<p class="sheet-section-sub">${sub}</p>` : ''}</div>
      ${actions ? `<div class="btn-row">${actions}</div>` : ''}
    </header>
    <div class="sheet-section-body">${body}</div>
  </section>`;
}

/** A titled group inside a section (Aetheria's GroupLabel). */
export const group = (label, inner, { note = '' } = {}) => `<div class="sheet-group"><p class="sheet-group-label">${esc(label)}${note ? ` <span class="faint">${esc(note)}</span>` : ''}</p>${inner}</div>`;

/** Switch sections, remember the choice per builder. */
export function showSection(root, id, { remember = '' } = {}) {
  const bodies = [...root.querySelectorAll('[data-section-body]')];
  if (!bodies.some((b) => b.dataset.sectionBody === id)) id = bodies[0]?.dataset.sectionBody;
  for (const b of bodies) b.hidden = b.dataset.sectionBody !== id;
  for (const i of root.querySelectorAll('.sheet-index-item')) i.setAttribute('aria-selected', String(i.dataset.section === id));
  const active = root.querySelector(`.sheet-index-item[data-section="${CSS.escape(id || '')}"]`);
  active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  if (remember) store.set(remember, id);
  return id;
}

/** Wire the index rail. Returns the starting section. */
export function wireIndex(root, { remember = '', start = '', onShow } = {}) {
  root.querySelector('.sheet-index-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('.sheet-index-item');
    if (!b) return;
    const id = showSection(root, b.dataset.section, { remember });
    onShow?.(id);
    if (matchMedia('(max-width: 900px)').matches) root.querySelector('.sheet-main')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  const first = start || (remember && store.get(remember)) || '';
  const id = showSection(root, first, { remember });
  onShow?.(id);
  return id;
}

export function setBadge(root, id, text) {
  const b = root.querySelector(`[data-badge="${CSS.escape(id)}"]`);
  if (!b) return;
  b.textContent = text ?? '';
  b.hidden = text === '' || text == null;
}

// ── Fields ─────────────────────────────────────────────────────────────────

export function textField({ path, label, value = '', hint = '', placeholder = '', mono = false, attrs = '' }) {
  return `<label class="field"><span class="field-label">${esc(label)}</span>
    <input class="input${mono ? ' mono' : ''}" id="${idFor(path)}" data-path="${esc(path)}" data-kind="text" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" ${attrs}>
    ${hintHtml(hint)}</label>`;
}

/** A textarea with a live token count (and optional macro chips via data-macros). */
export function areaField({ path, label, value = '', hint = '', placeholder = '', rows = 4, tokens = true, mono = false, macros = false, attrs = '' }) {
  return `<label class="field"><span class="field-label">${esc(label)}${tokens ? `<span class="mono" data-count="${esc(path)}">${fmtTokens(estTokens(value || ''))} tok</span>` : ''}</span>
    <textarea class="textarea${mono ? ' mono' : ''}" id="${idFor(path)}" data-path="${esc(path)}" data-kind="text"${macros ? ' data-macros' : ''} rows="${rows}" placeholder="${esc(placeholder)}" ${attrs}>${esc(value ?? '')}</textarea>
    ${hintHtml(hint)}</label>`;
}

/** Comma-separated list stored as an array of strings. */
export function tagField({ path, label, value = [], hint = '', placeholder = 'comma, separated' }) {
  return `<label class="field"><span class="field-label">${esc(label)}<span class="mono" data-listcount="${esc(path)}">${(value || []).length || ''}</span></span>
    <input class="input" id="${idFor(path)}" data-path="${esc(path)}" data-kind="list" value="${esc((value || []).join(', '))}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
    ${hintHtml(hint)}</label>`;
}

export function toggleField({ path, label, value = false, hint = '', invert = false }) {
  const on = invert ? !value : !!value;
  return `<div class="field field-toggle"><label class="toggle"><input type="checkbox" id="${idFor(path)}" data-path="${esc(path)}" data-kind="${invert ? 'notbool' : 'bool'}" ${on ? 'checked' : ''}> ${esc(label)}</label>${hintHtml(hint)}</div>`;
}

export function numberField({ path, label, value = '', min = '', max = '', step = 'any', hint = '', placeholder = '', blank = false }) {
  return `<label class="field"><span class="field-label">${esc(label)}</span>
    <input class="input mono" type="number" inputmode="decimal" id="${idFor(path)}" data-path="${esc(path)}" data-kind="${blank ? 'number?' : 'number'}" value="${esc(value ?? '')}" min="${esc(min)}" max="${esc(max)}" step="${esc(step)}" placeholder="${esc(placeholder)}">
    ${hintHtml(hint)}</label>`;
}

/** Slider with its value shown. `format(v)` renders the readout. */
export function rangeField({ path, label, value = 0, min = 0, max = 1, step = 0.01, hint = '', format = (v) => String(v), kind = 'number' }) {
  return `<label class="field"><span class="field-label">${esc(label)}<output class="mono" data-readout="${esc(path)}">${esc(format(value))}</output></span>
    <input type="range" class="range" id="${idFor(path)}" data-path="${esc(path)}" data-kind="${kind}" min="${min}" max="${max}" step="${step}" value="${esc(value)}">
    ${hintHtml(hint)}</label>`;
}

/** options: [{ value, label }] or strings. */
export function selectField({ path, label, value = '', options = [], hint = '', kind = 'text' }) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  return `<label class="field"><span class="field-label">${esc(label)}</span>
    <select class="select" id="${idFor(path)}" data-path="${esc(path)}" data-kind="${kind}">
      ${opts.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>${hintHtml(hint)}</label>`;
}

/** A JSON blob edited as text (extensions, raw request bodies). Invalid JSON is held, not written. */
export function jsonField({ path, label, value = {}, hint = '', rows = 6 }) {
  return `<label class="field"><span class="field-label">${esc(label)}<span class="mono" data-jsonstate="${esc(path)}"></span></span>
    <textarea class="textarea mono" id="${idFor(path)}" data-path="${esc(path)}" data-kind="json" rows="${rows}" spellcheck="false">${esc(JSON.stringify(value ?? {}, null, 2))}</textarea>
    ${hintHtml(hint)}</label>`;
}

export const fieldRow = (...cells) => `<div class="field-row">${cells.join('')}</div>`;

function readValue(el) {
  const kind = el.dataset.kind || 'text';
  if (kind === 'bool') return el.checked;
  if (kind === 'notbool') return !el.checked;
  if (kind === 'number') return el.value === '' ? 0 : Number(el.value);
  if (kind === 'number?') return el.value === '' ? null : Number(el.value);
  if (kind === 'int') return parseInt(el.value, 10) || 0;
  if (kind === 'list') return el.value.split(',').map((s) => s.trim()).filter(Boolean);
  if (kind === 'lines') return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (kind === 'json') return JSON.parse(el.value || '{}');
  if (kind === 'string-number') return String(el.value);
  return el.value;
}

/**
 * Write edits from [data-path] fields into the draft. `get` returns the live
 * draft object; `onChange(path, value, el)` runs after each write.
 * Fields inside an element with data-scope="x.y" have that prefix added.
 */
export function bindSheet(root, { get, onChange, formats = {} }) {
  const handle = (e) => {
    const el = e.target.closest('[data-path]');
    if (!el || !root.contains(el) || el.dataset.kind === 'none') return;
    if (e.type === 'input' && (el.type === 'checkbox' || el.tagName === 'SELECT')) return;
    const scope = el.closest('[data-scope]')?.dataset.scope;
    const path = scope ? `${scope}.${el.dataset.path}` : el.dataset.path;
    let value;
    try { value = readValue(el); } catch {
      const s = root.querySelector(`[data-jsonstate="${CSS.escape(el.dataset.path)}"]`);
      if (s) s.textContent = 'not valid JSON yet';
      el.setAttribute('aria-invalid', 'true');
      return;
    }
    el.removeAttribute('aria-invalid');
    const js = root.querySelector(`[data-jsonstate="${CSS.escape(el.dataset.path)}"]`);
    if (js) js.textContent = '';
    setPath(get(), path, value);
    const count = root.querySelector(`[data-count="${CSS.escape(el.dataset.path)}"]`);
    if (count) count.textContent = `${fmtTokens(estTokens(el.value))} tok`;
    const lc = root.querySelector(`[data-listcount="${CSS.escape(el.dataset.path)}"]`);
    if (lc) lc.textContent = Array.isArray(value) && value.length ? String(value.length) : '';
    const ro = root.querySelector(`[data-readout="${CSS.escape(el.dataset.path)}"]`);
    if (ro) ro.textContent = (formats[el.dataset.path] || String)(value);
    onChange?.(path, value, el);
  };
  root.addEventListener('input', handle);
  root.addEventListener('change', handle);
}

// ── Saving ─────────────────────────────────────────────────────────────────

/** Debounced autosave with a quiet status line ("Saved · 14:02"). */
export function saver(save, { delay = 900, status = null } = {}) {
  let t = 0;
  const say = (s) => { if (status) status.textContent = s; };
  const run = async () => {
    t = 0;
    try { await save(); say(`Saved in this browser · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`); }
    catch (err) { say('Could not save in this browser'); console.warn(err); }
  };
  return {
    poke() { say('Saving…'); clearTimeout(t); t = setTimeout(run, delay); },
    async flush() { if (t) { clearTimeout(t); await run(); } },
    say,
  };
}

// A tiny IndexedDB key-value store (falls back to localStorage), for drafts
// that may hold portraits or whole worlds.
const DB = 'aetheria-archive', OS = 'drafts';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(OS, mode); const s = t.objectStore(OS);
    const req = fn(s);
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
};
export const kv = {
  async get(k) { try { return await tx('readonly', (s) => s.get(k)); } catch { try { return JSON.parse(localStorage.getItem(`aa.${k}`) || 'null'); } catch { return null; } } },
  async set(k, v) { try { await tx('readwrite', (s) => s.put(v, k)); } catch { localStorage.setItem(`aa.${k}`, JSON.stringify(v)); } },
  async del(k) { try { await tx('readwrite', (s) => s.delete(k)); } catch { try { localStorage.removeItem(`aa.${k}`); } catch { /* */ } } },
  async keys(prefix = '') {
    try { const all = await tx('readonly', (s) => s.getAllKeys()); return (all || []).filter((k) => String(k).startsWith(prefix)); }
    catch { try { return Object.keys(localStorage).filter((k) => k.startsWith(`aa.${prefix}`)).map((k) => k.slice(3)); } catch { return []; } }
  },
};

/**
 * A shelf of drafts for one builder: each item { id, name, updated, data }.
 * The index of names is kept separately so listing never loads big drafts.
 */
export function draftShelf(kind) {
  const idxKey = `${kind}:index`;
  const readIdx = async () => (await kv.get(idxKey)) || [];
  return {
    async list() { return (await readIdx()).sort((a, b) => b.updated - a.updated); },
    async get(id) { return kv.get(`${kind}:item:${id}`); },
    async put(id, name, data) {
      const updated = Date.now();
      await kv.set(`${kind}:item:${id}`, { id, name, updated, data });
      const idx = (await readIdx()).filter((x) => x.id !== id);
      idx.push({ id, name: name || 'Untitled', updated });
      await kv.set(idxKey, idx);
    },
    async remove(id) {
      await kv.del(`${kind}:item:${id}`);
      await kv.set(idxKey, (await readIdx()).filter((x) => x.id !== id));
    },
    current: { get: () => store.get(`aetheria.${kind}.current`), set: (id) => store.set(`aetheria.${kind}.current`, id) },
  };
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** The drafts list for the index rail: switch, start new, remove. */
export function draftsHtml(items, currentId, { noun = 'draft' } = {}) {
  return `<div class="sheet-drafts">
    <div class="sheet-drafts-head"><span class="panel-sub">Your ${esc(noun)}s</span><button type="button" class="btn btn-sm" data-draft-new>New</button></div>
    <ul class="sheet-drafts-list">${items.map((d) => `<li><button type="button" class="sheet-draft${d.id === currentId ? ' is-current' : ''}" data-draft-open="${esc(d.id)}" aria-current="${d.id === currentId}">${esc(d.name || 'Untitled')}<small>${new Date(d.updated).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></button></li>`).join('') || `<li class="faint sheet-drafts-empty">Nothing saved yet.</li>`}</ul>
    <p class="field-hint">Kept in this browser only. Export to keep a copy.</p>
  </div>`;
}

/** The same list as a select, for the toolbar on phones (the rail's foot is hidden there). */
export function draftSelectHtml(items, currentId) {
  return `<select class="select draft-select" data-draft-select aria-label="Switch draft">
    ${items.map((d) => `<option value="${esc(d.id)}"${d.id === currentId ? ' selected' : ''}>${esc(d.name || 'Untitled')}</option>`).join('')}
    <option value="__new">+ New</option>
  </select>`;
}

/** Wire both draft lists (rail and toolbar select). */
export function wireDrafts(root, { onOpen, onNew }) {
  root.addEventListener('click', (e) => {
    const o = e.target.closest('[data-draft-open]');
    if (o) { onOpen(o.dataset.draftOpen); return; }
    if (e.target.closest('[data-draft-new]')) onNew();
  });
  root.addEventListener('change', (e) => {
    const s = e.target.closest('[data-draft-select]');
    if (!s) return;
    if (s.value === '__new') onNew(); else onOpen(s.value);
  });
}

// ── Files ──────────────────────────────────────────────────────────────────

/** Open the file picker; resolves with a File (or null if cancelled). */
export function pickFile(accept = '') {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.style.display = 'none';
    document.body.append(i);
    i.addEventListener('change', () => { res(i.files?.[0] || null); i.remove(); }, { once: true });
    i.addEventListener('cancel', () => { res(null); i.remove(); }, { once: true });
    i.click();
  });
}

export const readText = (file) => file.text();
export async function readJsonFile(file) {
  try { return JSON.parse(await file.text()); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
}

/** Show an error the way the sheets do: one plain sentence. */
export function sayError(err, fallback = 'That didn’t work.') {
  const msg = (err && (err.message || String(err))) || fallback;
  toast(msg.length > 160 ? `${msg.slice(0, 157)}…` : msg);
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
