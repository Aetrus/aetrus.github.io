// Aetheria's own preset logic for the web Preset builder, and the few pieces
// of src/contexts/PresetContext.js the sheet leans on that the context keeps
// to itself (validateAndFixPreset, the default context template), copied so a
// preset made here is shaped exactly as Aetheria shapes one.
import * as core from '../../vendor/aetheria/preset.js';

export { core };

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`);

/**
 * Aetheria's converters talk to the console as they work ("Converting a
 * chat-completion preset - raw data: …"). On the web page that is only noise,
 * so it is hushed while they run; a failure is still thrown.
 */
export function quiet(fn) {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  const restore = () => { console.log = log; console.error = error; };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

// How a classic preset formats the chat, kept for presets that have none (PresetContext.js).
const DEFAULT_CONTEXT_TEMPLATE = Object.freeze({
  chatStart: '',
  chatSeparator: '\n',
  userPrefix: 'Human: ',
  userSuffix: '\n',
  assistantPrefix: 'Assistant: ',
  assistantSuffix: '\n',
  systemPrefix: '',
  systemSuffix: '\n',
  chatEnd: 'Assistant: ',
});

const getNumericValue = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
};

/** PresetContext.validateAndFixPreset, as Aetheria runs it on every preset it keeps. */
export function validateAndFixPreset(preset) {
  const fixed = {
    id: preset.id || uuid(),
    version: preset.version ?? 2,
    type: preset.type || 'chat',
    name: preset.name || 'Unnamed Preset',
    temperature: getNumericValue(preset.temperature, 0.9),
    top_p: getNumericValue(preset.top_p, 0.95),
    top_k: getNumericValue(preset.top_k, 0),
    typical_p: getNumericValue(preset.typical_p, 1.0),
    tfs: getNumericValue(preset.tfs, 1.0),
    repetition_penalty: getNumericValue(preset.repetition_penalty, 1),
    repetition_penalty_range: getNumericValue(preset.repetition_penalty_range, 256),
    presence_penalty: getNumericValue(preset.presence_penalty, 0.0),
    frequency_penalty: getNumericValue(preset.frequency_penalty, 0.0),
    top_a: getNumericValue(preset.top_a, 0),
    min_p: getNumericValue(preset.min_p, 0),
    seed: getNumericValue(preset.seed, -1),
    max_tokens: getNumericValue(preset.max_tokens, 512),
    max_context_length: getNumericValue(preset.max_context_length, 4096),
    stop_sequences: Array.isArray(preset.stop_sequences) ? preset.stop_sequences : [],
    prompts: Array.isArray(preset.prompts) ? preset.prompts : [],
    system_prompt: preset.system_prompt ?? 'You are a helpful AI assistant.',
    continue_postfix: preset.continue_postfix ?? '\n\n',
    link_api_connection: Boolean(preset.link_api_connection),
    context_template: preset.context_template || { ...DEFAULT_CONTEXT_TEMPLATE },
    created_at: preset.created_at || new Date().toISOString(),
    updated_at: preset.updated_at || new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(preset).filter(([key]) => !['id', 'version', 'type', 'name', 'temperature', 'top_p', 'top_k',
        'typical_p', 'tfs', 'repetition_penalty', 'repetition_penalty_range',
        'presence_penalty', 'frequency_penalty', 'top_a', 'min_p', 'seed',
        'max_tokens', 'max_context_length', 'stop_sequences', 'prompts',
        'system_prompt', 'continue_postfix', 'link_api_connection', 'style',
        'context_template', 'created_at', 'updated_at'].includes(key)),
    ),
  };
  // On the list builder, memory and the world sit inside the history, once.
  return core.assembler.isSillyTavernPreset(fixed) ? core.assembler.withPerTurnBlocksInStory(fixed) : fixed;
}

/** The house preset, as the starter set brings it in: the Aetheria Storyteller. */
export function storytellerDraft(id) {
  const raw = core.storyteller.storytellerPreset('Aetheria Storyteller');
  const converted = quiet(() => core.stPreset.convertFromSillyTavernPreset(raw));
  const now = new Date().toISOString();
  return validateAndFixPreset({ ...converted, id, created_at: now, updated_at: now });
}

/**
 * A blank preset: the markers that place the card, the lorebook and the chat,
 * an empty main prompt and the post-history slot, at the house preset's
 * balanced settings. Read in through the importer like any other file.
 */
export function blankDraft(id) {
  const marker = (identifier, name) => ({ identifier, name, system_prompt: true, marker: true });
  const prompts = [
    { identifier: 'main', name: 'Main Prompt', role: 'system', content: '', system_prompt: true, marker: false },
    marker('worldInfoBefore', 'World Info (before)'),
    marker('personaDescription', 'Persona Description'),
    marker('charDescription', 'Char Description'),
    marker('charPersonality', 'Char Personality'),
    marker('scenario', 'Scenario'),
    marker('worldInfoAfter', 'World Info (after)'),
    marker('dialogueExamples', 'Chat Examples'),
    marker('chatHistory', 'Chat History'),
    { identifier: 'jailbreak', name: 'Post-History Instructions', role: 'system', content: '', system_prompt: true, marker: false },
  ];
  const raw = {
    name: 'New preset',
    temperature: 1,
    top_p: 1,
    top_k: 0,
    top_a: 0,
    min_p: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
    repetition_penalty: 1,
    openai_max_context: 32768,
    openai_max_tokens: 4000,
    names_behavior: 0,
    squash_system_messages: false,
    prompts,
    prompt_order: [{ character_id: 100001, order: prompts.map((p) => ({ identifier: p.identifier, enabled: true })) }],
  };
  const converted = quiet(() => core.stPreset.convertFromSillyTavernPreset(raw));
  const now = new Date().toISOString();
  return validateAndFixPreset({ ...converted, id, created_at: now, updated_at: now });
}

/** What a file holds when it is not a preset at all: a card or a lorebook. */
export function notAPreset(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return 'That file is not a preset.';
  if (/^chara_card/.test(String(json.spec || '')) || (json.data && (json.data.first_mes !== undefined || json.data.description !== undefined) && !json.prompts)) {
    return 'That file is a character card. The Character builder opens those.';
  }
  if (json.entries && !json.prompts && !json.prompt_order) return 'That file is a lorebook. The Lorebook builder opens those.';
  return '';
}

/** A chat-completion preset file, brought in as Aetheria brings one in (PresetContext.importPreset). */
export async function importFile(file, id) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
  const wrong = notAPreset(parsed);
  if (wrong) throw new Error(wrong);
  const imported = await quiet(() => core.stPreset.importSillyTavernPreset(file));
  const now = new Date().toISOString();
  return validateAndFixPreset({ ...imported, id, created_at: now, updated_at: now });
}

/** A preset handed over by another page: { json, name }. */
export function importJson(json, name, id) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const wrong = notAPreset(parsed);
  if (wrong) throw new Error(wrong);
  const raw = { ...parsed };
  if (!raw.name && !raw.preset_name && name) raw.preset_name = String(name);
  const converted = quiet(() => core.stPreset.convertFromSillyTavernPreset(raw));
  const now = new Date().toISOString();
  return validateAndFixPreset({ ...converted, id, created_at: now, updated_at: now });
}

/** The preset as a chat-completion preset file, as Aetheria's Export writes it. */
export function exportJson(preset) {
  return JSON.stringify(core.stPreset.convertToSillyTavernPreset(preset), null, 2);
}

export const exportName = (preset) => `${String(preset?.name || 'preset').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'preset'}.json`;

/**
 * The preset read the way the sheet reads it: the chain in the order it is
 * executed (list order on the list builder, by position, depth and order on
 * the classic one), each block's key, and the groups readChain finds.
 */
export function derive(draft, openedOn) {
  const { chain: ch, assembler: as, ordering } = core;
  const prompts = Array.isArray(draft.prompts) ? draft.prompts : [];
  const stMode = as.isSillyTavernPreset(draft);
  const keys = ch.blockKeys(prompts);
  const list = prompts.map((p, at) => ({ p, key: keys[at], at }));
  const entries = stMode ? list : list.slice().sort((a, b) => ordering.comparePromptExecutionOrder(a.p, b.p) || a.at - b.at);
  const chain = entries.map((e) => e.p);
  const shape = ch.readChain(chain, { openedOn });
  const counted = (p) => p && p.enabled !== false && !ch.isStoryBlock(p);
  const tokensOf = (indexes) => indexes.reduce((n, i) => n + (counted(chain[i]) ? ch.estTokens(chain[i].content) : 0), 0);
  const totalTokens = chain.reduce((n, p) => n + (counted(p) ? ch.estTokens(p.content) : 0), 0);
  const activeCount = chain.filter((p) => p.enabled !== false && !p.marker).length;
  const sectionIndexes = (s) => [...(s.heading != null ? [s.heading] : []), ...s.rows];
  const choiceIndexes = [
    ...(shape.choicesHeading != null ? [shape.choicesHeading] : []),
    ...shape.choices.flatMap((c) => [c.heading, ...c.options]),
  ];
  const rowsOn = shape.sections.reduce((n, s) => n + s.rows.filter((i) => chain[i].enabled !== false).length, 0);
  const dials = core.dials.dialsOf(draft);
  const panels = core.panels.panelsOf(draft);
  const missingBlocks = stMode ? as.missingAetheriaBlocks(prompts) : [];
  const hasCast = prompts.some((p) => as.aetheriaBlockOf(p)?.slot === 'cast');
  const indexOfKey = (key) => entries.findIndex((e) => e.key === key);
  const choiceOf = (index) => shape.choices.find((c) => c.options.includes(index) || c.heading === index) || null;
  return {
    prompts, stMode, keys, entries, chain, shape, tokensOf, totalTokens, activeCount, sectionIndexes, choiceIndexes,
    rowsOn, dials, panels, missingBlocks, hasCast, indexOfKey, choiceOf,
  };
}
