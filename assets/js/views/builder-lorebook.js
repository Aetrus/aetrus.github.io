// The Lorebook builder: Aetheria's lorebook sheet (src/sheets/LorebookSheet.js)
// in the browser. Volume │ entry tree │ activation inspector, on the shared
// Workshop sheet: the rail holds the volume and its entries, the middle the
// entry (or the volume, the activation test, the files), and the inspector
// the entry's activation, as Aetheria's does. Every reading and writing of
// the book goes through Aetheria's own lorebookUtils, and the activation test
// through its own lorebookEngine.
import { esc, toast, copyText, download, dropZone, confirmButton, store, slugify, starSvg } from '../ui.js';
import { handoff, take } from '../handoff.js';
import { getJSON, loadWorks } from '../data.js';
import { estTokens, fmtTokens } from '../lib/card.js';
import {
  sheetFrame, indexItem, sheetSection, group, wireIndex, showSection, setBadge,
  textField, areaField, tagField, toggleField, numberField, rangeField, selectField, fieldRow,
  bindSheet, saver, draftShelf, draftsHtml, draftSelectHtml, wireDrafts, pickFile, sayError, plural,
} from '../builders/sheet.js';
import {
  lore, LOREBOOK_POSITION, LOREBOOK_META_KEY as META, FIRES, firesOf, firesPatch, firesLine, secondaryHint,
  POSITIONS, positionOf, ROLES, TRIGGERS, asList, entryList, entryTree, descendantsOf, freeUid, newEntry, isRegexKey,
} from '../builders/lorebook/model.js';
import { fromJson, readLorebookFile, toWorldInfo, toCharacterBook, eitherCount } from '../builders/lorebook/codec.js';
import { runTest, sampleFor, EMPTY_RUNTIME } from '../builders/lorebook/activation.js';

const SECTION_KEY = 'aetheria.lorebook.section';
const SELECT_KEY = 'aetheria.lorebook.selected';
const TEST_KEY = (id) => `aetheria.lorebook.test.${id}`;
const RETURN_KEY = 'aetheria.lorebook.returnFor';

const keyOf = (e) => lore.getEntryKey(e);
const titleOf = (e) => (e && typeof e.comment === 'string' && e.comment.trim()) || 'Untitled entry';
const n0 = (v) => Number(v || 0).toLocaleString();
const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const BOOK_ICON = '<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M17 8c-3-2.2-7-2.6-11-1.9v20c4-.7 8-.3 11 1.9 3-2.2 7-2.6 11-1.9v-20c-4-.7-8-.3-11 1.9Zm0 0v20"/></svg>';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'always', label: 'Always' },
  { id: 'keyed', label: 'On a key' },
  { id: 'off', label: 'Off' },
];

const MATCHES = [
  ['matchCharacterDescription', 'The character’s description'],
  ['matchCharacterPersonality', 'The character’s personality'],
  ['matchScenario', 'The scenario'],
  ['matchPersonaDescription', 'Your persona'],
  ['matchCharacterDepthPrompt', 'The character’s depth note'],
  ['matchCreatorNotes', 'The creator’s notes'],
];

