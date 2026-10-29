// Standalone World Info  ⇄  V2-embedded character_book, ported from the Grimoire (LorebookCodec.kt).
//
// Field rename map (standalone → embedded):
//   key → keys · keysecondary → secondary_keys · order → insertion_order · uid → id
//   disable → enabled (inverted) · position 0/1 → "before_char"/"after_char"
//   position 2..7 → stashed in extensions.aetherbot_position · everything else → extensions[name]

export const POSITIONS = [
  // SillyTavern's world_info_position numbering
  'Before character', 'After character', "Top of Author's Note", "Bottom of Author's Note",
  'At depth', 'Before examples', 'After examples', 'Outlet',
];
export const SELECTIVE_LOGIC = ['AND ANY', 'AND ALL', 'NOT ANY', 'NOT ALL'];

const EXT_FIELDS = {
  vectorized: false, selectiveLogic: 0, depth: 4, role: 0, probability: 100, useProbability: true,
  excludeRecursion: false, preventRecursion: false, group: '', groupOverride: false, groupWeight: 100,
  useGroupScoring: false, sticky: 0, cooldown: 0, delay: 0,
  matchPersonaDescription: false, matchCharacterDescription: false, matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false, matchScenario: false, matchCreatorNotes: false,
  automationId: '', addMemo: true,
};

const list = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && typeof v !== 'boolean' ? Math.trunc(Number(v)) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

/** 'standalone' | 'character_book' | 'card' | null */
export function detectLorebook(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.spec && obj.data) return obj.data.character_book ? 'card' : null;
  if (obj.entries && !Array.isArray(obj.entries) && typeof obj.entries === 'object') return 'standalone';
  if (Array.isArray(obj.entries)) return 'character_book';
  if (obj.character_book) return 'card';
  return null;
}

export function toCharacterBook(book) {
  const entries = Object.values(book.entries || {})
    .sort((a, b) => int(a.displayIndex, int(a.uid, 0)) - int(b.displayIndex, int(b.uid, 0)))
    .map(entryToV2);
  const out = { name: book.name ?? undefined, description: book.description ?? undefined, extensions: {}, entries };
  if (out.name === undefined) delete out.name;
  if (out.description === undefined) delete out.description;
  return out;
}

