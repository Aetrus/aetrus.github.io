import { esc, starSvg, sigilSvg, cardTile, liftTiles, toast } from '../ui.js';
import { loadWorks, loadCards, getJSON } from '../data.js';
import { handoff } from '../handoff.js';
import { markdown } from '../lib/markdown.js';
import { TYPES, TYPE_ICON, folioTile } from './gallery.js';

export async function render(main, slug, { setTitle }) {
  const [works, cards] = await Promise.all([loadWorks(), loadCards().catch(() => [])]);
  const w = works.find((x) => x.slug === slug);
  if (!w) {
    setTitle('Not found');
    main.innerHTML = `<div class="page"><div class="empty-state glass">${sigilSvg(slug || '?', { size: 90 })}
      <h1 class="section-title">That isn't on the shelf</h1><p>It may have been renamed or taken down.</p><a class="btn" href="#works">Back to Works</a></div></div>`;
    return;
  }
  setTitle(w.name);
  const t = TYPES[w.type] || TYPES.other;
  const files = w.files || [];
  const links = w.links || [];
  const kin = w.world ? [...cards.filter((c) => c.world === w.world), ...works.filter((x) => x !== w && x.world === w.world)] : [];

  main.innerHTML = `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#works">Works</a><span aria-hidden="true">${starSvg('star')}</span><span>${esc(w.name)}</span></nav>
    <article class="reader">
      <div class="reader-art">
        <div class="folio-hero glass">
          <span class="folio-hero-icon">${TYPE_ICON[w.type] || TYPE_ICON.other}</span>
          <span class="folio-type">${esc(t.one)}${w.version ? ` · v${esc(w.version)}` : ''}</span>
        </div>
      </div>
      <div class="reader-main">
        <header style="display:flex;flex-direction:column;gap:10px">
          ${w.world ? `<p class="eyebrow">${starSvg('eyebrow-star')}${esc(w.world)}</p>` : `<p class="eyebrow">${starSvg('eyebrow-star')}${esc(t.one)}</p>`}
          <h1 class="reader-name">${esc(w.name)}</h1>
          ${w.tagline ? `<p class="reader-tagline">${esc(w.tagline)}</p>` : ''}
        </header>
        ${(w.tags || []).length ? `<div class="chip-row">${w.tags.map((x) => `<span class="chip chip-static tagline-chip">${esc(x)}</span>`).join('')}</div>` : ''}
        <div class="statline">
          <div class="stat"><span class="stat-val">${esc(t.one)}</span><span class="stat-label">Kind</span></div>
          ${w.version ? `<div class="stat"><span class="stat-val">v${esc(w.version)}</span><span class="stat-label">Version</span></div>` : ''}
          ${w.updated ? `<div class="stat"><span class="stat-val">${esc(w.updated)}</span><span class="stat-label">Updated</span></div>` : ''}
          <div class="stat"><span class="stat-val">${files.length}</span><span class="stat-label">File${files.length === 1 ? '' : 's'}</span></div>
        </div>
        <div class="btn-row">
          ${files.map((f, i) => `<a class="btn ${i === 0 ? 'btn-gilt' : ''}" href="${esc(f.url)}" download><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>${esc(f.label || 'Download')}</a>`).join('')}
          ${w.type === 'lorebook' && files.some((f) => /\.json$/i.test(f.url)) ? '<button type="button" class="btn btn-ghost" id="w-open" data-to="lorebook">Open in the Lorebook builder</button>' : ''}
          ${w.type === 'preset' && files.some((f) => /\.json$/i.test(f.url)) ? '<button type="button" class="btn btn-ghost" id="w-open" data-to="preset">Open in the Preset builder</button>' : ''}
          ${links.map((l) => `<a class="btn btn-ghost" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}
        </div>
        ${w.description ? `<div class="prose">${markdown(w.description)}</div>` : ''}
      </div>
    </article>
    ${kin.length ? `<section aria-labelledby="kin-title" style="display:flex;flex-direction:column;gap:18px"><div class="section-head"><h2 class="section-title" id="kin-title">Also from ${esc(w.world)}</h2></div>
      <div class="shelf">${kin.map((x) => (x.type ? folioTile(x) : cardTile(x))).join('')}</div></section>` : ''}
  </div>`;
  liftTiles(main);

  main.querySelector('#w-open')?.addEventListener('click', async (e) => {
    const to = e.currentTarget.dataset.to;
    const f = files.find((x) => /\.json$/i.test(x.url));
    try {
      handoff[to] = { json: await getJSON(f.url), name: w.name };
      location.hash = to;
    } catch (err) { toast(err.message); }
  });
}
