// Lorebooks in and out, through Aetheria's own functions wherever it has them
// (src/utils/lorebookUtils.js: normalizeLorebook reads World Info, its own
// files and a card's book alike; stripLorebookMeta writes World Info).
//
// Aetheria has no writer for a card's character_book, so toCharacterBook()
// writes one the way SillyTavern does when it binds a book into a card
// (convertWorldInfoToCharacterBook): the V2 names at the top level and the
// rest in snake_case under extensions, which is exactly what Aetheria's
// importer reads back. What neither names (Aetheria's cascade and filters)
// rides in extensions.aetheria, where Aetheria keeps its own.
import { lore } from './model.js';
import { readCardBytes } from '../../lib/card.js';
import { isPng } from '../../lib/png.js';
import { detectLorebook } from '../../lib/lorebook.js';
import { newId } from '../sheet.js';

const META = lore.LOREBOOK_META_KEY;
const AE = lore.AETHERIA_LOREBOOK_EXTENSION_KEY;
const plain = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Every field Aetheria keeps on an entry (its defaults, as normalizeLorebookEntry fills them). */
export const ENTRY_FIELDS = Object.keys(lore.normalizeLorebookEntry({}, 0)).filter((k) => k !== 'extensions');

// The names a V2 character_book entry uses, which normalizeLorebook has read into Aetheria's own.
const V2_NAMES = ['keys', 'secondary_keys', 'insertion_order', 'enabled', 'id', 'case_sensitive', 'name'];

// The Grimoire's character_book (lib/lorebook.js) writes these in camelCase where SillyTavern, and so Aetheria's reader, use snake_case.
const CAMEL = {
  excludeRecursion: 'exclude_recursion', preventRecursion: 'prevent_recursion', delayUntilRecursion: 'delay_until_recursion',
  groupOverride: 'group_override', groupWeight: 'group_weight', useGroupScoring: 'use_group_scoring',
  matchWholeWords: 'match_whole_words', automationId: 'automation_id', ignoreBudget: 'ignore_budget',
  matchPersonaDescription: 'match_persona_description', matchCharacterDescription: 'match_character_description',
  matchCharacterPersonality: 'match_character_personality', matchCharacterDepthPrompt: 'match_character_depth_prompt',
  matchScenario: 'match_scenario', matchCreatorNotes: 'match_creator_notes',
};

// What Aetheria keeps that a card's book has no field for, carried in extensions.aetheria.
const AE_EXTRAS = { addMemo: false, characterFilterNames: [], characterFilterTags: [], characterFilterExclude: false };

/** SillyTavern's "delay until recursion" may be true (the first step); Aetheria keeps a number. */
function prepEntry(e) {
  if (!e || typeof e !== 'object') return e;
  const out = { ...e };
  if (out.delayUntilRecursion === true) out.delayUntilRecursion = 1;
  return out;
}

/** One entry of a card's book, put the way normalizeLorebook reads it fully. */
function fromV2Entry(e, index, renumber) {
  if (!e || typeof e !== 'object') return e;
  const ex = plain(e.extensions);
  const ae = plain(ex[AE]);
  const out = prepEntry(e);
  // The full position lives in extensions (the top-level one only says before or after the character).
  const pos = [ex.position, ex.aetherbot_position].find((v) => Number.isInteger(v));
  if (pos !== undefined) out.position = pos;
  // The V2 spec keeps case sensitivity and the entry's name at the top level.
  if (out.caseSensitive === undefined && ex.case_sensitive === undefined && typeof e.case_sensitive === 'boolean') out.caseSensitive = e.case_sensitive;
  if (!(typeof out.comment === 'string' && out.comment.trim()) && typeof e.name === 'string') out.comment = e.name;
  // A NovelAI book, as Aetheria finds one in an image, calls them text and displayName.
  if (out.content === undefined && out.entry === undefined && typeof e.text === 'string') out.content = e.text;
  if (!(typeof out.comment === 'string' && out.comment.trim()) && typeof e.displayName === 'string') out.comment = e.displayName;
  for (const [camel, snake] of Object.entries(CAMEL)) {
    if (out[camel] === undefined && ex[snake] === undefined && ex[camel] !== undefined) out[camel] = ex[camel];
  }
  if (ex.delay_until_recursion === true && out.delayUntilRecursion === undefined) out.delayUntilRecursion = 1;
  if (out.delayUntilRecursion === true) out.delayUntilRecursion = 1;
  if (out.scanDepth === undefined && ex.scan_depth === undefined && Number.isFinite(ex.entryScanDepth)) out.scanDepth = ex.entryScanDepth;
  if (out.displayIndex === undefined) {
    const d = [ex.display_index, ex.displayIndex].find((v) => Number.isFinite(v));
    if (d !== undefined) out.displayIndex = d;
  }
  if (out.addMemo === undefined && typeof ex.addMemo === 'boolean') out.addMemo = ex.addMemo;
  for (const k of Object.keys(AE_EXTRAS)) if (out[k] === undefined && ae[k] !== undefined) out[k] = ae[k];
  if (renumber) { delete out.id; out.uid = index; }
  return out;
}

