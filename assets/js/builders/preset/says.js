// "What it says": the preset's instructions, by what they do (Aetheria's
// src/sheets/PresetSheet.js). The pick-one questions are one grid of choices,
// the other blocks sit in the preset's own groups (presetChain.js readChain),
// and the blocks the app fills in are the story itself. A block chosen opens
// beneath its row, in the sheet: where it is sent, as whom, and what it says.
import { esc } from '../../ui.js';
import { core, uuid } from './core.js';
import {
  ICON, button, card, field, iconButton, meta, ordinal, plural, segmented, toggle,
} from './bits.js';
import { blockWhenHtml, dialsCardHtml, panelsCardHtml } from './extras.js';

const CHOICES_SHOWN = 9;
const GROUP_TONES = ['memory', 'characters', 'lorebooks', 'history'];

/** Every block can move except the chat history, which is the anchor the rest move around. */
const kindIsPlaceable = (prompt) => !['chat_history', 'chatHistory'].includes(prompt?.identifier);

/** What a block the app fills in brings, by its kind. */
const FILLED_WITH = {
  description: "The character's description",
  personality: "The character's personality",
  scenario: 'The scenario',
  persona: 'Who you play',
  wiBefore: 'Lorebook entries',
  wiAfter: 'Lorebook entries',
  examples: "The card's example dialogue",
  history: 'The story so far, passage by passage',
};

/** A block a card stands in for on the list builder, said when the preset says nothing of it. */
const STOOD_IN_FOR = {
  main: "A card's own system prompt takes its place.",
  jailbreak: "A card's own post-history instructions take its place.",
};

export const whereSaid = (place) => {
  if (!place) return '';
  if (place.inChat) {
    return place.depth === 0 ? 'in the chat, after the newest message' : `in the chat, ${place.depth} ${place.depth === 1 ? 'message' : 'messages'} from the end`;
  }
  return place.after ? `after ${place.after}` : 'first in the order';
};

export const nameOf = (p) => core.chain.plainName(p?.name || p?.identifier);
const standIn = (d, p) => (d.stMode && !p?.forbid_overrides && STOOD_IN_FOR[p?.identifier]) || '';

/** A block's row as the chain shows it: its name, what it says or where it goes, its cost. */
export function rowParts(app, index) {
  const d = app.d();
  const { chain: ch, assembler: as, dials: dl } = core;
  const p = d.chain[index];
  const own = as.aetheriaBlockOf(p);
  const story = ch.isStoryBlock(p);
  const name = own ? `✦ ${own.name}` : nameOf(p);
  const where = whereSaid(ch.placeOf(d.chain, index));
  let hint;
  if (own) hint = `Filled each turn · ${where}`;
  else if (story) hint = `${FILLED_WITH[as.blockKindOf(p.identifier)] || 'Filled in when sent'} · ${where}`;
  else {
    const flags = [
      (p.role || 'system') !== 'system' ? `sent as ${p.role}` : '',
      Number(p.injection_position) === 1 ? where : '',
      d.stMode && p.inPromptOrder === false ? 'not in the imported order' : '',
      d.stMode ? dl.describeWhen(p, d.dials) : '',
    ].filter(Boolean).join(' · ');
    const said = ch.describeBlock(p.content) || standIn(d, p) || '';
    hint = [said, flags].filter(Boolean).join(' · ');
  }
  return { name, hint, cost: story ? '' : ch.estTokens(p.content).toLocaleString(), on: p.enabled !== false, story };
}

/** The steps the grip's ↑ and ↓ take: a group's row by the rows beside it, any other block by the next in the chain. */
export function stepFor(d, index, direction) {
  const inGroup = d.shape.sections.some((s) => s.rows.includes(index));
  if (inGroup) return core.chain.rowStep(d.shape, index, direction);
  const to = index + direction;
  return to >= 0 && to < d.chain.length ? to : null;
}

/** Move the block at chain index `from` to `to`, as the sheet moves it. */
export function move(app, from, to, opts = {}) {
  const d = app.d();
  if (to == null || from === to || to < 0 || to >= d.chain.length) return false;
  if (!d.stMode) {
    app.setPrompts(core.ordering.reorderPromptsForExecution(d.prompts, from, to), opts);
    return true;
  }
  const next = d.prompts.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  app.setPrompts(next, opts);
  return true;
}

