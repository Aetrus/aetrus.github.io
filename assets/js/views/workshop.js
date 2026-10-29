import { pageHead, starSvg } from '../ui.js';

export const ICONS = {
  character: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><rect x="14" y="8" width="26" height="38" rx="2.5"/><rect x="18" y="12" width="18" height="18" rx="1"/><path d="M18 35h18M18 40h12"/><path d="M27 15.5c.4 3 1.6 4.2 4.6 4.6-3 .4-4.2 1.6-4.6 4.6-.4-3-1.6-4.2-4.6-4.6 3-.4 4.2-1.6 4.6-4.6Z"/></svg>',
  preset: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="M10 15h34M10 27h34M10 39h34" stroke-opacity=".55"/><circle cx="20" cy="15" r="4"/><circle cx="35" cy="27" r="4"/><circle cx="25" cy="39" r="4"/><path d="M44 9v6M44 33v12" stroke-opacity=".35"/></svg>',
  lorebook: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="M27 13c-4-3-9.5-3.6-15-2.6v29c5.5-1 11-.4 15 2.6 4-3 9.5-3.6 15-2.6v-29c-5.5-1-11-.4-15 2.6Zm0 0v29"/><path d="M16 19h6M16 24h7M32 19h6M31 24h7" stroke-opacity=".55"/><path d="M34.5 29.5c.3 2 1.1 2.8 3.1 3.1-2 .3-2.8 1.1-3.1 3.1-.3-2-1.1-2.8-3.1-3.1 2-.3 2.8-1.1 3.1-3.1Z"/></svg>',
  world: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="18"/><path d="M9 27h36M27 9c5.5 5 5.5 31 0 36M27 9c-5.5 5-5.5 31 0 36" stroke-opacity=".55"/><path d="M14 18c4 2 8 1.5 11-1s7-2 9 .5M15 36c3-2.5 7-3 10-1.5s7 1.5 10-1" stroke-opacity=".8"/></svg>',
  lens: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="23" cy="23" r="14"/><circle cx="23" cy="23" r="9.5" stroke-dasharray="1.5 3"/><path d="m33.5 33.5 11 11"/><path d="M19 19.5h8M17 23h12M19 26.5h6"/></svg>',
  blueprints: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><rect x="8" y="9" width="38" height="36" rx="2"/><path d="M8 18h38M17 9v36" stroke-opacity=".5"/><path d="M22 24h18M22 30h12M22 36h15" stroke-dasharray="3 2.5"/></svg>',
  codex: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="M14 8h22l6 6v32H14z"/><path d="M36 8v6h6"/><path d="M20 22h3.5M20 22c-1.5 0-2 1-2 2.5v1c0 1-.6 1.5-1.5 1.5.9 0 1.5.5 1.5 1.5v1c0 1.5.5 2.5 2 2.5M33 22c1.5 0 2 1 2 2.5v1c0 1 .6 1.5 1.5 1.5-.9 0-1.5.5-1.5 1.5v1c0 1.5-.5 2.5-2 2.5M25 27h4"/></svg>',
};
ICONS.forge = ICONS.character;
ICONS.binder = ICONS.lorebook;

/** Aetheria's own builders, ported from Aetheria Experimental (everything but the parts that ask a model). */
export const BUILDERS = [
  { id: 'character', name: 'Character', from: 'Aetheria · the character sheet', text: 'Every section of the character sheet: identity, portrait and motion, personality, living pages, greetings, voice and group behaviour, with the live card beside it. Exports as PNG, CHARX or JSON.' },
  { id: 'preset', name: 'Preset', from: 'Aetheria · the preset sheet', text: 'The prompt chain in the order it is really sent, with dials, panels, scripts and styles. Read the assembled request for a sample character, then export it for SillyTavern.' },
  { id: 'lorebook', name: 'Lorebook', from: 'Aetheria · the lorebook sheet', text: 'A volume, its entry tree and every activation setting, with a test that shows which entries fire for a few lines of story, and why.' },
  { id: 'world', name: 'World', from: 'Aetheria · the Ages engine', text: 'Write a world’s book by hand, bake it into land and water, then read and shape the map, keep its worldbook, and carry it home as an .aetheria-age file.' },
];

export const TOOLS = [
  { id: 'lens', name: 'Card Lens', from: 'Archive · craft checks', text: 'Drop any card to see what is inside it: spec, chunks, a token anatomy of what rides in every prompt, and craft checks from the Card Workshop doctrine.' },
  { id: 'blueprints', name: 'Blueprints', from: 'Grimoire · [[slots]]', text: 'Templates with fill-in slots. Pick one, answer the questions, and send the result to the Character builder.' },
  { id: 'codex', name: 'Macro Codex', from: 'Grimoire · macro catalogue', text: 'Every SillyTavern macro, with what it does. Tap to copy.' },
];

const tile = (t, wide) => `<a class="instrument glass${wide ? ' wide' : ''}" href="#${t.id}">
  ${ICONS[t.id]}
  <span class="instrument-from">${t.from}</span>
  <h2>${t.name}</h2>
  <p>${t.text}</p>
  <span class="door-foot">Open <span aria-hidden="true">→</span></span>
</a>`;

export async function render(main, _arg, { setTitle }) {
  setTitle('Workshop');
  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'The Workshop',
      title: 'Builders &amp; <em>instruments</em>',
      lede: 'Aetheria’s own builders for characters, presets, lorebooks and worlds, running in your browser with nothing to install. Anything that asks a model to write stays in Aetheria.',
    })}
    <section class="workshop-group" aria-labelledby="ws-builders">
      <div class="section-head"><h2 class="section-title" id="ws-builders">${starSvg('eyebrow-star')}The builders</h2><span class="section-link faint">From Aetheria Experimental</span></div>
      <div class="instruments">${BUILDERS.map((t) => tile(t, true)).join('')}</div>
    </section>
    <section class="workshop-group" aria-labelledby="ws-tools">
      <div class="section-head"><h2 class="section-title" id="ws-tools">${starSvg('eyebrow-star')}Instruments</h2></div>
      <div class="instruments">${TOOLS.map((t) => tile(t, false)).join('')}</div>
    </section>
    <aside class="privacy-note glass">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/></svg>
      <p>Everything here runs on your own device. Nothing you open or build is uploaded; drafts and worlds stay in this browser until you export them.</p>
    </aside>
  </div>`;
}