const nameOf = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/**
 * Any lorebook-shaped JSON into an Aetheria volume: World Info, an Aetheria
 * lorebook, a character_book, a card (V1, V2, V3) with one bound in, or a
 * plain list of entries. Each import is a new volume, as Aetheria's own is.
 * Returns { book, kind, cardName }.
 */
export function fromJson(input, { name = '' } = {}) {
  let obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (Array.isArray(obj)) obj = { entries: obj };
  if (!obj || typeof obj !== 'object') throw new Error('No lorebook found in that file.');
  let kind = detectLorebook(obj);
  let src = obj;
  let cardName = '';
  if (!kind && obj.data && typeof obj.data === 'object' && obj.data.character_book) kind = 'card';
  if (kind === 'card') {
    const d = obj.data && typeof obj.data === 'object' && obj.data.character_book ? obj.data : obj;
    src = d.character_book;
    cardName = nameOf(d.name);
    kind = Array.isArray(src?.entries) ? 'character_book' : src?.entries && typeof src.entries === 'object' ? 'standalone' : null;
  } else if (!kind && obj.spec && obj.data) {
    throw new Error(`${nameOf(obj.data.name) || 'That card'} has no lorebook bound in.`);
  }
  if (!kind) throw new Error('No lorebook found. Expected World Info, an Aetheria lorebook, a character_book, or a card with one bound in.');

  const pre = clone(src);
  if (kind === 'character_book') {
    const ids = pre.entries.map((e) => (e && (e.uid ?? e.id)));
    const renumber = ids.some((id) => !Number.isInteger(Number(id)) || id === undefined || id === null || id === '') || new Set(ids.map(Number)).size !== ids.length;
    pre.entries = pre.entries.map((e, i) => fromV2Entry(e, i, renumber));
    const ae = plain(plain(pre.extensions)[AE]);
    if (pre.disabled === undefined && ae.disabled === true) pre.disabled = true;
  } else if (pre.entries && typeof pre.entries === 'object') {
    pre.entries = Object.fromEntries(Object.entries(pre.entries).map(([k, e]) => [k, prepEntry(e)]));
  }

  const book = lore.normalizeLorebook(pre);
  if (kind === 'character_book') {
    for (const e of Object.values(book.entries)) for (const k of V2_NAMES) delete e[k];
    if (book.extensions?.[AE]) delete book.extensions[AE].disabled;
  }
  const title = nameOf(src.name) || cardName || nameOf(name) || 'Untitled volume';
  book[META] = { id: newId(), name: title, version: 1 };
  book.name = title;
  return { book, kind, cardName };
}

/** A file (JSON, or a PNG card or lorebook image) into a volume. */
export async function readLorebookFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stem = String(file.name || '').replace(/\.(json|lorebook|png|txt)$/i, '');
  if (isPng(bytes)) {
    let card = null;
    try { card = readCardBytes(bytes, file.name); } catch { /* not a card: perhaps a lorebook image */ }
    if (card) {
      if (!card.data.character_book) throw new Error(`${card.data.name || 'That card'} has no lorebook bound in.`);
      return fromJson({ spec: 'chara_card_v2', data: card.data }, { name: stem });
    }
    let data;
    try { data = await lore.extractLorebookFromPngFile(file); } catch { throw new Error('That image holds neither a card nor a lorebook.'); }
    return fromJson(data, { name: stem });
  }
  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`${file.name || 'That file'} is not valid JSON.`); }
  return fromJson(json, { name: stem });
}

