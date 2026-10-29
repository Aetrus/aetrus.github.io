// The activation test: a few lines of a story, read by Aetheria's own engine
// (lorebookEngine.evaluateLorebooks), and an account of what fired and why.
// No model is asked anything; this is the same matching a story runs.
import { lore, loreEngine, LOREBOOK_LOGIC, asList, scanWindow, entryTitle, POSITIONS } from './model.js';
import { estTokens } from '../../lib/card.js';
import { rng } from '../../ui.js';

const META = lore.LOREBOOK_META_KEY;
export const EMPTY_RUNTIME = Object.freeze({ sticky: {}, cooldown: {} });

/**
 * The story as passages, one per line, the latest last. "Name: words" keeps
 * the name apart, as a story keeps who spoke apart from what was said.
 */
export function passagesOf(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([^:]{1,40}):\s+(.+)$/);
    if (m && !/[!?"“”]/.test(m[1]) && m[1].trim().split(/\s+/).length <= 4) return { name: m[1].trim(), content: m[2].trim() };
    return { name: '', content: line };
  });
}

const contextOf = (passages, extra = {}) => ({
  messages: passages.map((p) => ({ role: 'user', content: p.content })),
  characterDescription: extra.character || '',
  personaDescription: extra.persona || '',
  characterScenario: extra.scenario || '',
});

/**
 * Which of each entry's keys the story holds, asked of the engine itself: one
 * probe entry per key, matched as the entry matches (its case, whole words,
 * scan depth and the texts it searches), in a single evaluation.
 */
function probeKeys(book, context, only) {
  const entries = {};
  const probes = new Map();
  let n = 1;
  for (const e of Object.values(book.entries || {})) {
    if (only && !only.has(lore.getEntryKey(e))) continue;
    const add = (k, list) => {
      if (!String(k || '').trim()) return;
      entries[n] = {
        uid: n, key: [k], keysecondary: [], content: '', comment: '',
        constant: false, selective: false, disable: false, useProbability: false, probability: 100,
        sticky: null, cooldown: null, parentEntryId: '',
        position: e.position, depth: e.depth, scanDepth: e.scanDepth,
        caseSensitive: e.caseSensitive, matchWholeWords: e.matchWholeWords,
        matchPersonaDescription: e.matchPersonaDescription, matchCharacterDescription: e.matchCharacterDescription,
        matchCharacterPersonality: e.matchCharacterPersonality, matchCharacterDepthPrompt: e.matchCharacterDepthPrompt,
        matchScenario: e.matchScenario, matchCreatorNotes: e.matchCreatorNotes,
      };
      probes.set(n, { uid: lore.getEntryKey(e), key: k, list });
      n += 1;
    };
    asList(e.key).forEach((k) => add(k, 'key'));
    asList(e.keysecondary).forEach((k) => add(k, 'secondary'));
  }
  const found = new Map();
  if (n === 1) return found;
  const probeBook = { [META]: { id: 'probe', name: 'probe', version: 1 }, entries, extensions: { aetheria: { cascadeEnabled: false } } };
  const r = loreEngine.evaluateLorebooks({ lorebooks: [probeBook], context, random: () => 0 });
  // In the entry's own order of keys, not the order the engine sent them.
  const hits = r.activatedEntries.map((a) => Number(a.entry.uid)).filter((u) => probes.has(u)).sort((a, b) => a - b);
  for (const u of hits) {
    const p = probes.get(u);
    if (!found.has(p.uid)) found.set(p.uid, { key: [], secondary: [] });
    found.get(p.uid)[p.list].push(p.key);
  }
  return found;
}

const KEYWORD = new Set(['primary-match', 'either-match', 'secondary-and-any', 'secondary-any-match', 'secondary-and-all', 'secondary-not-any', 'secondary-not-all']);

const WHY = {
  constant: 'Always on',
  'primary-match': 'On a key',
  'either-match': 'On a key from either list',
  'secondary-and-any': 'On a key and a secondary key',
  'secondary-any-match': 'On a key and a secondary key',
  'secondary-and-all': 'On a key and every secondary key',
  'secondary-not-any': 'On a key, with no secondary key',
  'secondary-not-all': 'On a key, without every secondary key',
  sticky: 'Held on from an earlier reply',
};

