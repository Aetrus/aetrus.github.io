import { esc, pageHead, starSvg } from '../ui.js';
import { loadSite } from '../data.js';
import { BINDINGS, applyBinding } from '../app.js';

export async function render(main, _arg, { setTitle }) {
  setTitle('Aetheria');
  const site = await loadSite().catch(() => ({}));
  const a = site.aetheria || {};
  const current = document.documentElement.dataset.binding;

  main.innerHTML = `<div class="page">
    ${pageHead({ eyebrow: 'Aetheria', title: 'A library you <em>handle</em>' })}
    <p class="manifesto">A physical, magical library where you craft stories by moving things around by hand. <em>Not a sterile chat window.</em></p>

    <section class="kinds" aria-label="The three kinds of thing">
      <div class="kind glass">
        <svg viewBox="0 0 44 44" aria-hidden="true"><rect x="11" y="6" width="22" height="32" rx="2"/><circle cx="22" cy="18" r="5"/><path d="M15 32c1.5-4 4-6 7-6s5.5 2 7 6"/></svg>
        <h3>Characters</h3><p>Cards you riffle through on a shelf, pull out, and set on the table. Every card in the Gallery opens in Aetheria as-is.</p>
      </div>
      <div class="kind glass">
        <svg viewBox="0 0 44 44" aria-hidden="true"><path d="M22 10c-3.5-2.5-8-3-12.5-2.2v25c4.5-.8 9-.3 12.5 2.2 3.5-2.5 8-3 12.5-2.2v-25C30 7 25.5 7.5 22 10Zm0 0v25"/></svg>
        <h3>Lorebooks</h3><p>What the world knows, keyed to the words that call it up. Bound to a character, or kept as its own book.</p>
      </div>
      <div class="kind glass">
        <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="14"/><ellipse cx="22" cy="22" rx="14" ry="5.5"/><path d="M22 8c4 4 4 24 0 28M22 8c-4 4-4 24 0 28"/></svg>
        <h3>Worlds</h3><p>The ground the others stand on. Lay all three on the workbench and the table links what's related with light.</p>
      </div>
    </section>

    <section class="split">
      <div style="display:flex;flex-direction:column;gap:16px">
        <p class="eyebrow">${starSvg('eyebrow-star')}Bindings</p>
        <h2 class="section-title">One house, four bindings</h2>
        <p class="dim" style="max-width:56ch">A Binding is Aetheria's material: the ink of the ground, the gilt of its light, the colour of your own voice. It changes how the library feels, never where anything sits. This archive wears the same four. Try one.</p>
      </div>
      <div class="bindings-row" role="group" aria-label="Choose a binding">
        ${BINDINGS.map((b) => `<button type="button" class="binding-card" data-binding-choice="${b.id}" aria-pressed="${b.id === current}">
          <span class="specimen" data-specimen="${b.id}"><i></i><i></i><i></i></span>
          <span class="choice-name">${esc(b.name)}</span>
        </button>`).join('')}
      </div>
    </section>

    <section class="split">
      <div style="display:flex;flex-direction:column;gap:16px">
        <p class="eyebrow">${starSvg('eyebrow-star')}The Grimoire</p>
        <h2 class="section-title">Aetheria's companion</h2>
        <p class="dim" style="max-width:56ch">The Aetheria Grimoire is where cards get made: characters, standalone lorebooks and worldbuilding notes, cross-linked, with exports byte-compatible with SillyTavern V2. The Workshop on this site is its browser wing.</p>
        <div class="btn-row"><a class="btn" href="#workshop">Open the Workshop</a></div>
      </div>
      <div class="panel glass" style="gap:12px">
        <span class="status-pill">${esc(a.status || 'In the workshop')}</span>
        <p class="dim">${esc(a.note || 'Release links will appear here.')}</p>
        ${(a.links || []).length ? `<div class="btn-row">${a.links.map((l, i) => `<a class="btn ${i === 0 ? 'btn-gilt' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : ''}
      </div>
    </section>
  </div>`;

  const row = main.querySelector('.bindings-row');
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-binding-choice]');
    if (b) applyBinding(b.dataset.bindingChoice);
  });
}