function entryToV2(e) {
  const pos = int(e.position, 0);
  const ext = {};
  if (pos > 1) ext.aetherbot_position = pos;
  for (const [k, d] of Object.entries(EXT_FIELDS)) ext[k] = e[k] ?? d;
  if (e.delayUntilRecursion !== undefined && e.delayUntilRecursion !== null) ext.delayUntilRecursion = e.delayUntilRecursion;
  if (e.matchWholeWords !== undefined && e.matchWholeWords !== null) ext.matchWholeWords = e.matchWholeWords;
  if (e.scanDepth !== undefined && e.scanDepth !== null) ext.entryScanDepth = e.scanDepth;
  ext.displayIndex = int(e.displayIndex, int(e.uid, 0));
  if (e.extensions && typeof e.extensions === 'object') {
    for (const [k, v] of Object.entries(e.extensions)) if (!(k in ext)) ext[k] = v;
  }
  const out = {
    keys: list(e.key),
    content: e.content || '',
    extensions: ext,
    enabled: !bool(e.disable, false),
    insertion_order: int(e.order, 100),
    case_sensitive: e.caseSensitive ?? null,
    name: e.comment && String(e.comment).trim() ? e.comment : undefined,
    id: int(e.uid, 0),
    comment: e.comment || '',
    selective: bool(e.selective, false),
    secondary_keys: list(e.keysecondary).length ? list(e.keysecondary) : undefined,
    constant: bool(e.constant, false),
    position: pos === 0 ? 'before_char' : 'after_char',
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  if (out.case_sensitive === null) delete out.case_sensitive;
  return out;
}

export function toStandalone(book, name) {
  const entries = {};
  (book.entries || []).forEach((e, idx) => { entries[String(idx)] = v2ToEntry(e, idx); });
  const out = { entries };
  const n = book.name ?? name;
  if (n) out.name = n;
  if (book.description) out.description = book.description;
  return out;
}

function v2ToEntry(e, fallbackUid) {
  const ex = e.extensions || {};
  const stashed = Number.isInteger(ex.aetherbot_position) ? ex.aetherbot_position : null;
  const position = stashed ?? (e.position === 'before_char' ? 0 : 1);
  const out = {
    uid: Number.isInteger(e.id) ? e.id : fallbackUid,
    key: list(e.keys),
    keysecondary: list(e.secondary_keys),
    comment: e.comment ?? e.name ?? '',
    content: e.content || '',
    constant: bool(e.constant, false),
    vectorized: bool(ex.vectorized, false),
    selective: bool(e.selective, false),
    selectiveLogic: int(ex.selectiveLogic, 0),
    disable: !bool(e.enabled, true),
    position,
    order: int(e.insertion_order, 100),
    depth: int(ex.depth, 4),
    role: int(ex.role, 0),
    probability: int(ex.probability, 100),
    useProbability: bool(ex.useProbability, true),
    excludeRecursion: bool(ex.excludeRecursion, false),
    preventRecursion: bool(ex.preventRecursion, false),
    delayUntilRecursion: ex.delayUntilRecursion ?? false,
    group: typeof ex.group === 'string' ? ex.group : '',
    groupOverride: bool(ex.groupOverride, false),
    groupWeight: int(ex.groupWeight, 100),
    useGroupScoring: bool(ex.useGroupScoring, false),
    caseSensitive: typeof e.case_sensitive === 'boolean' ? e.case_sensitive : null,
    matchWholeWords: typeof ex.matchWholeWords === 'boolean' ? ex.matchWholeWords : null,
    scanDepth: Number.isInteger(ex.entryScanDepth) ? ex.entryScanDepth : null,
    sticky: int(ex.sticky, 0),
    cooldown: int(ex.cooldown, 0),
    delay: int(ex.delay, 0),
    matchPersonaDescription: bool(ex.matchPersonaDescription, false),
    matchCharacterDescription: bool(ex.matchCharacterDescription, false),
    matchCharacterPersonality: bool(ex.matchCharacterPersonality, false),
    matchCharacterDepthPrompt: bool(ex.matchCharacterDepthPrompt, false),
    matchScenario: bool(ex.matchScenario, false),
    matchCreatorNotes: bool(ex.matchCreatorNotes, false),
    automationId: typeof ex.automationId === 'string' ? ex.automationId : '',
    addMemo: bool(ex.addMemo, true),
    displayIndex: int(ex.displayIndex, fallbackUid),
  };
  return out;
}

/** Uniform rows for display, from either shape. */
export function lorebookRows(obj, kind = detectLorebook(obj)) {
  if (kind === 'card') return lorebookRows(obj.data ? obj.data.character_book : obj.character_book, 'character_book');
  if (kind === 'standalone') {
    return Object.values(obj.entries || {}).sort((a, b) => int(a.displayIndex, 0) - int(b.displayIndex, 0)).map((e) => ({
      name: e.comment || '(untitled)', keys: list(e.key), secondary: list(e.keysecondary), content: e.content || '',
      position: POSITIONS[int(e.position, 0)] || `Unknown (${e.position})`, order: int(e.order, 100),
      enabled: !e.disable, constant: !!e.constant, selective: !!e.selective,
    }));
  }
  if (kind === 'character_book') {
    return (obj.entries || []).map((e) => {
      const stashed = e.extensions && Number.isInteger(e.extensions.aetherbot_position) ? e.extensions.aetherbot_position : null;
      return {
        name: e.comment || e.name || '(untitled)', keys: list(e.keys), secondary: list(e.secondary_keys), content: e.content || '',
        position: stashed !== null ? POSITIONS[stashed] : e.position === 'before_char' ? POSITIONS[0] : POSITIONS[1],
        order: int(e.insertion_order, 100), enabled: e.enabled !== false, constant: !!e.constant, selective: !!e.selective,
      };
    });
  }
  return [];
}