const passagesWord = (n) => `the last ${n === 1 ? 'passage' : `${n} passages`}`;

/**
 * Run the test. `runtime` is what the story carried in (sticky and cooldown
 * turns); `seed` fixes the dice so typing does not reroll them; with `chance`
 * off every entry passes its probability.
 */
export function runTest(book, { text = '', extra = {}, runtime = EMPTY_RUNTIME, seed = 1, chance = true } = {}) {
  const passages = passagesOf(text);
  const norm = lore.normalizeLorebook(book);
  const setAside = Boolean(norm.disabled);
  norm.disabled = false;
  const meta = norm[META];
  const gid = (e) => loreEngine.makeEntryGlobalId(meta, e);
  const keyOf = (e) => lore.getEntryKey(e);
  const cascade = lore.getLorebookCascadeSettings(norm);

  // What would fire if every entry's chance came up is the same volume with probability set aside;
  // with chance off, that is what the test shows.
  const chancy = Object.values(norm.entries).some((e) => !e.disable && e.useProbability && Number(e.probability) < 100);
  const sureBook = chancy ? { ...norm, entries: Object.fromEntries(Object.entries(norm.entries).map(([k, e]) => [k, { ...e, useProbability: false }])) } : norm;
  const evaluate = (b, random) => loreEngine.evaluateLorebooks({ lorebooks: [b], context: contextOf(passages, extra), runtime, random });
  const result = chancy && chance ? evaluate(norm, rng(seed)) : evaluate(sureBook, () => 0);
  const sure = chancy && chance ? evaluate(sureBook, () => 0) : result;
  const start = loreEngine.advanceLorebookRuntime(runtime);

  // Which keys to name: those of entries that fired on a key, and of entries whose
  // secondary keys may have held them back (the rest did not fire for want of a key).
  const firedOn = new Set(result.activatedEntries.filter((a) => KEYWORD.has(a.reason)).map((a) => keyOf(a.entry)));
  const sureIds0 = new Set(sure.activatedEntries.map((a) => keyOf(a.entry)));
  const firedIds0 = new Set(result.activatedEntries.map((a) => keyOf(a.entry)));
  const toProbe = new Set(firedOn);
  for (const e of Object.values(norm.entries)) {
    const uid = keyOf(e);
    if (firedIds0.has(uid) || sureIds0.has(uid) || e.disable) continue;
    if (e.selective && e.selectiveLogic !== LOREBOOK_LOGIC.EITHER && asList(e.keysecondary).length) toProbe.add(uid);
  }
  const found = probeKeys(norm, contextOf(passages, extra), toProbe);
  const hitsOf = (uid) => found.get(uid) || { key: [], secondary: [] };

  const budget = Number.isFinite(norm.token_budget) && norm.token_budget > 0 ? norm.token_budget : 0;
  let running = 0;
  const fired = result.activatedEntries.map((a, i) => {
    const e = a.entry;
    const uid = keyOf(e);
    const hits = hitsOf(uid);
    const content = String(a.content || '').trim();
    const tokens = content ? estTokens(content) : 0;
    running += tokens;
    let keys = [];
    let secondary = [];
    if (a.reason === 'primary-match') keys = hits.key;
    else if (a.reason === 'either-match') keys = [...hits.key, ...hits.secondary];
    else if (String(a.reason).startsWith('secondary-')) { keys = hits.key; secondary = a.reason === 'secondary-not-any' || a.reason === 'secondary-not-all' ? [] : hits.secondary; }
    const why = a.reason === 'cascade'
      ? `Opened by ${a.triggeredByEntryTitle || 'its parent'}${a.cascadeDepth > 1 ? `, ${a.cascadeDepth} levels down` : ''}`
      : (WHY[a.reason] || 'On a key');
    const stickyLeft = Math.max(0, (result.runtime.sticky[gid(e)] || 0) - 1);
    const restsFor = Math.max(0, (result.runtime.cooldown[gid(e)] || 0) - 1);
    return {
      uid, rank: i + 1, title: entryTitle(e), reason: a.reason, why, keys, secondary,
      position: Number(e.position), depth: e.depth, order: e.order, tokens, empty: !content,
      byUid: a.triggeredByEntryId ? String(a.triggeredByEntryId) : '', level: a.reason === 'cascade' ? a.cascadeDepth : 0,
      stickyLeft, restsFor, overBudget: budget > 0 && running > budget, standing: Boolean(a.standing),
      window: scanWindow(e),
    };
  });

  const firedIds = new Set(fired.map((f) => f.uid));
  const sureIds = new Set(sure.activatedEntries.map((a) => keyOf(a.entry)));
  const byId = new Map(Object.values(norm.entries).map((e) => [keyOf(e), e]));
  const missed = Object.values(norm.entries).filter((e) => !firedIds.has(keyOf(e))).map((e) => {
    const uid = keyOf(e);
    const hits = hitsOf(uid);
    const keys = asList(e.key);
    const sec = asList(e.keysecondary);
    const win = passagesWord(scanWindow(e));
    let why;
    if (e.disable) why = 'Turned off.';
    else if ((start.cooldown[gid(e)] || 0) > 0) why = 'Resting after it fired.';
    else if (sureIds.has(uid)) why = `Missed its chance, at ${Number(e.probability)}%.`;
    else if (e.selective && e.selectiveLogic === LOREBOOK_LOGIC.EITHER) why = keys.length + sec.length ? `No key from either list in ${win}.` : 'Has no keys.';
    else if (!keys.length) why = 'Has no keys.';
    else if (!found.has(uid) || !hits.key.length) why = `None of its keys in ${win}.`;
    else {
      why = {
        [LOREBOOK_LOGIC.AND_ANY]: 'A key, but none of its secondary keys.',
        [LOREBOOK_LOGIC.AND_ALL]: 'A key, but not every secondary key.',
        [LOREBOOK_LOGIC.NOT_ANY]: 'A key, but a secondary key came up too.',
        [LOREBOOK_LOGIC.NOT_ALL]: 'A key, but every secondary key came up too.',
      }[e.selectiveLogic] || 'Its secondary keys held it back.';
    }
    // Filed under an entry that did fire: say why the cascade did not open it.
    const parent = String(e.parentEntryId || '').trim();
    if (!e.disable && parent && firedIds.has(parent) && byId.has(parent)) {
      if (!cascade.cascadeEnabled || cascade.cascadeMaxDepth <= 0) why += ' The volume does not cascade.';
      else if (e.cascadeFromParent === false) why += ' It waits for its own keys.';
      else why += ' It is filed too deep for the cascade.';
    }
    return { uid, title: entryTitle(e), why, keys: hits.key, secondary: hits.secondary, disabled: Boolean(e.disable) };
  });

  const byPosition = POSITIONS.map((p) => ({ ...p, items: fired.filter((f) => f.position === p.value) })).filter((g) => g.items.length);
  return {
    passages: passages.length, fired, missed, byPosition, setAside, cascade,
    tokens: running, budget, total: Object.keys(norm.entries).length,
    before: result.before, after: result.after, runtime: result.runtime,
    probabilistic: chancy,
  };
}

