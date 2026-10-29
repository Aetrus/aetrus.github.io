// The Character builder: Aetheria's Character sheet on the web.
//   Sections (left) │ one section of the card (centre) │ the live card (right)
// Port of aesrc/sheets/CharacterSheet.js (+ CharacterVoiceSection, VoiceChoice,
// SaveStatus), with Aetheria's own card logic bundled. Nothing here asks a model.
import { esc, toast, download, store, slugify, sigilSvg } from '../ui.js';
import { take, handoff } from '../handoff.js';
import { loadCards, loadCardBytes } from '../data.js';
import { tokenAnatomy, craftChecks, estTokens, fmtTokens } from '../lib/card.js';
import { pngSize } from '../lib/png.js';
import { MACRO_GROUPS, COMMON_MACROS } from '../lib/macros.js';
import { meterHtml, checksHtml } from './lens.js';
import {
  sheetFrame, indexItem, sheetSection, group, textField, areaField, fieldRow, rangeField,
  bindSheet, wireIndex, showSection, setBadge, saver, draftShelf, draftsHtml, draftSelectHtml, wireDrafts,
  pickFile, sayError, clone, newId, kv, plural,
} from '../builders/sheet.js';
import * as core from '../vendor/aetheria/character.js';
import * as M from '../builders/character/model.js';
import { openCropper, sigilCover, toPngBytes, pngUrl } from '../builders/character/portrait.js';
import * as V from '../builders/character/voice.js';

/* ── sections (Aetheria's own) ─────────────────────────────────────────── */

const SECTIONS = [
  { id: 'identity', label: 'Identity', hint: 'Name, display name, tags' },
  { id: 'media', label: 'Portrait & motion', hint: 'Still image and optional video' },
  { id: 'personality', label: 'Personality', hint: 'Description, traits, voice' },
  { id: 'living', label: 'Living pages', hint: 'Root, current self, revision trail' },
  { id: 'scenario', label: 'Scenario', hint: 'The situation the story opens in' },
  { id: 'greetings', label: 'Greetings', hint: 'First message and alternates' },
  { id: 'dialogue', label: 'Example dialogue', hint: 'How they actually speak' },
  { id: 'voice', label: 'Voice', hint: 'How they sound read aloud' },
  { id: 'advanced', label: 'Advanced prompting', hint: 'System prompt, post-history' },
  { id: 'group', label: 'Group behaviour', hint: 'Talkativeness, multi-character greetings' },
  { id: 'metadata', label: 'Metadata', hint: 'Creator, version, source, export' },
];
const TEXT_SECTIONS = new Set(['personality', 'scenario', 'greetings', 'dialogue', 'advanced', 'group']);
// Sections that show other sections' fields, so they are drawn afresh when opened.
const LIVE_SECTIONS = new Set(['media', 'living', 'voice', 'metadata']);

const FIELD_NAMES = {
  description: 'the description', personality: 'the personality', scenario: 'the scenario', first_mes: 'the first message',
  mes_example: 'the example dialogue', system_prompt: 'the system prompt', post_history_instructions: 'the post-history instructions',
  creator_notes: 'the creator notes',
};
const SECTION_OF = {
  name: 'identity', nickname: 'identity', description: 'personality', personality: 'personality', scenario: 'scenario', first_mes: 'greetings',
  mes_example: 'dialogue', system_prompt: 'advanced', post_history_instructions: 'advanced', creator_notes: 'metadata',
};
const EXPORTS = {
  png: { label: 'PNG card' }, charx: { label: 'CHARX file' }, json2: { label: 'V2 JSON file' }, json3: { label: 'V3 JSON file' },
};

const ART = (id) => `character:art:${id}`;
const VIDEO = (id) => `character:video:${id}`;
const ORIGINS = 'aetheria.character.origins';
const SECTION_KEY = 'aetheria.character.section';

const ICON = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 11-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0-11L7.5 8.5M12 4l4.5 4.5M5 19.5h14"/></svg>',
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── the view ──────────────────────────────────────────────────────────── */