/* ── the section ─────────────────────────────────────────────────────────── */

export function saysSub(app) {
  const d = app.d();
  const { shape } = d;
  return d.chain.length
    ? `${shape.choices.length ? `${plural(shape.choices.length, 'choice')} and ` : ''}${plural(d.rowsOn, 'block')} on · about ${d.totalTokens.toLocaleString()} tokens before the story itself`
    : 'Nothing yet';
}

export function saysHead(app) {
  const d = app.d();
  const sub = saysSub(app);
  const actions = d.stMode
    ? [button({ text: 'Add a dial', act: 'dial-add' }), button({ text: 'Add a panel', act: 'panel-add' }), button({ text: 'Add a block', act: 'block-add', cls: 'btn-gilt' })].join('')
    : [button({ text: 'Move to the list builder', act: 'to-list' }), button({ text: 'Add a block', act: 'block-add', cls: 'btn-ghost' })].join('');
  return { eyebrow: 'What it says', sub: esc(sub), actions };
}

export function meterHtml(d) {
  if (!d.totalTokens) return '';
  const { shape } = d;
  const segments = [
    ...shape.sections.map((s, i) => ({ tone: GROUP_TONES[i % GROUP_TONES.length], label: s.name, tokens: d.tokensOf(d.sectionIndexes(s)) })),
    ...(shape.choices.length ? [{ tone: 'system', label: 'Your choices', tokens: d.tokensOf(d.choiceIndexes) }] : []),
  ].filter((s) => s.tokens > 0);
  return `<div class="meter ps-meter" data-live="meter" role="img" aria-label="About ${d.totalTokens.toLocaleString()} tokens the preset sends, by group">
    <div class="meter-bar">${segments.map((s) => `<span class="tone-${s.tone}" style="flex-grow:${s.tokens}" title="${esc(`${s.label}: ${s.tokens.toLocaleString()}`)}"></span>`).join('')}</div>
    <div class="meter-legend">${segments.map((s) => `<div><i class="tone-${s.tone}"></i><span class="ps-legend-name">${esc(s.label)}</span><b>${s.tokens.toLocaleString()}</b></div>`).join('')}</div>
    <p class="ps-meter-label"><span>tokens the preset sends</span><b>${d.totalTokens.toLocaleString()}</b></p>
  </div>`;
}

const modeNote = (d) => (d.stMode
  ? `List builder: sent in the order shown, top to bottom${d.shape.choices.length ? ', and each choice where the preset puts it' : ''}.`
  : 'Classic builder: the blocks are joined into one system prompt in this order, and Aetheria places its own context itself. The list builder sends this same order, and shows memory, living pages and the rest as blocks you can move.');

export function saysBody(app) {
  const d = app.d();
  const { shape } = d;
  const parts = [meterHtml(d), `<p class="ps-meta ps-mode-note">${esc(modeNote(d))}</p>`];
  if (d.stMode) parts.push(dialsCardHtml(app), panelsCardHtml(app));
  if (!d.chain.length) {
    parts.push(`<div class="empty-state ps-empty"><p class="panel-sub">Nothing yet</p><h3 class="ps-empty-title">This preset sends nothing</h3><p>Add a block, or bring a chat-completion preset in.</p>${button({ text: 'Add a block', act: 'block-add', focus: 'empty-add' })}</div>`);
    return parts.join('');
  }
  if (shape.choices.length) parts.push(choicesCard(app));
  shape.sections.forEach((s) => parts.push(sectionCard(app, s)));
  parts.push(storyCard(app));
  parts.push(`<p class="ps-meta ps-help">Choose a block to read and change it: where it is sent, as whom, and what it says. Drag a row by its grip, or focus the grip and use ↑ / ↓, to move it in the order.</p>`);
  return parts.join('');
}

/* ── rows ────────────────────────────────────────────────────────────────── */

