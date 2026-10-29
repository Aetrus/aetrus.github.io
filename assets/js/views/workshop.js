import { pageHead } from '../ui.js';

export const ICONS = {
  forge: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><rect x="14" y="8" width="26" height="38" rx="2.5"/><rect x="18" y="12" width="18" height="18" rx="1"/><path d="M18 35h18M18 40h12"/><path d="M27 15.5c.4 3 1.6 4.2 4.6 4.6-3 .4-4.2 1.6-4.6 4.6-.4-3-1.6-4.2-4.6-4.6 3-.4 4.2-1.6 4.6-4.6Z"/></svg>',
  lens: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><circle cx="23" cy="23" r="14"/><circle cx="23" cy="23" r="9.5" stroke-dasharray="1.5 3"/><path d="m33.5 33.5 11 11"/><path d="M19 19.5h8M17 23h12M19 26.5h6"/></svg>',
  blueprints: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><rect x="8" y="9" width="38" height="36" rx="2"/><path d="M8 18h38M17 9v36" stroke-opacity=".5"/><path d="M22 24h18M22 30h12M22 36h15" stroke-dasharray="3 2.5"/></svg>',
  binder: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="M27 13c-4-3-9.5-3.6-15-2.6v29c5.5-1 11-.4 15 2.6 4-3 9.5-3.6 15-2.6v-29c-5.5-1-11-.4-15 2.6Zm0 0v29"/><path d="m19 24 3 3-3 3M35 24l-3 3 3 3"/></svg>',
  codex: '<svg class="instrument-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="M14 8h22l6 6v32H14z"/><path d="M36 8v6h6"/><path d="M20 22h3.5M20 22c-1.5 0-2 1-2 2.5v1c0 1-.6 1.5-1.5 1.5.9 0 1.5.5 1.5 1.5v1c0 1.5.5 2.5 2 2.5M33 22c1.5 0 2 1 2 2.5v1c0 1 .6 1.5 1.5 1.5-.9 0-1.5.5-1.5 1.5v1c0 1.5-.5 2.5-2 2.5M25 27h4"/></svg>',
};

export const TOOLS = [
  { id: 'forge', name: 'Card Forge', wide: true, from: 'Grimoire · character editor', text: 'Write every V2 field with macro chips at hand, crop a portrait, bind a lorebook, and press it all into a PNG that carries both chara and ccv3 data.' },
  { id: 'lens', name: 'Card Lens', wide: true, from: 'new · craft checks', text: 'Drop any card to see what is inside it: spec, chunks, a token anatomy of what rides in every prompt, and craft checks drawn from the Card Workshop doctrine.' },
  { id: 'blueprints', name: 'Blueprints', from: 'Grimoire · [[slots]]', text: 'Templates with fill-in slots. Pick one, answer the questions, and send the result to the Forge.' },
  { id: 'binder', name: 'Lorebook Binder', from: 'Grimoire · LorebookCodec', text: 'Convert standalone World Info to an embedded character_book and back, without losing a field.' },
  { id: 'codex', name: 'Macro Codex', from: 'Grimoire · macro catalogue', text: 'Every SillyTavern macro, with what it does. Tap to copy.' },
];

export async function render(main, _arg, { setTitle }) {
  setTitle('Workshop');
  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'The Workshop',
      title: 'Instruments for <em>making</em>',
      lede: "The Aetheria Grimoire's tools, rebuilt for the browser. Same formats, same macro catalogue, same lorebook codec; nothing to install.",
    })}
    <section class="instruments" aria-label="Instruments">
      ${TOOLS.map((t) => `<a class="instrument glass${t.wide ? ' wide' : ''}" href="#${t.id}">
        ${ICONS[t.id]}
        <span class="instrument-from">${t.from}</span>
        <h2>${t.name}</h2>
        <p>${t.text}</p>
        <span class="door-foot">Open <span aria-hidden="true">→</span></span>
      </a>`).join('')}
    </section>
    <aside class="privacy-note glass">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5V6Z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/></svg>
      <p>Everything here runs on your own device. Cards you open or forge never leave the browser, and drafts are kept only in this browser's local storage.</p>
    </aside>
  </div>`;
}
