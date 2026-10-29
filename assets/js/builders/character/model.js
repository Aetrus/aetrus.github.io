// The Character builder's card model: Aetheria's own card shape (characterCardUtils'
// internal format), read from PNG / JSON / CHARX and written back out with
// Aetheria's converters. Pure apart from the File and Blob reads.
import * as core from '../../vendor/aetheria/character.js';
import { isPng, readTextChunks, writeTextChunks, utf8ToBase64, base64ToUtf8, pngSize } from '../../lib/png.js';
import { detectLorebook, toCharacterBook } from '../../lib/lorebook.js';
import { estTokens } from '../../lib/card.js';

const cc = core.card;

const STR_FIELDS = [
  'name', 'nickname', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version',
];
const LIST_FIELDS = ['alternate_greetings', 'group_only_greetings', 'tags'];
// Field names from the oldest (V1 / TavernAI) cards.
const V1_ALIASES = {
  name: ['char_name'], description: ['char_persona'], scenario: ['world_scenario'],
  first_mes: ['char_greeting'], mes_example: ['example_dialogue'], creator_notes: ['creatorcomment'],
};

const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/**
 * Any card object (Aetheria's internal format, a flat V1 card, or the site's
 * normalised data) as the draft this builder edits: every field Aetheria's
 * createEmptyCard has, with lists as lists.
 */