function blockRow(app, index) {
  const d = app.d();
  const entry = d.entries[index];
  const parts = rowParts(app, index);
  const open = app.isOpen('block', entry.key);
  const plain = parts.name.replace(/^✦ /, '');
  return `<div class="ps-block${open ? ' is-open' : ''}${parts.on ? '' : ' is-off'}" data-row="${esc(entry.key)}" data-index="${index}">
    <div class="ps-block-row">
      <button type="button" class="ps-block-open" data-act="block-open" data-key="${esc(entry.key)}" aria-expanded="${open}" data-focus="open:${esc(entry.key)}">
        <strong class="ps-block-name">${esc(parts.name)}</strong>${parts.hint ? `<span class="ps-block-hint">${esc(parts.hint)}</span>` : '<span class="ps-block-hint"></span>'}
      </button>
      <span class="ps-block-cost mono"${parts.story ? '' : ' title="About this many tokens"'}>${parts.cost}</span>
      ${toggle({ checked: parts.on, label: `Send ${plain}`, act: 'block-toggle', data: { key: entry.key }, focus: `toggle:${entry.key}` })}
      <button type="button" class="ps-grip" data-grip-key="${esc(entry.key)}" data-index="${index}" aria-label="Reorder ${esc(plain)}" title="Drag to reorder, or use ↑ / ↓" data-focus="grip:${esc(entry.key)}">⠿</button>
    </div>
    ${open ? blockEditor(app, index) : ''}
  </div>`;
}

function groupTitle(app, name, headingIndex) {
  if (headingIndex == null) return esc(name);
  const d = app.d();
  const key = d.entries[headingIndex].key;
  const open = app.isOpen('block', key);
  return `<button type="button" class="ps-card-titlebtn" data-act="block-open" data-key="${esc(key)}" title="Open this heading's own block" aria-expanded="${open}"${open ? ' aria-current="true"' : ''} data-focus="open:${esc(key)}">${esc(name)}</button>`;
}

/** The open block's editor, when it belongs to these indexes (a heading, the choices' own blocks). */
function editorIfOpenAmong(app, indexes) {
  const d = app.d();
  const at = indexes.find((i) => app.isOpen('block', d.entries[i].key));
  return at == null ? '' : `<div class="ps-block is-open ps-block-detached" data-row="${esc(d.entries[at].key)}" data-index="${at}">${blockEditor(app, at)}</div>`;
}

function choicesCard(app) {
  const d = app.d();
  const { shape, chain, entries } = d;
  const umbrella = shape.choicesHeading != null ? entries[shape.choicesHeading] : null;
  const umbrellaSays = umbrella ? core.chain.describeBlock(umbrella.p.content) : '';
  const shown = app.S.allChoices ? shape.choices : shape.choices.slice(0, CHOICES_SHOWN);
  const cell = (choice) => {
    const chosen = core.chain.chosenOf(chain, choice.options);
    const value = chosen === 'several' ? 'several' : chosen == null ? '' : entries[chosen].key;
    const opens = typeof chosen === 'number' ? chosen : choice.heading;
    const current = choice.options.some((i) => app.isOpen('block', entries[i].key)) || app.isOpen('block', entries[choice.heading].key);
    const hkey = entries[choice.heading].key;
    const labelId = `preset-choice-${hkey.replace(/[^\w-]/g, '-')}`;
    return `<div class="ps-choice${current ? ' is-current' : ''}">
      <span class="ps-choice-q" id="${esc(labelId)}">${esc(choice.question)}</span>
      <div class="ps-choice-ctl">
        <select class="select" aria-labelledby="${esc(labelId)}" data-act="choose" data-heading="${esc(hkey)}" data-focus="choose:${esc(hkey)}">
          <option value=""${value === '' ? ' selected' : ''}>None chosen</option>
          ${chosen === 'several' ? '<option value="several" disabled selected>Several are on</option>' : ''}
          ${choice.options.map((i) => `<option value="${esc(entries[i].key)}"${value === entries[i].key ? ' selected' : ''}>${esc(nameOf(chain[i]))}</option>`).join('')}
        </select>
        ${iconButton({ icon: 'edit', label: `Read ${typeof chosen === 'number' ? nameOf(chain[chosen]) : choice.question}`, act: 'block-open', data: { key: entries[opens].key }, focus: `choice-open:${hkey}`, current })}
      </div>
    </div>`;
  };
  const own = [
    ...(shape.choicesHeading != null ? [shape.choicesHeading] : []),
    ...shape.choices.flatMap((c) => [c.heading, ...c.options]),
  ];
  const body = `${umbrellaSays ? `<p class="ps-meta">${esc(umbrellaSays)}</p>` : ''}
    <div class="ps-choice-grid">${shown.map(cell).join('')}</div>
    ${shape.choices.length > CHOICES_SHOWN ? `<div class="ps-card-foot">${button({ text: app.S.allChoices ? 'Show fewer' : `Show all ${shape.choices.length}`, act: 'choices-all', cls: 'btn-ghost', attrs: { 'aria-expanded': String(app.S.allChoices) } })}</div>` : ''}
    ${editorIfOpenAmong(app, own)}`;
  return card({
    titleHtml: groupTitle(app, 'Your choices', shape.choicesHeading),
    label: 'Your choices',
    aside: `${shape.choices.length} · one of each`,
    body,
    cls: 'ps-card-choices',
  });
}