/** A sample story for the volume: its own, for the one Aetheria ships, or lines made from its keys. */
export function sampleFor(book) {
  const name = String(book?.name || '').toLowerCase();
  if (name.includes('lantern quay')) {
    return [
      'Dilys: Councillor ate the tide table again, so we go by my reckoning.',
      'Ansel: Your reckoning has me on the strand at five in the morning.',
      'Dilys: If you want your prisms, Truscott, you walk the strand before the gulls do.',
      'Ansel: Every one is etched with my mark. The Works wants them back, and so does the Board.',
      'Dilys: The Tideright says what the tide leaves is mine. Ask Pascoe Dunn, he will read it to you by the hour.',
    ].join('\n');
  }
  const keyed = Object.values(book?.entries || {}).filter((e) => !e.disable && !e.constant && asList(e.key).length);
  const k = keyed.slice(0, 3).map((e) => asList(e.key)[0]);
  if (!k.length) return 'You: Tell me where we are.\nThey: Somewhere the map has not caught up with yet.';
  const lines = [`You: What do you know about ${k[0]}?`, `They: Less than I would like. Few people ask about ${k[0]} these days.`];
  if (k[1]) lines.push(`You: Then tell me about ${k[1]} instead.`);
  if (k[2]) lines.push(`They: That leads to ${k[2]}, sooner or later.`);
  return lines.join('\n');
}