export function normalizeCard(raw = {}) {
  const src = plainObject(raw) || {};
  const base = cc.createEmptyCard();
  const d = { ...base };
  for (const k of STR_FIELDS) {
    let v = src[k];
    if ((v == null || v === '') && V1_ALIASES[k]) {
      const alias = V1_ALIASES[k].find((a) => typeof src[a] === 'string' && src[a]);
      if (alias) v = src[alias];
    }
    d[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  for (const k of LIST_FIELDS) d[k] = strings(src[k]);
  // V3 keeps sources as a list; Aetheria's sheet once kept one as a string.
  d.source = Array.isArray(src.source) ? strings(src.source) : (typeof src.source === 'string' && src.source.trim() ? [src.source.trim()] : []);
  d.creator_notes_multilingual = plainObject(src.creator_notes_multilingual) || {};
  d.creation_date = src.creation_date ?? null;
  d.modification_date = src.modification_date ?? null;
  d.assets = Array.isArray(src.assets) ? src.assets.filter((a) => plainObject(a)) : [];
  d.character_book = toBook(src.character_book);
  d.extensions = plainObject(src.extensions) ? src.extensions : base.extensions;
  d.media = { portraitVideo: src.media?.portraitVideo ?? null };
  d.spec = 'chara_card_v3';
  d.spec_version = '3.0';
  return d;
}

export const blankCard = () => ({ ...normalizeCard({}), creation_date: Date.now() });

export function isBlank(d) {
  return !d || !(d.name || d.description || d.personality || d.scenario || d.first_mes || d.mes_example
    || (d.alternate_greetings || []).length || (d.tags || []).length || d.character_book);
}

// ── Lorebooks ─────────────────────────────────────────────────────────────

/** A character_book (V2 embedded shape) from a book in any shape, or null. */
export function toBook(obj) {
  const o = plainObject(obj);
  if (!o) return null;
  const kind = detectLorebook(o);
  if (kind === 'character_book') return o;
  if (kind === 'standalone') return toCharacterBook(o);
  if (kind === 'card') return toBook(o.data?.character_book || o.character_book);
  return null;
}

export function bookSummary(book) {
  const entries = Array.isArray(book?.entries) ? book.entries : [];
  return {
    name: book?.name || '',
    entries: entries.length,
    enabled: entries.filter((e) => e && e.enabled !== false).length,
    constant: entries.filter((e) => e && e.constant).length,
    tokens: entries.reduce((n, e) => n + estTokens(e?.content || ''), 0),
  };
}

/** A blank lorebook entry in the V2 embedded shape (the Forge's, kept for blueprints). */
export const bookEntry = (id, { content = '', title = '' } = {}) => ({
  keys: [], content, extensions: {}, enabled: true, insertion_order: 100, case_sensitive: false,
  name: title, id, comment: title, selective: false, secondary_keys: [], constant: false, position: 'before_char',
});

// ── Writing ───────────────────────────────────────────────────────────────

const hasBook = (d) => !!(d.character_book && Array.isArray(d.character_book.entries));

/**
 * The V2 card. Aetheria's convertToV2Format, plus the V2 fields it leaves out
 * (creator_notes and character_book), and the group greetings its own starter
 * cards carry in V2 and its importer reads back.
 */
export function toV2Payload(d) {
  const { extensions, media, ...rest } = cc.convertToV2Format(d).data;
  const data = { ...rest, creator_notes: d.creator_notes || '' };
  if (hasBook(d)) data.character_book = d.character_book;
  if ((d.group_only_greetings || []).length) data.group_only_greetings = d.group_only_greetings;
  data.extensions = extensions;
  data.media = media;
  return { spec: 'chara_card_v2', spec_version: '2.0', data };
}

/** The V3 card, exactly as Aetheria's convertToV3Format writes it. */
export function toV3Payload(d) {
  return cc.convertToV3Format({ ...d, assets: (d.assets || []).length ? d.assets : undefined, character_book: hasBook(d) ? d.character_book : null });
}

/** PNG bytes with the card inside: V2 as `chara`, V3 as `ccv3`, any older copies dropped. */
export function embedInPng(pngBytes, d) {
  return writeTextChunks(pngBytes, {
    chara: utf8ToBase64(JSON.stringify(toV2Payload(d))),
    ccv3: utf8ToBase64(JSON.stringify(toV3Payload(d))),
  }, ['character']);
}

/** A CHARX archive through Aetheria's createCharxBlob: card.json, the portrait, and motion if any. */
export async function charxBlob(d, artBytes, video) {
  const icon = artBytes ? new Blob([artBytes], { type: 'image/png' }) : null;
  const motion = video?.bytes ? new Blob([video.bytes], { type: video.type || 'video/mp4' }) : null;
  // The portrait goes in as the main icon, so a "ccdefault:" stand-in would be a second one.
  const assets = (d.assets || []).filter((a) => !(icon && a.type === 'icon' && a.uri === 'ccdefault:'));
  return cc.createCharxBlob({ ...d, assets, character_book: hasBook(d) ? d.character_book : null }, icon, motion);
}

// ── Reading ───────────────────────────────────────────────────────────────

const FORMAT_LABEL = { v1: 'V1', v2: 'V2', v3: 'V3', unknown: 'unknown' };
export const formatLabel = (f) => FORMAT_LABEL[f] || String(f || '').toUpperCase();

/** Aetheria's own reading of parsed card JSON: V3 or V2 through its converters, V1 as it is. */
function fromJson(json) {
  const format = cc.detectCardFormat(json);
  if (format === 'unknown') return { card: null, format };
  let card;
  if (json.spec === 'chara_card_v3') card = cc.convertFromV3Format(json);
  else if (json.spec === 'chara_card_v2' || json.spec === 'chara_card_v2.0') card = cc.convertFromV2Format(json);
  else if (plainObject(json.data)) card = format === 'v3' ? cc.convertFromV3Format(json) : cc.convertFromV2Format(json);
  else card = json;
  return { card, format };
}

const looksLikeZip = (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5);
const ext = (name = '') => String(name).split('.').pop().toLowerCase();

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/**
 * Read a dropped or chosen file. Resolves with one of:
 *   { kind: 'card', card, format, container, art (PNG bytes|null), artBlob (other image|null), video, size }
 *   { kind: 'lorebook', book }
 *   { kind: 'image', blob } · { kind: 'video', file }
 * Throws with a plain sentence when the file is none of these.
 */
export async function readFile(file) {
  const name = file.name || '';
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (/^video\//.test(file.type) || ['mp4', 'webm', 'mov'].includes(ext(name))) return { kind: 'video', file };

  if (isPng(bytes)) {
    let text = null;
    try { text = readTextChunks(bytes); } catch { text = null; }
    const lower = text ? Object.fromEntries(Object.entries(text).map(([k, v]) => [k.toLowerCase(), v])) : {};
    let found = null;
    // V3 first, as SillyTavern reads it: it is the fuller copy.
    if (lower.ccv3) {
      try { found = fromJson(JSON.parse(base64ToUtf8(lower.ccv3))); if (!found.card) found = null; } catch { found = null; }
    }
    if (!found) {
      const card = await cc.extractCardFromImage(new File([bytes], name || 'card.png', { type: 'image/png' })).catch(() => null);
      if (card) {
        let format = 'v2';
        try { if (lower.chara) format = cc.detectCardFormat(JSON.parse(base64ToUtf8(lower.chara))); } catch { /* raw JSON chunks */ }
        found = { card, format };
      }
    }
    if (!found) return { kind: 'image', blob: new Blob([bytes], { type: 'image/png' }) };
    let size = null;
    try { size = pngSize(bytes); } catch { /* */ }
    return { kind: 'card', card: normalizeCard(found.card), format: found.format, container: 'png', art: bytes, artBlob: null, video: null, size };
  }

  if (looksLikeZip(bytes) || ext(name) === 'charx') {
    const { card, assets } = await cc.extractCardFromCharx(new Blob([bytes]));
    const d = normalizeCard(card);
    const portrait = cc.charxPortrait({ card, assets });
    let video = null;
    const kept = [];
    for (const a of d.assets) {
      const uri = typeof a.uri === 'string' ? a.uri : '';
      const blob = uri.startsWith('embeded://') ? assets.get(uri) : null;
      const isVideo = /^(mp4|webm|mov)$/i.test(a.ext || '') || /\.(mp4|webm|mov)$/i.test(uri);
      if (a.type === 'icon' && isVideo && blob && !video) {
        video = { bytes: new Uint8Array(await blob.arrayBuffer()), name: uri.split('/').pop() || 'portrait.mp4', type: blob.type || 'video/mp4' };
        continue;
      }
      // The portrait comes back in as the still; createCharxBlob writes it again on export.
      if (a.type === 'icon' && uri.startsWith('embeded://assets/icon/')) continue;
      // Anything else the archive carried travels on inside the card, as V3 allows.
      if (blob) { kept.push({ ...a, uri: await blobToDataUrl(blob) }); continue; }
      kept.push(a);
    }
    d.assets = kept;
    if (video && !d.media.portraitVideo) d.media.portraitVideo = video.name;
    const fmt = cc.detectCardFormat(card?.data ? card : { spec: 'chara_card_v3', data: card });
    const isPngBlob = portrait && (portrait.type === 'image/png');
    return {
      kind: 'card', card: d, format: fmt === 'unknown' ? 'v3' : fmt, container: 'charx',
      art: isPngBlob ? new Uint8Array(await portrait.arrayBuffer()) : null,
      artBlob: portrait && !isPngBlob ? portrait : null, video, size: null,
    };
  }

  if (/^image\//.test(file.type) || ['jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext(name))) {
    return { kind: 'image', blob: new Blob([bytes], { type: file.type || 'image/*' }) };
  }

  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch {
    throw new Error(`${name || 'That file'} is not a card Aetheria can read: choose a PNG, JSON or CHARX card.`);
  }
  const lore = detectLorebook(json);
  if (lore === 'standalone' || lore === 'character_book') return { kind: 'lorebook', book: toBook(json) };
  // Through Aetheria's importCardFromJson, as its Library imports a JSON card.
  const card = await cc.importCardFromJson(new File([bytes], name || 'card.json', { type: 'application/json' }));
  const { format } = fromJson(json);
  if (format === 'unknown' || !card || typeof card !== 'object') throw new Error('That JSON is not a character card (V1, V2 or V3).');
  return { kind: 'card', card: normalizeCard(card), format, container: 'json', art: null, artBlob: null, video: null, size: null };
}

/** Card bytes the site already holds (a gallery PNG), read the same way. */
export const readBytes = (bytes, name = 'card.png') => readFile(new File([bytes], name, { type: isPng(bytes) ? 'image/png' : 'application/json' }));

// ── Small helpers for the view ────────────────────────────────────────────

export function toBytes(x) {
  if (!x) return null;
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (typeof x === 'object') { const v = Object.values(x); return v.length ? Uint8Array.from(v) : null; }
  return null;
}

export function dataUrlToBytes(url) {
  const bin = atob(String(url).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const wordCount = (v) => String(v || '').split(/\s+/).filter(Boolean).length;

/** How many example exchanges mes_example holds (blocks opened by <START>). */
export function exchanges(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  const n = (t.match(/<START>/gi) || []).length;
  return n || 1;
}