export function groupAside(app, s) {
  const d = app.d();
  const on = s.rows.filter((i) => d.chain[i].enabled !== false).length;
  return s.rows.length ? `${on} of ${s.rows.length} on · ${d.tokensOf(d.sectionIndexes(s)).toLocaleString()} tokens` : 'a heading alone';
}

export const groupId = (app, s) => (s.heading != null ? app.d().entries[s.heading].key : s.id);

function sectionCard(app, s) {
  const d = app.d();
  const body = `${s.heading != null ? editorIfOpenAmong(app, [s.heading]) : ''}
    ${s.rows.length ? `<div class="ps-rows">${s.rows.map((i) => blockRow(app, i)).join('')}</div>` : '<p class="ps-meta">Nothing sits under this heading.</p>'}`;
  const id = groupId(app, s);
  return `<div data-group="${esc(id)}">${card({
    titleHtml: groupTitle(app, s.name, s.heading),
    label: s.name,
    aside: groupAside(app, s),
    asideLive: `aside:${id}`,
    body,
  })}</div>`;
}

function storyCard(app) {
  const d = app.d();
  const { shape } = d;
  if (!shape.story.length && !d.missingBlocks.length) return '';
  const missing = d.missingBlocks.map((b) => `<div class="ps-row ps-row-ghost"><div class="ps-row-text"><span class="ps-row-label">✦ ${esc(b.name)}</span><span class="ps-row-hint">${esc(`Not in the list: sent at its usual place, ${core.chain.usualPlaceOf(b)}.`)}</span></div></div>`).join('');
  const foot = d.stMode && (d.missingBlocks.length > 0 || !d.hasCast) ? `<div class="ps-card-foot ps-story-foot">
      ${d.missingBlocks.length ? `<p class="ps-meta">${d.missingBlocks.length === 1 ? 'Show it to move it or switch it off.' : 'Show them to move or switch them off.'}</p>${button({ text: 'Show Aetheria’s blocks', act: 'aetheria-show' })}` : ''}
      ${!d.hasCast ? button({ text: 'Add the cast', act: 'aetheria-cast', cls: 'btn-ghost' }) : ''}
    </div>` : '';
  return card({
    title: 'The story itself',
    aside: d.stMode ? 'placed by the app, where this preset says' : 'placed by the app',
    body: `<div class="ps-rows">${shape.story.map((i) => blockRow(app, i)).join('')}</div>${missing}${foot}`,
    cls: 'ps-card-story',
  });
}

/* ── the block, open ─────────────────────────────────────────────────────── */

const ROLES = [['system', 'System'], ['user', 'User'], ['assistant', 'Assistant']];

export function tokensLabel(content) {
  return `What it says · ~${core.chain.estTokens(content).toLocaleString()} tokens`;
}

