// The World builder: Aetheria's world (the Ages engine, "Veils") made by hand.
// Aetheria compiles a world's book from prose with a model; here the book is
// written word by word from the engine's own vocabulary, then baked, mapped,
// shaped and kept by the engine itself (vendor/aetheria/world.js), running in
// this browser. Rooms after Aetheria's world pane (components/ages/AgesPanel.js).
import { esc, toast, download, confirmButton, dropZone, store } from '../ui.js';
import { sheetFrame, indexItem, sheetSection, group, wireIndex, showSection, setBadge, bindSheet, kv, sayError, plural, pickFile } from '../builders/sheet.js';
import {
  loadCore, loadStarter, TIMELINE, DETAILS, detail, withEngine, progress, nextPaint, buildWorld, previewBook, exportWorld, sizeWord, onMainThread, northUp, relayAtlas,
} from '../builders/world/engine.js';
import {
  blankDraft, draftFromDocument, sameDraft, candidateFrom, bookFormHtml, wireBookForm, biomesHtml, WORDS, windWord,
} from '../builders/world/book.js';
import { MapStudio } from '../builders/world/map.js';
import { AuthorTools } from '../builders/world/author.js';
import { Worldbook } from '../builders/world/worldbook.js';
import { reviewHtml } from '../builders/world/review.js';

