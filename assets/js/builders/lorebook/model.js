// The Lorebook builder's vocabulary, lifted from Aetheria's sheet
// (src/sheets/LorebookSheet.js): how an entry fires, where it goes, and the
// entry list as a tree of what is filed under what (the cascade the engine
// follows, src/utils/lorebookEngine.js).
import * as core from '../../vendor/aetheria/lorebook.js';

export const { lore, loreEngine } = core;
export const { LOREBOOK_LOGIC, LOREBOOK_POSITION, LOREBOOK_META_KEY } = core.lore;

export const asList = (v) => (Array.isArray(v) ? v.map(String).filter((s) => s.trim()) : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));

/*
 * When an entry fires, as one choice: always, on a key, or on a key with what
 * its secondary keys say. "Either list" is Aetheria's own (LOREBOOK_LOGIC.EITHER);
 * the rest are the logic other apps use, so a book reads the same there.
 */
export const FIRES = [
  { id: 'always', label: 'Always', hint: 'Sent with every request, keys or none.' },
  { id: 'key', label: 'On a key', hint: 'Any of its keys. The secondary keys are not used.' },
  { id: 'either', label: 'On a key from either list', hint: 'Any key, from the keys or the secondary keys.' },
  { id: 'and_any', label: 'On a key and any secondary key', hint: 'A key, and at least one secondary key as well.', logic: LOREBOOK_LOGIC.AND_ANY },
  { id: 'and_all', label: 'On a key and every secondary key', hint: 'A key, and all of the secondary keys as well.', logic: LOREBOOK_LOGIC.AND_ALL },
  { id: 'not_any', label: 'On a key, with no secondary key', hint: 'A key, while none of the secondary keys comes up.', logic: LOREBOOK_LOGIC.NOT_ANY },
  { id: 'not_all', label: 'On a key, unless every secondary key is there', hint: 'A key, unless all of the secondary keys come up too.', logic: LOREBOOK_LOGIC.NOT_ALL },
];

export const firesOf = (entry) => {
  if (entry.constant) return 'always';
  if (!entry.selective) return 'key';
  if (entry.selectiveLogic === LOREBOOK_LOGIC.EITHER) return 'either';
  return FIRES.find((f) => f.logic === entry.selectiveLogic)?.id || 'and_any';
};

export const firesPatch = (id) => {
  if (id === 'always') return { constant: true };
  if (id === 'key') return { constant: false, selective: false };
  if (id === 'either') return { constant: false, selective: true, selectiveLogic: LOREBOOK_LOGIC.EITHER };
  return { constant: false, selective: true, selectiveLogic: FIRES.find((f) => f.id === id).logic };
};

/** The entry's line in the list: its keys, and how it fires when that is not on a key. */
export const firesLine = (entry) => {
  const fires = firesOf(entry);
  if (fires === 'always') return ' · always on';
  if (fires === 'either') return ' · either list';
  if (fires !== 'key' && asList(entry.keysecondary).length) return ' · with secondary keys';
  return '';
};

/** What the secondary keys do, for the field's hint (Aetheria's own wording). */
export const secondaryHint = (entry) => ({
  always: 'Not used: the entry is always sent.',
  key: 'Not used while it fires on a key alone. Choose how they count under “When it fires”.',
  either: 'Each counts as a key of its own.',
}[firesOf(entry)] || 'Used with a key, as “When it fires” says.');

