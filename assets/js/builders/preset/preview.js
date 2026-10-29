// The inspector: the request this preset would put together, for a small
// sample story, through Aetheria's own assembler (stAssembler.js
// assembleSillyTavernRequest) and macros (stMacros.js). No model is asked.
//
// The assembler hands back finished messages; to say which block each came
// from, it is run with squashing and the prefill off, the blocks it injected
// into the chat are matched to their messages the way it places them (by
// depth, then order, then role), and the two last steps are then done here as
// it does them. Aetheria's own blocks (memory, living pages, the world…) are
// filled from a story; here each holds a mark that shows only where it goes.
import { esc, rng } from '../../ui.js';
import { core, quiet } from './core.js';
import { SAMPLE } from './sample.js';
import { button, plural, segmented } from './bits.js';

const OPEN = '';
const CLOSE = '';
const MARK = new RegExp(`${OPEN}(\\w+)${CLOSE}`, 'g');
const mark = (slot) => `${OPEN}${slot}${CLOSE}`;
// The cast speaks only in group stories; the sample is one-to-one.
const SLOTS = ['living', 'chapters', 'memory', 'world', 'receipt', 'instructions'];
const SLOT_NAME = Object.fromEntries(core.assembler.AETHERIA_BLOCKS.map((b) => [b.slot, b.name]));
const hasText = (v) => typeof v === 'string' && v.trim().length > 0;
const ROLE = { system: 'System', user: 'User', assistant: 'Assistant' };

export const SAMPLES = [
  { id: 'dilys', label: SAMPLE.character.name },
  { id: 'none', label: 'No character' },
];

/** The sample story: Dilys Pengelly of Lantern Quay, the reader as Ansel; or no character at all. */
function sampleOf(which) {
  const persona = { name: SAMPLE.persona.name, description: SAMPLE.persona.description };
  if (which === 'none') {
    return {
      name: 'no character',
      card: {},
      persona,
      worldInfo: {},
      history: [{ role: 'user', content: SAMPLE.anyLine, metadata: { passage: true } }],
    };
  }
  const c = SAMPLE.character;
  const card = {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    mes_example: c.mes_example,
    system_prompt: c.system_prompt,
    post_history_instructions: c.post_history_instructions,
    tags: c.tags,
  };
  const greeting = core.macros.substituteMacros(c.first_mes, { user: persona.name, char: c.name });
  return {
    name: c.name,
    card,
    persona,
    // SillyTavern joins the entries it found with a new line.
    worldInfo: { before: SAMPLE.lore.map((e) => e.content).join('\n') },
    history: [
      { role: 'assistant', content: greeting, metadata: { passage: true, greeting: true } },
      { role: 'user', content: SAMPLE.firstLine, metadata: { passage: true } },
    ],
  };
}

/** SillyTavern's squash, as stAssembler.js does it, keeping where each part came from. */
function squash(messages, exclude) {
  const out = [];
  messages.forEach((m) => {
    const prev = out[out.length - 1];
    const excluded = exclude.some((e) => hasText(e) && m.content === e);
    if (prev && prev.role === 'system' && m.role === 'system' && !excluded && !prev.squashLocked) {
      out[out.length - 1] = { ...prev, content: `${prev.content}\n${m.content}`, sources: [...prev.sources, ...m.sources], where: prev.where === m.where ? prev.where : 'in order, merged into one system message' };
    } else {
      out.push(excluded ? { ...m, squashLocked: true } : m);
    }
  });
  return out.map(({ squashLocked, ...m }) => m);
}

const depthWords = (depth) => (depth === 0 ? 'in the chat, after the newest message' : `in the chat, ${depth} ${depth === 1 ? 'message' : 'messages'} from the end`);

/**
 * The request for `draft` and the chosen sample. Returns the messages, each
 * with its role, text, where it came from and an estimate of its tokens, and
 * what the request leaves in its variables.
 */
