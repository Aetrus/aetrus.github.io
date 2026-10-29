// Character card model: read V1 / V2 / V3, write V2 + V3, measure, and check craft.
import { isPng, readTextChunks, writeTextChunks, utf8ToBase64, base64ToUtf8, pngSize } from './png.js';
import { MACRO_TOKENS } from './macros.js';

export const TEXT_FIELDS = [
  'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'creator_notes', 'system_prompt', 'post_history_instructions',
];

export function emptyCard() {
  return {
    name: '', description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
    creator_notes: '', system_prompt: '', post_history_instructions: '',
    alternate_greetings: [], group_only_greetings: [], tags: [], creator: '', character_version: '1.0',
    character_book: null, extensions: {},
  };
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** Normalise any card JSON into { spec, data } where data has every V2 field (+ V3 extras). */
export function normaliseCard(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('That JSON is not a character card.');
  let spec = 'v1';
  let src = obj;
  if (obj.spec === 'chara_card_v3' && obj.data) { spec = 'v3'; src = obj.data; }
  else if (obj.spec === 'chara_card_v2' && obj.data) { spec = 'v2'; src = obj.data; }
  else if (obj.data && typeof obj.data === 'object' && (obj.data.name || obj.data.first_mes)) { spec = 'v2'; src = obj.data; }
  else if (!(obj.name || obj.char_name || obj.first_mes || obj.char_greeting)) {
    throw new Error('No card fields found. Expected a SillyTavern card (V1, V2 or V3).');
  }
  const d = emptyCard();
  d.name = str(src.name || src.char_name);
  d.description = str(src.description ?? src.char_persona);
  d.personality = str(src.personality);
  d.scenario = str(src.scenario ?? src.world_scenario);
  d.first_mes = str(src.first_mes ?? src.char_greeting);
  d.mes_example = str(src.mes_example ?? src.example_dialogue);
  d.creator_notes = str(src.creator_notes ?? src.creatorcomment);
  d.system_prompt = str(src.system_prompt);
  d.post_history_instructions = str(src.post_history_instructions);
  d.alternate_greetings = arr(src.alternate_greetings);
  d.group_only_greetings = arr(src.group_only_greetings);
  d.tags = arr(src.tags);
  d.creator = str(src.creator);
  d.character_version = str(src.character_version) || '';
  d.character_book = src.character_book && typeof src.character_book === 'object' ? src.character_book : null;
  d.extensions = src.extensions && typeof src.extensions === 'object' ? src.extensions : {};
  for (const k of ['nickname', 'source', 'creation_date', 'modification_date', 'assets', 'creator_notes_multilingual']) {
    if (src[k] !== undefined) d[k] = src[k];
  }
  return { spec, data: d };
}

export function toV2(d) {
  const data = {
    name: d.name, description: d.description, personality: d.personality, scenario: d.scenario,
    first_mes: d.first_mes, mes_example: d.mes_example, creator_notes: d.creator_notes,
    system_prompt: d.system_prompt, post_history_instructions: d.post_history_instructions,
    alternate_greetings: d.alternate_greetings || [], tags: d.tags || [],
    creator: d.creator, character_version: d.character_version, extensions: d.extensions || {},
  };
  if (d.character_book && (d.character_book.entries || []).length) data.character_book = d.character_book;
  return { spec: 'chara_card_v2', spec_version: '2.0', data };
}

export function toV3(d) {
  const v2 = toV2(d).data;
  const now = Math.floor(Date.now() / 1000);
  const data = {
    ...v2,
    group_only_greetings: d.group_only_greetings || [],
    creation_date: typeof d.creation_date === 'number' ? d.creation_date : now,
    modification_date: now,
  };
  for (const k of ['nickname', 'source', 'assets', 'creator_notes_multilingual']) if (d[k] !== undefined) data[k] = d[k];
  return { spec: 'chara_card_v3', spec_version: '3.0', data };
}

/** Read a card from PNG or JSON bytes. Returns { spec, data, container, chunks, size }. */
export function readCardBytes(bytes, filename = '') {
  if (isPng(bytes)) {
    const text = readTextChunks(bytes);
    const keys = Object.keys(text);
    const lower = Object.fromEntries(keys.map((k) => [k.toLowerCase(), text[k]]));
    const chunks = ['ccv3', 'chara'].filter((k) => k in lower);
    if (!chunks.length) throw new Error('This PNG has no card data inside (no chara or ccv3 chunk).');
    let parsed = null;
    let lastErr = null;
    for (const k of chunks) {
      try { parsed = normaliseCard(JSON.parse(base64ToUtf8(lower[k]))); break; } catch (e) { lastErr = e; }
    }
    if (!parsed) throw lastErr || new Error('The card data in this PNG could not be read.');
    return { ...parsed, container: 'png', chunks, size: pngSize(bytes) };
  }
  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(`${filename || 'That file'} is neither a PNG card nor valid JSON.`); }
  return { ...normaliseCard(json), container: 'json', chunks: [], size: null };
}