/** World Info, as Aetheria exports a volume (stripLorebookMeta): SillyTavern reads it as is. */
export const toWorldInfo = (book) => lore.stripLorebookMeta(lore.normalizeLorebook(book));

/** The volume as a card's character_book (SillyTavern's form, which Aetheria reads back whole). */
export function toCharacterBook(book) {
  const wi = toWorldInfo(book);
  const entries = Object.values(wi.entries || {}).map((e) => {
    const ext = clone(plain(e.extensions));
    const ae = { ...plain(ext[AE]) };
    for (const [k, d] of Object.entries(AE_EXTRAS)) {
      const v = e[k];
      if (v === undefined || JSON.stringify(v) === JSON.stringify(d)) delete ae[k]; else ae[k] = v;
    }
    const pos = Number(e.position) || 0;
    const extensions = {
      ...ext,
      [AE]: ae,
      position: pos,
      exclude_recursion: e.excludeRecursion,
      display_index: e.displayIndex,
      probability: e.probability ?? null,
      useProbability: e.useProbability ?? false,
      depth: e.depth ?? 4,
      selectiveLogic: e.selectiveLogic ?? 0,
      group: e.group ?? '',
      group_override: e.groupOverride ?? false,
      group_weight: e.groupWeight ?? null,
      prevent_recursion: e.preventRecursion ?? false,
      delay_until_recursion: e.delayUntilRecursion ?? false,
      scan_depth: e.scanDepth ?? null,
      match_whole_words: e.matchWholeWords ?? null,
      // SillyTavern writes false here; null (follow the app's own setting) is kept as null so it reads back the same.
      use_group_scoring: e.useGroupScoring ?? null,
      case_sensitive: e.caseSensitive ?? null,
      automation_id: e.automationId ?? '',
      role: e.role ?? 0,
      vectorized: e.vectorized ?? false,
      sticky: e.sticky ?? null,
      cooldown: e.cooldown ?? null,
      delay: e.delay ?? null,
      match_persona_description: e.matchPersonaDescription ?? false,
      match_character_description: e.matchCharacterDescription ?? false,
      match_character_personality: e.matchCharacterPersonality ?? false,
      match_character_depth_prompt: e.matchCharacterDepthPrompt ?? false,
      match_scenario: e.matchScenario ?? false,
      match_creator_notes: e.matchCreatorNotes ?? false,
      triggers: e.triggers ?? [],
      ignore_budget: e.ignoreBudget ?? false,
    };
    // The Grimoire reads a position past "after the character" from here.
    if (pos > 1) extensions.aetherbot_position = pos; else delete extensions.aetherbot_position;
    return {
      id: e.uid,
      keys: [...(e.key || [])],
      secondary_keys: [...(e.keysecondary || [])],
      comment: e.comment,
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      insertion_order: e.order,
      enabled: !e.disable,
      position: pos === 0 ? 'before_char' : 'after_char',
      use_regex: true,
      extensions,
    };
  });
  const top = { name: wi.name };
  if (nameOf(wi.description)) top.description = wi.description;
  if (Number.isFinite(wi.scan_depth)) top.scan_depth = wi.scan_depth;
  if (Number.isFinite(wi.token_budget)) top.token_budget = wi.token_budget;
  if (typeof wi.recursive_scanning === 'boolean') top.recursive_scanning = wi.recursive_scanning;
  const extensions = clone(plain(wi.extensions));
  extensions[AE] = { ...plain(extensions[AE]) };
  if (wi.disabled) extensions[AE].disabled = true; else delete extensions[AE].disabled;
  return { ...top, extensions, entries };
}

/** How many entries fire on a key from either list (written as one list on export). */
export const eitherCount = (book) => Object.values(book?.entries || {}).filter((e) => e.selective && e.selectiveLogic === lore.LOREBOOK_LOGIC.EITHER).length;

/** An entry's Aetheria fields alone, for comparing two readings of a volume. */
export function canonicalEntry(e) {
  const n = lore.normalizeLorebookEntry(e);
  const out = {};
  // Aetheria leaves an unset case or whole-words choice undefined, a card's book writes null: both mean "the default".
  for (const k of ENTRY_FIELDS) out[k] = n[k] === undefined ? null : n[k];
  return out;
}
