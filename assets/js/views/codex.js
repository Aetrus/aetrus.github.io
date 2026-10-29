import { esc, pageHead, copyText } from '../ui.js';
import { MACRO_GROUPS } from '../lib/macros.js';
import { POSITIONS, SELECTIVE_LOGIC } from '../lib/lorebook.js';

const FIELDS = [
  ['description', 'Permanent', 'Who the character is. Sent with every prompt for the whole chat.'],
  ['personality', 'Permanent', 'A short summary of temperament. Many frontends fold it into the description block.'],
  ['scenario', 'Permanent', 'The situation the chat starts in.'],
  ['first_mes', 'Ephemeral', 'The opening message. It scrolls out of context as the chat grows, but it sets the register first.'],
  ['alternate_greetings', 'Ephemeral', 'Other openings the player can swipe between.'],
  ['mes_example', 'Ephemeral', 'Example dialogue, split with <START>. Teaches voice early, then falls out of context in most frontends.'],
  ['system_prompt', 'Permanent', 'Overrides the global system prompt. Use {{original}} to include the global one.'],
  ['post_history_instructions', 'Permanent', 'Placed after the chat history, so it is read last. Strong; use sparingly.'],
  ['character_book', 'Keyed', 'The embedded lorebook. Entries are injected only when their keys appear (or always, if constant).'],
  ['creator_notes', 'Not sent', 'Shown to people browsing the card. Never reaches the model.'],
];

export async function render(main, _arg, { setTitle }) {
  setTitle('Macro Codex');
  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Workshop · Macro Codex', title: 'Macro <em>Codex</em>', lede: 'SillyTavern macros, grouped as the Grimoire groups them. Tap any row to copy the macro.' })}
    </div>
    <label class="search glass" style="display:block;padding:10px;border-radius:var(--r-panel)">
      <svg viewBox="0 0 24 24" aria-hidden="true" style="left:22px"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
      <input class="input" id="cx-q" type="search" placeholder="Find a macro: time, var, random…" aria-label="Find a macro" autocomplete="off" style="padding-left:40px">
    </label>
    <div id="cx-groups" style="display:flex;flex-direction:column;gap:34px"></div>

    <hr class="rule">
    <section style="display:flex;flex-direction:column;gap:16px" aria-labelledby="cx-fields">
      <h2 class="section-title" id="cx-fields">Where each field lands</h2>
      <p class="dim" style="max-width:66ch">Permanent fields ride along in every prompt. Ephemeral fields teach early and then scroll away. Keyed fields arrive only when called. Placement is a budget decision as much as a writing one.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Field</th><th>Rent</th><th>What it does</th></tr></thead><tbody>
        ${FIELDS.map(([f, k, t]) => `<tr><td class="num">${esc(f)}</td><td><span class="flag ${k === 'Permanent' ? 'flag-on' : ''}">${esc(k)}</span></td><td class="cell-content" style="max-width:none">${esc(t)}</td></tr>`).join('')}
      </tbody></table></div>
    </section>

    <section class="two" aria-label="World Info reference">
      <div class="panel glass">
        <p class="panel-sub">World Info</p><h3 class="panel-title">Insertion positions</h3>
        <div class="table-wrap" style="border:0"><table class="data" style="min-width:0"><tbody>
          ${POSITIONS.map((p, i) => `<tr><td class="num">${i}</td><td>${esc(p)}</td><td class="num">${i === 0 ? 'before_char' : i === 1 ? 'after_char' : 'extensions'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="field-hint">V2 cards only name the first two. The Lorebook builder keeps the other positions in each entry's <code>extensions</code>, the way SillyTavern does, so they survive a round trip.</p>
      </div>
      <div class="panel glass">
        <p class="panel-sub">World Info</p><h3 class="panel-title">Selective logic</h3>
        <div class="table-wrap" style="border:0"><table class="data" style="min-width:0"><tbody>
          ${SELECTIVE_LOGIC.map((p, i) => `<tr><td class="num">${i}</td><td>${esc(p)}</td><td class="cell-content">${['Any secondary key also present', 'Every secondary key present', 'No secondary key present', 'Not all secondary keys present'][i]}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="panel-sub" style="margin-top:8px">Blueprint slots</p>
        <p class="dim" style="font-size:1rem">Write <code>[[Label: hint]]</code> anywhere in a blueprint. The label becomes a question, the hint its placeholder. A label used twice is asked once. <code>{{macros}}</code> pass through untouched.</p>
      </div>
    </section>
  </div>`;

  const holder = main.querySelector('#cx-groups');
  function draw(q = '') {
    const needle = q.trim().toLowerCase();
    const html = MACRO_GROUPS.map((g) => {
      const rows = g.macros.filter((m) => !needle || `${m.token} ${m.description} ${g.name}`.toLowerCase().includes(needle));
      if (!rows.length) return '';
      return `<section class="codex-group"><h3>${esc(g.name)} <small>${rows.length}</small></h3><div class="codex-rows">
        ${rows.map((m) => `<button type="button" class="codex-row" data-token="${esc(m.token)}"><span class="tok">${esc(m.token)}</span><span class="desc">${esc(m.description)}</span><span class="copy">Copy</span></button>`).join('')}
      </div></section>`;
    }).join('');
    holder.innerHTML = html || '<p class="dim">No macro matches that. Try a shorter word.</p>';
  }
  holder.addEventListener('click', (e) => {
    const b = e.target.closest('[data-token]');
    if (b) copyText(b.dataset.token, `Copied ${b.dataset.token}`);
  });
  main.querySelector('#cx-q').addEventListener('input', (e) => draw(e.target.value));
  draw();
}