/** Embed card data into PNG bytes as chara (V2) and optionally ccv3 (V3). */
export function embedCard(pngBytes, d, { v3 = true } = {}) {
  const entries = { chara: utf8ToBase64(JSON.stringify(toV2(d))) };
  if (v3) entries.ccv3 = utf8ToBase64(JSON.stringify(toV3(d)));
  return writeTextChunks(pngBytes, entries, v3 ? [] : ['ccv3']);
}

// ── Measuring ──────────────────────────────────────────────────────────────

/** Rough token estimate. Real counts depend on the model's tokenizer. */
export function estTokens(s) {
  if (!s) return 0;
  const words = (s.match(/\S+/g) || []).length;
  return Math.round(Math.max(s.length / 4, words * 1.3));
}

export function bookEntries(d) {
  const b = d.character_book;
  return b && Array.isArray(b.entries) ? b.entries : [];
}

/** Where every field's tokens live in a prompt. */
export function tokenAnatomy(d) {
  const lore = bookEntries(d).reduce((n, e) => n + estTokens(e.content || ''), 0);
  const greetings = [d.first_mes, ...(d.alternate_greetings || [])].filter(Boolean);
  const avgGreeting = greetings.length ? Math.round(greetings.reduce((n, g) => n + estTokens(g), 0) / greetings.length) : 0;
  const parts = [
    { key: 'description', label: 'Description', kind: 'permanent', tokens: estTokens(d.description) },
    { key: 'personality', label: 'Personality', kind: 'permanent', tokens: estTokens(d.personality) },
    { key: 'scenario', label: 'Scenario', kind: 'permanent', tokens: estTokens(d.scenario) },
    { key: 'system_prompt', label: 'System prompt', kind: 'permanent', tokens: estTokens(d.system_prompt) },
    { key: 'post_history_instructions', label: 'Post-history', kind: 'permanent', tokens: estTokens(d.post_history_instructions) },
    { key: 'mes_example', label: 'Examples', kind: 'ephemeral', tokens: estTokens(d.mes_example) },
    { key: 'first_mes', label: 'Greeting (avg)', kind: 'ephemeral', tokens: avgGreeting },
    { key: 'lore', label: 'Lorebook', kind: 'keyed', tokens: lore },
  ];
  const permanent = parts.filter((p) => p.kind === 'permanent').reduce((n, p) => n + p.tokens, 0);
  const total = parts.reduce((n, p) => n + p.tokens, 0);
  return { parts, permanent, total };
}

export function cardStats(d) {
  const a = tokenAnatomy(d);
  return {
    permanent: a.permanent,
    greetings: (d.first_mes ? 1 : 0) + (d.alternate_greetings || []).length,
    lore: bookEntries(d).length,
  };
}

export const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// ── Craft checks ───────────────────────────────────────────────────────────