/* Where an activated entry goes in the request (LOREBOOK_POSITION), in the order a request reads. */
export const POSITIONS = [
  { value: LOREBOOK_POSITION.BEFORE, label: 'Before the character', short: 'Before the character', hint: 'Sent just before the character’s description.' },
  { value: LOREBOOK_POSITION.AFTER, label: 'After the character', short: 'After the character', hint: 'Sent just after the character’s description.' },
  { value: LOREBOOK_POSITION.EM_TOP, label: 'Before the example dialogue', short: 'Before the examples', hint: 'Sent just before the example dialogue.' },
  { value: LOREBOOK_POSITION.EM_BOTTOM, label: 'After the example dialogue', short: 'After the examples', hint: 'Sent just after the example dialogue.' },
  { value: LOREBOOK_POSITION.AN_TOP, label: 'Top of the author’s note', short: 'Top of the author’s note', hint: 'Sent at the top of the author’s note.' },
  { value: LOREBOOK_POSITION.AN_BOTTOM, label: 'Bottom of the author’s note', short: 'Bottom of the author’s note', hint: 'Sent at the bottom of the author’s note.' },
  { value: LOREBOOK_POSITION.AT_DEPTH, label: 'In the story, at a depth', short: 'In the story', hint: 'Placed among the passages, as far back as its depth says.' },
];
export const positionOf = (v) => POSITIONS.find((p) => p.value === Number(v)) || POSITIONS[0];

export const ROLES = [{ value: 0, label: 'System' }, { value: 1, label: 'User' }, { value: 2, label: 'Assistant' }];

/** SillyTavern's generation types, for an entry's triggers. */
export const TRIGGERS = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'];

/** How many of the latest passages the engine searches for this entry (lorebookEngine normalizeScanDepth). */
export function scanWindow(entry) {
  if (Number.isFinite(entry.scanDepth) && entry.scanDepth > 0) return entry.scanDepth;
  if (Number(entry.position) !== LOREBOOK_POSITION.AT_DEPTH && Number.isFinite(entry.depth) && entry.depth > 0) return entry.depth;
  return lore.DEFAULT_LOREBOOK_DEPTH;
}

export const entryTitle = (e) => (e?.comment && String(e.comment).trim()) || asList(e?.key)[0] || 'Untitled entry';

/** The volume's entries in the order it keeps them (Aetheria lists Object.entries of the map). */
export const entryList = (book) => Object.values(book?.entries || {});

/**
 * The entries as a tree of what is filed under what (parentEntryId), each
 * level in the volume's own order. An entry whose parent is missing, or that
 * would loop, stands at the top.
 */
export function entryTree(list) {
  const ids = new Map(list.map((e) => [lore.getEntryKey(e), e]));
  const kids = new Map();
  const roots = [];
  for (const e of list) {
    const id = lore.getEntryKey(e);
    const p = String(e.parentEntryId || '').trim();
    if (p && p !== id && ids.has(p)) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(e);
    } else roots.push(e);
  }
  const out = [];
  const seen = new Set();
  const walk = (e, level) => {
    const id = lore.getEntryKey(e);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ entry: e, level, children: (kids.get(id) || []).length });
    for (const c of kids.get(id) || []) walk(c, level + 1);
  };
  roots.forEach((e) => walk(e, 0));
  // Entries filed under each other in a ring have no root: they stand at the top.
  for (const e of list) if (!seen.has(lore.getEntryKey(e))) walk(e, 0);
  return out;
}

/** Every entry filed under this one, however deep (so it cannot be filed under one of them). */
export function descendantsOf(list, uid) {
  const out = new Set([String(uid)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of list) {
      const id = lore.getEntryKey(e);
      if (!out.has(id) && out.has(String(e.parentEntryId || '').trim())) { out.add(id); grew = true; }
    }
  }
  return out;
}

/** A fresh uid, as Aetheria's sheet makes one: a timestamp, moved on until it is free. */
export function freeUid(book) {
  const used = new Set(entryList(book).map((e) => Number(e.uid)));
  let uid = Date.now();
  while (used.has(uid)) uid += 1;
  return uid;
}

/** Aetheria's new entry (LorebookSheet newEntry), through its own createLorebookEntry. */
export const newEntry = (uid, extra = {}) => lore.createLorebookEntry({
  uid,
  comment: 'New entry',
  content: '',
  key: [],
  keysecondary: [],
  constant: false,
  selective: false,
  selectiveLogic: 0,
  order: 100,
  position: 0,
  depth: 4,
  probability: 100,
  useProbability: false,
  caseSensitive: false,
  matchWholeWords: false,
  disable: false,
  ...extra,
});

export const isRegexKey = (k) => /^\/.+\/[a-z]*$/i.test(String(k).trim());
