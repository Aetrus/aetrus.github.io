import { esc, pageHead, starSvg } from '../ui.js';
import { loadSite, loadReleases, loadCards } from '../data.js';
import { assetButtons, relDate } from './releases.js';
import { BINDINGS, applyBinding } from '../app.js';

export async function render(main, _arg, { setTitle }) {
  setTitle('Aetheria');
  const [site, cards] = await Promise.all([loadSite().catch(() => ({})), loadCards().catch(() => [])]);
  const a = site.aetheria || {};
  // The cards of the starter set that comes with the app (tools/starter-set writes them, tagged "starter").
  const starter = cards.filter((c) => c.world === 'Lantern Quay' && (c.tags || []).includes('starter'));
  const current = document.documentElement.dataset.binding;

  main.innerHTML = `<div class="page">
    ${pageHead({ eyebrow: 'Aetheria', title: 'A library you <em>handle</em>' })}
    <p class="manifesto">A physical, magical library where you craft stories by moving things around by hand. <em>Not a sterile chat window.</em></p>

    <section class="split">
      <div style="display:flex;flex-direction:column;gap:14px">
        <p class="eyebrow">${starSvg('eyebrow-star')}Get Aetheria</p>
        <h2 class="section-title">Windows &amp; Android</h2>
        <p class="dim" style="max-width:52ch">${esc(a.note || 'Builds are published as GitHub releases.')}</p>
        <div class="btn-row"><a class="btn" href="#releases">All builds &amp; patch notes</a></div>
      </div>
      <div class="panel glass" style="gap:14px" id="a-release">
        <p class="panel-sub">Downloads</p>
        <p class="dim">Checking for the newest build…</p>
      </div>
    </section>

    <section class="kinds" aria-label="The three kinds of thing">
      <div class="kind glass">
        <svg viewBox="0 0 44 44" aria-hidden="true"><rect x="11" y="6" width="22" height="32" rx="2"/><circle cx="22" cy="18" r="5"/><path d="M15 32c1.5-4 4-6 7-6s5.5 2 7 6"/></svg>
        <h3>Characters</h3><p>Cards you riffle through on a shelf, pull out, and set on the table. Every card in Works opens in Aetheria as-is.</p>
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

    ${starter.length ? `<section style="display:flex;flex-direction:column;gap:16px" aria-labelledby="a-starter">
      <p class="eyebrow">${starSvg('eyebrow-star')}Comes with Aetheria</p>
      <h2 class="section-title" id="a-starter">The starter set: Lantern Quay</h2>
      <p class="dim" style="max-width:56ch">A new archive comes with two characters of Lantern Quay, a cold harbour town that grinds the lenses for every lighthouse on the coast: Dilys Pengelly, the salvager, who owns whatever the tide brings in, and Ansel Truscott, the young master grinder whose lens is in the sea. With them come their lorebook, their world and the house storytelling preset. All of it is in Works, to download or open in the builders here.</p>
      <div class="btn-row">${starter.map((c) => `<a class="btn" href="#card-${esc(c.slug)}">${esc(c.name)}</a>`).join('')}<a class="btn btn-ghost" href="#works">All of it in Works</a></div>
    </section>` : ''}

    <section class="split">
      <div style="display:flex;flex-direction:column;gap:16px">
        <p class="eyebrow">${starSvg('eyebrow-star')}Bindings</p>
        <h2 class="section-title">One house, five bindings</h2>
        <p class="dim" style="max-width:56ch">A Binding is Aetheria's material: the ink of the ground, the gilt of its light, the colour of your own voice. It changes how the library feels, never where anything sits. This archive wears the same five. Try one.</p>
      </div>
      <div class="bindings-row" role="group" aria-label="Choose a binding">
        ${BINDINGS.map((b) => `<button type="button" class="binding-card" data-binding-choice="${b.id}" aria-pressed="${b.id === current}">
          <span class="specimen" data-specimen="${b.id}"><i></i><i></i><i></i></span>
          <span class="choice-name">${esc(b.name)}</span>
        </button>`).join('')}
      </div>
    </section>

    <section class="board-cta glass">
      <div><p class="panel-sub">Shape what comes next</p><h2 class="section-title">Requests &amp; bug reports</h2>
        <p class="dim" style="max-width:52ch">Ask for features, vote on what matters to you, and report what broke. Everything is read.</p></div>
      <div class="btn-row"><a class="btn btn-gilt" href="#board">Feature requests</a><a class="btn" href="#bugs">Bug reports</a></div>
    </section>

    <section style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <p class="eyebrow">${starSvg('eyebrow-star')}The Workshop</p>
        <h2 class="section-title">Aetheria’s builders, in the browser</h2>
        <p class="dim" style="max-width:56ch">The character, preset, lorebook and world builders from Aetheria itself, running on its own logic with nothing to install. Start something here and finish it in the app: every export opens in Aetheria as it is. The parts that ask a model to write stay in Aetheria.</p>
        <div class="btn-row"><a class="btn" href="#workshop">Open the Workshop</a></div>
      </div>
    </section>
  </div>`;

  const box = main.querySelector('#a-release');
  const repo = site.releases && site.releases.repo;
  (async () => {
    let rels = [];
    try { rels = repo ? await loadReleases(repo) : []; } catch { rels = null; }
    const latest = rels && (rels.find((r) => !r.prerelease) || rels[0]);
    box.innerHTML = latest
      ? `<p class="panel-sub">Latest build</p><h3 class="panel-title">${esc(latest.name || latest.tag_name)}</h3><p class="mono faint">${relDate(latest.published_at)}</p>${assetButtons(latest)}<a class="linkish" href="#releases">Patch notes and earlier builds →</a>`
      : `<span class="status-pill">${esc(a.status || 'In the workshop')}</span><p class="dim">${rels === null ? 'GitHub could not be reached just now.' : 'No public build yet. When one is released it appears here and on the downloads page, with its patch notes.'}</p><a class="linkish" href="#releases">Downloads page →</a>`;
  })();

  const row = main.querySelector('.bindings-row');
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-binding-choice]');
    if (b) applyBinding(b.dataset.bindingChoice);
  });
}