const FREQ = /\b(sometimes|rarely|occasionally|usually|often|seldom|frequently|now and then|from time to time|at times|every so often|on rare (?:days|occasions))\b/gi;
const USER_ACT = /\{\{user\}\}(?:'s)?\s+(?:\w+\s+)?(?:feels?|felt|thinks?|thought|decides?|decided|wants?|wanted|realizes?|realised|realized|blush(?:es|ed)?|gasps?|gasped|nods?|nodded|smiles?|smiled|sighs?|sighed|says?|said|repl(?:ies|ied)|moans?|moaned|can't help|cannot help|knows?|knew)\b/gi;
const YOU_FEEL = /\byou\s+(?:feel|felt|think|thought|decide|decided|realize|realise|realized|can't help but|cannot help but|blush|gasp|nod|smile|sigh|reply|replied|moan|want|wanted)\b/gi;
const PROHIB = /\b(never|don't|do not|must not|mustn't|no)\b/gi;

function snippets(text, re, field, max = 6) {
  const out = [];
  if (!text) return out;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) && out.length < max) {
    const a = Math.max(0, m.index - 48);
    const b = Math.min(text.length, m.index + m[0].length + 48);
    out.push({ field, before: (a > 0 ? '…' : '') + text.slice(a, m.index), match: m[0], after: text.slice(m.index + m[0].length, b) + (b < text.length ? '…' : '') });
  }
  return out;
}

const FIELD_LABEL = {
  description: 'Description', personality: 'Personality', scenario: 'Scenario', first_mes: 'First message',
  mes_example: 'Examples', system_prompt: 'System prompt', post_history_instructions: 'Post-history', creator_notes: "Creator's notes",
};

/**
 * Craft checks from the Card Workshop doctrine. Each returns
 * { id, level: 'pass' | 'note' | 'look', title, detail, hits }.
 */
