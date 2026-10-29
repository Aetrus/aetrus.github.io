import { esc, cardTile, liftTiles, pageHead, store, sigilSvg } from '../ui.js';
import { loadCards } from '../data.js';

export async function render(main, _arg, { setTitle }) {
  setTitle('Gallery');
  const cards = await loadCards();
  const hasMature = cards.some((c) => c.nsfw);
  const state = { q: '', tags: new Set(), sort: 'featured', mature: !!store.get('aetheria.mature', false) };

  const counts = new Map();
  for (const c of cards) for (const t of c.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 18).map(([t]) => t);
  const worlds = new Set(cards.map((c) => c.world).filter(Boolean));

  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'The Gallery',
      title: 'Cards on the <em>table</em>',
      lede: 'Every card here carries its lorebook inside the image. Download the PNG and drop it into Aetheria or SillyTavern; nothing else to install.',
    })}
    <section class="gallery-controls" aria-label="Filter cards">
      <div class="gallery-controls-row">
        <label class="search">
          <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input line" id="g-q" type="search" placeholder="Search names, worlds, tags" autocomplete="off" aria-label="Search cards">
        </label>
        <select class="select line" id="g-sort" aria-label="Sort">
          <option value="featured">Featured first</option>
          <option value="newest">Newest</option>
          <option value="name">By name</option>
        </select>
        ${hasMature ? `<label class="toggle"><input type="checkbox" id="g-mature" ${state.mature ? 'checked' : ''}> Unveil mature covers</label>` : ''}
      </div>
      ${tags.length ? `<div class="chip-row" id="g-tags" role="group" aria-label="Tags"><span class="filter-label">Filter</span>${tags.map((t) => `<button type="button" class="chip" aria-pressed="false" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="gallery-controls-row" style="justify-content:space-between">
        <span class="gallery-count" id="g-count" aria-live="polite"></span>
        ${worlds.size ? `<span class="starlines-note"><svg viewBox="0 0 34 12" aria-hidden="true"><path d="M2 10 Q17 -4 32 10"/></svg>Hover a card to see which others share its world.</span>` : ''}
      </div>
    </section>
    <section class="gallery-grid${state.mature ? ' show-mature' : ''}" id="g-grid" aria-label="Cards"></section>
  </div>`;

  const grid = main.querySelector('#g-grid');
  const count = main.querySelector('#g-count');

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = cards.filter((c) => {
      if (state.tags.size && ![...state.tags].every((t) => (c.tags || []).includes(t))) return false;
      if (!q) return true;
      const hay = [c.name, c.tagline, c.world, c.creator, ...(c.tags || [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    if (state.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === 'newest') list = [...list].sort((a, b) => String(b.added).localeCompare(String(a.added)));
    else list = [...list].sort((a, b) => (b.featured - a.featured) || String(b.added).localeCompare(String(a.added)));
    return list;
  }

  function draw() {
    const list = filtered();
    count.textContent = `${list.length} of ${cards.length} card${cards.length === 1 ? '' : 's'}`;
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">${sigilSvg('nothing', { size: 80 })}<p>No cards match that. Clear a tag or try another word.</p></div>`;
      return;
    }
    grid.innerHTML = list.map((c, i) => cardTile(c, { eager: i < 4 })).join('') + '<svg class="starlines" aria-hidden="true"></svg>';
    liftTiles(grid);
  }

  // Starlines: semantic links only. A card lights the cards that share its world.
  function lines(tile) {
    const svg = grid.querySelector('.starlines');
    if (!svg) return;
    const world = tile.dataset.world;
    svg.innerHTML = '';
    if (!world) return;
    const kin = [...grid.querySelectorAll('.tile')].filter((t) => t !== tile && t.dataset.world === world);
    if (!kin.length) return;
    const g = grid.getBoundingClientRect();
    const anchor = (t) => {
      const r = t.querySelector('.tile-art').getBoundingClientRect();
      return [r.left - g.left + r.width / 2, r.top - g.top + r.height * 0.32];
    };
    const [sx, sy] = anchor(tile);
    let html = '';
    for (const k of kin) {
      const [tx, ty] = anchor(k);
      const mx = (sx + tx) / 2;
      const my = Math.min(sy, ty) - Math.max(40, Math.abs(tx - sx) * 0.22);
      html += `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3.5"/>`;
    }
    html += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5"/>`;
    svg.innerHTML = html;
    for (const p of svg.querySelectorAll('path')) p.style.setProperty('--len', String(Math.ceil(p.getTotalLength())));
  }
  const clear = () => { const svg = grid.querySelector('.starlines'); if (svg) svg.innerHTML = ''; };
  grid.addEventListener('pointerover', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) lines(t); });
  grid.addEventListener('pointerout', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) clear(); });
  grid.addEventListener('focusin', (e) => { const t = e.target.closest('.tile'); if (t) lines(t); });
  grid.addEventListener('focusout', clear);

  // Veiled covers reveal on the first tap instead of navigating.
  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile.is-veiled');
    if (!t || grid.classList.contains('show-mature') || t.classList.contains('is-revealed')) return;
    e.preventDefault();
    t.classList.add('is-revealed');
  });

  main.querySelector('#g-q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  main.querySelector('#g-sort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });
  main.querySelector('#g-mature')?.addEventListener('change', (e) => {
    state.mature = e.target.checked; store.set('aetheria.mature', state.mature);
    grid.classList.toggle('show-mature', state.mature);
  });
  main.querySelector('#g-tags')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    const t = b.dataset.tag;
    if (state.tags.has(t)) state.tags.delete(t); else state.tags.add(t);
    b.setAttribute('aria-pressed', String(state.tags.has(t)));
    draw();
  });
  draw();
}