function blockEditor(app, index) {
  const d = app.d();
  const { chain: ch, assembler: as, dials: dl } = core;
  const entry = d.entries[index];
  const selected = entry.p;
  const key = entry.key;
  const own = as.aetheriaBlockOf(selected);
  const heading = ch.isHeading(selected);
  const choice = d.choiceOf(index);
  const isOption = Boolean(choice && choice.options.includes(index));
  const authored = !ch.isStoryBlock(selected);
  const atDepth = Number(selected.injection_position) === 1;
  const title = own ? `✦ ${own.name}` : nameOf(selected);
  const said = authored ? ch.describeBlock(selected.content) || standIn(d, selected) || '' : '';
  let eyebrow = 'The block';
  if (own) eyebrow = 'Aetheria’s block';
  else if (!authored) eyebrow = 'Filled from the story';
  else if (isOption) eyebrow = `A choice · ${choice.question}`;
  else if (heading) eyebrow = 'A heading';
  const earlier = stepFor(d, index, -1);
  const later = stepFor(d, index, 1);
  const on = selected.enabled !== false;
  const scope = `prompts.${entry.at}`;
  const out = [];

  out.push(`<header class="ps-editor-head"><div><p class="panel-sub">${esc(eyebrow)}</p><h4 class="ps-editor-title" data-live="editor-title">${esc(title)}</h4>${said ? `<p class="ps-meta">${esc(said)}</p>` : ''}</div>
    ${iconButton({ icon: 'close', label: 'Close this block', act: 'block-open', data: { key }, focus: `close:${key}` })}</header>`);

  if (isOption) {
    out.push(toggle({ checked: on, label: 'Chosen', text: 'Chosen', act: 'block-chosen', data: { key }, focus: `chosen:${key}` }),
      `<span class="field-hint ps-under-toggle">${esc(`Choosing it switches the other answers to “${choice.question}” off.`)}</span>`);
    out.push(`<div class="ps-answers" role="group" aria-label="${esc(`The answers to “${choice.question}”`)}"><p class="ps-meta">${esc(`The answers to “${choice.question}”`)}</p>
      ${choice.options.map((i) => {
        const k = d.entries[i].key;
        return `<button type="button" class="ps-answer${i === index ? ' is-current' : ''}" data-act="block-open-keep" data-key="${esc(k)}"${i === index ? ' aria-current="true"' : ''} data-focus="answer:${esc(k)}"><span>${esc(nameOf(d.chain[i]))}</span>${d.chain[i].enabled !== false ? '<span class="ps-answer-on">chosen</span>' : ''}</button>`;
      }).join('')}</div>`);
  } else {
    out.push(toggle({ checked: on, label: 'On', text: 'On', act: 'block-toggle', data: { key }, focus: `on:${key}` }),
      `<span class="field-hint ps-under-toggle">${esc(heading ? 'A heading: the preset names the group under it with this block. Switched off, its own text is not sent.' : 'Switched off, it is not sent.')}</span>`);
  }

  if (own) out.push(`<p class="ps-body">${esc(`${own.hint} Aetheria fills this block each turn; move it, send it in the chat at a depth, or switch it off.`)}</p>`);
  if (!own && selected.marker) {
    out.push(`<p class="ps-body">${esc(`This is a marker. It holds a place in the order: ${(FILLED_WITH[as.blockKindOf(selected.identifier)] || 'what it stands for').toLowerCase()} is put here when the preset is sent, rather than text written in the preset.`)}</p>`);
  }

  if (d.stMode && authored && !own) out.push(blockWhenHtml(app, selected, `block:${key}`));

  if (d.stMode && kindIsPlaceable(selected)) {
    out.push(`<div class="ps-inline">
      ${field({ label: 'Sent', group: true, control: segmented({ act: 'block-sent', value: atDepth ? 'chat' : 'order', options: [{ id: 'order', label: 'In order' }, { id: 'chat', label: 'In the chat' }], data: { key }, label: 'Sent', focus: `sent:${key}` }), hint: atDepth ? 'Inside the chat: depth 0 is after the newest message, depth 2 has two messages after it.' : 'Sent where it sits in the order.' })}
      ${field({ label: 'As', control: `<select class="select" data-act="block-role" data-key="${esc(key)}" data-focus="role:${esc(key)}">${ROLES.map(([v, l]) => `<option value="${v}"${(selected.role || 'system') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` })}
    </div>`);
    if (atDepth) {
      out.push(`<div class="ps-inline">
        ${field({ label: 'Depth', control: `<input class="input mono ps-num" type="number" inputmode="numeric" min="0" max="999" value="${esc(selected.injection_depth ?? 4)}" data-act="block-depth" data-key="${esc(key)}" data-focus="depth:${esc(key)}">` })}
        ${field({ label: 'Order', hint: 'At the same depth, a higher order is sent later', control: `<input class="input mono ps-num" type="number" inputmode="numeric" value="${esc(selected.injection_order ?? 100)}" data-act="block-order" data-key="${esc(key)}" data-focus="order:${esc(key)}">` })}
      </div>`);
    }
  } else {
    out.push(meta(`Position ${selected.injection_position ?? 0} · depth ${selected.injection_depth ?? 0} · order ${selected.injection_order ?? 100}${!d.stMode ? ' · the classic builder places it by these' : ''}`));
  }

  if (authored && d.stMode && d.dials.length) {
    out.push(`<div class="ps-insert-dial"><select class="select" aria-label="Insert a dial" data-act="insert-dial" data-key="${esc(key)}" data-focus="insert:${esc(key)}">
      <option value="" selected disabled>Insert a dial…</option>
      ${d.dials.map((x) => `<option value="${esc(x.name)}">${esc(`${x.label} · {{.${x.name}}}`)}</option>`).join('')}
    </select></div>`);
  }

  if (authored) {
    const read = app.read();
    const reads = read.variables.filter((v) => v.readIn.some((b) => b.key === key)).map((v) => (v.dial ? v.dial.label : v.name));
    const sets = read.variables.filter((v) => v.setIn.some((b) => b.key === key)).map((v) => v.name);
    out.push(`<div class="ps-scope" data-scope="${esc(scope)}">
      <label class="field ps-field"><span class="field-label"><span data-live="tokens:${esc(key)}">${esc(tokensLabel(selected.content))}</span></span>
        <textarea class="textarea ps-content" data-path="content" data-kind="text" data-key="${esc(key)}" rows="10" spellcheck="true" data-focus="content:${esc(key)}">${esc(selected.content || '')}</textarea>
      </label>
      ${d.stMode && (reads.length || sets.length) ? `<div class="ps-reads"><p class="ps-meta">${esc([reads.length ? `Reads ${reads.join(', ')}` : '', sets.length ? `sets ${sets.join(', ')}` : ''].filter(Boolean).join(' · '))}</p>${button({ text: 'What it remembers', act: 'goto-remembers', cls: 'btn-ghost' })}</div>` : ''}
      <label class="field ps-field"><span class="field-label">Its name</span><input class="input" data-path="name" data-kind="text" data-key="${esc(key)}" value="${esc(selected.name || '')}" autocomplete="off" spellcheck="false" data-focus="name:${esc(key)}"></label>
    </div>`);
  }

  out.push(`<div class="ps-order-line"><p class="ps-meta">${esc(`${ordinal(index + 1)} of ${d.chain.length} in the order it is sent`)}</p>
    <div class="btn-row">${button({ text: '↑ Earlier', act: 'block-step', data: { key, dir: '-1' }, cls: 'btn-ghost', disabled: earlier == null, focus: `earlier:${key}` })}${button({ text: '↓ Later', act: 'block-step', data: { key, dir: '1' }, cls: 'btn-ghost', disabled: later == null, focus: `later:${key}` })}</div></div>`);

  if (authored) {
    const asking = app.S.confirm === `block:${key}`;
    out.push(asking
      ? `<div class="ps-confirm" role="alertdialog" aria-label="${esc(`Delete “${nameOf(selected)}”?`)}"><p><strong>${esc(`Delete “${nameOf(selected)}”?`)}</strong> Its text goes with it, and the preset no longer sends it. This cannot be undone.</p><div class="btn-row">${button({ text: 'Delete', act: 'block-delete', data: { key }, cls: 'btn-danger', focus: `del-yes:${key}` })}${button({ text: 'Cancel', act: 'ask-cancel', cls: 'btn-ghost', focus: `del-no:${key}` })}</div></div>`
      : `<div class="btn-row">${button({ text: 'Duplicate', act: 'block-dup', data: { key } })}${button({ text: 'Delete', act: 'ask', data: { ask: `block:${key}` }, cls: 'btn-danger', focus: `del:${key}` })}</div>`);
  }
  return `<div class="ps-editor" data-editor="block:${esc(key)}">${out.join('')}</div>`;
}

/* ── what the chain does ─────────────────────────────────────────────────── */

/**
 * A new block beside the chosen one, sent the same way; with none chosen,
 * just before the chat history. Beside one of a choice's answers it is a new
 * answer, after the last, switched off so the question keeps its one.
 */
export function addBlock(app) {
  const d = app.d();
  const open = app.S.open?.kind === 'block' ? d.indexOfKey(app.S.open.key) : -1;
  const choice = open >= 0 ? d.choiceOf(open) : null;
  const beside = choice ? choice.options[choice.options.length - 1] : open;
  const anchorAt = beside >= 0 ? d.entries[beside].at : d.prompts.findIndex((p) => core.assembler.blockKindOf(p.identifier) === 'history');
  const anchor = anchorAt >= 0 ? d.prompts[anchorAt] : null;
  const family = choice ? String(d.chain[choice.heading]?.identifier || '') : '';
  const named = choice && family && String(anchor?.identifier || '').startsWith(`${family}_`);
  const block = {
    identifier: named ? `${family}_${uuid().slice(0, 8)}` : uuid(),
    name: choice ? 'New answer' : 'New block',
    role: 'system',
    content: '',
    system_prompt: false,
    marker: false,
    enabled: !choice,
    injection_position: anchor ? Number(anchor.injection_position || 0) : 0,
    injection_depth: anchor?.injection_depth ?? 4,
    injection_order: anchor?.injection_order ?? 100,
  };
  const at = anchorAt < 0 ? d.prompts.length : (beside >= 0 ? anchorAt + 1 : anchorAt);
  const next = d.prompts.slice();
  next.splice(at, 0, block);
  app.S.open = { kind: 'block', key: block.identifier };
  app.setPrompts(next, { reveal: `content:${block.identifier}` });
}

export function duplicateBlock(app, key) {
  const d = app.d();
  const at = d.keys.indexOf(key);
  if (at < 0) return;
  const original = d.prompts[at];
  const index = d.indexOfKey(key);
  const isOption = d.shape.choices.some((c) => c.options.includes(index));
  const copy = {
    ...original,
    identifier: `${original.identifier || 'block'}_copy_${uuid().slice(0, 8)}`,
    name: `${original.name || original.identifier || 'Block'} (copy)`,
    enabled: isOption ? false : original.enabled,
  };
  delete copy.inPromptOrder;
  const next = d.prompts.slice();
  next.splice(at + 1, 0, copy);
  app.S.open = { kind: 'block', key: copy.identifier };
  app.setPrompts(next, { reveal: `name:${copy.identifier}` });
}

export function deleteBlock(app, key) {
  const d = app.d();
  if (app.S.open?.kind === 'block' && app.S.open.key === key) app.S.open = null;
  app.S.confirm = null;
  app.setPrompts(d.prompts.filter((_, i) => d.keys[i] !== key));
}

export function setBlock(app, key, patch, opts) {
  const d = app.d();
  app.setPrompts(d.prompts.map((p, i) => (d.keys[i] === key ? { ...p, ...patch } : p)), opts);
}

export function choose(app, headingKey, chosenKey) {
  const d = app.d();
  const choice = d.shape.choices.find((c) => d.entries[c.heading].key === headingKey);
  if (!choice) return;
  const optionKeys = choice.options.map((i) => d.entries[i].key);
  app.setPrompts(core.chain.chooseOption(d.prompts, d.keys, optionKeys, chosenKey || null));
}

/** A dial's {{.name}} put into the block's text where the cursor is. */
export function insertDial(app, key, name, textarea) {
  const d = app.d();
  const at = d.keys.indexOf(key);
  if (at < 0 || !name) return;
  const text = d.prompts[at].content || '';
  // Where the caret was, once the text has been written in; else at the end.
  const known = textarea && textarea.dataset.caret === '1' && typeof textarea.selectionStart === 'number';
  const from = known ? textarea.selectionStart : text.length;
  const to = known && typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : from;
  const macro = `{{.${name}}}`;
  const next = `${text.slice(0, from)}${macro}${text.slice(to)}`;
  d.prompts[at] = { ...d.prompts[at], content: next };
  if (textarea) {
    textarea.value = next;
    textarea.focus();
    textarea.setSelectionRange(from + macro.length, from + macro.length);
  }
  app.touch();
  app.patchBlock(key);
}

export { ICON };