const ROOMS = [
  { id: 'world', label: 'World', hint: 'the world at a glance' },
  { id: 'book', label: 'Book', hint: 'every word of it, by hand' },
  { id: 'map', label: 'Map', hint: 'look, read, shape' },
  { id: 'worldbook', label: 'Worldbook', hint: 'what is true of it' },
  { id: 'changes', label: 'Changes', hint: 'review, undo, the record' },
  { id: 'files', label: 'Files', hint: 'take it out, bring one in' },
];
const INSPECTOR_LABELS = { world: 'How a world is made here', book: 'The book, read back', map: 'On the map', worldbook: 'The entry', changes: 'The revision', files: 'What a package holds' };
const OP_WORDS = {
  'feature.create': 'set down', 'feature.update': 'edited', 'feature.move': 'moved', 'feature.duplicate': 'copied', 'feature.delete': 'taken away',
  'feature.protect': 'protection changed', 'region.create': 'marked out', 'region.update': 'edited', 'region.delete': 'no longer marked',
  'environment.paint': 'painted', 'environment.delete': 'paint taken off', 'water.set': 'water level set', 'terrain.sculpt': 'sculpted',
};
const PROSE_WORDS = { accepted: 'the book took the new line', modified: 'the book took your wording', 'structured-only': 'the book was left as it was', rejected: 'the wording was turned down' };
const day = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const when = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
/** A point as a person says it: "320 m east, 1.2 km south of the centre". */
const whereWords = ({ x, z }) => {
  const d = (v) => (Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)} km` : `${Math.round(Math.abs(v))} m`);
  if (Math.hypot(x, z) < 5) return 'At the centre';
  return `${d(x)} ${x < 0 ? 'west' : 'east'}, ${d(z)} ${z < 0 ? 'south' : 'north'} of the centre`;
};
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

export async function render(main, _arg, { setTitle }) {
  setTitle('World builder');
  main.innerHTML = `<div class="page page-wide wb-page"><p class="wb-loading" role="status">Opening the world engine…</p></div>`;
  let core;
  try { core = await loadCore(); } catch (e) {
    main.innerHTML = `<div class="page"><p class="error-note">The world engine could not be loaded. ${esc(e.message)}</p></div>`;
    return;
  }

  // ── State ────────────────────────────────────────────────────────────────
  const S = {
    worlds: [], id: null, w: null, draft: blankDraft(core), pending: null, busy: null, room: 'world',
    history: { canUndo: false, canRedo: false }, wbTotal: 0, importReview: null, status: '',
    exportOpts: { mode: 'full', liveState: 'included', includePreview: true, author: store.get('aetheria.world.author', '') },
    diag: 'biome',
  };
  let alive = true;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); timers.delete(t); t = later(fn, ms); }; };

  // ── Frame ────────────────────────────────────────────────────────────────
  const page = main.querySelector('.page');
  page.innerHTML = sheetFrame({
    id: 'world-sheet', eyebrow: 'Workshop · World', title: 'A new world',
    index: ROOMS.map((r, i) => indexItem({ id: r.id, label: r.label, hint: r.hint, num: String(i + 1).padStart(2, '0') })).join(''),
    indexFoot: '<div class="ww-library" data-library></div>',
    toolbar: `<select class="select draft-select" data-world-select aria-label="Switch world"></select>
      <div class="wb-status" role="status" aria-live="polite"><span class="wb-meter" hidden><i></i></span><span class="save-status" data-status></span></div>
      <span class="spacer"></span>
      <span class="wb-history" role="group" aria-label="Revisions">
        <button type="button" class="btn btn-sm btn-ghost" data-act="undo" title="Undo the last world revision">Undo</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="redo" title="Redo the world revision">Redo</button>
      </span>`,
    body: ROOMS.map((r) => sheetSection({ id: r.id, title: '', body: '' })).join(''),
    inspector: '<div data-insp-review></div><div data-insp-room></div>',
    inspectorLabel: 'Inspector',
  });
  const root = page.querySelector('#world-sheet');
  const $ = (sel) => root.querySelector(sel);
  const section = (id) => root.querySelector(`[data-section-body="${id}"]`);
  const sectionBody = (id) => section(id).querySelector('.sheet-section-body');
  const setHead = (id, { eyebrow = '', title, sub = '', actions = '' }) => {
    const head = section(id).querySelector('.sheet-section-head');
    head.innerHTML = `<div>${eyebrow ? `<p class="panel-sub">${esc(eyebrow)}</p>` : ''}<h2 class="sheet-section-title">${esc(title)}</h2>${sub ? `<p class="sheet-section-sub">${sub}</p>` : ''}</div>${actions ? `<div class="btn-row">${actions}</div>` : ''}`;
  };
  const inspReview = $('[data-insp-review]');
  const inspRoom = $('[data-insp-room]');

  // Persistent pieces: the map, its reading, the shaping tools, the worldbook editor.
  const mapHost = document.createElement('div');
  const hereHost = document.createElement('div'); hereHost.className = 'wi-here';
  const authorHost = document.createElement('div'); authorHost.className = 'wi-author';
  const wbList = document.createElement('div'); wbList.className = 'wwb';
  const wbEditor = document.createElement('div'); wbEditor.className = 'wi-entry';

  const map = new MapStudio(mapHost, core, {
    onInspect: (spot) => renderHere(spot),
    onAuthorPoint: (p) => author.addPoint(p),
    onReviewMoves: (moves) => planMoves(moves),
    onDiagnostic: (layer) => showDiagnostic(layer),
  });
  const author = new AuthorTools(authorHost, {
    core,
    getData: () => S.pending?.preview || S.w?.studio || null,
    isDisabled: () => Boolean(S.busy || S.pending),
    onPlan: (op) => planAuthoring(op),
    onPlanTown: (id, layout) => planTown(id, layout),
    onDrawing: (d) => map.setAuthoring(d),
  });
  const worldbook = new Worldbook(wbList, wbEditor, {
    core,
    worldId: () => S.id,
    blocked: () => (S.pending ? 'Apply or cancel the revision waiting before changing the worldbook.' : S.busy ? 'Working on the world…' : ''),
    onChanged: async () => { if (S.id) S.w.document = await core.agesWorldDocument(S.id); await refreshHistory(); renderChanges(); renderWorldRoom(); },
    onJumpToMap: (entry) => { go('map'); later(() => map.goTo(entry.position.x, entry.position.z, { entryId: entry.id }), 30); },
    onOpen: () => { if (matchMedia('(max-width: 1240px)').matches) later(() => wbEditor.scrollIntoView({ block: 'start', behavior: 'smooth' }), 20); },
    say: (t) => toast(t),
  });

  // ── Status and busy ──────────────────────────────────────────────────────
  const say = (text) => { const el = $('[data-status]'); if (el && !S.busy) el.textContent = text; };
  // A word from the engine stays a while, then the line goes back to how the world stands.
  let noteTimer = 0;
  const note = (text) => {
    S.status = text; say(text);
    clearTimeout(noteTimer); timers.delete(noteTimer);
    noteTimer = later(() => { S.status = ''; say(defaultStatus()); }, 9000);
  };
  const defaultStatus = () => {
    if (S.id && S.w) return isDirty() ? 'The book has changes not yet built' : `Kept in this browser · built ${when(S.w.document.identity.lastBakedAt || S.w.document.identity.updatedAt)}`;
    return S.worlds.length ? 'A new world, not yet built' : 'Nothing is built yet';
  };
  const meterEl = $('.wb-meter');
  const onProgress = ({ fraction, phase, seconds }) => {
    meterEl.hidden = false; meterEl.querySelector('i').style.width = `${Math.round(fraction * 100)}%`;
    meterEl.setAttribute('aria-hidden', 'true');
    const el = $('[data-status]'); if (el) el.textContent = `${phase}… ${seconds.toFixed(1)} s${onMainThread() ? ' · on this page' : ''}`;
  };
  async function busy(label, run) {
    if (S.busy) return undefined;
    S.busy = { label };
    root.classList.add('is-busy');
    syncIdle();
    const el = $('[data-status]'); if (el) el.textContent = `${label}…`;
    try { return await run(); } finally {
      S.busy = null; root.classList.remove('is-busy');
      meterEl.hidden = true; meterEl.querySelector('i').style.width = '0';
      syncIdle(); if (S.status) note(S.status); else say(defaultStatus());
    }
  }
  /** Buttons that wait while the engine works, or while a revision waits. */
  function syncIdle() {
    for (const b of root.querySelectorAll('[data-idle]')) b.disabled = Boolean(S.busy) || (b.dataset.idle === 'free' && Boolean(S.pending));
    if (S.id) for (const b of root.querySelectorAll('[data-act="rebuild"]')) b.disabled = b.disabled || !isDirty();
    for (const b of root.querySelectorAll('[data-act="undo"]')) b.disabled = !S.id || Boolean(S.busy || S.pending) || !S.history.canUndo;
    for (const b of root.querySelectorAll('[data-act="redo"]')) b.disabled = !S.id || Boolean(S.busy || S.pending) || !S.history.canRedo;
    map.setDisabled(Boolean(S.busy || S.pending));
    author.render();
    author.emitDrawing();
  }

  // ── Worlds ───────────────────────────────────────────────────────────────
  async function refreshWorlds() {
    const r = await core.agesListWorlds();
    S.worlds = r.worlds || [];
    renderLibrary();
  }
  const summary = () => S.worlds.find((w) => w.world_id === S.id) || null;
  const isAtlas = () => Boolean(S.w?.document?.layers?.atlas?.enabled);
  const isDirty = () => (S.id && S.w ? !sameDraft(S.draft, draftFromDocument(core, S.w.document)) : true);
  const draftKey = () => `world:book:${S.id || 'new'}`;
  const keepDraft = debounce(async () => {
    try {
      if (S.id && !isDirty()) await kv.del(draftKey()); else await kv.set(draftKey(), S.draft);
    } catch { /* the book is still on the page */ }
  }, 500);

  async function loadWorld() {
    const id = S.id;
    const [manifest, document, studio, synopsis, state, book] = await Promise.all([
      core.agesManifest(id), core.agesWorldDocument(id), core.agesMapStudioData(id), core.agesSynopsis(id), core.agesState(id, TIMELINE),
      core.agesWorldbook(id, TIMELINE, { pageSize: 10 }),
    ]);
    if (id !== S.id) return;
    S.w = { manifest, document, studio, synopsis: synopsis?.synopsis || '', state };
    S.wbTotal = book.total || 0;
    S.history = core.agesHistoryStatus(id);
    map.setWorld(studio, state);
    if (S.diag !== 'biome') showDiagnostic(S.diag);
  }
  async function refreshHistory() { if (S.id) { S.history = core.agesHistoryStatus(S.id); const b = await core.agesWorldbook(S.id, TIMELINE, { pageSize: 10 }); S.wbTotal = b.total || 0; setBadge(root, 'worldbook', String(S.wbTotal)); } syncIdle(); }

  async function openWorld(id, { room = null } = {}) {
    if (S.pending) await cancelPending({ quiet: true });
    S.id = id; S.w = null; S.diag = 'biome';
    store.set('aetheria.world.current', id);
    try { await loadWorld(); } catch (e) {
      sayError(e, 'That world could not be opened.');
      S.id = null; store.remove('aetheria.world.current');
      return newWorld();
    }
    const kept = await kv.get(draftKey()).catch(() => null);
    S.draft = kept && kept.book && kept.kind === draftFromDocument(core, S.w.document).kind ? kept : draftFromDocument(core, S.w.document);
    author.reset();
    worldbook.loadedFor = null; worldbook.selectedId = null;
    renderAll();
    if (room) go(room);
    if (S.room === 'worldbook') worldbook.load().catch((e) => sayError(e));
  }
  async function newWorld({ room = 'book' } = {}) {
    if (S.pending) await cancelPending({ quiet: true });
    S.id = null; S.w = null;
    store.remove('aetheria.world.current');
    const kept = await kv.get('world:book:new').catch(() => null);
    S.draft = kept?.book ? kept : blankDraft(core);
    map.setWorld(null, null);
    author.reset();
    renderAll();
    go(room);
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function renderAll() {
    renderLibrary(); renderTitle(); renderWorldRoom(); renderBookRoom(); renderMapRoom(); renderWorldbookRoom(); renderChanges(); renderFiles();
    renderInspector(); syncIdle(); say(S.status || defaultStatus());
    setBadge(root, 'changes', S.pending ? '1' : '');
    setBadge(root, 'worldbook', S.id && S.wbTotal ? String(S.wbTotal) : '');
  }
  function renderTitle() {
    const name = S.w?.document?.identity?.name || (S.draft.name || '').trim() || 'A new world';
    $('[data-sheet-title]').textContent = name;
  }
  function renderLibrary() {
    const host = $('[data-library]');
    host.innerHTML = `<div class="sheet-drafts">
      <div class="sheet-drafts-head"><span class="panel-sub">Your worlds</span><button type="button" class="btn btn-sm" data-act="new" data-idle>New</button></div>
      <ul class="sheet-drafts-list ww-list">${S.worlds.map((w) => `<li><button type="button" class="sheet-draft ww-item${w.world_id === S.id ? ' is-current' : ''}" data-open="${esc(w.world_id)}" aria-current="${w.world_id === S.id}">
        <span class="ww-thumb" aria-hidden="true">${w.cover_url || w.preview_url ? `<img src="${esc(w.cover_url || w.preview_url)}" alt="">` : ''}</span>
        <span class="ww-item-text">${esc(w.seed || 'Untitled')}<small>${new Date(w.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></span></button></li>`).join('')
        || '<li class="faint sheet-drafts-empty">No world built yet.</li>'}</ul>
      <p class="field-hint">Kept in this browser by the world engine. Export one to keep a copy.</p>
    </div>`;
    const sel = $('[data-world-select]');
    sel.innerHTML = `${S.worlds.map((w) => `<option value="${esc(w.world_id)}"${w.world_id === S.id ? ' selected' : ''}>${esc(w.seed || 'Untitled')}</option>`).join('')}<option value="__new"${S.id ? '' : ' selected'}>+ A new world</option>`;
  }

  // World ─────────────────────────────────────────────────────────────────
  function renderWorldRoom() {
    const body = sectionBody('world');
    if (!S.id || !S.w) {
      setHead('world', { eyebrow: 'The world', title: S.worlds.length ? 'A new world' : 'Begin a world', sub: 'Build a world by hand from the engine’s own words, then walk its map. It stays in this browser until you export it.' });
      body.innerHTML = `<div class="ww-doors">
        <button type="button" class="ww-door" data-go="book"><span class="ww-door-mark" aria-hidden="true">✦</span><strong>Begin with the book</strong><span>Choose the land, the water, the sky and the weather, word by word, and the engine grows the world from them.</span></button>
        <button type="button" class="ww-door" data-act="starter" data-idle><span class="ww-door-mark" aria-hidden="true">✦</span><strong>Lantern Quay</strong><span>Aetheria’s starter world: a harbour town under a cliff on a cold west coast, a tidal island, a moor inland.</span></button>
        <button type="button" class="ww-door" data-go="files"><span class="ww-door-mark" aria-hidden="true">✦</span><strong>Bring a world in</strong><span>Open an .aetheria-age package from Aetheria or from another archive.</span></button>
      </div>
      <p class="field-hint">Writing a world from prose, and reading one out of a lorebook, happen in Aetheria.</p>`;
      return;
    }
    const doc = S.w.document; const man = S.w.manifest; const sum = summary();
    const atlas = isAtlas();
    const spatial = man.spatial;
    const metrics = man.diagnostics?.metrics;
    const made = doc.layers.authoredFeatures.features.filter((f) => !(f.tags || []).includes('atlas')).length
      + (atlas ? (doc.layers.atlas.places || []).filter((p) => p.source === 'manual').length : 0);
    const notes = [...(man.diagnostics?.warnings || []), ...(atlas ? doc.layers.atlas.notes || [] : [])];
    setHead('world', {
      eyebrow: atlas ? 'Drawn as a map' : 'Grown from the land', title: doc.identity.name,
      actions: '<button type="button" class="btn btn-sm btn-gilt" data-go="map">Open the map</button><button type="button" class="btn btn-sm" data-go="book">The book</button>',
    });
    const top = atlas ? [] : commonLegend();
    body.innerHTML = `
      <div class="ww-hero">
        <div class="ww-picture-wrap">
          <figure class="ww-picture">${sum?.cover_url ? `<img src="${esc(sum.cover_url)}" alt="The picture of ${esc(doc.identity.name)}">` : sum?.preview_url ? `<img src="${esc(sum.preview_url)}" alt="The map of ${esc(doc.identity.name)}">` : ''}</figure>
          <div class="btn-row ww-picture-acts"><button type="button" class="btn btn-sm btn-ghost" data-act="cover" data-idle>${sum?.cover_url ? 'Another picture' : 'Give it a picture'}</button>${sum?.cover_url ? '<button type="button" class="btn btn-sm btn-ghost" data-act="uncover" data-idle>Show the map</button>' : ''}</div>
        </div>
        <div class="ww-copy">
          <p class="ww-synopsis">${esc(S.w.synopsis || '')}</p>
          ${man.instability > 0 ? `<p class="ww-kept"><span class="panel-sub">Kept in the book, not on the map</span>${esc((man.unmapped || []).join('; '))}</p>` : ''}
          ${top.length ? `<div class="ww-ground" aria-label="The land">${top.map((b) => `<span class="wb-biome" title="${esc(b.prose || '')}"><i style="background:${esc(b.color)}"></i>${esc(core.biomeName(b))}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <dl class="ww-figures">
        <div><dt>Across</dt><dd>${esc(km(spatial.width))}</dd></div>
        <div><dt>Detail</dt><dd>${man.resolution} cells</dd></div>
        <div><dt>Made by hand</dt><dd>${made}</dd></div>
        <div><dt>Worldbook</dt><dd>${plural(S.wbTotal, 'entry', 'entries')}</dd></div>
        <div><dt>Built</dt><dd title="${esc(when(doc.identity.lastBakedAt || doc.identity.updatedAt))}">${esc(day(doc.identity.lastBakedAt || doc.identity.updatedAt))}</dd></div>
        <div><dt>Seed</dt><dd class="mono">${esc(doc.identity.masterSeed)}</dd></div>
      </dl>
      ${metrics && !atlas ? `<p class="field-hint">${metrics.riverCells} river cells · ${metrics.generatedFeatureCount} places the land made · ${(metrics.peakArrayBytes / 1024 / 1024).toFixed(1)} MB of derived data</p>` : ''}
      ${notes.map((n) => `<p class="ww-note">${esc(n)}</p>`).join('')}
      <div class="ww-danger">
        <div><p class="panel-sub">Let this world go</p><p class="field-hint">Removes the world, its map, its worldbook and its history from this browser. Export it first to keep a copy.</p></div>
        <button type="button" class="btn btn-sm btn-danger" data-act="delete" data-idle>Delete this world</button>
      </div>`;
    const del = body.querySelector('[data-act="delete"]');
    confirmButton(del, () => deleteWorld(), `Delete ${doc.identity.name}?`);
  }
  function commonLegend() {
    const st = S.w?.studio; if (!st) return [];
    const counts = new Map();
    for (let i = 0; i < st.biomeId.length; i += 1) { if (st.belowSea[i] || st.lakes[i] || st.rivers[i]) continue; counts.set(st.biomeId[i], (counts.get(st.biomeId[i]) || 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => st.manifest.biome_legend[String(id)]).filter(Boolean);
  }

  // Book ──────────────────────────────────────────────────────────────────
  const bookFormats = new Proxy({}, {
    get: (_t, path) => {
      const p = String(path);
      if (p.endsWith('terrain.intensity')) return WORDS.intensity;
      if (p.endsWith('ground.vegetation')) return WORDS.vegetation;
      if (p.endsWith('water.level')) return WORDS.water;
      if (p.endsWith('fog.density')) return WORDS.fog;
      if (p.endsWith('rainfall.amount')) return WORDS.rain;
      if (p.endsWith('wind.direction')) return windWord;
      if (p.endsWith('wind.strength')) return WORDS.strength;
      if (p.endsWith('sea.reach')) return WORDS.reach;
      if (/landforms\.\d+\.intensity$/.test(p)) return WORDS.landform;
      return undefined;
    },
  });
  function renderBookRoom({ focus = '' } = {}) {
    const existing = Boolean(S.id && S.w);
    const atlas = S.draft.kind === 'atlas';
    const dirty = isDirty();
    setHead('book', {
      eyebrow: existing ? (atlas ? 'Drawn as a map' : 'Grown from the land') : 'A new world',
      title: 'The book of the world',
      sub: atlas
        ? 'The sea, the ground and the sky, chosen from the engine’s own words. Towns, roads and woods are set down on the map.'
        : 'Every choice is a word from the engine’s own vocabulary. The world is grown from them.',
      actions: existing
        ? `<button type="button" class="btn btn-sm btn-ghost" data-act="discard" data-idle${dirty ? '' : ' hidden'}>Discard changes</button><button type="button" class="btn btn-gilt" data-act="rebuild" data-idle="free"${dirty ? '' : ' disabled'}>Rebuild from the book</button>`
        : `<label class="wb-detail"><span class="sr-only">Detail</span><select class="select" data-detail aria-label="Detail">${DETAILS.map((d) => `<option value="${d.value}"${detail.get() === d.value ? ' selected' : ''}>${esc(d.label)} · ${d.value} cells</option>`).join('')}</select></label><button type="button" class="btn btn-gilt" data-act="build" data-idle>Build the world</button>`,
    });
    const body = sectionBody('book');
    body.innerHTML = `<div class="wb-form" data-book>${bookFormHtml(core, S.draft, { existing })}</div>
      <div class="wb-form-foot btn-row">${existing
        ? `<button type="button" class="btn btn-gilt" data-act="rebuild" data-idle="free"${dirty ? '' : ' disabled'}>Rebuild from the book</button><span class="field-hint">You see the change on the map before it is made.</span>`
        : `<button type="button" class="btn btn-gilt" data-act="build" data-idle>Build the world</button><span class="field-hint">${esc(DETAILS.find((d) => d.value === detail.get())?.hint || '')}</span>`}</div>
      ${existing ? `<details class="fold wb-doc" data-doc-fold><summary>The world document <span class="sum-meta">as data</span></summary><div class="fold-body">
        <p class="field-hint">The built world, as data. Edits go through the same review and undo as everything else.</p>
        <textarea class="textarea mono wb-doc-text" data-doc-text rows="16" spellcheck="false" aria-label="The world document, as JSON"></textarea>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="review-doc" data-idle="free">Review this edit</button><span class="field-hint" data-doc-note></span></div>
      </div></details>` : ''}`;
    const fold = body.querySelector('[data-doc-fold]');
    fold?.addEventListener('toggle', async () => {
      if (!fold.open || !S.id) return;
      const ta = fold.querySelector('[data-doc-text]');
      ta.value = JSON.stringify(await core.agesWorldDocument(S.id), null, 2);
    });
    if (focus) body.querySelector(focus)?.focus();
    syncIdle();
  }
  const bookChanged = () => {
    renderTitle(); keepDraft(); S.status = ''; say(defaultStatus());
    const dirty = isDirty();
    for (const b of root.querySelectorAll('[data-act="rebuild"]')) b.disabled = !dirty || Boolean(S.busy || S.pending);
    const d = section('book').querySelector('[data-act="discard"]'); if (d) d.hidden = !dirty;
    schedulePreview();
    if (S.room === 'book') readBackSoon();
  };
  const STRUCTURAL = ['kind', 'extras.temperature.mode', 'extras.rainfall.mode', 'atlas.sea.side'];
  bindSheet(section('book'), {
    get: () => S.draft,
    formats: bookFormats,
    onChange: (path, _v, el) => {
      if (STRUCTURAL.includes(path)) { renderBookRoom({ focus: `[data-path="${CSS.escape(el.dataset.path)}"]` }); }
      if (path === 'name') renderTitle();
      bookChanged();
    },
  });
  wireBookForm(section('book'), {
    get: () => S.draft,
    onChange: (path) => {
      if (path === 'kind') renderBookRoom({ focus: '[data-choose="kind"][aria-checked="true"]' });
      if (path === 'book.ground.palette') { const b = section('book').querySelector('[data-biomes]'); if (b) b.outerHTML = biomesHtml(core, S.draft.book.ground.palette); }
      bookChanged();
    },
    onStructure: (_what, focusSel) => { renderBookRoom({ focus: focusSel }); bookChanged(); },
  });

  // The book read back (laying out an atlas takes a moment, so not on every key), and a quick look at it.
  const readBackSoon = debounce(() => renderBookInspector(), 160);
  let previewToken = 0;
  const schedulePreview = debounce(async () => {
    const token = ++previewToken;
    try {
      const { doc } = candidateFrom(core, S.draft, S.id ? S.w?.document : null);
      let url = '';
      if (S.draft.kind === 'atlas') { core.prepareAtlasDocument(doc); url = core.atlasPicture(doc.layers.atlas, { width: 360, height: 270, whole: true, look: map.lookName() }); }
      else url = await previewBook(core, doc, 96);
      if (token !== previewToken || !alive) return;
      S.bookPreview = url;
      const img = inspRoom.querySelector('[data-book-preview]');
      if (img) { img.src = url; img.closest('figure').classList.remove('is-waiting'); }
    } catch (e) { if (token === previewToken) S.bookPreview = ''; }
  }, 420);
  function renderBookInspector() {
    if (S.room !== 'book') return;
    let synopsis = ''; let warnings = []; let book = null;
    try {
      const c = candidateFrom(core, S.draft, S.id ? S.w?.document : null);
      if (S.draft.kind === 'atlas') core.prepareAtlasDocument(c.doc);
      synopsis = core.generateWorldSynopsis(c.doc); warnings = c.warnings; book = c.book;
    } catch (e) { synopsis = ''; warnings = [String(e.message || e)]; }
    const existing = Boolean(S.id && S.w);
    if (!inspRoom.querySelector('[data-book-insp]')) {
      inspRoom.innerHTML = `<div data-book-insp>
        <figure class="wb-preview${S.bookPreview ? '' : ' is-waiting'}"><img data-book-preview src="${esc(S.bookPreview || '')}" alt="A quick look at the world the book describes"><figcaption data-preview-caption></figcaption></figure>
        <div class="wb-readback"><p class="panel-sub">As the engine reads it</p><p data-readback></p></div>
        <div data-book-warnings></div>
        <p class="field-hint" data-book-dirty></p>
        <details class="wb-json"><summary>The book as data</summary><pre class="json-view mono" data-book-json></pre></details>
      </div>`;
    }
    const q = (sel) => inspRoom.querySelector(sel);
    q('[data-preview-caption]').textContent = S.draft.kind === 'atlas' ? 'The land as the map lays it out.' : 'A quick look, 96 cells across. The world itself is built finer.';
    q('[data-readback]').textContent = synopsis;
    q('[data-book-warnings]').innerHTML = warnings.map((w) => `<p class="wrv-warn">${esc(w)}</p>`).join('');
    q('[data-book-dirty]').textContent = existing ? (isDirty() ? 'The book has changes not yet built. Rebuild to review them on the map before they are made.' : 'The book is as the world was built.') : 'Nothing is built until you build it. The book is kept in this browser meanwhile.';
    q('[data-book-json]').textContent = JSON.stringify(book || {}, null, 2);
  }

  // Map ───────────────────────────────────────────────────────────────────
  function renderMapRoom() {
    const body = sectionBody('map');
    if (!S.id || !S.w) {
      setHead('map', { eyebrow: 'The map', title: 'No world yet', sub: 'Build a world from the book, or bring one in, and its map opens here.' });
      body.innerHTML = '<div class="ww-doors ww-doors-two"><button type="button" class="ww-door" data-go="book"><strong>Open the book</strong><span>Choose the words the world is grown from.</span></button><button type="button" class="ww-door" data-go="files"><strong>Bring a world in</strong><span>Open an .aetheria-age package.</span></button></div>';
      return;
    }
    setHead('map', { eyebrow: isAtlas() ? 'Drawn as a map' : 'Grown from the land', title: `The map of ${S.w.document.identity.name}` });
    if (!body.contains(mapHost)) { body.innerHTML = ''; body.append(mapHost); }
    map.schedule();
  }
  function renderHere(spot) {
    if (S.room !== 'map') return;
    if (!S.w) { hereHost.innerHTML = ''; return; }
    if (!spot) {
      hereHost.innerHTML = '<p class="wi-how">Drag to look around; scroll, pinch or use + and − to zoom. Point at the map to read the ground there, and tap or click to pin a point. North is up.</p>';
      return;
    }
    const { cell, atlasSpot, entry, pinned, atlas, point } = spot;
    let html = '';
    if (atlasSpot) {
      const place = atlasSpot.place && atlas.places.find((p) => p.id === atlasSpot.place.id);
      html += `<h3 class="inspector-title">${esc(atlasSpot.title)}</h3>${atlasSpot.line ? `<p class="wi-line">${esc(atlasSpot.line)}</p>` : ''}${place?.description ? `<p>${esc(place.description)}</p>` : ''}`;
    } else if (cell) {
      html += `<h3 class="inspector-title">${esc(core.biomeName(cell.biome) || 'Unnamed ground')}</h3>
        <p class="wi-line">${esc(cell.water)}${cell.biome?.prose ? ` · ${esc(cell.biome.prose)}` : ''}</p>
        <div class="inspector-row"><span>Height</span><b>${Math.round(cell.elevation)} m</b></div>
        <div class="inspector-row"><span>Slope</span><b>${Math.round(cell.slopeDegrees)}°</b></div>
        <div class="inspector-row"><span>Temperature</span><b>${Math.round(cell.temperature)}°C</b></div>
        <div class="inspector-row"><span>Moisture</span><b>${Math.round(cell.moisture * 100)}%</b></div>
        <div class="inspector-row"><span>Growth</span><b>${Math.round(cell.vegetation * 100)}%</b></div>
        ${cell.invalid ? '<p class="wrv-warn">The engine could not place a feature here.</p>' : ''}`;
    }
    if (entry) {
      html += `<div class="wi-entry-line"><p class="panel-sub">${spot.entry && map.selected.includes(entry.id) ? 'Chosen' : 'Nearby'}</p><p><strong>${esc(entry.name)}</strong> · ${esc(map.entryWord(entry))}</p>${entry.detail && !atlasSpot ? `<p class="field-hint">${esc(entry.detail)}</p>` : ''}
        <button type="button" class="btn btn-sm" data-act="entry-to-book" data-kind="${esc(entry.kind)}" data-id="${esc(entry.id)}">Open in the worldbook</button></div>`;
    }
    if (point) html += `<p class="wi-where">${esc(whereWords(point))}${pinned ? ' · pinned' : ''}</p>${pinned ? '<button type="button" class="btn btn-sm btn-ghost" data-act="unpin">Let the point go</button>' : ''}`;
    hereHost.innerHTML = `<p class="panel-sub">${pinned ? 'The point you pinned' : 'Under the pointer'}</p>${html}`;
  }
  async function showDiagnostic(layer) {
    S.diag = layer || 'biome';
    if (S.diag === 'biome' || !S.id) { map.setDiagnostic('biome', null); return; }
    try {
      const r = await core.agesDiagnosticMap(S.id, S.diag);
      const img = new Image();
      img.onload = () => { if (alive && S.diag === layer) map.setDiagnostic(layer, img); };
      img.src = r.map_url;
    } catch (e) { sayError(e); map.setDiagnostic('biome', null); }
  }

  // Worldbook ─────────────────────────────────────────────────────────────
  function renderWorldbookRoom() {
    const body = sectionBody('worldbook');
    if (!S.id || !S.w) {
      setHead('worldbook', { eyebrow: 'The worldbook', title: 'No world yet', sub: 'What is true of a world is kept here, entry by entry, once it is built.' });
      body.innerHTML = '';
      return;
    }
    setHead('worldbook', { eyebrow: 'The worldbook', title: `What is true of ${S.w.document.identity.name}`, sub: 'Find, choose, correct. Each correction is kept with a revision, and travels with the world.' });
    if (!body.contains(wbList)) { body.innerHTML = ''; body.append(wbList); worldbook.render(); }
  }

  // Changes ───────────────────────────────────────────────────────────────
  function renderChanges() {
    const body = sectionBody('changes');
    setBadge(root, 'changes', S.pending ? '1' : '');
    if (!S.id || !S.w) {
      setHead('changes', { eyebrow: 'Changes', title: 'Nothing to review', sub: 'Edits to a world’s book and on its map are previewed here before they are made.' });
      body.innerHTML = '';
      return;
    }
    setHead('changes', { eyebrow: 'Changes', title: S.pending ? 'A revision, waiting for you' : 'The record', sub: 'Every edit is previewed as a revision you apply or cancel, and can be undone.' });
    const doc = S.w.document;
    const log = [...(doc.layers.authoredFeatures.authoringLog || [])].reverse().slice(0, 40);
    const prose = [...(doc.source.proseRevisions || [])].reverse().slice(0, 20);
    body.innerHTML = `
      ${S.pending ? reviewHtml(core, S.pending, { busy: Boolean(S.busy), full: true, names: names() }) : '<p class="wc-empty">Nothing is waiting. Rebuild from the book, or shape the world on the map, and the change waits here for you.</p>'}
      ${group('Undo', `<div class="btn-row">
        <button type="button" class="btn btn-sm" data-act="undo"${!S.history.canUndo || S.busy || S.pending ? ' disabled' : ''}>Undo the last revision</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="redo"${!S.history.canRedo || S.busy || S.pending ? ' disabled' : ''}>Redo</button></div>
        <p class="field-hint">The engine keeps the last five revisions to step back through while this page is open.</p>`)}
      ${group('Made by hand', log.length ? `<ol class="wc-log">${log.map((r) => `<li><span><strong>${esc(r.subjectName || 'The world')}</strong> ${esc(OP_WORDS[r.operation?.op] || r.operation?.op || 'changed')}</span><time>${esc(when(r.createdAt))}</time></li>`).join('')}</ol>` : '<p class="field-hint">Nothing has been set down by hand yet.</p>')}
      ${prose.length ? group('The descriptive book', `<ol class="wc-log">${prose.map((p) => `<li><span>${esc(PROSE_WORDS[p.status] || p.status)}${p.addition?.trim() ? `: <em>${esc(p.addition.trim())}</em>` : ''}</span><time>${esc(when(p.decidedAt))}</time></li>`).join('')}</ol>`) : ''}
      <div data-wb-record></div>`;
    const id = S.id;
    core.agesWorldbook(id, TIMELINE, { pageSize: 10, revisionPageSize: 20 }).then((r) => {
      const host = body.querySelector('[data-wb-record]');
      if (!host || id !== S.id || !(r.revisions || []).length) return;
      const ACTION = { create: 'written', edit: 'corrected', lock: 'locked', unlock: 'unlocked', archive: 'archived', restore: 'restored', merge: 'merged into' };
      host.innerHTML = group('The worldbook', `<ol class="wc-log">${r.revisions.map((v) => `<li><span><strong>${esc(v.after?.name || v.before?.name || 'An entry')}</strong> ${esc(ACTION[v.action] || v.action)}${v.note && v.action === 'merge' ? ` · ${esc(v.note.replace(/^Merged /, ''))}` : ''}</span><time>${esc(when(v.t))}</time></li>`).join('')}</ol>`);
    }).catch(() => {});
  }

  // Files ─────────────────────────────────────────────────────────────────
  function renderFiles() {
    const body = sectionBody('files');
    setHead('files', { eyebrow: 'Files', title: 'Take a world out, bring one in', sub: 'Worlds travel as .aetheria-age packages, the same files Aetheria writes and reads.' });
    const o = S.exportOpts; const has = Boolean(S.id && S.w);
    const r = S.importReview;
    const sm = r?.summary || {};
    body.innerHTML = `
      ${has ? group(`Take ${S.w.document.identity.name} out`, `
        <p class="field-hint wb-lead">A full package keeps the built world as it is; a recipe rebuilds it exactly and travels light.</p>
        <div class="field-row">
          <label class="field"><span class="field-label">Package</span><select class="select" data-x="mode">${[['full', 'Full built world'], ['recipe', 'Recipe only']].map(([v, l]) => `<option value="${v}"${o.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Story history</span><select class="select" data-x="liveState">${[['included', 'Include it'], ['excluded', 'Leave it out']].map(([v, l]) => `<option value="${v}"${o.liveState === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <p class="field-hint">The worldbook entries you write or correct are kept with the story history: leave it out and they stay behind.</p>
        <label class="field"><span class="field-label">Author</span><input class="input" data-x="author" value="${esc(o.author)}" placeholder="Optional attribution" autocomplete="off"></label>
        <label class="toggle"><input type="checkbox" data-x="includePreview" ${o.includePreview ? 'checked' : ''}> Include a preview image. Nothing is published anywhere.</label>
        <div class="btn-row"><button type="button" class="btn btn-gilt" data-act="export" data-idle="free">Export this world</button><span class="field-hint" data-export-note></span></div>`) : ''}
      ${group('Bring a world in', `
        <p class="field-hint wb-lead">A world package from Aetheria or another archive: it is checked, and you review what it holds before anything is added.</p>
        <label class="dropzone wb-drop" data-drop>
          <input type="file" accept=".aetheria-age,application/json,.json" aria-label="Choose a world package">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4"/></svg>
          <strong>Drop a world here</strong><small>.aetheria-age</small>
        </label>
        ${r ? `<div class="wf-review${r.collision || r.duplicateOf ? ' is-warning' : ''}">
          ${sm.preview ? `<img class="wf-preview" src="${esc(sm.preview)}" alt="The world in the package">` : ''}
          <div><p class="panel-sub">Review</p><h3 class="inspector-title">${esc(sm.name || 'Imported world')}</h3>
          <p class="field-hint">${sm.packageType === 'recipe' ? 'Recipe only' : 'Exact built world'} · ${sm.liveState === 'included' ? 'holds story history' : 'story history left out'} · ${sm.checksumVerified ? 'checksum verified' : `brought up from an older format (v${esc(sm.migratedFrom)})`} · ${sm.resolution} cells${sm.author ? ` · by ${esc(sm.author)}` : ''}</p>
          ${sm.privacy?.containsPrivateWorldbook ? '<p class="wrv-warn">It holds private or GM-only worldbook entries.</p>' : ''}
          ${r.collision ? '<p class="wrv-warn">A world with this permanent identity is already here.</p>' : ''}
          ${r.duplicateOf ? '<p class="wrv-warn">Its recipe matches a world already here.</p>' : ''}
          <div class="btn-row">
            ${r.collision ? '<button type="button" class="btn btn-gilt btn-sm" data-import="replace" data-idle>Replace the one here</button>' : '<button type="button" class="btn btn-gilt btn-sm" data-import="replace" data-idle>Add it</button>'}
            <button type="button" class="btn btn-sm" data-import="duplicate" data-idle>Keep as a copy</button>
            ${r.collision ? '<button type="button" class="btn btn-sm" data-import="merge" data-idle>Merge histories</button>' : ''}
            <button type="button" class="btn btn-sm btn-ghost" data-import="cancel" data-idle>Cancel</button>
          </div></div></div>` : ''}`)}
      ${group('Aetheria’s starter world', `
        <div class="wf-starter"><div><h3 class="inspector-title">Lantern Quay</h3>
          <p>A small harbour town on a cold, foggy coast, built up a cliff above its harbour; a tidal island with a test tower; a heather moor inland. The world of the starter set that comes with Aetheria.</p>
          <p class="field-hint">Built from the structure Aetheria writes out for it, drawn as a map, with no model asked.</p></div>
          <div class="btn-row">${starterHere() ? `<button type="button" class="btn btn-sm" data-act="open-starter">Open it</button><button type="button" class="btn btn-sm btn-ghost" data-act="starter" data-idle>Build another</button>` : '<button type="button" class="btn btn-gilt btn-sm" data-act="starter" data-idle>Build Lantern Quay</button>'}</div></div>`)}`;
    const zone = body.querySelector('[data-drop]');
    dropZone(zone, (files) => stageImport(files[0]));
    syncIdle();
  }
  const starterHere = () => S.worlds.find((w) => w.seed === 'Lantern Quay') || null;

  /** What the things a revision touches are called, by id. */
  function names() {
    const m = new Map();
    for (const data of [S.w?.studio, S.pending?.preview]) {
      if (!data) continue;
      (data.authoredFeatures || []).forEach((f) => m.set(f.id, f.name));
      (data.namedRegions || []).forEach((r) => m.set(r.id, r.name));
      (data.document?.layers?.authoredFeatures?.environmentalEdits || []).forEach((e) => m.set(e.id, e.name));
      const a = data.document?.layers?.atlas;
      if (a?.enabled) ['places', 'areas', 'ways', 'waters', 'relief'].forEach((k) => (a[k] || []).forEach((t) => t.name && m.set(t.id, t.name)));
    }
    return m;
  }

  // Inspector ─────────────────────────────────────────────────────────────
  function renderInspector() {
    const label = root.querySelector('.sheet-inspector-fold > summary .panel-sub');
    if (label) label.textContent = S.pending && S.room !== 'map' && S.room !== 'worldbook' ? 'A revision, waiting' : INSPECTOR_LABELS[S.room] || 'Inspector';
    inspReview.innerHTML = S.pending && S.room !== 'changes' ? reviewHtml(core, S.pending, { busy: Boolean(S.busy), onMap: S.room === 'map', names: names() }) : '';
    if (S.room === 'map') {
      inspRoom.replaceChildren(hereHost, authorHost);
      if (!S.w) { inspRoom.innerHTML = '<p class="field-hint">The map’s reading and the tools to shape it open here once a world is built.</p>'; return; }
      renderHere(map.spot()); author.render(); author.emitDrawing();
    } else if (S.room === 'worldbook') {
      if (!S.w) { inspRoom.innerHTML = ''; return; }
      inspRoom.replaceChildren(wbEditor);
    } else if (S.room === 'book') {
      renderBookInspector();
    } else if (S.room === 'world') {
      inspRoom.innerHTML = `
        <ol class="wi-steps">
          <li><strong>The book.</strong> Choose its land, water, sky and weather from the engine’s own words.</li>
          <li><strong>The build.</strong> The engine grows the world from them, here in this browser.</li>
          <li><strong>The map.</strong> Look around, read the ground, and set down towns, roads and regions.</li>
          <li><strong>The worldbook.</strong> Correct and add to what is true of it.</li>
        </ol>
        <p class="field-hint">This is Aetheria’s own world engine, built in and working offline. Nothing is uploaded.</p>
        <label class="field"><span class="field-label">Detail for new worlds</span><select class="select" data-detail>${DETAILS.map((d) => `<option value="${d.value}"${detail.get() === d.value ? ' selected' : ''}>${esc(d.label)} · ${d.value} cells</option>`).join('')}</select><span class="field-hint">${esc(DETAILS.find((d) => d.value === detail.get())?.hint || '')}</span></label>`;
    } else if (S.room === 'changes') {
      inspRoom.innerHTML = S.pending
        ? `<p class="field-hint">The map shows the revision as a preview. Apply it to keep it, or cancel and the world is as it was.</p><button type="button" class="btn btn-sm" data-go="map">See it on the map</button>`
        : '<p class="field-hint">A revision is planned by the engine: what it changes, what it rebuilds, and anything placed that the change would flood or strand. Nothing is made until you apply it.</p>';
    } else if (S.room === 'files') {
      inspRoom.innerHTML = `
        <p>An .aetheria-age file is the whole world as the engine keeps it: its document, its map and, if you choose, its story history.</p>
        <p class="field-hint">A full package of a world 256 cells across is about 7 MB; a recipe, a few kilobytes. Open one in Aetheria under Worlds, Import a world.</p>
        ${S.lastExport ? `<p class="field-hint">Last exported: ${esc(S.lastExport)}</p>` : ''}`;
    }
  }

  // ── Doing ────────────────────────────────────────────────────────────────
  function go(room) {
    const before = S.room;
    onShow(showSection(root, room, { remember: 'aetheria.world.room' }));
    // On a phone the rail is a row of tabs over the room: a room opened from within one starts at its top.
    if (before !== room && matchMedia('(max-width: 900px)').matches) {
      const mainEl = root.querySelector('.sheet-main');
      if (mainEl.getBoundingClientRect().top < 0 || mainEl.getBoundingClientRect().top > innerHeight * 0.6) mainEl.scrollIntoView({ block: 'start' });
    }
  }
  function onShow(room) {
    const moved = S.room !== room;
    S.room = room;
    // A long room left scrolled down: the next one opens from its top.
    const top = root.getBoundingClientRect().top;
    if (moved && top < 0 && !matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: 'auto' });
    renderInspector();
    if (room === 'map') { renderMapRoom(); requestAnimationFrame(() => map.schedule()); }
    if (room === 'worldbook' && S.id && worldbook.loadedFor !== S.id) worldbook.load().catch((e) => sayError(e));
    if (room === 'book') { renderBookInspector(); schedulePreview(); }
    syncIdle();
  }

  async function build() {
    const draft = S.draft;
    if (!(draft.name || '').trim() && !(draft.seed || '').trim()) { toast('Give the world a name first.'); section('book').querySelector('[data-path="name"]')?.focus(); return; }
    await busy('Building the world', async () => {
      try {
        const { doc, warnings } = candidateFrom(core, draft, null);
        const res = await buildWorld(core, { document: doc, resolution: detail.get(), onProgress });
        await kv.del('world:book:new').catch(() => {});
        await refreshWorlds();
        warnings.forEach((w) => toast(w));
        S.status = core.builtNote(res.name, false, res.instability);
        await openWorld(res.world_id, { room: 'map' });
        toast(S.status);
      } catch (e) { sayError(e, 'The world could not be built.'); }
    });
  }

  /** Plan, preview, wait for review: Aetheria's pending change. */
  async function stage(title, makePlan, { note = '', authoring = false, kind = authoring ? 'author' : 'plan' } = {}) {
    if (!S.id) return false;
    if (S.pending) { toast('Apply or cancel the revision waiting first.'); return false; }
    let ok = false;
    await busy('Planning the change', async () => {
      try {
        const planned = await makePlan();
        const meter = progress('plan', (S.w?.manifest?.resolution || 256) ** 2, onProgress);
        let preview;
        try { await nextPaint(); preview = await withEngine(() => core.agesRenderPlan(planned.plan.planId)); } finally { meter.finish(); }
        const atlasWorld = isAtlas();
        S.pending = {
          ...planned, plan: preview.plan, preview: preview.studio_data, title, note, authoring, kind,
          // A map's book is the world (change one, the other follows), so what is drawn by hand is written into it unless you say otherwise.
          proseStatus: authoring ? (atlasWorld ? 'accepted' : 'structured-only') : undefined,
          proseText: planned.prose_patch?.proposed || '',
        };
        map.setPreview(preview.studio_data);
        ok = true;
      } catch (e) { if (e?.name !== 'AbortError') sayError(e, 'That change could not be planned.'); }
    });
    if (ok) { S.status = 'A revision is waiting for you. Review it, then apply or cancel.'; renderAfterPlan(); }
    return ok;
  }
  function renderAfterPlan() {
    renderInspector(); renderChanges(); syncIdle(); if (S.status) note(S.status);
    setBadge(root, 'changes', S.pending ? '1' : '');
    if (S.pending) {
      const body = root.querySelector('.sheet-inspector-body');
      if (matchMedia('(max-width: 1240px)').matches) later(() => inspReview.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
      else if (body) body.scrollTop = 0;
    }
  }
  async function rebuildFromBook() {
    const name = (S.draft.name || '').trim() || S.w.document.identity.name;
    await stage(`${name}, rebuilt from the book`, async () => {
      // The world as it is now (the worldbook may have changed since it was read), with the book laid over it.
      const base = await core.agesWorldDocument(S.id);
      const { doc } = candidateFrom(core, { ...S.draft, name }, base);
      return core.agesPlanWorldDocument(S.id, doc, { originalProse: S.draft.prose });
    }, { note: 'The book’s new words, laid over the world. What was made by hand is kept.', kind: 'book' });
    if (S.pending) go('map');
  }
  async function planAuthoring(op) {
    const name = op.feature?.name || op.region?.name || op.edit?.name || (op.op === 'water.set' ? 'The water' : '') || (S.w.studio.authoredFeatures.find((f) => f.id === op.featureId)?.name) || 'An edit';
    const ok = await stage(`${name}: ${OP_WORDS[op.op] || 'an edit'}`, () => core.agesPlanAuthoringOperation(S.id, op), { authoring: true });
    if (ok) author.set({ points: [], enabled: false });
    return ok;
  }
  async function planMoves(moves) {
    if (moves.length === 1) return planAuthoring({ op: 'feature.move', featureId: moves[0].id, x: moves[0].x, z: moves[0].z, snap: false });
    return stage(`${moves.length} places moved`, () => core.agesPlanFeatureMoves(S.id, moves));
  }
  async function planTown(id, layout) {
    const town = S.w.document.layers.atlas.places.find((p) => p.id === id)?.name || 'The town';
    await stage(layout === 'manual' ? `${town}, begun again by hand` : `${town}, laid out from the book`, () => core.agesPlanTownLayout(S.id, id, layout), {
      note: layout === 'manual' ? `${town} keeps only its named places and what you set down.` : `${town}’s streets and houses are laid out from the book again.`,
    });
  }
  async function applyPending() {
    const p = S.pending; if (!p) return;
    const wasClean = !isDirty();
    await busy('Applying the revision', async () => {
      try {
        let message;
        if (p.authoring) {
          const r = await withEngine(() => core.agesCommitAuthoringPlan(p.plan.planId, { status: p.proseStatus || 'structured-only', text: p.proseText }));
          await relayAtlas(core, S.id);
          message = `Applied. ${{ accepted: 'The book has the new line', modified: 'The book has your wording' }[r.prose_status] || 'The book is as it was'}; the map and the worldbook have the change.`;
        } else {
          const r = await withEngine(() => core.agesCommitPlan(p.plan.planId));
          message = r.selective ? `Applied: ${(r.rebuilt_targets || []).length ? 'rebuilt what it touched' : 'the document only'}.` : 'Applied: the world was rebuilt.';
        }
        S.pending = null; map.setPreview(null); author.reset();
        await northUp(core, S.id);
        await loadWorld(); await refreshWorlds();
        if (wasClean || p.kind === 'book') { S.draft = draftFromDocument(core, S.w.document); await kv.del(draftKey()).catch(() => {}); }
        else S.draft.prose = S.w.document.source.originalProse || S.draft.prose;
        worldbook.loadedFor = null;
        S.status = message;
        renderAll();
        if (S.room === 'worldbook') worldbook.load().catch(() => {});
        toast(message);
      } catch (e) { sayError(e, 'The revision could not be applied.'); renderAfterPlan(); }
    });
  }
  async function cancelPending({ quiet = false } = {}) {
    const p = S.pending; if (!p) return;
    try { await core.agesCancelPlan(p.plan.planId); } catch { /* it has gone already */ }
    S.pending = null; map.setPreview(null);
    if (!quiet) { S.status = 'Change cancelled. The world is unchanged.'; renderAfterPlan(); toast(S.status); }
  }
  async function resolveConflict(conflictId, choice) {
    const p = S.pending; if (!p) return;
    await busy('Trying that', async () => {
      try {
        const resolved = await core.agesResolvePlanConflict(p.plan.planId, conflictId, choice);
        const preview = await withEngine(() => core.agesRenderPlan(p.plan.planId));
        S.pending = { ...p, plan: preview.plan || resolved.plan, preview: preview.studio_data };
        map.setPreview(preview.studio_data);
        S.status = 'The change is previewed with your choice. Apply it, or cancel.';
      } catch (e) { sayError(e); }
    });
    renderAfterPlan();
  }
  async function moveHistory(dir) {
    if (!S.id || S.pending) return;
    const wasClean = !isDirty();
    await busy(dir === 'undo' ? 'Stepping back' : 'Stepping forward', async () => {
      try {
        const r = dir === 'undo' ? await core.agesUndoWorld(S.id) : await core.agesRedoWorld(S.id);
        await northUp(core, S.id);
        await loadWorld(); await refreshWorlds();
        if (wasClean) S.draft = draftFromDocument(core, S.w.document);
        worldbook.loadedFor = null;
        S.status = r.success ? (dir === 'undo' ? 'Undid the last change to the world.' : 'Restored the next change to the world.') : (r.message || 'Nothing to do.');
      } catch (e) { sayError(e); }
    });
    renderAll();
    if (S.room === 'worldbook') worldbook.load().catch(() => {});
  }
  async function deleteWorld() {
    const id = S.id; const name = S.w?.document?.identity?.name || 'The world';
    await busy('Letting the world go', async () => {
      try {
        await core.agesDeleteWorld(id);
        await kv.del(`world:book:${id}`).catch(() => {});
        await refreshWorlds();
        S.status = `${name} was deleted.`;
      } catch (e) { sayError(e, 'Could not delete this world.'); }
    });
    toast(S.status);
    if (S.worlds.length) await openWorld(S.worlds[0].world_id, { room: 'world' }); else await newWorld({ room: 'world' });
  }
  async function buildStarter() {
    await busy('Building Lantern Quay', async () => {
      try {
        const st = await loadStarter();
        const meter = progress('atlas', 256 * 256, onProgress);
        let res;
        try { await nextPaint(); res = await withEngine(() => core.agesBakeCompilerProposal(JSON.parse(JSON.stringify(st.WORLD_STRUCTURE)), { originalProse: st.WORLD_BOOK })); } finally { meter.finish(); }
        await refreshWorlds();
        S.status = core.builtNote(res.name, false, res.instability);
        await openWorld(res.world_id, { room: 'map' });
        toast(S.status);
      } catch (e) { sayError(e, 'Lantern Quay could not be built.'); }
    });
  }
  async function exportCurrent() {
    await busy('Packing the world', async () => {
      try {
        const { filename, contents } = await exportWorld(core, S.id, S.exportOpts);
        download(contents, filename, 'application/json');
        S.lastExport = `${filename} · ${sizeWord(contents.length)}`;
        S.status = `Exported ${filename}.`;
        const n = section('files').querySelector('[data-export-note]'); if (n) n.textContent = S.lastExport;
        if (S.room === 'files') renderInspector();
      } catch (e) { sayError(e, 'The world could not be exported.'); }
    });
  }
  /** A picture for the world's card (Aetheria's agesSetWorldCover), made small enough to keep with it. */
  async function setCover(clear) {
    let picture = null;
    if (clear !== null) {
      const file = await pickFile('image/*');
      if (!file) return;
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = URL.createObjectURL(file); });
        const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        picture = c.toDataURL('image/jpeg', 0.86);
      } catch (e) { sayError(e); return; }
    }
    await busy(picture ? 'Keeping the picture' : 'Taking the picture off', async () => {
      try {
        await core.agesSetWorldCover(S.id, picture);
        await refreshWorlds();
        S.status = picture ? 'The world has its picture.' : 'The world shows its map again.';
      } catch (e) { sayError(e); }
    });
    renderWorldRoom();
  }
  /** A structured edit of the world document, through review (Aetheria's agesPlanWorldDocument). */
  async function reviewDocument() {
    const ta = section('book').querySelector('[data-doc-text]');
    const noteEl = section('book').querySelector('[data-doc-note]');
    let candidate;
    try { candidate = JSON.parse(ta.value); } catch (e) { noteEl.textContent = `The document will not parse: ${e.message}`; ta.setAttribute('aria-invalid', 'true'); return; }
    ta.removeAttribute('aria-invalid'); noteEl.textContent = '';
    const ok = await stage(`${S.w.document.identity.name}, edited as data`, () => core.agesPlanWorldDocument(S.id, candidate), { note: 'The world document as you edited it.' });
    if (ok) go('map');
  }
  async function stageImport(file) {
    if (!file) return;
    await busy('Checking the package', async () => {
      try {
        const contents = await file.text();
        const r = await core.agesStageWorldFile(contents);
        if (!r?.success) throw new Error('That file is not a world package.');
        S.importReview = r;
        S.status = 'Package checked. Review what it holds before adding it.';
      } catch (e) { S.importReview = null; sayError(e, 'That file could not be read as a world.'); }
    });
    renderFiles();
    section('files').querySelector('.wf-review')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function resolveImport(resolution) {
    const r = S.importReview; if (!r) return;
    let opened = null;
    await busy('Bringing the world in', async () => {
      try {
        const res = await core.agesResolveWorldImport(r.importId, resolution);
        S.importReview = null;
        if (res?.success && res.world) {
          const name = res.world.document?.identity?.name || 'The world';
          S.status = { replace: r.collision ? `${name} replaced the world already here.` : `${name} entered the archive.`, duplicate: `${name} entered the archive as a copy.`, merge: `${name} merged its history into the world already here.` }[resolution] || `${name} entered the archive.`;
          await northUp(core, res.world.worldId);
          await refreshWorlds();
          opened = res.world.worldId;
        } else S.status = 'Import cancelled. Nothing changed.';
      } catch (e) { sayError(e, 'The world could not be brought in.'); }
    });
    toast(S.status);
    if (opened) await openWorld(opened, { room: 'world' }); else renderFiles();
  }

  // ── Events ───────────────────────────────────────────────────────────────
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.dataset.go) { go(b.dataset.go); return; }
    if (b.dataset.open) { if (b.dataset.open !== S.id) openWorld(b.dataset.open); return; }
    if (b.dataset.import) { resolveImport(b.dataset.import); return; }
    if (b.dataset.review) {
      if (b.dataset.review === 'apply') applyPending();
      if (b.dataset.review === 'cancel') cancelPending();
      if (b.dataset.review === 'map') go('map');
      return;
    }
    if (b.dataset.conflict) { resolveConflict(b.dataset.conflict, b.dataset.choice); return; }
    if (b.dataset.prose && S.pending) {
      S.pending.proseStatus = b.dataset.prose;
      renderInspector(); if (S.room === 'changes') renderChanges();
      return;
    }
    switch (b.dataset.act) {
      case 'new': newWorld(); break;
      case 'build': build(); break;
      case 'rebuild': rebuildFromBook(); break;
      case 'discard': S.draft = draftFromDocument(core, S.w.document); kv.del(draftKey()).catch(() => {}); renderBookRoom(); bookChanged(); break;
      case 'undo': moveHistory('undo'); break;
      case 'redo': moveHistory('redo'); break;
      case 'starter': buildStarter(); break;
      case 'open-starter': { const st = starterHere(); if (st) openWorld(st.world_id, { room: 'map' }); break; }
      case 'export': exportCurrent(); break;
      case 'cover': setCover(); break;
      case 'uncover': setCover(null); break;
      case 'review-doc': reviewDocument(); break;
      case 'unpin': map.clearPin(); break;
      case 'entry-to-book': {
        const entry = map.entries.find((x) => x.id === b.dataset.id && x.kind === b.dataset.kind);
        if (!entry) break;
        go('worldbook');
        worldbook.reveal(core.worldbookEntryIdForMapEntry(entry)).catch((err) => sayError(err));
        break;
      }
      default: break;
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-prose-text]') && S.pending) S.pending.proseText = e.target.value;
    if (e.target.matches('[data-x="author"]')) { S.exportOpts.author = e.target.value; store.set('aetheria.world.author', e.target.value); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-world-select]')) { if (t.value === '__new') newWorld(); else openWorld(t.value); return; }
    if (t.matches('[data-detail]')) { detail.set(t.value); for (const s of root.querySelectorAll('[data-detail]')) s.value = t.value; if (S.room === 'book') renderBookRoom(); else renderInspector(); return; }
    if (t.dataset.x) { S.exportOpts[t.dataset.x] = t.type === 'checkbox' ? t.checked : t.value; }
  });
  wireIndex(root, { remember: 'aetheria.world.room', onShow });

  // ── Begin ────────────────────────────────────────────────────────────────
  try {
    await refreshWorlds();
  } catch (e) { sayError(e, 'The worlds in this browser could not be read.'); }
  const current = store.get('aetheria.world.current');
  const startRoom = S.room;
  if (current && S.worlds.some((w) => w.world_id === current)) await openWorld(current);
  else if (S.worlds.length) await openWorld(S.worlds[0].world_id);
  else await newWorld({ room: startRoom === 'files' ? 'files' : 'world' });
  if (S.room) go(S.room);

  return () => {
    alive = false;
    timers.forEach((t) => clearTimeout(t)); timers.clear();
    if (S.pending) core.agesCancelPlan(S.pending.plan.planId).catch(() => {});
    map.destroy();
  };
}