export function assemble(draft, { which = 'dilys', seed = 1 } = {}) {
  const { assembler: as, chain: ch, builder, macros, budget } = core;
  const stMode = as.isSillyTavernPreset(draft);
  // The classic builder's own assembler lives in Aetheria; the list builder sends the same order.
  const preset = stMode ? draft : quiet(() => builder.toListBuilder(draft));
  const prompts = Array.isArray(preset.prompts) ? preset.prompts : [];
  const sample = sampleOf(which);
  const ctx = macros.createMacroContext({
    user: sample.persona.name,
    char: sample.card.name,
    description: sample.card.description,
    personality: sample.card.personality,
    scenario: sample.card.scenario,
    persona: sample.persona.description,
    mesExamples: sample.card.mes_example,
    firstMes: sample.history.find((m) => m.metadata?.greeting)?.content,
    charPrompt: sample.card.system_prompt,
    charInstruction: sample.card.post_history_instructions,
    model: '',
    maxContext: preset.max_context_length,
    maxResponse: preset.max_tokens,
    lastMessage: sample.history[sample.history.length - 1]?.content,
    lastUserMessage: [...sample.history].reverse().find((m) => m.role === 'user')?.content,
    lastCharMessage: [...sample.history].reverse().find((m) => m.role === 'assistant')?.content || '',
    rng: rng(seed),
  });
  const aetheria = Object.fromEntries(SLOTS.map((slot) => [slot, [mark(slot)]]));
  const r = as.assembleSillyTavernRequest({
    preset: { ...preset, squash_system_messages: false },
    card: sample.card,
    persona: sample.persona,
    worldInfo: sample.worldInfo,
    history: sample.history,
    aetheria,
    isGroup: false,
    macroContext: ctx,
    prefill: false,
  });

  // Each block's key in the draft (blockKeys), for opening it from its message.
  const draftKeys = ch.blockKeys(draft.prompts || []);
  const keyOf = (identifier) => {
    const at = (draft.prompts || []).findIndex((p) => p?.identifier === identifier);
    return at >= 0 ? draftKeys[at] : null;
  };
  const promptOf = (identifier) => prompts.find((p) => p?.identifier === identifier && p.enabled !== false) || null;
  const sourceOf = (identifier, fallbackName) => {
    const own = as.aetheriaBlockOf({ identifier });
    const p = promptOf(identifier);
    return { key: keyOf(identifier), name: own ? `✦ ${own.name}` : ch.plainName(p?.name || fallbackName || identifier), own: Boolean(own) };
  };

  // What was injected at each depth, in the order the assembler lays it down.
  const injected = r.blocks.filter((b) => b.position === 'depth').map((b) => {
    let order;
    if (String(b.identifier).startsWith('panel:')) order = 190;
    else if (b.aetheria && b.placement === 'default') order = as.AETHERIA_BLOCKS.find((x) => x.identifier === b.identifier)?.order ?? -1000;
    else order = Number(promptOf(b.identifier)?.injection_order ?? 100);
    return { ...b, order, depthAt: Number(b.depth) || 0 };
  });
  const laid = new Map();
  const groupsAt = (depth) => {
    if (laid.has(depth)) return laid.get(depth);
    const at = injected.filter((e) => e.depthAt === depth);
    const orders = [...new Set(at.map((e) => e.order))].sort((a, b) => b - a);
    const group = [];
    orders.forEach((o) => ['system', 'user', 'assistant'].forEach((role) => {
      const items = at.filter((e) => e.order === o && (e.role || 'system') === role);
      if (items.length) group.push(items);
    }));
    const finalOrder = group.reverse();
    laid.set(depth, finalOrder);
    return finalOrder;
  };
  const taken = new Map();

  let newChat = null;
  let messages = r.messages.map((m) => {
    const meta = m.metadata || {};
    let sources = [];
    let where = '';
    if (meta.injectedAtDepth !== undefined) {
      const depth = meta.injectedAtDepth;
      const n = taken.get(depth) || 0;
      taken.set(depth, n + 1);
      const items = groupsAt(depth)[n] || [];
      sources = items.map((b) => (String(b.identifier).startsWith('panel:') ? { key: null, name: b.name, own: true } : sourceOf(b.identifier, b.name)));
      where = depthWords(depth);
    } else if (meta.passage) {
      sources = [{ key: null, name: meta.greeting ? 'The story so far · the greeting' : 'The story so far · your line', story: true }];
      where = 'the chat';
    } else if (meta.promptIdentifier) {
      const block = r.blocks.find((b) => b.identifier === meta.promptIdentifier);
      sources = [sourceOf(meta.promptIdentifier, block?.name)];
      where = block?.placement === 'default' ? 'at its usual place' : 'in order';
    } else if (meta.aetheria) {
      sources = [{ key: null, name: 'Lorebook entries by the examples', own: true }];
      where = 'in order';
    } else {
      newChat = m.content;
      sources = [{ key: null, name: 'The start of the story', note: 'new_chat_prompt' }];
      where = 'before the chat';
    }
    return { role: m.role, content: m.content, sources, where };
  });

  if (preset.squash_system_messages) messages = squash(messages, [newChat, preset.new_example_chat_prompt]);
  if (hasText(preset.assistant_prefill)) {
    messages.push({ role: 'assistant', content: macros.substituteMacros(preset.assistant_prefill, ctx), sources: [{ key: null, name: 'Assistant prefill' }], where: 'last, for Claude only', prefill: true });
  }

  const tokensOf = (text) => budget.estimateContextMessageTokens({ content: String(text).replace(MARK, '') });
  messages = messages.map((m) => {
    const bare = m.content.replace(MARK, '').trim();
    return { ...m, ghost: !bare, tokens: bare ? tokensOf(m.content) : 0 };
  });
  const total = messages.reduce((n, m) => n + m.tokens, 0);
  const counted = messages.filter((m) => !m.ghost).length;

  const enabledText = prompts.filter((p) => p && p.enabled !== false).map((p) => String(p.content || '')).join('\n');
  return {
    messages,
    total,
    counted,
    variables: r.variables,
    sampleName: sample.name,
    stMode,
    usesModel: /\{\{\s*(?:model_habits|modelhabits|model)\s*\}\}/i.test(enabledText),
    usesChance: /\{\{\s*(?:roll|random|pick)\b/i.test(enabledText),
    usesLore: Boolean(sample.worldInfo.before),
    contextLimit: Number(preset.max_context_length) || 0,
  };
}

/* ── drawing it ─────────────────────────────────────────────────────────── */

const textHtml = (text) => esc(text)
  .replace(/\{\{([^{}]+)\}\}/g, '<span class="macro">{{$1}}</span>')
  .replace(MARK, (_, slot) => `<span class="req-slot">✦ ${esc(SLOT_NAME[slot] || slot)}</span>`);

const msgKey = (m, i) => `${m.sources.map((s) => s.key || s.name).join('+')}@${m.where}#${i}`;

export function previewHtml(app, run) {
  const S = app.S;
  if (!run) return '<p class="ps-meta">The request appears here once a preset is open.</p>';
  if (run.error) return `<p class="ps-meta ps-error" role="alert">${esc(`This request could not be put together: ${run.error}`)}</p>`;
  const openKey = S.open?.kind === 'block' ? S.open.key : null;
  const seen = new Map();
  const items = run.messages.map((m, i) => {
    const base = m.sources.map((s) => s.key || s.name).join('+');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    const id = msgKey(m, n);
    const lit = openKey && m.sources.some((s) => s.key === openKey);
    const long = m.content.length > 360 || m.content.split('\n').length > 6;
    const expanded = S.expanded.has(id);
    const names = m.sources.map((s) => (s.key
      ? `<button type="button" class="req-src-btn" data-act="goto-block" data-key="${esc(s.key)}" title="Open this block">${esc(s.name)}</button>`
      : `<span class="req-src-name">${esc(s.name)}</span>`)).join('<span class="req-plus"> + </span>');
    return `<li class="req-msg role-${esc(m.role)}${m.ghost ? ' is-ghost' : ''}${lit ? ' is-lit' : ''}"${lit ? ' data-lit' : ''}>
      <div class="req-head"><span class="req-role">${ROLE[m.role] || esc(m.role)}</span><span class="req-src">${names}</span>${m.ghost ? '' : `<span class="req-tok mono" title="About this many tokens">${m.tokens.toLocaleString()}</span>`}</div>
      <p class="req-where">${esc(m.ghost ? `${m.where} · Aetheria fills this in a story; empty here` : m.where)}</p>
      ${m.ghost ? '' : `<div class="req-text${long && !expanded ? ' is-clamped' : ''}">${textHtml(m.content)}</div>
      ${long ? `<button type="button" class="req-more" data-act="msg-more" data-msg="${esc(id)}" aria-expanded="${expanded}">${expanded ? 'Show less' : 'Show all'}</button>` : ''}`}
    </li>`;
  }).join('');

  const notes = [
    'Nothing is sent and no model is asked: this is what Aetheria would put together for the sample, with the preset’s dials at their starting values.',
    run.messages.some((m) => m.ghost || //.test(m.content)) ? 'The ✦ marks show where Aetheria puts its own context (story memory, living pages, the world, chapter summaries, response instructions). A story fills them; there is none here.' : '',
    run.usesLore ? 'World info is three entries of Aetheria’s Lantern Quay lorebook, as a story there would find them; no lorebook is searched here.' : '',
    run.usesModel ? 'No model is chosen here, so {{model}} and {{model_habits}} send nothing.' : '',
    !run.stMode ? 'On the classic builder Aetheria joins the blocks into one system prompt and places its own context itself. Shown here is the same order as the list builder sends it.' : '',
  ].filter(Boolean);

  const limit = run.contextLimit;
  const share = limit ? Math.min(100, (run.total / limit) * 100) : 0;
  return `<div class="req">
    <div class="req-top">
      <h2 class="inspector-title">The request</h2>
      <p class="req-sum"><span>${plural(run.counted, 'message')}</span> · <span>about <b>${run.total.toLocaleString()}</b> tokens</span>${limit ? ` <span class="faint">of ${limit.toLocaleString()} it may read</span>` : ''}</p>
      ${limit ? `<div class="req-gauge" role="img" aria-label="${esc(`About ${Math.round(share)} percent of the context limit`)}"><span style="width:${share.toFixed(1)}%"></span></div>` : ''}
      <div class="req-controls">
        ${segmented({ act: 'sample', value: S.sample, options: SAMPLES, label: 'The sample story', focus: 'sample' })}
      </div>
      <p class="ps-meta req-cast">${esc(S.sample === 'none' ? `No character: {{char}} reads “Character”. You play ${SAMPLE.persona.name}.` : `${SAMPLE.character.name} of Lantern Quay, from Aetheria’s starter set. You play ${SAMPLE.persona.name}.`)}</p>
    </div>
    <ol class="req-list" aria-label="The messages, in the order they are sent">${items}</ol>
    <div class="req-notes">${notes.map((n) => `<p>${esc(n)}</p>`).join('')}
      <div class="btn-row">${run.usesChance ? button({ text: 'Roll again', act: 'roll', cls: 'btn-ghost', focus: 'roll' }) : ''}${button({ text: 'Copy the messages', act: 'copy-request', cls: 'btn-ghost', focus: 'copy-request' })}</div>
      ${run.usesChance ? '<p>Dice and random picks are rolled for this preview; each request rolls its own.</p>' : ''}
    </div>
  </div>`;
}

/** The messages as JSON, Aetheria's marks written out in words. */
export const requestJson = (run) => JSON.stringify(run.messages.filter((m) => !m.ghost).map((m) => ({
  role: m.role,
  content: m.content.replace(MARK, (_, slot) => `[✦ ${SLOT_NAME[slot] || slot}]`),
})), null, 2);