export async function render(main, _arg, { setTitle }) {
  setTitle('Character builder');
  const shelf = draftShelf('character');

  let S = null;            // { id, d, art, video, origin, saved }
  let root = null;
  let section = store.get(SECTION_KEY) || 'identity';
  let notice = null;       // { html, actions, focus }
  let mediaNotice = null;  // { error, text }
  let exportNotice = null;
  let voiceOpen = false;
  let systemVoices = [];
  let srcUrl = null;       // the uncropped image chosen this session, for Re-crop
  let lastField = null;
  let gallery = [];
  const urls = { art: null, video: null, cover: null, coverKey: '' };

  const displayName = () => (S.d.name || '').trim() || 'Untitled';

  /* ── keeping drafts ─────────────────────────────────────────────────── */

  const status = { el: null };
  let pendingSince = 0;
  const sv = saver(async () => {
    pendingSince = 0;
    await shelf.put(S.id, displayName(), { card: S.d, origin: S.origin });
    const first = !S.saved;
    S.saved = true;
    shelf.current.set(S.id);
    if (first || listedName !== displayName()) refreshDraftLists();
    if (first && !notice?.html) redrawBanner();
  }, { status: { set textContent(v) { if (status.el) status.el.textContent = v; } } });
  let listedName = '';

  async function persistNow() {
    await shelf.put(S.id, displayName(), { card: S.d, origin: S.origin });
    S.saved = true;
    shelf.current.set(S.id);
  }
  async function persistMedia() {
    if (S.art) await kv.set(ART(S.id), S.art); else await kv.del(ART(S.id));
    if (S.video) await kv.set(VIDEO(S.id), S.video); else await kv.del(VIDEO(S.id));
  }

  async function loadDraft(id) {
    if (!id) return null;
    const rec = await shelf.get(id);
    if (!rec) return null;
    const data = rec.data || {};
    const art = M.toBytes(await kv.get(ART(id)));
    const vid = await kv.get(VIDEO(id));
    return {
      id, d: M.normalizeCard(data.card || data), art,
      video: vid && vid.bytes ? { name: vid.name || 'portrait.mp4', type: vid.type || 'video/mp4', bytes: M.toBytes(vid.bytes) } : null,
      origin: data.origin || null, saved: true,
    };
  }

  async function removeDraft(id) {
    await shelf.remove(id);
    await kv.del(ART(id));
    await kv.del(VIDEO(id));
    const origins = store.get(ORIGINS, {}) || {};
    for (const k of Object.keys(origins)) if (origins[k] === id) delete origins[k];
    store.set(ORIGINS, origins);
  }

  const fresh = (card = M.blankCard(), extra = {}) => ({ id: newId(), d: card, art: null, video: null, origin: null, saved: false, ...extra });

  /** Picks up the old Card Forge's draft (localStorage) once, as a draft here. */
  async function migrateForge() {
    if (store.get('aetheria.character.migrated')) return null;
    let id = null;
    try {
      const saved = store.get('aetheria.forge.draft');
      if (saved && saved.data && typeof saved.data === 'object') {
        const card = M.normalizeCard(saved.data);
        if (!M.isBlank(card)) {
          id = newId();
          const artUrl = store.get('aetheria.forge.art');
          await shelf.put(id, card.name || 'Untitled', { card, origin: 'forge' });
          if (typeof artUrl === 'string' && artUrl.startsWith('data:')) await kv.set(ART(id), M.dataUrlToBytes(artUrl));
        }
      }
    } catch (e) { console.warn(e); id = null; }
    store.set('aetheria.character.migrated', true);
    return id;
  }

  /* ── opening drafts ─────────────────────────────────────────────────── */

  const listWithCurrent = (items) => (S && !S.saved ? [{ id: S.id, name: displayName(), updated: Date.now() }, ...items] : items);

  async function refreshDraftLists() {
    if (!root) return;
    listedName = displayName();
    const items = listWithCurrent(await shelf.list());
    const foot = root.querySelector('.sheet-index-foot');
    if (foot) foot.innerHTML = draftsHtml(items, S.id, { noun: 'character' });
    const sel = root.querySelector('[data-draft-select]');
    if (sel && document.activeElement !== sel) sel.outerHTML = draftSelectHtml(items, S.id);
  }

  /** Make `next` the open draft. A saved draft left wholly blank is let go. */
  async function adopt(next, { persist = false } = {}) {
    if (S) {
      await sv.flush();
      if (S.saved && S.id !== next.id && M.isBlank(S.d) && !S.art && !S.video) await removeDraft(S.id).catch(() => {});
    }
    S = next;
    if (persist) { await persistNow(); await persistMedia(); }
    if (S.saved) shelf.current.set(S.id);
    mediaNotice = null; exportNotice = null; voiceOpen = false;
    if (srcUrl) { URL.revokeObjectURL(srcUrl); srcUrl = null; }
    resetUrls();
    await mount();
  }

  async function openArchiveCard(file) {
    const bytes = await loadCardBytes(file);
    const r = await M.readBytes(bytes, file.split('/').pop());
    if (r.kind !== 'card') throw new Error('That Archive card could not be read.');
    const next = fresh(r.card, { art: r.art, origin: file });
    const origins = store.get(ORIGINS, {}) || {};
    origins[file] = next.id;
    store.set(ORIGINS, origins);
    notice = { html: `Opened <b>${esc(r.card.name || 'the card')}</b> from the Archive as a new draft. Your edits save in this browser.` };
    await adopt(next, { persist: true });
  }

  /** A file read by the model: a card becomes a new draft; a lorebook, picture or video joins this one. */
  async function takeFile(file) {
    let r;
    try { r = await M.readFile(file); } catch (e) { sayError(e); return; }
    if (r.kind === 'card') {
      let art = r.art;
      if (!art && r.artBlob) { try { art = await toPngBytes(r.artBlob); } catch { art = null; } }
      const book = M.bookSummary(r.card.character_book);
      notice = {
        html: `Imported <b>${esc(r.card.name || file.name)}</b>, a ${M.formatLabel(r.format)} card from ${r.container === 'png' ? 'a PNG' : r.container === 'charx' ? 'a CHARX file' : 'JSON'}. It is a new draft; your edits save in this browser.${r.card.character_book ? ` Its lorebook (${plural(book.entries, 'entry', 'entries')}) came with it, under Metadata.` : ''}${r.video ? ' So did its motion portrait.' : ''}`,
      };
      await adopt(fresh(r.card, { art, video: r.video }), { persist: true });
      return;
    }
    if (r.kind === 'lorebook') { bindBook(r.book, 'Attached'); return; }
    if (r.kind === 'image') { goto('media'); await chooseArt(r.blob); return; }
    if (r.kind === 'video') { goto('media'); await setVideo(r.file); }
  }

  /* ── handoffs ───────────────────────────────────────────────────────── */

  function applyPatch({ target, text, title }) {
    const body = String(text || '').trim();
    if (!body) return '';
    if (target === 'lore') {
      const book = S.d.character_book || { name: `${S.d.name || 'Card'} lore`, entries: [], extensions: {} };
      if (!Array.isArray(book.entries)) book.entries = [];
      book.entries.push(M.bookEntry(book.entries.length, { content: body, title: title || 'New entry' }));
      S.d.character_book = book;
      section = 'metadata';
      return `Added the blueprint${title ? ` <b>${esc(title)}</b>` : ''} to this card’s lorebook as a new entry. Give it keys in the Lorebook builder.`;
    }
    const field = typeof S.d[target] === 'string' && FIELD_NAMES[target] ? target : 'description';
    const had = S.d[field].trim();
    S.d[field] = had ? `${had}\n\n${body}` : body;
    section = SECTION_OF[field] || 'personality';
    notice = { focus: field };
    return had ? `Appended the blueprint to <b>${FIELD_NAMES[field]}</b>.` : `Placed the blueprint in <b>${FIELD_NAMES[field]}</b>.`;
  }

  function bindBook(raw, verb = 'Bound') {
    const book = M.toBook(raw);
    if (!book) { toast('That file holds no lorebook.'); return; }
    S.d.character_book = book;
    const s = M.bookSummary(book);
    exportNotice = null;
    changed();
    redraw('metadata');
    refreshInspector();
    toast(`${verb} ${s.name ? `“${s.name}”` : 'the lorebook'}: ${plural(s.entries, 'entry', 'entries')}`);
  }

  /* ── mounting ───────────────────────────────────────────────────────── */

  async function mount() {
    const items = listWithCurrent(await shelf.list());
    listedName = displayName();
    main.innerHTML = `<div class="page page-wide cb-page">${sheetFrame({
      id: 'character-sheet',
      eyebrow: 'Character',
      title: displayName(),
      index: SECTIONS.map((s, i) => indexItem({ id: s.id, label: s.label, hint: s.hint, num: i + 1, active: s.id === section })).join(''),
      indexFoot: draftsHtml(items, S.id, { noun: 'character' }),
      toolbar: toolbarHtml(items),
      body: `<div data-banner>${bannerHtml()}</div>${macroBarHtml()}${SECTIONS.map((s) => sectionHtml(s.id, s.id === section)).join('')}`,
      inspector: inspectorShell(),
      inspectorLabel: 'Live card',
    })}</div>`;
    root = main.querySelector('#character-sheet');
    status.el = root.querySelector('[data-save-status]');
    wire();
    section = wireIndex(root, { remember: SECTION_KEY, start: section, onShow });
    refreshPortraits();
    refreshInspector();
    refreshBadges();
    ensureCover();
    if (notice?.focus) flash(notice.focus);
  }

  /* ── toolbar, banner, macros ────────────────────────────────────────── */

  const toolbarHtml = (items) => `
    ${draftSelectHtml(items, S.id)}
    <button type="button" class="btn btn-sm" data-act="import">${ICON.import}Import</button>
    <div class="cb-menu-wrap">
      <button type="button" class="btn btn-sm btn-gilt" data-act="export-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="cb-export-menu">${ICON.export}Export</button>
      <div class="cb-menu" id="cb-export-menu" role="menu" aria-label="Export as" hidden>
        <button type="button" role="menuitem" data-export="png"><strong>PNG card</strong><small>The portrait, with V2 and V3 inside</small></button>
        <button type="button" role="menuitem" data-export="charx"><strong>CHARX</strong><small>V3, with the portrait and its motion</small></button>
        <button type="button" role="menuitem" data-export="json2"><strong>JSON · V2</strong><small>For SillyTavern and most apps</small></button>
        <button type="button" role="menuitem" data-export="json3"><strong>JSON · V3</strong><small>Every field, nickname and sources too</small></button>
      </div>
    </div>
    <button type="button" class="btn btn-sm btn-ghost" data-act="new">New</button>
    <span class="spacer"></span>
    <span class="save-status" data-save-status role="status">${S.saved ? 'Saved in this browser' : 'Nothing to save yet'}</span>`;

  function bannerHtml() {
    if (notice?.html) {
      return `<div class="banner cb-banner" role="status"><span>${notice.html}</span>${notice.actions || ''}<button type="button" class="cb-x" data-act="dismiss" aria-label="Dismiss">${ICON.close}</button></div>`;
    }
    if (!S.saved && M.isBlank(S.d) && !S.art) {
      const chips = gallery.map((c) => `<button type="button" class="chip" data-start-file="${esc(c.file)}">${esc(c.name)}</button>`).join('');
      return `<div class="banner cb-banner cb-banner-blank"><span>A blank card. Write it here, import a PNG, JSON or CHARX card, or drop one anywhere on the sheet.${chips ? ' Or begin from one in the Archive:' : ''}</span>${chips ? `<span class="chip-row">${chips}</span>` : ''}</div>`;
    }
    return '';
  }
  const redrawBanner = () => { const b = root?.querySelector('[data-banner]'); if (b) b.innerHTML = bannerHtml(); };

  const macroBarHtml = () => `<div class="cb-macros" data-macro-bar${TEXT_SECTIONS.has(section) ? '' : ' hidden'}>
    <span class="cb-macros-label">Insert</span>
    <span class="cb-macros-row">${COMMON_MACROS.map((m) => `<button type="button" class="macro-chip" data-macro="${esc(m)}">${esc(m.replace('::a::b::c', '::…'))}</button>`).join('')}</span>
    <button type="button" class="btn btn-sm btn-ghost" data-act="macros-all" aria-expanded="false" aria-controls="cb-macro-more">All macros</button>
    <div class="cb-macro-more" id="cb-macro-more" hidden>${MACRO_GROUPS.map((g) => `<div><p class="cb-macros-label">${esc(g.name)}</p><div class="cb-macros-row is-wrap">${g.macros.map((m) => `<button type="button" class="macro-chip" data-macro="${esc(m.token)}" title="${esc(m.description)}">${esc(m.label)}</button>`).join('')}</div></div>`).join('')}</div>
  </div>`;

  /* ── sections ───────────────────────────────────────────────────────── */

  function sectionHtml(id, active) {
    return sheetSection({ id, active, ...RENDER[id]() });
  }

  function redraw(id) {
    const el = root?.querySelector(`[data-section-body="${id}"]`);
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = sectionHtml(id, !el.hidden);
    el.replaceWith(tmp.firstElementChild);
    if (id === 'media') ensureCover();
  }

  const badge = (text, ok = false) => `<span class="badge${ok ? ' ok' : ''}">${esc(text)}</span>`;
  const notice$ = (n) => (n ? `<p class="cb-notice${n.error ? ' is-error' : ''}" role="${n.error ? 'alert' : 'status'}">${esc(n.text)}</p>` : '');
  const greetingCount = () => (S.d.first_mes ? 1 : 0) + (S.d.alternate_greetings || []).length;

  function tagsHtml() {
    const tags = S.d.tags || [];
    return `<div class="field cb-tags">
      <label class="field-label" for="cb-tag-input">Tags<span class="mono">${tags.length || ''}</span></label>
      <div class="cb-tag-entry">
        <input class="input" id="cb-tag-input" data-tag-input placeholder="fantasy, seer, silverglade" autocomplete="off" spellcheck="false" enterkeyhint="done">
        <button type="button" class="btn btn-sm btn-ghost" data-act="tag-add">Add</button>
      </div>
      <span class="field-hint">Press Enter to add. Click a tag to remove it.</span>
      ${tags.length ? `<div class="cb-tag-list">${tags.map((t) => `<button type="button" class="cb-tag" data-tag-remove="${esc(t)}" aria-label="Remove tag ${esc(t)}" title="Remove">${esc(t)}<span aria-hidden="true">${ICON.close}</span></button>`).join('')}</div>` : ''}
    </div>`;
  }

  function listField({ key, label, hint, placeholder, item, first = false }) {
    const values = S.d[key] || [];
    return `<div class="cb-list" data-list="${key}">
      <div class="cb-list-head">
        <div><p class="panel-sub">${esc(hint)}</p><h3 class="cb-list-title">${esc(label)}</h3></div>
        <button type="button" class="btn btn-sm" data-act="list-add" data-key="${key}">Add</button>
      </div>
      ${values.length ? `<ol class="cb-list-items">${values.map((v, i) => `<li class="cb-list-item">
        <div class="cb-list-item-head">
          <span class="cb-ordinal" aria-hidden="true">${i + 1}</span>
          <span class="cb-list-tools">
            <button type="button" class="btn btn-sm btn-ghost cb-icon" data-act="list-up" data-key="${key}" data-i="${i}" aria-label="Move ${esc(item)} ${i + 1} up"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
            <button type="button" class="btn btn-sm btn-ghost cb-icon" data-act="list-down" data-key="${key}" data-i="${i}" aria-label="Move ${esc(item)} ${i + 1} down"${i === values.length - 1 ? ' disabled' : ''}>${ICON.down}</button>
            ${first ? `<button type="button" class="btn btn-sm btn-ghost" data-act="list-first" data-key="${key}" data-i="${i}" aria-label="Make ${esc(item)} ${i + 1} the first message">Make first</button>` : ''}
            <button type="button" class="btn btn-sm btn-ghost cb-icon" data-act="list-remove" data-key="${key}" data-i="${i}" aria-label="Remove ${esc(item)} ${i + 1}">${ICON.close}</button>
          </span>
        </div>
        <label class="field"><span class="field-label"><span class="cb-sr">${esc(item)} ${i + 1}</span><span class="mono" data-count="${key}.${i}">${fmtTokens(estTokens(v || ''))} tok</span></span>
          <textarea class="textarea" id="f-${key}-${i}" data-path="${key}.${i}" data-kind="text" rows="6" placeholder="${esc(placeholder)}">${esc(v || '')}</textarea></label>
      </li>`).join('')}</ol>` : '<p class="cb-meta">None yet. Add one to give the story more than one way to open.</p>'}
    </div>`;
  }

  function ensureUrls() {
    if (S.art && !urls.art) urls.art = pngUrl(S.art);
    if (S.video && !urls.video) urls.video = URL.createObjectURL(new Blob([S.video.bytes], { type: S.video.type || 'video/mp4' }));
  }

  function mediaPreview(kind) {
    ensureUrls();
    const name = S.d.name || 'Character';
    if (kind === 'video') {
      if (S.video && urls.video) return `<video src="${urls.video}" muted loop playsinline ${reducedMotion() ? 'controls' : 'autoplay'} aria-label="${esc(name)} motion portrait"></video>`;
      if (S.art && urls.art) return `<img src="${urls.art}" alt="Still portrait fallback">`;
      return '<span class="cb-media-empty" aria-hidden="true">◇</span>';
    }
    if (S.art && urls.art) return `<img src="${urls.art}" alt="${esc(name)} still portrait">`;
    return `<span class="cb-cover" data-cover>${coverImg()}</span>`;
  }
  const coverImg = () => (urls.cover ? `<img src="${urls.cover}" alt="A constellation cover drawn from the name">` : sigilSvg(S.d.name || '?', { size: 120 }));

  function artShape() {
    try {
      const s = S.art ? pngSize(S.art) : null;
      if (!s) return '';
      const r = s.width / s.height;
      if (Math.abs(r - 2 / 3) < 0.02) return '2:3 portrait';
      if (Math.abs(r - 1) < 0.02) return '1:1 portrait';
      return `${s.width} × ${s.height}`;
    } catch { return ''; }
  }

  // With no story open, this is what Aetheria's sheet edits too: the card's own page, or the story template.
  const livingDoc = () => core.living.resolveLivingCharacterDocument(S.d, null, S.id);

  const livingSelect = (key, label, value, options, hint) => `<label class="field"><span class="field-label">${esc(label)}</span>
    <select class="select" data-living="${key}">${options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <span class="field-hint">${esc(hint)}</span></label>`;

  const RENDER = {
    identity: () => {
      const ext = S.d.extensions || {};
      return {
        eyebrow: 'Name, display name, tags', title: 'Identity',
        body: `${fieldRow(
          textField({ path: 'name', label: 'Name', value: S.d.name, hint: 'How the character is addressed in the story', placeholder: 'Elowen' }),
          textField({ path: 'nickname', label: 'Display name', value: S.d.nickname, hint: 'Optional alternative shown in chat', placeholder: 'Optional' }),
        )}
        ${tagsHtml()}
        ${group('For the Archive', fieldRow(
          textField({ path: 'extensions.aetheria.tagline', label: 'Tagline', value: ext.aetheria?.tagline || '', hint: 'One line under the name in the gallery. Other apps ignore it.', placeholder: 'Keeper of the lost and found' }),
          textField({ path: 'extensions.world', label: 'World', value: typeof ext.world === 'string' ? ext.world : '', hint: 'The world the gallery files it under.', placeholder: 'Lowmere' }),
        ), { note: '· kept in the card’s extensions' })}`,
      };
    },

    media: () => ({
      eyebrow: 'Character presence', title: 'Portrait & motion',
      actions: badge(S.video ? 'Motion active' : S.art ? 'Still active' : 'No portrait', !!(S.video || S.art)),
      sub: 'Give the card its still portrait, then optionally layer a short looping video over it. The still image remains the portable card artwork; motion is an Aetheria enhancement stored beside it.',
      body: `<div class="cb-media-grid">
        <section class="cb-media-card" aria-labelledby="cb-still-h">
          <div class="cb-media-head"><div><strong id="cb-still-h">Still portrait</strong><small>Used in the Library, exports, and anywhere motion is unavailable.</small></div>${badge(S.art ? 'Ready' : 'Empty', !!S.art)}</div>
          <div class="cb-media-preview">${mediaPreview('still')}<span class="cb-media-badge">${S.art ? esc(artShape() || 'Portrait') : 'Constellation cover'}</span></div>
          <div class="cb-media-actions">
            <button type="button" class="btn btn-sm${S.art ? '' : ' btn-gilt'}" data-act="art-choose">${S.art ? 'Replace image' : 'Choose image'}</button>
            ${S.art ? '<button type="button" class="btn btn-sm" data-act="art-recrop">Re-crop</button><button type="button" class="btn btn-sm btn-danger" data-act="art-remove">Remove</button>' : ''}
          </div>
        </section>
        <section class="cb-media-card" aria-labelledby="cb-motion-h">
          <div class="cb-media-head"><div><strong id="cb-motion-h">Motion portrait</strong><small>Optional. Loops silently and takes precedence over the still portrait.</small></div>${badge(S.video ? 'Active' : 'Optional', !!S.video)}</div>
          <div class="cb-media-preview">${mediaPreview('video')}<span class="cb-media-badge">${S.video ? 'Motion preview' : 'Still fallback'}</span></div>
          <div class="cb-media-actions">
            <button type="button" class="btn btn-sm${S.video ? '' : ' btn-gilt'}" data-act="video-choose">${S.video ? 'Replace video' : 'Add video'}</button>
            ${S.video ? '<button type="button" class="btn btn-sm btn-danger" data-act="video-remove">Remove video</button>' : ''}
          </div>
        </section>
      </div>
      ${notice$(mediaNotice)}
      <p class="field-hint">${S.art ? '' : 'Without a still portrait, exports carry the constellation cover, drawn from the name. '}Motion travels in a CHARX export; a PNG or JSON card carries the still alone.</p>`,
    }),

    personality: () => ({
      eyebrow: 'Description, traits, voice', title: 'Personality',
      body: `${areaField({ path: 'description', label: 'Description', value: S.d.description, hint: 'Appearance, background, and defining traits', placeholder: 'Describe the character’s appearance, background, and key traits…', rows: 11, macros: true })}
        ${areaField({ path: 'personality', label: 'Personality', value: S.d.personality, hint: 'Mannerisms, motivations, and how they speak', rows: 8, macros: true })}`,
    }),

    living: () => {
      const cfg = core.living.getLivingDocumentConfig(S.d);
      const doc = livingDoc();
      const leaves = !cfg.enabled ? `<div class="cb-dormant">
          <span class="cb-dormant-mark" aria-hidden="true">✎</span>
          <p class="panel-sub">Dormant page</p>
          <h3 class="cb-dormant-title">The root card speaks alone</h3>
          <p>Turn on the Living Document when this character should be allowed to grow beyond its original description. Nothing is added to the prompt while it is off.</p>
        </div>` : `<div class="cb-leaves">
          <article class="cb-leaf">
            <p class="panel-sub">Printed root · read only</p>
            <h3 class="cb-leaf-title">${esc(S.d.name || 'Untitled')}</h3>
            <hr class="rule">
            <p class="cb-meta">Description</p><div class="cb-leaf-text">${esc(S.d.description || 'No description written.')}</div>
            ${S.d.personality ? `<hr class="rule"><p class="cb-meta">Personality</p><div class="cb-leaf-text">${esc(S.d.personality)}</div>` : ''}
            ${S.d.scenario ? `<hr class="rule"><p class="cb-meta">Opening scenario</p><div class="cb-leaf-text">${esc(S.d.scenario)}</div>` : ''}
          </article>
          <article class="cb-leaf is-living">
            <p class="panel-sub">Living page · ${cfg.scope === 'character' ? 'character-locked' : 'story-bound'}</p>
            <h3 class="cb-leaf-title">Revision ${doc.revision}</h3>
            <hr class="rule">
            ${cfg.scope === 'story' ? '<p class="cb-meta">No story is open here, so these edits become the template used when this character enters a story.</p>' : ''}
            ${doc.sections.map((s) => `<label class="field"><span class="field-label">${esc(s.label)}</span>
              <textarea class="textarea" rows="3" data-living-section="${esc(s.id)}" data-living-label="${esc(s.label)}" placeholder="The living page has not changed here yet…">${esc(s.content)}</textarea>
              <span class="field-hint">Current prose; later revisions may replace or clear this section.</span></label>`).join('')}
          </article>
        </div>`;
      const trail = cfg.enabled && doc.revisions.length ? `<div class="cb-trail">
          <p class="panel-sub">Revision trail</p>
          <h3 class="cb-list-title">${doc.revisions.length} remembered ${doc.revisions.length === 1 ? 'change' : 'changes'}</h3>
          ${doc.revisions.slice().reverse().map((r) => `<div class="cb-trail-item">
            <p class="cb-meta">${esc(r.id || '')} · ${r.at ? esc(new Date(r.at).toLocaleString()) : 'Unknown time'}</p>
            <p>${esc(r.summary || '')}</p>
            <p class="cb-meta">${r.conversationId ? 'Born in a story' : 'Edited on the card'}${r.swipeIndex != null ? ` · take ${Number(r.swipeIndex) + 1}` : ''}</p>
          </div>`).join('')}
        </div>` : '';
      return {
        eyebrow: 'Root + living page', title: 'A character that can revise itself',
        actions: badge(`Revision ${doc.revision}`),
        body: `<div class="field field-toggle"><label class="toggle"><input type="checkbox" data-living="enabled"${cfg.enabled ? ' checked' : ''}> Living document</label><span class="field-hint">Let this character maintain an authoritative layer after its original card.</span></div>
          ${fieldRow(
            livingSelect('scope', 'Document scope', cfg.scope, [['story', 'This story (default)'], ['character', 'The character card']], cfg.scope === 'story' ? 'Changes belong only to the story that produced them.' : 'Changes follow this character into every story.'),
            livingSelect('revise', 'Revises itself', cfg.revise, [['moment', 'In the moment'], ['reflection', 'On reflection'], ['both', 'Both']], { moment: 'A private receipt at the end of each reply records what changed.', reflection: 'Revised between scenes from kept passages by the memory pass. Replies stay clean.', both: 'Either in the moment or on reflection.' }[cfg.revise]),
            livingSelect('awareness', 'Awareness', cfg.awareness, [['immersive', 'Immersive'], ['self-aware', 'Self-aware'], ['authorial', 'Authorial / meta-aware']], 'Awareness changes perspective, not storage authority.'),
          )}
          <div class="field field-toggle"><label class="toggle"><input type="checkbox" data-living="allowStoryEdits"${cfg.allowStoryEdits ? ' checked' : ''}${cfg.enabled ? '' : ' disabled'}> May amend the story</label><span class="field-hint">Allows structured edits to the story’s separate living canon.</span></div>
          ${leaves}
          ${trail}
          <p class="cb-meta cb-aside">Living pages grow in Aetheria: its stories write the revisions, and keep the receipts that record them.</p>`,
      };
    },

    scenario: () => ({
      eyebrow: 'The situation the story opens in', title: 'Scenario',
      body: areaField({ path: 'scenario', label: 'Scenario', value: S.d.scenario, hint: 'The situation a story with this character opens in', placeholder: 'Set the scene or context for conversations with this character…', rows: 12, macros: true }),
    }),

    greetings: () => ({
      eyebrow: 'First message and alternates', title: 'Greetings',
      actions: badge(plural(greetingCount(), 'greeting')),
      body: `${areaField({ path: 'first_mes', label: 'First message', value: S.d.first_mes, hint: 'The opening the character speaks', rows: 10, macros: true })}
        <hr class="rule">
        ${listField({ key: 'alternate_greetings', label: 'Alternate greetings', hint: 'Other ways to open', placeholder: 'Another way this story could begin…', item: 'alternate greeting', first: true })}`,
    }),

    dialogue: () => {
      const n = M.exchanges(S.d.mes_example);
      return {
        eyebrow: 'How they actually speak', title: 'Example dialogue',
        actions: n ? badge(plural(n, 'exchange')) : '<span></span>',
        body: areaField({ path: 'mes_example', label: 'Example dialogue', value: S.d.mes_example, hint: 'Sample exchanges that define the character’s voice. Begin each with &lt;START&gt;.', placeholder: 'Example conversations or dialogue to help define the character’s voice…', rows: 16, macros: true }),
      };
    },

    voice: () => ({
      eyebrow: 'Read aloud', title: 'Voice',
      actions: badge(V.voiceBadge(S.d)),
      body: V.voiceBody(S.d, { systemVoices, open: voiceOpen }),
    }),

    advanced: () => ({
      eyebrow: 'System prompt, post-history', title: 'Advanced prompting',
      body: `${areaField({ path: 'system_prompt', label: 'System prompt', value: S.d.system_prompt, hint: 'Overrides the default story instruction when chatting with this character', rows: 8, macros: true })}
        ${areaField({ path: 'post_history_instructions', label: 'Post-history instructions', value: S.d.post_history_instructions, hint: 'Inserted after the conversation history (also known as the jailbreak slot)', rows: 8, macros: true })}`,
    }),

    group: () => {
      const talk = core.group.talkativenessOf(S.d);
      return {
        eyebrow: 'Talkativeness, multi-character greetings', title: 'Group behaviour',
        body: `${rangeField({ path: 'extensions.talkativeness', label: 'Talkativeness', value: talk, min: 0, max: 1, step: 0.05, kind: 'string-number', format: (v) => `${Math.round(Number(v) * 100)}%`, hint: 'In a story with several characters, how often they join in when nobody names them. Kept on the card, so it travels with it.' })}
          <hr class="rule">
          ${listField({ key: 'group_only_greetings', label: 'Group-only greetings', hint: 'Used when this character enters a multi-character story', placeholder: 'How they enter a scene that already has other characters…', item: 'group greeting' })}`,
      };
    },

    metadata: () => ({
      eyebrow: 'Creator, version, source, export', title: 'Metadata',
      body: `${fieldRow(
        textField({ path: 'creator', label: 'Creator', value: S.d.creator, placeholder: 'Your name or handle' }),
        textField({ path: 'character_version', label: 'Version', value: S.d.character_version, placeholder: '1.0' }),
      )}
        <label class="field"><span class="field-label">Source<span class="mono" data-listcount="source">${(S.d.source || []).length || ''}</span></span>
          <textarea class="textarea mono cb-source" id="f-source" data-path="source" data-kind="lines" rows="2" placeholder="https://…" spellcheck="false">${esc((S.d.source || []).join('\n'))}</textarea>
          <span class="field-hint">Where this card came from. One link to a line.</span></label>
        ${areaField({ path: 'creator_notes', label: 'Creator notes', value: S.d.creator_notes, hint: 'Notes for you (not sent to the model)', rows: 5 })}
        <hr class="rule">
        ${group('Embedded lorebook', loreHtml())}
        <hr class="rule">
        <div class="cb-export">
          <div><p class="panel-sub">Export</p><h3 class="cb-list-title">Take this character elsewhere</h3></div>
          <div class="btn-row">
            <button type="button" class="btn btn-sm btn-gilt" data-export="png">PNG card</button>
            <button type="button" class="btn btn-sm" data-export="charx">CHARX (v3)</button>
            <button type="button" class="btn btn-sm" data-export="json2">JSON (v2)</button>
            <button type="button" class="btn btn-sm" data-export="json3">JSON (v3)</button>
          </div>
          <div data-export-notice>${notice$(exportNotice)}</div>
          <p class="field-hint">A PNG card holds V2 for SillyTavern and V3 beside it. CHARX also carries the motion portrait.</p>
        </div>`,
    }),
  };

  function loreHtml() {
    const b = S.d.character_book;
    if (!b) {
      return `<p class="cb-meta">No lorebook travels with this card. Attach one, or start one in the Lorebook builder.</p>
        <div class="btn-row"><button type="button" class="btn btn-sm" data-act="lore-attach">Attach a lorebook</button><button type="button" class="btn btn-sm btn-ghost" data-act="lore-open">Start one in the Lorebook builder</button></div>`;
    }
    const s = M.bookSummary(b);
    return `<div class="cb-lore">
      <div class="cb-lore-sum"><strong>${esc(s.name || 'Untitled lorebook')}</strong>
        <span class="mono">${plural(s.entries, 'entry', 'entries')} · ≈${fmtTokens(s.tokens)} tokens${s.constant ? ` · ${s.constant} always on` : ''}${s.enabled < s.entries ? ` · ${s.entries - s.enabled} off` : ''}</span></div>
      <div class="btn-row">
        <button type="button" class="btn btn-sm btn-gilt" data-act="lore-open">Open in Lorebook builder</button>
        <button type="button" class="btn btn-sm" data-act="lore-attach">Replace from a file</button>
        <button type="button" class="btn btn-sm btn-danger" data-act="lore-detach">Detach</button>
      </div>
      <p class="field-hint">It rides inside every export as the card’s character book. Its entries are written in the Lorebook builder.</p>
    </div>`;
  }

  /* ── the live card (inspector) ──────────────────────────────────────── */

  const inspectorShell = () => `<div class="cb-live">
      <div class="cb-live-portrait" data-live-portrait></div>
      <div class="cb-live-id" data-live-id></div>
      <button type="button" class="btn btn-sm btn-ghost" data-goto="media">Change portrait &amp; motion</button>
    </div>
    <div class="statline cb-live-stats" data-live-stats></div>
    <section class="cb-live-block" aria-label="Token anatomy"><p class="panel-sub">Token anatomy</p><div data-live-anatomy></div></section>
    <details class="cb-fold" data-fold="craft"><summary><span class="cb-fold-title">Craft checks</span><span class="cb-fold-meta" data-live-craft-sum></span></summary><div class="cb-fold-body" data-live-craft></div></details>
    <details class="cb-fold" data-fold="house"><summary><span class="cb-fold-title">The house checklist</span><span class="cb-fold-meta" data-live-house-sum></span></summary><div class="cb-fold-body" data-live-house></div></details>
    <div data-live-lore></div>
    <div class="btn-row"><button type="button" class="btn btn-sm" data-act="lens">Read under the Lens</button></div>
    <p class="field-hint">Beginning a story, and rebuilding this card by interview, happen in Aetheria.</p>
    <div class="cb-danger"><p>Deleting a draft removes it from this browser. Cards you exported keep everything.</p><button type="button" class="btn btn-sm btn-danger" data-act="draft-delete">Delete this draft</button></div>`;

  function refreshPortraits() {
    if (!root) return;
    ensureUrls();
    const box = root.querySelector('[data-live-portrait]');
    if (!box) return;
    const name = S.d.name || 'Character';
    box.innerHTML = S.video && urls.video
      ? `<video src="${urls.video}" muted loop playsinline ${reducedMotion() ? '' : 'autoplay'} ${S.art && urls.art ? `poster="${urls.art}"` : ''} aria-label="${esc(name)} motion portrait"></video>`
      : S.art && urls.art ? `<img src="${urls.art}" alt="${esc(name)} portrait">`
        : `<span class="cb-cover" data-cover>${coverImg()}</span><span class="cb-media-badge">Constellation cover</span>`;
  }

  function houseFlags() {
    const c = S.d;
    const allow = [c.name, c.nickname, ...(c.tags || []), typeof c.extensions?.world === 'string' ? c.extensions.world : ''].join(' ');
    const fields = [
      ['Description', c.description, 'portrait'], ['Personality', c.personality, 'prose'], ['Scenario', c.scenario, 'prose'],
      ['First message', c.first_mes, 'prose'],
      ...(c.alternate_greetings || []).map((g, i) => [`Alternate greeting ${i + 1}`, g, 'prose']),
      ...(c.group_only_greetings || []).map((g, i) => [`Group greeting ${i + 1}`, g, 'prose']),
    ];
    const out = [];
    for (const [label, text, kind] of fields) {
      if (!String(text || '').trim()) continue;
      const flags = core.house.houseCheck(text, { kind, allow }).filter((f) => f.id !== 'empty');
      if (flags.length) out.push({ label, flags });
    }
    return out;
  }

  let refreshTimer = 0;
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { refreshInspector(); refreshBadges(); refreshHeads(); ensureCover(); }, 220); }

  /** The badges in section heads that count what is typed elsewhere in the section. */
  function refreshHeads() {
    const head = (id) => root?.querySelector(`[data-section-body="${id}"] .sheet-section-head .btn-row`);
    const g = head('greetings');
    if (g) g.innerHTML = badge(plural(greetingCount(), 'greeting'));
    const dl = head('dialogue');
    const n = M.exchanges(S.d.mes_example);
    if (dl) dl.innerHTML = n ? badge(plural(n, 'exchange')) : '';
  }

  function refreshInspector() {
    if (!root) return;
    const c = S.d;
    const q = (s) => root.querySelector(s);
    const id = q('[data-live-id]');
    if (!id) return;
    id.innerHTML = `<h3 class="inspector-title">${esc(displayName())}</h3>
      ${c.nickname ? `<p class="cb-live-nick">Shown in chat as <b>${esc(c.nickname)}</b></p>` : ''}
      ${(c.tags || []).length ? `<div class="chip-row">${c.tags.map((t) => `<span class="chip chip-static tagline-chip">${esc(t)}</span>`).join('')}</div>` : ''}`;
    const book = M.bookSummary(c.character_book);
    q('[data-live-stats]').innerHTML = `<div class="stat"><span class="stat-val">${M.wordCount(c.description)}</span><span class="stat-label">Description</span></div>
      <div class="stat"><span class="stat-val">${greetingCount()}</span><span class="stat-label">Greetings</span></div>
      <div class="stat"><span class="stat-val">${book.entries}</span><span class="stat-label">Lore</span></div>`;
    const anat = tokenAnatomy({ ...c, character_book: c.character_book && Array.isArray(c.character_book.entries) ? c.character_book : null });
    q('[data-live-anatomy]').innerHTML = `<p class="big-number">≈${fmtTokens(anat.permanent)}<small>permanent</small></p>${meterHtml(anat)}`;

    // Keep which checks were open across refreshes.
    const craftBox = q('[data-live-craft]');
    const wasOpen = [...craftBox.querySelectorAll('details.check')].map((x) => x.open);
    const checks = craftChecks({ ...c, character_book: c.character_book && Array.isArray(c.character_book.entries) ? c.character_book : null });
    craftBox.innerHTML = checksHtml(checks);
    if (wasOpen.length) craftBox.querySelectorAll('details.check').forEach((x, i) => { if (i < wasOpen.length) x.open = wasOpen[i]; });
    const looks = checks.filter((x) => x.level !== 'pass').length;
    q('[data-live-craft-sum]').textContent = looks ? `${looks} to read` : 'Clear';

    const flags = houseFlags();
    const n = flags.reduce((k, f) => k + f.flags.length, 0);
    q('[data-live-house-sum]').textContent = n ? `${n} to read` : 'Clear';
    q('[data-live-house]').innerHTML = `<p class="field-hint">Aetheria reads every piece of made prose against this list before anyone sees it. Names you chose are yours to use.</p>
      ${flags.length ? flags.map((f) => `<div class="cb-house-field"><p class="cb-house-where">${esc(f.label)}</p>
        ${f.flags.map((x) => `<div class="cb-house-flag"><span class="sev sev-${x.level === 'rewrite' ? 'look' : 'note'}">${x.level === 'rewrite' ? 'Rewrite' : 'Note'}</span><span>${esc(x.note)}${x.quotes?.length && !['user', 'name', 'echo'].includes(x.id) ? `<span class="cb-house-quote">${esc(x.quotes[0])}</span>` : ''}</span></div>`).join('')}
      </div>`).join('') : '<p class="cb-meta">Nothing here the house checklist would send back.</p>'}`;

    q('[data-live-lore]').innerHTML = c.character_book
      ? `<button type="button" class="cb-live-lore" data-goto="metadata"><span class="panel-sub">Lorebook</span><span>${esc(book.name || 'Untitled lorebook')}</span><span class="mono">${plural(book.entries, 'entry', 'entries')} · ≈${fmtTokens(book.tokens)} tok</span></button>`
      : '';
  }

  function refreshBadges() {
    if (!root) return;
    const c = S.d;
    const tk = (...keys) => { const n = keys.reduce((k, f) => k + estTokens(c[f] || ''), 0); return n ? `${fmtTokens(n)} tk` : ''; };
    setBadge(root, 'media', S.video ? 'Motion' : S.art ? 'Still' : '');
    setBadge(root, 'personality', tk('description', 'personality'));
    setBadge(root, 'living', core.living.getLivingDocumentConfig(c).enabled ? 'On' : '');
    setBadge(root, 'scenario', tk('scenario'));
    setBadge(root, 'greetings', greetingCount() ? String(greetingCount()) : '');
    setBadge(root, 'dialogue', tk('mes_example'));
    setBadge(root, 'voice', Object.values(core.speech.voicesOfCharacter(c)).some((v) => String(v || '').trim()) ? 'Own' : '');
    setBadge(root, 'advanced', tk('system_prompt', 'post_history_instructions'));
    setBadge(root, 'group', (c.group_only_greetings || []).length ? String(c.group_only_greetings.length) : '');
    setBadge(root, 'metadata', c.character_book ? `${M.bookSummary(c.character_book).entries} lore` : '');
  }

  /* ── the constellation cover, drawn as it will be exported ──────────── */

  let coverTimer = 0;
  function ensureCover() {
    if (S.art) return;
    const key = `${S.d.name}|${S.d.extensions?.aetheria?.tagline || ''}|${document.documentElement.dataset.binding || ''}`;
    if (key === urls.coverKey && urls.cover) { paintCover(); return; }
    clearTimeout(coverTimer);
    coverTimer = setTimeout(async () => {
      const want = key;
      try {
        const bytes = await sigilCover(S.d.name || 'Untitled', S.d.extensions?.aetheria?.tagline || '');
        if (want !== `${S.d.name}|${S.d.extensions?.aetheria?.tagline || ''}|${document.documentElement.dataset.binding || ''}`) return;
        if (urls.cover) URL.revokeObjectURL(urls.cover);
        urls.cover = pngUrl(bytes);
        urls.coverKey = want;
        paintCover();
      } catch (e) { console.warn(e); }
    }, urls.cover ? 500 : 0);
  }
  const paintCover = () => { for (const el of root?.querySelectorAll('[data-cover]') || []) el.innerHTML = coverImg(); };
  const coverBytes = () => sigilCover(S.d.name || 'Untitled', S.d.extensions?.aetheria?.tagline || '');

  function resetUrls() {
    for (const k of ['art', 'video', 'cover']) if (urls[k]) URL.revokeObjectURL(urls[k]);
    urls.art = null; urls.video = null; urls.cover = null; urls.coverKey = '';
  }

  /* ── portrait & motion ──────────────────────────────────────────────── */

  async function chooseArt(blob) {
    const looksLikeImage = blob && (blob.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(blob.name || ''));
    if (!looksLikeImage) { mediaNotice = { error: true, text: 'Choose an image file for the still portrait.' }; redraw('media'); return; }
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(blob);
    const bytes = await openCropper(srcUrl);
    if (!bytes) return;
    await setArt(bytes, 'Still portrait set. Exports will carry it.');
  }

  async function setArt(bytes, text) {
    S.art = bytes;
    if (urls.art) URL.revokeObjectURL(urls.art);
    urls.art = null;
    mediaNotice = { error: false, text };
    try { await persistMedia(); } catch (e) { mediaNotice = { error: true, text: `The portrait is shown, but this browser would not keep it: ${e.message}` }; }
    sv.poke();
    redraw('media'); refreshPortraits(); refreshBadges();
  }

  async function setVideo(file) {
    const ok = file && (file.type?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name || ''));
    if (!ok) { mediaNotice = { error: true, text: 'Choose an MP4, WebM, or MOV video.' }; redraw('media'); return; }
    mediaNotice = { error: false, text: `Preparing ${file.name || 'motion portrait'}…` };
    redraw('media');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      S.video = { bytes, name: file.name || 'portrait.mp4', type: file.type || (/\.webm$/i.test(file.name || '') ? 'video/webm' : 'video/mp4') };
      S.d.media = { ...(S.d.media || {}), portraitVideo: S.video.name };
      if (urls.video) URL.revokeObjectURL(urls.video);
      urls.video = null;
      await persistMedia();
      mediaNotice = { error: false, text: 'Motion portrait saved. It now takes precedence over the still image wherever motion is supported.' };
    } catch (e) {
      mediaNotice = { error: true, text: e?.message || 'The motion portrait could not be saved.' };
    }
    sv.poke();
    redraw('media'); refreshPortraits(); refreshBadges();
  }

  /* ── living pages ───────────────────────────────────────────────────── */

  function updateLivingConfig(changes) {
    const cfg = core.living.getLivingDocumentConfig(S.d);
    S.d.extensions = core.living.setLivingDocumentConfig(S.d, { ...cfg, ...changes }).extensions;
  }

  /* ── exporting ──────────────────────────────────────────────────────── */

  async function exportAs(kind) {
    closeMenu();
    await sv.flush();
    const label = EXPORTS[kind]?.label || 'card';
    const base = slugify(S.d.name || 'character');
    try {
      if (kind === 'png') {
        download(M.embedInPng(S.art || await coverBytes(), S.d), `${base}.png`, 'image/png');
      } else if (kind === 'charx') {
        download(await M.charxBlob(S.d, S.art || await coverBytes(), S.video), `${base}.charx`, 'application/zip');
      } else if (kind === 'json2') {
        download(JSON.stringify(M.toV2Payload(S.d), null, 2), `${base}.json`, 'application/json');
      } else if (kind === 'json3') {
        download(JSON.stringify(M.toV3Payload(S.d), null, 2), `${base}.v3.json`, 'application/json');
      }
      exportNotice = { error: false, text: `The ${label} is exported.` };
    } catch (e) {
      exportNotice = { error: true, text: `The ${label} was not exported: ${e?.message || 'the file could not be written.'}` };
      toast(exportNotice.text);
    }
    const box = root?.querySelector('[data-export-notice]');
    if (box) box.innerHTML = notice$(exportNotice);
  }

  const menu = () => root?.querySelector('#cb-export-menu');
  function openMenu() {
    const m = menu(); const b = root.querySelector('[data-act="export-menu"]');
    m.hidden = false; b.setAttribute('aria-expanded', 'true');
    m.querySelector('[role=menuitem]')?.focus();
  }
  function closeMenu(focus = false) {
    const m = menu(); if (!m || m.hidden) return;
    m.hidden = true;
    const b = root.querySelector('[data-act="export-menu"]');
    b?.setAttribute('aria-expanded', 'false');
    if (focus) b?.focus();
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  function changed(path = '') {
    if (path === 'name' || path === '') {
      const t = root?.querySelector('[data-sheet-title]');
      if (t) t.textContent = displayName();
      // The drafts lists follow the name as it is typed.
      const item = root?.querySelector('.sheet-draft.is-current');
      if (item?.firstChild?.nodeType === 3) item.firstChild.textContent = displayName();
      const opt = root?.querySelector(`[data-draft-select] option[value="${CSS.escape(S.id)}"]`);
      if (opt) opt.textContent = displayName();
    }
    sv.poke();
    // Long runs of typing still reach the shelf every few seconds.
    if (!pendingSince) pendingSince = Date.now();
    else if (Date.now() - pendingSince > 4000) { pendingSince = 0; sv.flush(); }
    scheduleRefresh();
  }

  function goto(id) {
    section = showSection(root, id, { remember: SECTION_KEY });
    onShow(section);
    root.querySelector('.sheet-main')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function onShow(id) {
    section = id;
    const bar = root.querySelector('[data-macro-bar]');
    if (bar) bar.hidden = !TEXT_SECTIONS.has(id);
    if (LIVE_SECTIONS.has(id)) redraw(id);
    if (id === 'voice' && !systemVoices.length && V.systemVoiceAvailable()) {
      V.listSystemVoices().then((list) => { systemVoices = list; if (section === 'voice' && list.length) redraw('voice'); });
    }
  }

  function flash(field) {
    const el = root.querySelector(`[data-path="${CSS.escape(field)}"]`);
    if (!el) return;
    el.classList.add('cb-flash');
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    if (field === 'description' || field === 'first_mes') { el.focus({ preventScroll: true }); el.setSelectionRange?.(el.value.length, el.value.length); }
    setTimeout(() => el.classList.remove('cb-flash'), 2400);
  }

  function inlineConfirm(btn, question, onYes) {
    const wrap = document.createElement('span');
    wrap.className = 'confirm-inline';
    wrap.innerHTML = `<span>${esc(question)}</span><button type="button" class="btn btn-sm btn-danger" data-yes>Yes</button><button type="button" class="btn btn-sm btn-ghost" data-no>Cancel</button>`;
    btn.replaceWith(wrap);
    wrap.querySelector('[data-yes]').addEventListener('click', (e) => { e.stopPropagation(); wrap.replaceWith(btn); onYes(); });
    wrap.querySelector('[data-no]').addEventListener('click', (e) => { e.stopPropagation(); wrap.replaceWith(btn); btn.focus(); });
    wrap.querySelector('[data-no]').focus();
  }

  function addTags(input) {
    const words = String(input.value || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!words.length) return;
    const tags = [...(S.d.tags || [])];
    for (const w of words) if (!tags.includes(w)) tags.push(w);
    S.d.tags = tags;
    redraw('identity');
    root.querySelector('#cb-tag-input')?.focus();
    changed('tags');
  }

  function listAction(act, key, i) {
    const list = [...(S.d[key] || [])];
    const focusSel = (j, what = 'textarea') => (what === 'textarea' ? `[data-path="${key}.${j}"]` : `[data-act="${what}"][data-key="${key}"][data-i="${j}"]`);
    let focus = null;
    if (act === 'list-add') { list.push(''); focus = focusSel(list.length - 1); }
    if (act === 'list-up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; focus = focusSel(i - 1, i - 1 === 0 ? 'list-down' : 'list-up'); }
    if (act === 'list-down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; focus = focusSel(i + 1, i + 1 === list.length - 1 ? 'list-up' : 'list-down'); }
    if (act === 'list-remove') { list.splice(i, 1); focus = list.length ? focusSel(Math.min(i, list.length - 1), 'list-remove') : `[data-act="list-add"][data-key="${key}"]`; }
    if (act === 'list-first') {
      const was = S.d.first_mes || '';
      S.d.first_mes = list[i];
      if (was.trim()) list[i] = was; else list.splice(i, 1);
      toast('That greeting is the first message now.');
      focus = '[data-path="first_mes"]';
    }
    S.d[key] = list;
    const sec = key === 'group_only_greetings' ? 'group' : 'greetings';
    redraw(sec);
    if (focus) root.querySelector(focus)?.focus();
    changed(key);
    refreshBadges();
  }

  async function newBlank() {
    notice = null;
    await adopt(fresh());
    root.querySelector('[data-path="name"]')?.focus();
  }

  async function onClick(e) {
    const t = e.target;
    const exp = t.closest('[data-export]');
    if (exp) { exportAs(exp.dataset.export); return; }
    const tag = t.closest('[data-tag-remove]');
    if (tag) { S.d.tags = (S.d.tags || []).filter((x) => x !== tag.dataset.tagRemove); redraw('identity'); root.querySelector('#cb-tag-input')?.focus(); changed('tags'); return; }
    const mac = t.closest('[data-macro]');
    if (mac) { insertMacro(mac.dataset.macro); return; }
    const go = t.closest('[data-goto]');
    if (go) { goto(go.dataset.goto); return; }
    const start = t.closest('[data-start-file]');
    if (start) { try { await openArchiveCard(start.dataset.startFile); } catch (err) { sayError(err); } return; }
    const hear = t.closest('[data-voice-hear]');
    if (hear) {
      const p = root.querySelector(`[data-voice-problem="${CSS.escape(hear.dataset.voiceHear)}"]`);
      if (p) p.hidden = true;
      const problem = await V.hear(S.d, hear.dataset.voiceHear);
      if (problem && p) { p.textContent = problem; p.hidden = false; }
      return;
    }
    const b = t.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const act = b.dataset.act;
    switch (act) {
      case 'import': { const f = await pickFile('.png,.json,.charx,image/png,application/json'); if (f) await takeFile(f); break; }
      case 'export-menu': if (menu().hidden) openMenu(); else closeMenu(); break;
      case 'new': await newBlank(); break;
      case 'dismiss': notice = null; redrawBanner(); break;
      case 'fresh-from': { try { notice = null; await openArchiveCard(b.dataset.file); } catch (err) { sayError(err); } break; }
      case 'macros-all': { const more = root.querySelector('#cb-macro-more'); more.hidden = !more.hidden; b.setAttribute('aria-expanded', String(!more.hidden)); break; }
      case 'tag-add': addTags(root.querySelector('#cb-tag-input')); break;
      case 'list-add': case 'list-up': case 'list-down': case 'list-first':
        listAction(act, b.dataset.key, Number(b.dataset.i)); break;
      case 'list-remove': {
        const key = b.dataset.key; const i = Number(b.dataset.i);
        if (String(S.d[key]?.[i] || '').trim()) inlineConfirm(b, 'Remove it?', () => listAction('list-remove', key, i));
        else listAction('list-remove', key, i);
        break;
      }
      case 'art-choose': { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'); if (f) await chooseArt(f); break; }
      case 'art-recrop': {
        const url = srcUrl || urls.art;
        if (!url) break;
        const bytes = await openCropper(url);
        if (bytes) await setArt(bytes, 'Still portrait cropped again.');
        break;
      }
      case 'art-remove': inlineConfirm(b, 'Remove the portrait?', async () => {
        if (srcUrl) { URL.revokeObjectURL(srcUrl); srcUrl = null; }
        await setArt(null, 'Still portrait removed. Exports will carry the constellation cover.');
        ensureCover();
      }); break;
      case 'video-choose': { const f = await pickFile('video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'); if (f) await setVideo(f); break; }
      case 'video-remove': inlineConfirm(b, 'Remove the video?', async () => {
        S.video = null;
        S.d.media = { ...(S.d.media || {}), portraitVideo: null };
        if (urls.video) URL.revokeObjectURL(urls.video);
        urls.video = null;
        await persistMedia().catch(() => {});
        mediaNotice = { error: false, text: 'Motion portrait removed. The still portrait is active again.' };
        sv.poke(); redraw('media'); refreshPortraits(); refreshBadges();
      }); break;
      case 'voice-others': voiceOpen = !voiceOpen; redraw('voice'); root.querySelector('[data-act="voice-others"]')?.focus(); break;
      case 'lens': { await sv.flush(); handoff.lens = { data: clone(S.d) }; location.hash = 'lens'; break; }
      case 'lore-open': {
        await sv.flush();
        if (!S.saved) await persistNow();
        const book = S.d.character_book || { name: `${S.d.name || 'Card'} lore`, description: '', entries: [], extensions: {} };
        handoff.lorebook = { json: clone(book), name: S.d.name || 'Untitled', from: 'character', draftId: S.id };
        location.hash = 'lorebook';
        break;
      }
      case 'lore-attach': {
        const f = await pickFile('.json,.png,application/json,image/png');
        if (!f) break;
        try {
          const r = await M.readFile(f);
          const book = r.kind === 'lorebook' ? r.book : r.kind === 'card' ? r.card.character_book : null;
          if (!book) { toast('That file holds no lorebook.'); break; }
          bindBook(book, 'Attached');
        } catch (err) { sayError(err); }
        break;
      }
      case 'lore-detach': inlineConfirm(b, 'Detach the lorebook?', () => {
        S.d.character_book = null; changed('character_book'); redraw('metadata'); refreshInspector();
        root.querySelector('[data-act="lore-attach"]')?.focus();
      }); break;
      case 'draft-delete': inlineConfirm(b, 'Delete this draft?', async () => {
        await sv.flush();
        const gone = S.id;
        const wasSaved = S.saved;
        S.saved = false;
        if (wasSaved) await removeDraft(gone);
        const items = await shelf.list();
        const next = items.length ? await loadDraft(items[0].id) : null;
        S = null;
        notice = { html: 'The draft is deleted.' };
        await adopt(next || fresh());
      }); break;
      default: break;
    }
  }

  function insertMacro(tok) {
    const el = lastField && document.contains(lastField) && !lastField.closest('[hidden]') ? lastField : null;
    if (!el) { toast('Click into a field first, then pick a macro.'); return; }
    const s = el.selectionStart ?? el.value.length; const en = el.selectionEnd ?? el.value.length;
    el.setRangeText(tok, s, en, 'end');
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wire() {
    bindSheet(root, {
      get: () => S.d,
      onChange: (path) => changed(path),
      formats: { 'extensions.talkativeness': (v) => `${Math.round(Number(v) * 100)}%` },
    });
    root.addEventListener('click', onClick);
    root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-macro]')) e.preventDefault(); });
    root.addEventListener('focusin', (e) => {
      if (e.target.matches('.sheet-body textarea, .sheet-body input.input')) lastField = e.target;
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-tag-input]') && e.key === 'Enter') { e.preventDefault(); addTags(e.target); }
      if (e.target.closest('#cb-export-menu')) {
        const items = [...menu().querySelectorAll('[role=menuitem]')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
        if (e.key === 'Tab') closeMenu();
      }
    });
    const onEdit = (e) => {
      const t = e.target;
      if (t.matches('[data-voice-engine]')) {
        const v = t.dataset.trim !== undefined ? t.value.trim() : t.value;
        V.setVoice(S.d, t.dataset.voiceEngine, v);
        const sec = root.querySelector('[data-section-body="voice"] .sheet-section-head .badge');
        if (sec) sec.textContent = V.voiceBadge(S.d);
        changed('extensions');
        return;
      }
      if (t.matches('[data-living-section]')) {
        const cfg = core.living.getLivingDocumentConfig(S.d);
        const doc = livingDoc();
        const next = core.living.setLivingDocumentSection(doc, t.dataset.livingSection, t.value, t.dataset.livingLabel);
        updateLivingConfig(cfg.scope === 'character' ? { characterDocument: next } : { storyTemplate: next });
        changed('extensions');
        return;
      }
      if (t.matches('[data-living]') && e.type === 'change') {
        const key = t.dataset.living;
        if (key === 'enabled') updateLivingConfig({ enabled: t.checked });
        else if (key === 'allowStoryEdits') updateLivingConfig({ allowStoryEdits: t.checked });
        else if (key === 'scope') {
          const cfg = core.living.getLivingDocumentConfig(S.d);
          const doc = livingDoc();
          const scope = t.value === 'character' ? 'character' : 'story';
          updateLivingConfig({ scope, ...(scope === 'character' ? { characterDocument: doc } : { storyTemplate: doc }) });
        } else updateLivingConfig({ [key]: t.value });
        redraw('living');
        root.querySelector(`[data-living="${key}"]`)?.focus();
        changed('extensions');
      }
    };
    root.addEventListener('input', onEdit);
    root.addEventListener('change', onEdit);
    wireDrafts(root, {
      onOpen: async (id) => {
        if (id === S.id) return;
        const next = await loadDraft(id);
        if (!next) { toast('That draft is no longer here.'); refreshDraftLists(); return; }
        notice = null;
        await adopt(next);
      },
      onNew: () => newBlank(),
    });
    // Drop a card, lorebook, picture or video anywhere on the sheet.
    let depth = 0;
    root.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { depth++; root.classList.add('is-dropping'); } });
    root.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) root.classList.remove('is-dropping'); });
    root.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    root.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); depth = 0; root.classList.remove('is-dropping');
      takeFile(e.dataTransfer.files[0]);
    });
  }

  /* ── document-level listeners ───────────────────────────────────────── */

  const onDocClick = (e) => { if (root && !e.target.closest('.cb-menu-wrap')) closeMenu(); };
  const onDocKey = (e) => { if (e.key === 'Escape' && menu() && !menu().hidden) closeMenu(true); };
  const onBinding = () => { if (S && !S.art) { urls.coverKey = ''; ensureCover(); } };
  const onHide = () => { sv.flush(); };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKey);
  document.addEventListener('binding', onBinding);
  window.addEventListener('pagehide', onHide);

  /* ── start ──────────────────────────────────────────────────────────── */

  const migrated = await migrateForge();
  gallery = await loadCards().then((cs) => cs.filter((c) => c.file)).catch(() => []);
  const h = take('forge') || take('character') || null;
  const current = async () => (await loadDraft(shelf.current.get())) || (await loadDraft((await shelf.list())[0]?.id));

  try {
    if (h?.file) {
      const origins = store.get(ORIGINS, {}) || {};
      const had = origins[h.file] ? await loadDraft(origins[h.file]) : null;
      if (had) {
        notice = {
          html: `You already have a draft of <b>${esc(had.d.name || 'this card')}</b>. It is open where you left it.`,
          actions: `<button type="button" class="btn btn-sm" data-act="fresh-from" data-file="${esc(h.file)}">Start again from the Archive copy</button>`,
        };
        await adopt(had);
      } else {
        await openArchiveCard(h.file);
      }
    } else if (h?.data) {
      if (h.blank) await adopt(fresh());
      else {
        const card = M.normalizeCard(h.data);
        notice = { html: `Opened <b>${esc(card.name || 'a card')}</b> as a new draft. Your edits save in this browser.` };
        await adopt(fresh(card, { art: M.toBytes(h.imageBytes) }), { persist: true });
      }
    } else if (h?.patch) {
      S = (await current()) || fresh();
      const said = applyPatch(h.patch);
      notice = { ...(notice || {}), html: said || 'The blueprint was empty, so nothing changed.' };
      await persistNow();
      const target = S; S = null;
      await adopt(target);
    } else if (h?.book) {
      S = (h.draftId && await loadDraft(h.draftId)) || (await current()) || fresh();
      const book = M.toBook(h.book);
      if (book) {
        const had = S.d.character_book;
        const replaced = had && (had.name || '') !== (book.name || '');
        S.d.character_book = book;
        section = 'metadata';
        notice = { html: `The lorebook is back from the Lorebook builder and bound to <b>${esc(displayName())}</b>: ${plural(M.bookSummary(book).entries, 'entry', 'entries')}.${replaced ? ` It takes the place of “${esc(had.name || 'the book it had')}”.` : ''}` };
        await persistNow();
      }
      const target = S; S = null;
      await adopt(target);
    } else {
      const open = await current();
      if (migrated && (!open || open.id === migrated)) notice = { html: 'Your draft from the old Card Forge is here, as you left it.' };
      await adopt(open || fresh());
    }
  } catch (e) {
    console.error(e);
    sayError(e, 'That card could not be opened.');
    if (!root) { S = null; await adopt((await current()) || fresh()); }
  }

  return () => {
    sv.flush();
    clearTimeout(refreshTimer); clearTimeout(coverTimer);
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKey);
    document.removeEventListener('binding', onBinding);
    window.removeEventListener('pagehide', onHide);
    V.stopSpeaking();
    resetUrls();
    if (srcUrl) URL.revokeObjectURL(srcUrl);
  };
}