export function craftChecks(d) {
  const checks = [];
  const spec = ['description', 'personality', 'system_prompt', 'post_history_instructions'];
  const greetings = [['first_mes', d.first_mes], ...(d.alternate_greetings || []).map((g, i) => [`alt_${i}`, g])];
  const glabel = (k) => (k === 'first_mes' ? 'First message' : `Greeting ${Number(k.split('_')[1]) + 2}`);

  // 1. Frequency adverbs in behaviour specs
  let hits = [];
  for (const f of spec) hits.push(...snippets(d[f], FREQ, FIELD_LABEL[f]));
  checks.push({
    id: 'triggers', level: hits.length ? 'look' : 'pass',
    title: hits.length ? `${hits.length === 6 ? '6+' : hits.length} frequency adverb${hits.length === 1 ? '' : 's'} in the spec` : 'Variance is written as triggers',
    detail: 'A model has no dice. "Usually X, rarely Z" plays as X forever or Z on a schedule. Swap each adverb for a state the scene can check: tired, cornered, three days in, after the second pot of tea.',
    hits,
  });

  // 2. {{user}} integrity in greetings
  hits = [];
  for (const [k, g] of greetings) {
    hits.push(...snippets(g, USER_ACT, glabel(k), 4));
    hits.push(...snippets(g, YOU_FEEL, glabel(k), 4));
  }
  checks.push({
    id: 'user', level: hits.length ? 'look' : 'pass',
    title: hits.length ? `${hits.length} line${hits.length === 1 ? '' : 's'} may speak for {{user}}` : "Greetings leave {{user}} to the player",
    detail: 'Greetings teach the model what it may narrate. Lines that decide what {{user}} feels, thinks or says get copied. Possible hits only; read each in context.',
    hits,
  });

  // 3. Permanent token budget
  const a = tokenAnatomy(d);
  checks.push({
    id: 'budget', level: a.permanent > 2400 ? 'look' : a.permanent > 1500 ? 'note' : 'pass',
    title: `≈${fmtTokens(a.permanent)} permanent tokens`,
    detail: 'Description, personality, scenario and prompt overrides ride along in every single prompt. Weigh what must be permanent against what could be keyed (lorebook) or ephemeral (example messages, which teach register early and then scroll out).',
    hits: [],
  });

  // 4. Prohibition density
  hits = [];
  for (const f of spec) hits.push(...snippets(d[f], PROHIB, FIELD_LABEL[f], 12));
  checks.push({
    id: 'prohibit', level: hits.length >= 8 ? 'note' : 'pass',
    title: hits.length >= 8 ? `${hits.length >= 12 ? '12+' : hits.length} prohibitions in the spec` : 'Rules lean on demonstration',
    detail: 'Demonstration beats prohibition. Every hard rule in the spec should also be shown in at least one greeting. If you have to choose, keep the demonstration and cut the rule.',
    hits: hits.length >= 8 ? hits.slice(0, 6) : [],
  });

  // 5. Lorebook key health
  const entries = bookEntries(d);
  const lkHits = [];
  const seen = new Map();
  const permanentText = `${d.description}\n${d.personality}\n${d.scenario}`.toLowerCase();
  entries.forEach((e, i) => {
    const name = e.comment || e.name || `Entry ${i + 1}`;
    const keys = Array.isArray(e.keys) ? e.keys : [];
    if (!keys.length && !e.constant) lkHits.push({ field: name, before: '', match: 'no keys', after: ' and not constant, so it can never fire' });
    for (const k of keys) {
      const key = String(k).trim();
      if (!key) continue;
      const lk = key.toLowerCase();
      if (key.length < 3) lkHits.push({ field: name, before: 'key ', match: `"${key}"`, after: ' is very short and will fire on fragments' });
      else if (permanentText.includes(lk) && !e.constant) lkHits.push({ field: name, before: 'key ', match: `"${key}"`, after: ' appears in the description, so this entry fires on nearly every turn' });
      if (seen.has(lk) && seen.get(lk) !== name) lkHits.push({ field: name, before: 'key ', match: `"${key}"`, after: ` is shared with ${seen.get(lk)}` });
      seen.set(lk, name);
    }
  });
  checks.push({
    id: 'keys', level: !entries.length ? 'pass' : lkHits.length ? 'note' : 'pass',
    title: !entries.length ? 'No lorebook attached' : lkHits.length ? `${lkHits.length} lorebook key${lkHits.length === 1 ? '' : 's'} to review` : `${entries.length} lorebook entries, keys look clean`,
    detail: 'Keys that fire constantly are description by another name. Keys the player will never say before the model does may never fire. Review collisions and keys that already live in the description.',
    hits: lkHits.slice(0, 8),
  });

  // 6. Macro hygiene
  const allText = [...TEXT_FIELDS.map((f) => d[f]), ...(d.alternate_greetings || [])].join('\n');
  const unknown = new Set();
  for (const m of allText.matchAll(/\{\{([^{}]+)\}\}/g)) {
    const inner = m[1].trim();
    const head = inner.split(/::|\s/)[0].replace(/^\/|^#/, '');
    if (inner.startsWith('//')) continue;
    if (!MACRO_TOKENS.has(head.toLowerCase()) && !/^time_utc/i.test(head)) unknown.add(`{{${inner}}}`);
  }
  const opens = (allText.match(/\{\{/g) || []).length;
  const closes = (allText.match(/\}\}/g) || []).length;
  const macroHits = [...unknown].slice(0, 6).map((u) => ({ field: 'Macro', before: '', match: u, after: ' is not a SillyTavern macro' }));
  if (opens !== closes) macroHits.unshift({ field: 'Braces', before: '', match: `${opens} {{ vs ${closes} }}`, after: ' (unbalanced)' });
  checks.push({
    id: 'macros', level: macroHits.length ? 'note' : 'pass',
    title: macroHits.length ? 'Macros to double-check' : 'Macros are all recognised',
    detail: 'Unknown macros reach the model as literal text. Check spelling against the Macro Codex.',
    hits: macroHits,
  });

  // 7. Greeting variety
  const g = greetings.filter(([, t]) => t && t.trim()).length;
  checks.push({
    id: 'greetings', level: g === 0 ? 'look' : g === 1 ? 'note' : 'pass',
    title: g === 0 ? 'No greeting' : g === 1 ? 'One greeting' : `${g} greetings`,
    detail: 'Variance the card cannot hold as rules can live in greeting variety: different hours, moods and stakes. A floor greeting (a quiet, ordinary one) sets the register everything else inherits.',
    hits: [],
  });

  // 8. Em-dash count (house style)
  hits = [];
  for (const f of TEXT_FIELDS) hits.push(...snippets(d[f], /—/g, FIELD_LABEL[f] || f, 3));
  checks.push({
    id: 'dash', level: hits.length ? 'note' : 'pass',
    title: hits.length ? `Em-dashes present` : 'No em-dashes',
    detail: 'House style for the Archive: em-dashes are the most recognisable tell of machine-drafted prose. Commas, colons and full stops do the same work.',
    hits,
  });

  return checks;
}