export async function render(main, _arg, { setTitle }) {
  setTitle('Lorebook builder');
  main.innerHTML = '<div class="page page-wide" id="lb-page"></div>';
  const page = main.querySelector('#lb-page');
  const shelf = draftShelf('lorebook');
  const mq = matchMedia('(max-width: 900px)');
  const isPhone = () => mq.matches;

  let book = null;
  let id = null;
  let selected = null;
  let section = 'volume';
  let query = '';
  let filter = 'all';
  // Set when the volume came from the Character builder: { draftId } of the character to send it back to.
  let returnTo = null;
  let drafts = [];
  let works = null;
  const openFolds = new Set();
  const test = { text: '', custom: false, extra: {}, runtime: EMPTY_RUNTIME, turn: 1, seed: 1, chance: true, report: null };

  const treeEl = document.createElement('div');
  treeEl.className = 'lb-tree';
  treeEl.setAttribute('role', 'region');
  treeEl.setAttribute('aria-label', 'Entries');

  const sv = saver(async () => {
    if (!book || !id) return;
    await shelf.put(id, book.name, lore.normalizeLorebook(book));
    await redrawDrafts();
  }, { status: { set textContent(v) { const el = page.querySelector('[data-status]'); if (el) el.textContent = v; } } });

  const current = () => (selected && book?.entries?.[selected]) || null;

  // ── Opening volumes ─────────────────────────────────────────────────────

  function setBook(b, draftId, { sectionStart = '' } = {}) {
    book = b;
    id = draftId;
    shelf.current.set(id);
    const remembered = store.get(SELECT_KEY);
    selected = remembered && remembered.id === id && book.entries?.[remembered.uid] ? String(remembered.uid) : null;
    const back = session.get(RETURN_KEY);
    returnTo = back && back.id === id ? { draftId: back.draftId || null } : null;
    const savedTest = store.get(TEST_KEY(id));
    Object.assign(test, {
      text: savedTest?.text ?? sampleFor(book), custom: Boolean(savedTest?.text), extra: savedTest?.extra || {},
      runtime: EMPTY_RUNTIME, turn: 1, seed: 1, report: null,
    });
    drawFrame(sectionStart);
  }

  async function newDraft(b = lore.createLorebookSkeleton('Untitled volume'), opts = {}) {
    await sv.flush();
    const did = b[META]?.id || crypto.randomUUID?.() || String(Date.now());
    await shelf.put(did, b.name, b);
    drafts = await shelf.list();
    setBook(b, did, opts);
  }

  async function openDraft(did) {
    if (did === id) return;
    await sv.flush();
    const item = await shelf.get(did);
    if (!item?.data) { toast('That volume could not be opened.'); return; }
    drafts = await shelf.list();
    setBook(lore.normalizeLorebook(item.data), did);
  }

  async function importBook(result, { from = '', draftId = null } = {}) {
    const n = Object.keys(result.book.entries).length;
    // An empty volume nobody wrote in gives way to the one brought in.
    if (book && id && !entryList(book).length && (book.name || 'Untitled volume') === 'Untitled volume' && !String(book.description || '').trim()) {
      await sv.flush();
      await shelf.remove(id);
      store.remove(TEST_KEY(id));
      book = null; id = null;
    }
    await newDraft(result.book, { sectionStart: 'volume' });
    if (from === 'character') { session.set(RETURN_KEY, { id, draftId }); returnTo = { draftId }; drawFrame('volume'); }
    toast(`Opened ${result.book.name} · ${plural(n, 'entry', 'entries')}`);
  }

  async function importFile(file) {
    if (!file) return;
    try { await importBook(await readLorebookFile(file)); } catch (e) { sayError(e, 'That file could not be read.'); }
  }

  async function openSample(kind, url = '', name = '') {
    try {
      if (kind === 'lq') {
        const starter = (await import('../builders/lorebook/lantern-quay.js')).default;
        await importBook(fromJson(starter, { name: 'Lantern Quay' }));
      } else {
        await importBook(fromJson(await getJSON(url), { name }));
      }
    } catch (e) { sayError(e, 'That lorebook could not be opened.'); }
  }

  // ── The frame ───────────────────────────────────────────────────────────

  function drawFrame(sectionStart = '') {
    const count = entryList(book).length;
    page.innerHTML = sheetFrame({
      id: 'lorebook-sheet',
      eyebrow: 'Lorebook',
      title: book.name || 'Untitled volume',
      index: [
        indexItem({ id: 'volume', label: 'Volume', hint: 'Name, cascade, a card’s budget' }),
        indexItem({ id: 'entries', label: 'Entries', badge: String(count) }),
        indexItem({ id: 'test', label: 'Activation test', hint: 'What fires, and why' }),
        indexItem({ id: 'files', label: 'Import & export', hint: 'World Info, a card’s book' }),
      ].join(''),
      indexFoot: draftsHtml(drafts, id, { noun: 'volume' }),
      toolbar: toolbarHtml(),
      body: [volumeHtml(), entriesSectionHtml(), entryHtml(), testHtml(), filesHtml()].join(''),
      inspector: '',
      inspectorLabel: 'Inspector',
    });
    treeEl.innerHTML = treeShellHtml();
    placeTree();
    redrawRows();
    wireConfirms();
    wireDropzone();
    fillWorks();
    const start = sectionStart || store.get(SECTION_KEY) || 'volume';
    wireIndex(page, { remember: SECTION_KEY, start, onShow: (s) => afterShow(s) });
    scheduleTest(0);
  }

  function toolbarHtml() {
    return `${draftSelectHtml(drafts, id)}
      <span class="save-status" data-status>Kept in this browser</span>
      <span class="spacer"></span>
      ${returnTo ? '<button type="button" class="btn btn-sm btn-gilt" data-act="to-character">Back to the character</button>' : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-act="import">Import</button>
      <button type="button" class="btn btn-sm" data-act="dl-wi" title="Download as World Info JSON">Export</button>`;
  }

  async function redrawDrafts() {
    drafts = await shelf.list();
    const list = page.querySelector('.sheet-drafts');
    if (list) list.outerHTML = draftsHtml(drafts, id, { noun: 'volume' });
    const sel = page.querySelector('[data-draft-select]');
    if (sel) sel.outerHTML = draftSelectHtml(drafts, id);
  }

  function placeTree() {
    const nav = page.querySelector('.sheet-index');
    const slot = page.querySelector('[data-tree-slot]');
    if (isPhone()) { if (slot && treeEl.parentElement !== slot) slot.append(treeEl); }
    else if (nav && treeEl.parentElement !== nav) nav.insertBefore(treeEl, nav.querySelector('.sheet-index-foot'));
  }

  // ── Sections ────────────────────────────────────────────────────────────

  function go(s) {
    if (s === 'entries' && !isPhone()) s = current() ? 'entry' : 'volume';
    if (s === 'entry' && !current()) s = isPhone() ? 'entries' : 'volume';
    section = showSection(page, s, { remember: SECTION_KEY });
    afterShow(section, true);
    return section;
  }

  function afterShow(s, already = false) {
    if (!already && ((s === 'entries' && !isPhone()) || (s === 'entry' && !current()))) { go(s); return; }
    section = s;
    const entriesTab = page.querySelector('.sheet-index-item[data-section="entries"]');
    if (entriesTab && s === 'entry') entriesTab.setAttribute('aria-selected', 'true');
    for (const r of treeEl.querySelectorAll('[data-entry]')) r.setAttribute('aria-current', String(s === 'entry' && r.dataset.entry === selected));
    redrawInspector();
    if (s === 'test') {
      if (!test.custom) { test.text = sampleFor(book); const ta = page.querySelector('[data-lb="test-text"]'); if (ta) ta.value = test.text; }
      if (resultsStale) drawResults();
      scheduleTest(0);
    }
    if (s === 'files') redrawFilesOut();
    if (s === 'volume' && volumeStale) redrawVolumeStats();
  }

  // Volume
  function stats() {
    const list = entryList(book);
    const active = list.filter((e) => !e.disable);
    return {
      count: list.length,
      active: active.length,
      always: active.filter((e) => e.constant).length,
      filed: list.filter((e) => String(e.parentEntryId || '').trim() && book.entries[String(e.parentEntryId).trim()]).length,
      tokens: active.reduce((n, e) => n + estTokens(e.content || ''), 0),
    };
  }

  const statsHtml = (s) => `<div class="statline lb-stats" data-vol-stats>
    <div class="stat"><span class="stat-val">${n0(s.count)}</span><span class="stat-label">Entries</span></div>
    <div class="stat"><span class="stat-val">${n0(s.active)}</span><span class="stat-label">Active</span></div>
    <div class="stat"><span class="stat-val">${n0(s.always)}</span><span class="stat-label">Always on</span></div>
    <div class="stat"><span class="stat-val">~${fmtTokens(s.tokens)}</span><span class="stat-label">Tokens</span></div>
  </div>`;

  function volumeHtml() {
    const s = stats();
    const cas = lore.getLorebookCascadeSettings(book);
    const begin = s.count ? '' : `<div class="lb-begin">
        <p>An empty volume. Write its first entry, bring a lorebook in, or open one to learn from.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-gilt" data-act="add">Add an entry</button>
          <button type="button" class="btn" data-act="import">Import a file</button>
          <button type="button" class="btn btn-ghost" data-act="sample-lq">Open Lantern Quay</button>
        </div>
      </div>`;
    return sheetSection({
      id: 'volume',
      eyebrow: `${s.active} active · ~${n0(s.tokens)} tokens`,
      title: book.name || 'Untitled volume',
      sub: 'Select an entry to edit it, or add one. Entries activate on their keys as the story mentions them.',
      actions: s.count ? '<button type="button" class="btn btn-sm btn-gilt" data-act="add">Add entry</button>' : '',
      body: `${begin}${statsHtml(s)}
        ${group('The volume', `
          ${textField({ path: 'name', label: 'Volume name', value: book.name || '', placeholder: 'Untitled volume' })}
          ${areaField({ path: 'description', label: 'Description', value: book.description || '', rows: 3, tokens: false, placeholder: 'What this volume holds, for whoever opens it.', hint: 'Not sent to the model.' })}
          ${toggleField({ path: 'disabled', label: 'In use', value: Boolean(book.disabled), invert: true, hint: 'Off, the volume is kept but no story reads it.' })}
        `)}
        ${group('Cascade', `
          <div class="field field-toggle"><label class="toggle"><input type="checkbox" id="lb-cascade" data-lb="cascadeEnabled" ${cas.cascadeEnabled ? 'checked' : ''}> Entries open the entries filed under them</label><span class="field-hint">File an entry under another in its inspector, and it comes along when that one fires.</span></div>
          <label class="field lb-narrow"><span class="field-label">How far down</span>
            <input class="input mono" type="number" inputmode="numeric" id="lb-cascade-depth" data-lb="cascadeMaxDepth" min="0" max="10" step="1" value="${cas.cascadeMaxDepth}">
            <span class="field-hint">How many levels one entry can open, from 0 to 10.</span></label>
        `)}
        ${group('For a card’s book', '<p class="field-hint">Written into a card’s book for the apps that read them. Aetheria searches each entry by its own depth and sends all that fires.</p>' + fieldRow(
          numberField({ path: 'scan_depth', label: 'Scan depth', value: book.scan_depth ?? '', min: 0, step: 1, blank: true, placeholder: 'App default', hint: 'How many recent passages a card’s book is searched in.' }),
          numberField({ path: 'token_budget', label: 'Token budget', value: book.token_budget ?? '', min: 0, step: 1, blank: true, placeholder: 'No budget', hint: 'The most a card’s book may send at once.' }),
        ) + toggleField({ path: 'recursive_scanning', label: 'Recursive scanning', value: Boolean(book.recursive_scanning), hint: 'Lets the words of one entry set off another.' }))}
        <div class="lb-danger">
          <div><strong>Delete this volume</strong><p class="field-hint">Deleting a volume removes every entry in it from this browser.</p></div>
          <button type="button" class="btn btn-sm btn-danger" data-confirm="delete-volume">Delete lorebook</button>
        </div>`,
    });
  }

  function entriesSectionHtml() {
    return sheetSection({ id: 'entries', title: 'Entries', body: '<div data-tree-slot></div>' });
  }

  // Entry
  function entryHtml() {
    const e = current();
    if (!e) return sheetSection({ id: 'entry', title: 'No entry chosen', body: '<p class="dim">Choose an entry from the list, or add one.</p>' });
    const list = entryList(book);
    const uid = keyOf(e);
    const ord = list.findIndex((x) => keyOf(x) === uid) + 1;
    const parent = book.entries[String(e.parentEntryId || '').trim()];
    return `<section class="sheet-section lb-entry" data-section-body="entry" hidden role="tabpanel">
      <button type="button" class="lb-back" data-act="to-entries"><span aria-hidden="true">‹</span> All entries</button>
      <header class="sheet-section-head">
        <div><p class="panel-sub" data-entry-eyebrow>${esc(entryEyebrow(e, ord, list.length, parent))}</p><h2 class="sheet-section-title" data-entry-title>${esc(titleOf(e))}</h2></div>
        <div class="btn-row">
          <button type="button" class="btn btn-sm" data-act="duplicate">Duplicate</button>
          <button type="button" class="btn btn-sm btn-danger" data-confirm="remove-entry">Remove</button>
        </div>
      </header>
      <div class="sheet-section-body" data-scope="entries.${esc(uid)}">
        ${textField({ path: 'comment', label: 'Title', value: e.comment || '', hint: 'How you find this entry (not sent to the model).', placeholder: 'Untitled entry' })}
        ${areaField({ path: 'content', label: 'Content', value: e.content || '', rows: 10, placeholder: 'What the story knows once this entry activates…', hint: 'Sent as it is written, when the entry fires.' })}
        <hr class="rule">
        ${keysHtml(e, 'key')}
        ${keysHtml(e, 'keysecondary')}
      </div>
    </section>`;
  }

  const entryEyebrow = (e, ord, total, parent) => `Entry ${ord} of ${total}${parent ? ` · filed under ${titleOf(parent)}` : ''}${e.disable ? ' · off' : ''}`;

  function keysHtml(e, list) {
    const keys = asList(e[list]);
    const label = list === 'key' ? 'Keys' : 'Secondary keys';
    const hint = list === 'key' ? 'Commas between them. A key is a word or a phrase the story might write.' : secondaryHint(e);
    return `<div class="field lb-keys" data-keys="${list}">
      <span class="field-label"><span id="lb-${list}-label">${label}</span><span class="mono">${keys.length || ''}</span></span>
      <div class="lb-chipbox" data-chipbox="${list}">${chipsHtml(keys, list)}</div>
      <span class="field-hint" data-keys-hint="${list}">${esc(hint)}</span>
    </div>`;
  }

  const chipsHtml = (keys, list) => `${keys.map((k, i) => `<span class="lb-chip${isRegexKey(k) ? ' is-regex' : ''}"><button type="button" class="lb-chip-text" data-key-edit="${i}" title="Edit this key">${esc(k)}</button><button type="button" class="lb-chip-x" data-key-remove="${i}" aria-label="Remove ${esc(k)}"><span aria-hidden="true">×</span></button></span>`).join('')}<input class="lb-chip-input" id="lb-keys-${list}" data-key-input="${list}" aria-labelledby="lb-${list}-label" placeholder="${keys.length ? 'Add a key' : list === 'key' ? 'hollow court, the court' : 'Add a key'}" autocomplete="off" spellcheck="false" enterkeyhint="done">`;

  // ── The entry tree ──────────────────────────────────────────────────────

  function treeShellHtml() {
    return `<div class="lb-tree-head">
        <p class="sheet-group-label"><span class="lb-tree-word">Entries</span> <span class="faint" data-tree-count></span></p>
        <button type="button" class="btn btn-sm" data-act="add">Add</button>
      </div>
      <label class="search lb-search">${SEARCH_ICON}<input class="input" type="search" data-lb="query" value="${esc(query)}" placeholder="Search entries" aria-label="Search entries" autocomplete="off" spellcheck="false"></label>
      <div class="lb-filters" role="group" aria-label="Show">${FILTERS.map((f) => `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${filter === f.id}">${f.label}</button>`).join('')}</div>
      <ol class="lb-rows" data-tree-rows aria-label="Entries"></ol>`;
  }

  function redrawRows() {
    const list = entryList(book);
    const ord = new Map(list.map((e, i) => [keyOf(e), i + 1]));
    const q = query.trim().toLowerCase();
    const keep = (e) => (filter === 'always' ? e.constant && !e.disable : filter === 'keyed' ? !e.constant && !e.disable : filter === 'off' ? e.disable : true)
      && (!q || `${e.comment || ''} ${e.content || ''} ${asList(e.key).join(' ')}`.toLowerCase().includes(q));
    const flat = q || filter !== 'all';
    const rows = flat ? list.filter(keep).map((entry) => ({ entry, level: 0 })) : entryTree(list);
    const rowsEl = treeEl.querySelector('[data-tree-rows]');
    const countEl = treeEl.querySelector('[data-tree-count]');
    if (countEl) countEl.textContent = `${rows.length} of ${list.length}`;
    if (!rowsEl) return;
    if (!list.length) rowsEl.innerHTML = '<li class="lb-rows-note">No entries yet. Add one to start the volume.</li>';
    else if (!rows.length) rowsEl.innerHTML = `<li class="lb-rows-note">No entries match${q ? ` “${esc(query.trim())}”` : ' that'}.</li>`;
    else rowsEl.innerHTML = rows.map(({ entry: e, level }) => rowHtml(e, level, ord.get(keyOf(e)))).join('');
    setBadge(page, 'entries', String(list.length));
  }

  /** One entry in the tree, as Aetheria lists it: its number, title, first keys and how it fires, and its tokens. */
  function rowHtml(e, level, ordinal) {
    const uid = keyOf(e);
    const keys = asList(e.key);
    const meta = `${keys.length ? keys.slice(0, 3).join(', ') : 'no keys'}${firesLine(e)}${e.disable ? ' · off' : ''}`;
    const tok = estTokens(e.content || '');
    return `<li><button type="button" class="lb-row${e.disable ? ' is-off' : ''}${e.constant ? ' is-always' : ''}${level ? ' is-filed' : ''}" data-entry="${esc(uid)}" aria-current="${section === 'entry' && uid === selected}" style="--lvl:${Math.min(level, 4)}">
      <span class="lb-num">${ordinal}</span>
      <span class="lb-row-text"><strong>${e.constant ? starSvg('lb-always') : ''}<span>${esc(titleOf(e))}</span></strong><small>${esc(meta)}</small></span>
      <span class="lb-tok" title="About ${tok} tokens">${fmtTokens(tok)}</span>
    </button></li>`;
  }

  // Typing in one entry redraws its own row; a change to what the tree shows redraws the tree.
  let rowsQueued = 0;
  let fullRows = false;
  const patchRows = new Set();
  function scheduleRows(uid = null) {
    if (uid == null || query.trim() || filter !== 'all') fullRows = true; else patchRows.add(String(uid));
    if (rowsQueued) return;
    rowsQueued = requestAnimationFrame(() => {
      rowsQueued = 0;
      if (fullRows) redrawRows();
      else {
        for (const u of patchRows) {
          const btn = treeEl.querySelector(`[data-entry="${CSS.escape(u)}"]`);
          const e = book.entries[u];
          if (!btn || !e) { redrawRows(); break; }
          // Most keystrokes leave the row as it was; only a changed row is touched.
          const html = rowHtml(e, Number(btn.style.getPropertyValue('--lvl')) || 0, btn.querySelector('.lb-num')?.textContent || '');
          if (html !== btn.parentElement.outerHTML) btn.parentElement.outerHTML = html;
        }
      }
      fullRows = false;
      patchRows.clear();
      if (section === 'volume') redrawVolumeStats(); else volumeStale = true;
    });
  }

  // The volume's counts are kept up while it is in view, and brought up to date when it comes back.
  let volumeStale = false;
  function redrawVolumeStats() {
    volumeStale = false;
    const st = stats();
    const s = page.querySelector('[data-vol-stats]');
    if (s) s.outerHTML = statsHtml(st);
    const eb = page.querySelector('[data-section-body="volume"] .sheet-section-head .panel-sub');
    if (eb) eb.textContent = `${st.active} active · ~${n0(st.tokens)} tokens`;
  }

  // ── The inspector ───────────────────────────────────────────────────────

  function redrawInspector() {
    const body = page.querySelector('.sheet-inspector-body');
    if (!body) return;
    const active = document.activeElement;
    const fid = active && body.contains(active) ? active.id : '';
    const top = body.scrollTop;
    const label = page.querySelector('.sheet-inspector-fold > summary .panel-sub');
    const e = section === 'entry' ? current() : null;
    const showing = e ? `entry:${keyOf(e)}` : 'volume';
    if (label) label.textContent = e ? 'This entry' : 'At a glance';
    body.innerHTML = e ? activationHtml(e) : volumeCardHtml();
    for (const d of body.querySelectorAll('details[data-fold]')) d.open = openFolds.has(d.dataset.fold);
    // Redrawn for the same entry, it stays where you were; a new entry starts at the top.
    body.scrollTop = body.dataset.showing === showing ? top : 0;
    body.dataset.showing = showing;
    if (fid) document.getElementById(fid)?.focus({ preventScroll: true });
    drawEntryStatus();
  }

  function volumeCardHtml() {
    const s = stats();
    const cas = lore.getLorebookCascadeSettings(book);
    const r = test.report;
    return `<div class="lb-insp-head"><h2 class="inspector-title">${esc(book.name || 'Untitled volume')}</h2></div>
      <div class="inspector-row"><span>Entries</span><b>${n0(s.count)}</b></div>
      <div class="inspector-row"><span>Active</span><b>${n0(s.active)}</b></div>
      <div class="inspector-row"><span>Always on</span><b>${n0(s.always)}</b></div>
      <div class="inspector-row"><span>Filed under another</span><b>${n0(s.filed)}</b></div>
      <div class="inspector-row"><span>Cascade</span><b>${cas.cascadeEnabled && cas.cascadeMaxDepth > 0 ? `on · ${plural(cas.cascadeMaxDepth, 'level')}` : 'off'}</b></div>
      <div class="inspector-row"><span>Tokens, all active</span><b>~${n0(s.tokens)}</b></div>
      ${Number.isFinite(book.token_budget) && book.token_budget > 0 ? `<div class="inspector-row"><span>A card’s budget</span><b>${n0(book.token_budget)}</b></div>` : ''}
      ${book.disabled ? '<p class="lb-note">Not in use: no story reads this volume.</p>' : ''}
      ${r ? `<div class="lb-insp-test"><p class="panel-sub">In the activation test</p><p><b>${r.fired.length}</b> of ${r.total} fire · ~${n0(r.tokens)} tokens</p>${section !== 'test' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="open-test">Open the test</button>' : ''}</div>` : ''}
      <div class="btn-row"><button type="button" class="btn btn-sm" data-act="add">Add entry</button></div>`;
  }

  function activationHtml(e) {
    const uid = keyOf(e);
    const fires = firesOf(e);
    const pos = Number(e.position);
    const list = entryList(book);
    const barred = descendantsOf(list, uid);
    const parentId = String(e.parentEntryId || '').trim();
    const parents = list.filter((x) => !barred.has(keyOf(x)));
    const atDepth = pos === LOREBOOK_POSITION.AT_DEPTH;
    const kids = list.filter((x) => String(x.parentEntryId || '').trim() === uid && keyOf(x) !== uid);
    const gs = e.useGroupScoring === true ? 'true' : e.useGroupScoring === false ? 'false' : '';
    return `<div class="lb-insp" data-scope="entries.${esc(uid)}">
      <div class="lb-insp-head"><p class="panel-sub">Activation</p><h2 class="inspector-title">When this fires</h2></div>
      <div class="lb-status" data-entry-status hidden></div>
      <label class="field"><span class="field-label">When it fires</span>
        <select class="select" id="lb-fires" data-lb="fires">${FIRES.map((f) => `<option value="${f.id}"${f.id === fires ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
        <span class="field-hint">${esc(FIRES.find((f) => f.id === fires)?.hint || '')}</span></label>
      ${toggleField({ path: 'caseSensitive', label: 'Case sensitive', value: Boolean(e.caseSensitive) })}
      ${toggleField({ path: 'matchWholeWords', label: 'Whole words only', value: Boolean(e.matchWholeWords), hint: 'Stops “art” matching “heart”.' })}
      ${toggleField({ path: 'disable', label: 'Disabled', value: Boolean(e.disable), hint: 'Kept in the volume but never activated.' })}
      <hr class="rule">
      ${numberField({ path: 'order', label: 'Insertion order', value: e.order ?? 100, step: 1, hint: 'Lower inserts earlier among activated entries.' })}
      ${selectField({ path: 'position', label: 'Position', value: pos, kind: 'int', options: POSITIONS.map((p) => ({ value: p.value, label: p.label })), hint: positionOf(pos).hint })}
      ${numberField({ path: 'depth', label: 'Depth', value: e.depth ?? 4, min: 0, step: 1, hint: atDepth ? 'How far back in the history the entry is placed.' : 'How many of the latest passages are searched for its keys.' })}
      ${toggleField({ path: 'useProbability', label: 'Use probability', value: Boolean(e.useProbability) })}
      ${e.useProbability ? rangeField({ path: 'probability', label: 'Probability', value: e.probability ?? 100, min: 0, max: 100, step: 1, format: (v) => `${v}%`, hint: 'How often it fires when its keys come up.' }) : ''}
      ${group('Over several replies', fieldRow(
        numberField({ path: 'sticky', label: 'Sticky', value: e.sticky ?? '', min: 0, step: 1, blank: true, placeholder: 'No', hint: 'Stays on this many replies once it fires.' }),
        numberField({ path: 'cooldown', label: 'Cooldown', value: e.cooldown ?? '', min: 0, step: 1, blank: true, placeholder: 'No', hint: 'Then rests this many replies.' }),
      ))}
      ${group('Cascade', `
        <label class="field"><span class="field-label">Filed under</span>
          <select class="select" id="lb-parent" data-lb="parent">
            <option value="">Nothing, it stands on its own</option>
            ${parents.map((x) => `<option value="${esc(keyOf(x))}"${keyOf(x) === parentId ? ' selected' : ''}>${esc(titleOf(x))}</option>`).join('')}
          </select>
          <span class="field-hint">It opens when that entry fires, if the volume cascades.</span></label>
        ${parentId ? toggleField({ path: 'cascadeFromParent', label: 'Opens with its parent', value: e.cascadeFromParent !== false, hint: 'Off, it waits for its own keys.' }) : ''}
        ${kids.length ? `<p class="lb-kids"><span class="field-label">Filed under it</span>${kids.map((x) => `<button type="button" class="lb-link" data-entry="${esc(keyOf(x))}">${esc(titleOf(x))}</button>`).join('<span class="faint"> · </span>')}</p>` : ''}
        <div><button type="button" class="btn btn-sm btn-ghost" data-act="add-under">Add an entry under this one</button></div>
      `)}
      <details class="lb-more" data-fold="searched"><summary>Searched as well</summary><div class="lb-more-body">
        ${numberField({ path: 'scanDepth', label: 'Scan depth', value: e.scanDepth ?? '', min: 0, step: 1, blank: true, placeholder: atDepth ? '4' : 'The depth', hint: 'How many of the latest passages are searched, in place of the depth.' })}
        <p class="field-hint">Besides the story, its keys are looked for in:</p>
        ${MATCHES.map(([k, l]) => toggleField({ path: k, label: l, value: Boolean(e[k]) })).join('')}
      </div></details>
      <details class="lb-more" data-fold="other"><summary>Kept for other apps</summary><div class="lb-more-body">
        <p class="field-hint">Aetheria keeps these with the entry; apps such as SillyTavern act on them.</p>
        ${group('Inclusion group', `
          ${textField({ path: 'group', label: 'Group', value: e.group || '', placeholder: 'None', hint: 'Of a group that fires together, one is chosen.' })}
          ${fieldRow(
            numberField({ path: 'groupWeight', label: 'Group weight', value: e.groupWeight ?? 100, min: 0, step: 1 }),
            `<label class="field"><span class="field-label">Group scoring</span><select class="select" id="lb-groupscoring" data-lb="useGroupScoring">
              <option value=""${gs === '' ? ' selected' : ''}>The app’s own</option><option value="true"${gs === 'true' ? ' selected' : ''}>On</option><option value="false"${gs === 'false' ? ' selected' : ''}>Off</option></select></label>`,
          )}
          ${toggleField({ path: 'groupOverride', label: 'Prioritise', value: Boolean(e.groupOverride), hint: 'Chosen first in its group, by insertion order.' })}
        `)}
        ${group('Recursion', `
          ${toggleField({ path: 'excludeRecursion', label: 'Non-recursable', value: Boolean(e.excludeRecursion), hint: 'Not set off by another entry’s words.' })}
          ${toggleField({ path: 'preventRecursion', label: 'Prevent further recursion', value: Boolean(e.preventRecursion), hint: 'Its words set off no other entry.' })}
          ${numberField({ path: 'delayUntilRecursion', label: 'Delay until recursion', value: e.delayUntilRecursion ?? 0, min: 0, step: 1, hint: 'Waits for this step of recursion; 0 does not wait.' })}
        `)}
        ${group('Timing and voice', `
          ${fieldRow(
            numberField({ path: 'delay', label: 'Delay', value: e.delay ?? '', min: 0, step: 1, blank: true, placeholder: 'No', hint: 'Not before the story has this many passages.' }),
            selectField({ path: 'role', label: 'Role', value: e.role ?? 0, kind: 'int', options: ROLES, hint: 'Who says it, when placed in the story.' }),
          )}
          <div class="field"><span class="field-label">Triggers</span>
            <div class="chip-row" role="group" aria-label="Triggers">${TRIGGERS.map((t) => `<button type="button" class="chip" data-trigger="${t}" aria-pressed="${asList(e.triggers).includes(t)}">${t}</button>`).join('')}</div>
            <span class="field-hint">Only for these kinds of reply; none means every kind.</span></div>
        `)}
        ${group('Other', `
          ${toggleField({ path: 'ignoreBudget', label: 'Ignore budget', value: Boolean(e.ignoreBudget), hint: 'Sent even when the budget is spent.' })}
          ${toggleField({ path: 'vectorized', label: 'Vectorized', value: Boolean(e.vectorized), hint: 'Found by meaning, where vector storage is on.' })}
          ${textField({ path: 'automationId', label: 'Automation ID', value: e.automationId || '', placeholder: 'None', hint: 'Runs a quick reply when it fires.' })}
          ${tagField({ path: 'characterFilterNames', label: 'Only for these characters', value: asList(e.characterFilterNames), placeholder: 'Names, commas between' })}
          ${tagField({ path: 'characterFilterTags', label: 'Or characters with these tags', value: asList(e.characterFilterTags), placeholder: 'Tags, commas between' })}
          ${toggleField({ path: 'characterFilterExclude', label: 'Leave those characters out instead', value: Boolean(e.characterFilterExclude) })}
        `)}
      </div></details>
    </div>`;
  }

  function drawEntryStatus() {
    const el = page.querySelector('[data-entry-status]');
    const e = current();
    if (!el || !e || !test.report) { if (el) el.hidden = true; return; }
    const uid = keyOf(e);
    const hit = test.report.fired.find((f) => f.uid === uid);
    const miss = test.report.missed.find((m) => m.uid === uid);
    el.hidden = false;
    el.className = `lb-status ${hit ? 'is-on' : 'is-off'}`;
    const why = hit
      ? `<span>${esc(hit.why)}</span>${hit.keys.length || hit.secondary.length ? `<span class="keys">${keyChips(hit.keys)}${keyChips(hit.secondary, ' lb-key-sec')}</span>` : ''}`
      : `<span>${esc(miss?.why || '')}</span>`;
    el.innerHTML = `<span class="lb-status-dot" aria-hidden="true"></span>
      <div class="lb-status-text"><p class="lb-status-head">${hit ? 'Fires in the activation test' : 'Does not fire in the activation test'}</p><p class="lb-hit-why">${why}</p>
      ${section === 'test' ? '' : '<button type="button" class="lb-link" data-act="open-test">Open the test</button>'}</div>`;
  }

  // ── Activation test ─────────────────────────────────────────────────────

  function testHtml() {
    const x = test.extra || {};
    return sheetSection({
      id: 'test',
      eyebrow: 'Activation test',
      title: 'What would fire',
      sub: 'Paste a few lines of a story. Aetheria’s own engine reads them and shows what this volume would send, and why.',
      body: `
        <label class="field"><span class="field-label">The story so far<span class="mono" data-test-count></span></span>
          <textarea class="textarea lb-story" id="lb-test-text" data-lb="test-text" rows="7" spellcheck="false">${esc(test.text)}</textarea>
          <span class="field-hint">One passage per line, the latest last. A name and a colon at the start says who speaks.</span></label>
        <div class="btn-row">
          <button type="button" class="btn btn-sm" data-act="test-sample">Use a sample</button>
          <button type="button" class="btn btn-sm btn-ghost" data-act="test-clear">Clear</button>
        </div>
        <details class="fold lb-fold" data-fold-test="extra"${x.character || x.persona || x.scenario ? ' open' : ''}><summary>Also in the request<span class="sum-meta">for entries that search them</span></summary><div class="fold-body">
          <label class="field"><span class="field-label">The character’s description</span><textarea class="textarea" rows="3" data-lb="test-character" spellcheck="false">${esc(x.character || '')}</textarea></label>
          <label class="field"><span class="field-label">Your persona</span><textarea class="textarea" rows="2" data-lb="test-persona" spellcheck="false">${esc(x.persona || '')}</textarea></label>
          <label class="field"><span class="field-label">The scenario</span><textarea class="textarea" rows="2" data-lb="test-scenario" spellcheck="false">${esc(x.scenario || '')}</textarea>
            <span class="field-hint">Searched only by entries that ask for it under “Searched as well”.</span></label>
        </div></details>
        <div class="lb-turn" role="group" aria-label="Replies">
          <span class="lb-turn-label">Reply <b data-test-turn>${test.turn}</b></span>
          <button type="button" class="btn btn-sm" data-act="next-reply">Next reply</button>
          <button type="button" class="btn btn-sm btn-ghost" data-act="start-over">Start over</button>
          <span class="spacer"></span>
          <label class="toggle"><input type="checkbox" data-lb="test-chance" ${test.chance ? 'checked' : ''}> Let chance decide</label>
          <button type="button" class="btn btn-sm btn-ghost" data-act="reroll" hidden>Roll again</button>
        </div>
        <p class="field-hint">Next reply carries sticky and cooldown turns forward, as a story would.</p>
        <div class="lb-results" data-test-results></div>`,
    });
  }

  let testTimer = 0;
  function scheduleTest(delay = null) {
    clearTimeout(testTimer);
    // A large volume waits for a longer pause in the typing before it is read again.
    const wait = delay ?? (entryList(book || {}).length > 300 ? 500 : 180);
    testTimer = setTimeout(runNow, wait);
  }

  // The results are drawn while the test is in view, and when it comes back into view.
  let resultsStale = true;
  function drawResults() {
    const r = test.report;
    const out = page.querySelector('[data-test-results]');
    if (!out || !r) return;
    out.innerHTML = resultsHtml(r);
    resultsStale = false;
  }

  function runNow() {
    if (!book) return;
    try {
      test.report = runTest(book, { text: test.text, extra: test.extra, runtime: test.runtime, seed: test.seed, chance: test.chance });
    } catch (e) {
      console.warn(e);
      test.report = null;
    }
    const r = test.report;
    if (section === 'test') drawResults(); else resultsStale = true;
    const cnt = page.querySelector('[data-test-count]');
    if (cnt && r) cnt.textContent = plural(r.passages, 'passage');
    const reroll = page.querySelector('[data-act="reroll"]');
    if (reroll) reroll.hidden = !(test.chance && r?.probabilistic);
    setBadge(page, 'test', r ? String(r.fired.length) : '');
    if (section === 'entry') drawEntryStatus();
    else redrawInspector();
  }

  const keyChips = (keys, cls = '') => keys.map((k) => `<span class="key${cls}">${esc(k)}</span>`).join('');

  function resultsHtml(r) {
    const pct = r.budget ? Math.min(100, Math.round((r.tokens / r.budget) * 100)) : 0;
    const over = r.budget && r.tokens > r.budget;
    const head = `<div class="lb-sum">
        <p class="lb-sum-count"><span class="big-number">${r.fired.length}</span><span>of ${plural(r.total, 'entry', 'entries')} ${r.fired.length === 1 ? 'fires' : 'fire'}</span></p>
        <p class="lb-sum-tok"><span class="mono">~${n0(r.tokens)}</span> tokens${r.budget ? ` of a ${n0(r.budget)} budget` : ''}</p>
        ${r.budget ? `<div class="meter-bar lb-budget${over ? ' is-over' : ''}" role="img" aria-label="${pct}% of the budget"><span style="flex-grow:${Math.min(r.tokens, r.budget)}"></span><span class="lb-budget-rest" style="flex-grow:${Math.max(0, r.budget - r.tokens)}"></span></div>` : ''}
      </div>`;
    const notes = [
      r.setAside ? 'This volume is not in use, so a story sends none of it. The test reads it anyway.' : '',
      !r.passages ? 'No story yet: only entries that are always on fire.' : '',
      over ? 'Past the budget. A card’s budget travels with its book; Aetheria itself sends all that fires.' : '',
    ].filter(Boolean).map((t) => `<p class="lb-note">${esc(t)}</p>`).join('');
    const slots = r.byPosition.map((g) => `<section class="lb-slot" aria-label="${esc(g.label)}">
        <h3 class="lb-slot-title"><span>${esc(g.label)}</span><span class="mono faint">${g.items.length}</span></h3>
        <ol class="lb-hits">${g.items.map((f, i) => hitHtml(f, i + 1)).join('')}</ol>
      </section>`).join('');
    const missed = r.missed.length ? `<details class="fold lb-fold" data-fold-test="missed"${openFolds.has('test-missed') ? ' open' : ''}><summary>Did not fire<span class="sum-meta">${r.missed.length}</span></summary><div class="fold-body">
        <ul class="lb-missed">${r.missed.map((m) => `<li class="${m.disabled ? 'is-off' : ''}"><button type="button" class="lb-hit-title" data-entry="${esc(m.uid)}">${esc(m.title)}</button><span>${esc(m.why)}</span></li>`).join('')}</ul>
      </div></details>` : '';
    const sent = r.byPosition.length ? `<details class="fold lb-fold" data-fold-test="sent"${openFolds.has('test-sent') ? ' open' : ''}><summary>The text it sends<span class="sum-meta">~${n0(r.tokens)} tok</span></summary><div class="fold-body">
        ${r.byPosition.map((g) => {
          const texts = g.items.filter((f) => !f.empty).map((f) => String(book.entries[f.uid]?.content || '').trim());
          return texts.length ? `<div class="lb-sent"><p class="sheet-group-label">${esc(g.label)}</p><pre class="json-view">${esc(texts.join('\n\n'))}</pre></div>` : '';
        }).join('')}
      </div></details>` : '';
    return `${head}${notes}${slots || '<p class="lb-note">Nothing fires on these lines.</p>'}${missed}${sent}`;
  }

  /** One entry that fired, numbered in the order it is sent within its place. */
  function hitHtml(f, n) {
    const meta = [
      `order ${f.order}`,
      f.position === LOREBOOK_POSITION.AT_DEPTH ? `depth ${f.depth}` : '',
      f.stickyLeft ? `held ${plural(f.stickyLeft, 'more reply', 'more replies')}` : '',
      f.restsFor ? `then rests ${plural(f.restsFor, 'reply', 'replies')}` : '',
      f.empty ? 'no content' : '',
      f.overBudget ? 'past the budget' : '',
    ].filter(Boolean).join(' · ');
    return `<li class="lb-hit${f.overBudget ? ' is-over' : ''}${f.level ? ' is-cascade' : ''}" style="--lvl:${Math.min(f.level, 4)}">
      <span class="lb-hit-rank" aria-label="Sent ${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} here">${n}</span>
      <div class="lb-hit-main">
        <button type="button" class="lb-hit-title" data-entry="${esc(f.uid)}">${esc(f.title)}</button>
        <p class="lb-hit-why"><span>${esc(f.why)}</span>${f.keys.length || f.secondary.length ? `<span class="keys">${keyChips(f.keys)}${keyChips(f.secondary, ' lb-key-sec')}</span>` : ''}</p>
        <p class="lb-hit-meta">${esc(meta)}</p>
      </div>
      <span class="lb-hit-tok mono" title="About ${f.tokens} tokens">${f.tokens}</span>
    </li>`;
  }

  function saveTest() {
    if (!id) return;
    store.set(TEST_KEY(id), { text: test.custom ? test.text : null, extra: test.extra });
  }

  // ── Files ───────────────────────────────────────────────────────────────

  function filesHtml() {
    return sheetSection({
      id: 'files',
      eyebrow: 'Import & export',
      title: 'Files',
      sub: 'Bring a lorebook in, or take this one out. Nothing leaves this browser unless you save it.',
      body: `${group('Bring one in', `
          <label class="dropzone lb-drop" data-drop>
            <input type="file" accept=".json,.png,.lorebook,application/json,image/png" aria-label="Choose a lorebook or a card">
            ${BOOK_ICON}
            <strong>Drop a lorebook or a card</strong>
            <small>World Info · Aetheria lorebook · character_book · card PNG or JSON</small>
          </label>
          <p class="field-hint">It opens as a new volume; this one stays on your shelf.</p>
          <details class="fold lb-fold"><summary>Or paste JSON</summary><div class="fold-body">
            <textarea class="textarea mono-area" data-lb="paste" rows="7" spellcheck="false" aria-label="Lorebook JSON" placeholder='{"entries": {"0": {"key": ["…"], "content": "…"}}}'></textarea>
            <div class="btn-row"><button type="button" class="btn btn-sm" data-act="paste">Read it</button></div>
          </div></details>
          <div class="lb-samples"><p class="sheet-group-label">Or open one to learn from</p>
            <div class="btn-row" data-works><button type="button" class="btn btn-sm" data-act="sample-lq">Lantern Quay <span class="faint">· Aetheria’s starter</span></button></div>
          </div>`)}
        ${group('Take it out', '<div data-files-out></div>')}`,
    });
  }

  function redrawFilesOut() {
    const out = page.querySelector('[data-files-out]');
    if (!out) return;
    const either = eitherCount(book);
    const wasOpen = out.querySelector('details[data-preview]')?.open;
    out.innerHTML = `<div class="lb-out">
        <div class="lb-out-row"><div><strong>World Info</strong><p class="field-hint">A standalone lorebook, for SillyTavern and Aetheria alike.</p></div>
          <div class="btn-row"><button type="button" class="btn btn-sm btn-gilt" data-act="dl-wi">Download</button><button type="button" class="btn btn-sm" data-act="copy-wi">Copy</button></div></div>
        <div class="lb-out-row"><div><strong>A card’s book</strong><p class="field-hint">The same volume as a character_book, the way a card carries it.</p></div>
          <div class="btn-row"><button type="button" class="btn btn-sm btn-gilt" data-act="dl-cb">Download</button><button type="button" class="btn btn-sm" data-act="copy-cb">Copy</button></div></div>
        <div class="lb-out-row"><div><strong>${returnTo ? 'Back to the character' : 'Into a character'}</strong><p class="field-hint">${returnTo ? 'Sends the book back to the character it came from.' : 'Opens the Character builder with this book bound into its draft.'}</p></div>
          <div class="btn-row"><button type="button" class="btn btn-sm${returnTo ? ' btn-gilt' : ''}" data-act="to-character">${returnTo ? 'Back to the character' : 'Bind into a character'}</button></div></div>
      </div>
      ${either ? `<p class="lb-note">${plural(either, 'entry fires', 'entries fire')} on a key from either list. Exported, ${either === 1 ? 'its keys are' : 'their keys are'} written as one list, which reads the same everywhere.</p>` : ''}
      <details class="fold lb-fold" data-preview${wasOpen ? ' open' : ''}><summary>Preview<span class="sum-meta">${plural(entryList(book).length, 'entry', 'entries')}</span></summary><div class="fold-body">
        <div class="tabs" role="tablist" aria-label="Format"><button type="button" class="tab" role="tab" data-preview-tab="wi" aria-selected="true">World Info</button><button type="button" class="tab" role="tab" data-preview-tab="cb" aria-selected="false">A card’s book</button></div>
        <pre class="json-view" data-preview-json tabindex="0"></pre>
      </div></details>`;
    if (wasOpen) drawPreview('wi');
  }

  function drawPreview(kind) {
    const pre = page.querySelector('[data-preview-json]');
    if (!pre) return;
    for (const t of page.querySelectorAll('[data-preview-tab]')) t.setAttribute('aria-selected', String(t.dataset.previewTab === kind));
    const json = JSON.stringify(kind === 'cb' ? toCharacterBook(book) : toWorldInfo(book), null, 2);
    pre.textContent = json.length > 40000 ? `${json.slice(0, 40000)}\n…` : json;
  }

  async function fillWorks() {
    if (!works) works = (await loadWorks().catch(() => [])).filter((w) => w.type === 'lorebook' && (w.files || []).some((f) => /\.json$/i.test(f.url)));
    const row = page.querySelector('[data-works]');
    if (!row || row.querySelector('[data-act="sample-work"]')) return;
    row.insertAdjacentHTML('beforeend', works.map((w) => `<button type="button" class="btn btn-sm" data-act="sample-work" data-url="${esc(w.files.find((f) => /\.json$/i.test(f.url)).url)}" data-name="${esc(w.name)}">${esc(w.name.split(':')[0])} <span class="faint">· from the archive</span></button>`).join(''));
  }

  function wireDropzone() {
    const z = page.querySelector('[data-drop]');
    if (z) dropZone(z, (files) => importFile(files[0]));
  }

  const bookName = () => book.name || 'lorebook';
  const exportWi = () => JSON.stringify(toWorldInfo(book), null, 2);
  const exportCb = () => JSON.stringify(toCharacterBook(book), null, 2);

  async function toCharacter() {
    await sv.flush();
    handoff.character = { book: toCharacterBook(book), ...(returnTo?.draftId ? { draftId: returnTo.draftId } : {}) };
    toast(returnTo ? 'The book goes back to the character' : 'The book goes to the Character builder');
    location.hash = 'character';
  }

  // ── Editing ─────────────────────────────────────────────────────────────

  function afterEdit(path) {
    sv.poke();
    const m = /^entries\.([^.]+)\.(.+)$/.exec(path);
    if (m) {
      const field = m[2];
      const e = current();
      scheduleRows(['disable', 'parentEntryId', 'fires'].includes(field) ? null : m[1]);
      if (field === 'comment' && e) {
        const t = page.querySelector('[data-entry-title]');
        if (t) t.textContent = titleOf(e);
      }
      if (['disable', 'parentEntryId'].includes(field) && e) {
        const eb = page.querySelector('[data-entry-eyebrow]');
        const list = entryList(book);
        if (eb) eb.textContent = entryEyebrow(e, list.findIndex((x) => keyOf(x) === selected) + 1, list.length, book.entries[String(e.parentEntryId || '').trim()]);
      }
      if (['useProbability', 'position', 'fires', 'parentEntryId'].includes(field)) redrawInspector();
      if (field === 'fires') {
        const h = page.querySelector('[data-keys-hint="keysecondary"]');
        if (h && e) h.textContent = secondaryHint(e);
      }
    } else {
      if (path === 'name') {
        book[META] = { ...(book[META] || {}), name: book.name };
        const nm = book.name || 'Untitled volume';
        const t = page.querySelector('[data-sheet-title]');
        if (t) t.textContent = nm;
        const vt = page.querySelector('[data-section-body="volume"] .sheet-section-title');
        if (vt) vt.textContent = nm;
      }
      if (section !== 'entry') redrawInspector();
    }
    scheduleTest();
  }

  bindSheet(page, { get: () => book, onChange: (path) => afterEdit(path), formats: { probability: (v) => `${v}%` } });

  function setEntry(patch, field) {
    const e = current();
    if (!e) return;
    Object.assign(e, patch);
    afterEdit(`entries.${keyOf(e)}.${field}`);
  }

  /** Write a key list and redraw its chips; `value` is left typed in the new input. */
  function setKeys(list, keys, { value = '', focus = null } = {}) {
    const e = current();
    if (!e) return;
    e[list] = keys;
    const box = page.querySelector(`[data-chipbox="${list}"]`);
    const refocus = focus ?? document.activeElement?.dataset?.keyInput === list;
    if (box) box.innerHTML = chipsHtml(keys, list);
    const count = box?.closest('.lb-keys')?.querySelector('.field-label .mono');
    if (count) count.textContent = keys.length || '';
    const input = box?.querySelector('[data-key-input]');
    if (input) { input.value = value; if (refocus) input.focus(); }
    afterEdit(`entries.${keyOf(e)}.${list}`);
  }

  /** Turn what is typed into keys: up to the last comma as it is typed, all of it on Enter or leaving. */
  function commitKeyInput(input, { all = false } = {}) {
    const list = input.dataset.keyInput;
    const e = current();
    if (!e) return;
    const parts = input.value.split(',');
    const rest = all ? '' : parts.pop().replace(/^\s+/, '');
    const adds = parts.map((x) => x.trim()).filter(Boolean);
    const keys = asList(e[list]);
    const fresh = adds.filter((k, i) => !keys.includes(k) && adds.indexOf(k) === i);
    if (!fresh.length) { input.value = rest; return; }
    setKeys(list, [...keys, ...fresh], { value: rest, focus: document.activeElement === input });
  }

  function select(uid, { focus = false } = {}) {
    selected = uid == null ? null : String(uid);
    store.set(SELECT_KEY, { id, uid: selected });
    const sec = page.querySelector('[data-section-body="entry"]');
    if (sec) sec.outerHTML = entryHtml();
    wireConfirms();
    go(selected ? 'entry' : (isPhone() ? 'entries' : 'volume'));
    if (selected) {
      if (isPhone()) page.querySelector('.sheet-main')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      if (focus) { const t = page.querySelector('[data-section-body="entry"] [data-path="comment"]'); t?.focus(); t?.select(); }
      treeEl.querySelector(`[data-entry="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function addEntry(parent = '') {
    const uid = freeUid(book);
    book = lore.upsertLorebookEntry(book, newEntry(uid, parent ? { parentEntryId: String(parent) } : {}));
    sv.poke();
    redrawVolume();
    redrawRows();
    select(uid, { focus: true });
    scheduleTest();
  }

  function duplicateEntry() {
    const e = current();
    if (!e) return;
    const c = lore.cloneLorebookEntry(e);
    c.uid = freeUid(book);
    c.comment = `${titleOf(e)} (copy)`;
    book = lore.upsertLorebookEntry(book, c);
    sv.poke();
    redrawRows();
    select(c.uid);
    toast('Entry duplicated');
    scheduleTest();
  }

  function removeEntry() {
    const e = current();
    if (!e) return;
    const name = titleOf(e);
    book = lore.deleteLorebookEntry(book, keyOf(e));
    sv.poke();
    redrawVolume();
    redrawRows();
    select(null);
    toast(`Removed ${name}`);
    scheduleTest();
  }

  function redrawVolume() {
    const v = page.querySelector('[data-section-body="volume"]');
    if (!v) return;
    const hidden = v.hidden;
    v.outerHTML = volumeHtml();
    const nv = page.querySelector('[data-section-body="volume"]');
    if (nv) nv.hidden = hidden;
    wireConfirms();
  }

  function wireConfirms() {
    const rm = page.querySelector('[data-confirm="remove-entry"]:not([data-wired])');
    if (rm) { rm.dataset.wired = '1'; confirmButton(rm, removeEntry, 'Remove this entry?'); }
    const dv = page.querySelector('[data-confirm="delete-volume"]:not([data-wired])');
    if (dv) { dv.dataset.wired = '1'; confirmButton(dv, deleteVolume, `Delete ${entryList(book).length ? 'it and every entry' : 'this volume'}?`); }
  }

  async function deleteVolume() {
    await sv.flush();
    const gone = id;
    const name = book.name || 'The volume';
    await shelf.remove(gone);
    store.remove(TEST_KEY(gone));
    book = null; id = null;
    drafts = await shelf.list();
    if (drafts[0]) {
      const item = await shelf.get(drafts[0].id);
      if (item?.data) { setBook(lore.normalizeLorebook(item.data), drafts[0].id, { sectionStart: 'volume' }); toast(`${name} is deleted`); return; }
    }
    await newDraft(undefined, { sectionStart: 'volume' });
    toast(`${name} is deleted`);
  }

  // ── Events ──────────────────────────────────────────────────────────────

  page.addEventListener('click', async (ev) => {
    const t = ev.target;
    const row = t.closest('[data-entry]');
    if (row) { select(row.dataset.entry); return; }
    const f = t.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      for (const c of treeEl.querySelectorAll('[data-filter]')) c.setAttribute('aria-pressed', String(c.dataset.filter === filter));
      redrawRows();
      return;
    }
    const trig = t.closest('[data-trigger]');
    if (trig) {
      const e = current();
      if (!e) return;
      const on = trig.getAttribute('aria-pressed') !== 'true';
      trig.setAttribute('aria-pressed', String(on));
      const set = new Set(asList(e.triggers));
      if (on) set.add(trig.dataset.trigger); else set.delete(trig.dataset.trigger);
      setEntry({ triggers: TRIGGERS.filter((x) => set.has(x)) }, 'triggers');
      return;
    }
    const kr = t.closest('[data-key-remove]');
    if (kr) {
      const list = kr.closest('[data-chipbox]').dataset.chipbox;
      const keys = asList(current()?.[list]);
      keys.splice(Number(kr.dataset.keyRemove), 1);
      setKeys(list, keys, { focus: true });
      return;
    }
    const ke = t.closest('[data-key-edit]');
    if (ke) {
      const list = ke.closest('[data-chipbox]').dataset.chipbox;
      const keys = asList(current()?.[list]);
      const [k] = keys.splice(Number(ke.dataset.keyEdit), 1);
      setKeys(list, keys, { value: k, focus: true });
      return;
    }
    const box = t.closest('[data-chipbox]');
    if (box && t === box) { box.querySelector('[data-key-input]')?.focus(); return; }
    const tab = t.closest('[data-preview-tab]');
    if (tab) { drawPreview(tab.dataset.previewTab); return; }

    const act = t.closest('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'add': addEntry(); break;
      case 'add-under': if (current()) addEntry(keyOf(current())); break;
      case 'duplicate': duplicateEntry(); break;
      case 'to-entries': go(isPhone() ? 'entries' : 'volume'); break;
      case 'open-test': go('test'); break;
      case 'import': importFile(await pickFile('.json,.png,.lorebook,application/json,image/png')); break;
      case 'paste': {
        const ta = page.querySelector('[data-lb="paste"]');
        try { await importBook(fromJson(ta.value, { name: 'Pasted lorebook' })); } catch (e) { sayError(e.message.includes('JSON') ? new Error('That is not valid JSON. Check for a missing brace or comma.') : e); }
        break;
      }
      case 'sample-lq': openSample('lq'); break;
      case 'sample-work': { const b = t.closest('[data-act]'); openSample('work', b.dataset.url, b.dataset.name); break; }
      case 'dl-wi': download(exportWi(), `${slugify(bookName())}.json`, 'application/json'); break;
      case 'dl-cb': download(exportCb(), `${slugify(bookName())}.character_book.json`, 'application/json'); break;
      case 'copy-wi': copyText(exportWi(), 'World Info copied'); break;
      case 'copy-cb': copyText(exportCb(), 'The card’s book copied'); break;
      case 'to-character': toCharacter(); break;
      case 'test-sample': {
        test.text = sampleFor(book); test.custom = false; saveTest();
        const ta = page.querySelector('[data-lb="test-text"]'); if (ta) ta.value = test.text;
        scheduleTest(0); break;
      }
      case 'test-clear': {
        test.text = ''; test.custom = true; saveTest();
        const ta = page.querySelector('[data-lb="test-text"]'); if (ta) { ta.value = ''; ta.focus(); }
        scheduleTest(0); break;
      }
      case 'next-reply':
        if (test.report) test.runtime = test.report.runtime;
        test.turn += 1; test.seed += 1;
        page.querySelector('[data-test-turn]').textContent = test.turn;
        scheduleTest(0); break;
      case 'start-over':
        test.runtime = EMPTY_RUNTIME; test.turn = 1; test.seed = 1;
        page.querySelector('[data-test-turn]').textContent = test.turn;
        scheduleTest(0); break;
      case 'reroll': test.seed += 101; scheduleTest(0); break;
      default: break;
    }
  });

  page.addEventListener('input', (ev) => {
    const el = ev.target;
    const lb = el.dataset?.lb;
    if (el.dataset?.keyInput !== undefined && el.value.includes(',')) { commitKeyInput(el); return; }
    if (!lb) return;
    if (lb === 'query') { query = el.value; redrawRows(); return; }
    if (lb === 'test-text') { test.text = el.value; test.custom = true; saveTest(); scheduleTest(); return; }
    if (lb.startsWith('test-') && lb !== 'test-chance') { test.extra = { ...test.extra, [lb.slice(5)]: el.value }; saveTest(); scheduleTest(); return; }
    if (lb === 'cascadeMaxDepth') {
      if (el.value === '') return;
      book.extensions = lore.withLorebookCascadeSettings(book, { cascadeMaxDepth: el.value }).extensions;
      sv.poke(); scheduleTest(); if (section !== 'entry') redrawInspector();
    }
  });

  page.addEventListener('change', (ev) => {
    const el = ev.target;
    const lb = el.dataset?.lb;
    if (!lb) return;
    if (lb === 'fires') { setEntry(firesPatch(el.value), 'fires'); return; }
    if (lb === 'parent') { setEntry({ parentEntryId: el.value }, 'parentEntryId'); return; }
    if (lb === 'useGroupScoring') { setEntry({ useGroupScoring: el.value === '' ? null : el.value === 'true' }, 'useGroupScoring'); return; }
    if (lb === 'cascadeEnabled') {
      book.extensions = lore.withLorebookCascadeSettings(book, { cascadeEnabled: el.checked }).extensions;
      sv.poke(); scheduleTest(); if (section !== 'entry') redrawInspector(); return;
    }
    if (lb === 'cascadeMaxDepth') { el.value = String(lore.getLorebookCascadeSettings(book).cascadeMaxDepth); return; }
    if (lb === 'test-chance') { test.chance = el.checked; scheduleTest(0); }
  });

  page.addEventListener('keydown', (ev) => {
    const el = ev.target;
    if (el.dataset?.keyInput === undefined) return;
    if (ev.key === 'Enter') { ev.preventDefault(); commitKeyInput(el, { all: true }); return; }
    if (ev.key === 'Backspace' && el.value === '') {
      const list = el.dataset.keyInput;
      const keys = asList(current()?.[list]);
      if (!keys.length) return;
      ev.preventDefault();
      const last = keys.pop();
      setKeys(list, keys, { value: last, focus: true });
    }
  });

  page.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if (el.dataset?.keyInput !== undefined && el.value.trim()) commitKeyInput(el, { all: true });
  });

  page.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d.dataset?.fold) { if (d.open) openFolds.add(d.dataset.fold); else openFolds.delete(d.dataset.fold); }
    if (d.dataset?.foldTest) { if (d.open) openFolds.add(`test-${d.dataset.foldTest}`); else openFolds.delete(`test-${d.dataset.foldTest}`); }
    if (d.matches?.('[data-preview]') && d.open) drawPreview(page.querySelector('[data-preview-tab][aria-selected="true"]')?.dataset.previewTab || 'wi');
  }, true);

  wireDrafts(page, { onOpen: (did) => openDraft(did), onNew: () => newDraft(undefined, { sectionStart: 'volume' }) });

  const onMq = () => {
    placeTree();
    if (!isPhone() && section === 'entries') go(current() ? 'entry' : 'volume');
  };
  mq.addEventListener('change', onMq);
  const onHide = () => { sv.flush(); };
  window.addEventListener('pagehide', onHide);
  const onVis = () => { if (document.visibilityState === 'hidden') sv.flush(); };
  document.addEventListener('visibilitychange', onVis);

  // ── Start ───────────────────────────────────────────────────────────────

  drafts = await shelf.list();
  const h = take('binder') || take('lorebook');
  let opened = false;
  if (h?.json) {
    try { await importBook(fromJson(h.json, { name: h.name || '' }), { from: h.from || '', draftId: h.draftId || null }); opened = true; }
    catch (e) { sayError(e, 'That lorebook could not be opened.'); }
  } else if (h && h.from === 'character') {
    // A character with no book yet: start one for it, to send back when it is written.
    const b = lore.createLorebookSkeleton(h.name || 'Untitled volume');
    await newDraft(b, { sectionStart: 'volume' });
    session.set(RETURN_KEY, { id, draftId: h.draftId || null });
    returnTo = { draftId: h.draftId || null };
    drawFrame('volume');
    opened = true;
  }
  if (!opened) {
    const want = shelf.current.get();
    const pick = (want && drafts.find((d) => d.id === want)) || drafts[0];
    const item = pick && await shelf.get(pick.id);
    if (item?.data) setBook(lore.normalizeLorebook(item.data), pick.id);
    else await newDraft();
  }

  return () => {
    sv.flush();
    clearTimeout(testTimer);
    mq.removeEventListener('change', onMq);
    window.removeEventListener('pagehide', onHide);
    document.removeEventListener('visibilitychange', onVis);
  };
}
