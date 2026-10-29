// Works: everything made here and posted publicly. Cards use the lifting tiles,
// and so does any other work with a picture of its own; the rest use folio plates.
import { esc, cardTile, liftTiles, pageHead, store, sigilSvg } from '../ui.js';
import { loadCards, loadWorks } from '../data.js';

export const TYPES = {
  card: { label: 'Cards', one: 'Card' },
  lorebook: { label: 'Lorebooks', one: 'Lorebook' },
  preset: { label: 'Presets', one: 'Preset' },
  world: { label: 'Worlds', one: 'World' },
  theme: { label: 'Themes', one: 'Theme' },
  guide: { label: 'Guides', one: 'Guide' },
  tool: { label: 'Tools', one: 'Tool' },
  other: { label: 'Other', one: 'Work' },
};

export const TYPE_ICON = {
  lorebook: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 9c-3.2-2.2-7.4-2.7-11.5-2v24c4.1-.7 8.3-.2 11.5 2 3.2-2.2 7.4-2.7 11.5-2V7c-4.1-.7-8.3-.2-11.5 2Zm0 0v24"/><path d="M12 14h4M12 18h5M24 14h4M23 18h5"/></svg>',
  preset: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 11h24M8 20h24M8 29h24"/><circle cx="14" cy="11" r="2.6"/><circle cx="25" cy="20" r="2.6"/><circle cx="18" cy="29" r="2.6"/></svg>',
  world: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="12.5"/><ellipse cx="20" cy="20" rx="12.5" ry="5"/><path d="M20 7.5c3.6 3.6 3.6 21.4 0 25M20 7.5c-3.6 3.6-3.6 21.4 0 25"/></svg>',
  theme: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="12.5"/><path d="M20 7.5v25M20 7.5a12.5 12.5 0 0 1 0 25"/><path d="M20 15c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4Z"/></svg>',
  guide: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 7h14l6 6v20H11z"/><path d="M25 7v6h6M15 18h12M15 22h12M15 26h8"/></svg>',
  tool: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="11"/><circle cx="20" cy="20" r="4.5"/><path d="M20 5v4M20 31v4M5 20h4M31 20h4"/></svg>',
  other: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 8c.8 6.3 3.7 9.2 10 10-6.3.8-9.2 3.7-10 10-.8-6.3-3.7-9.2-10-10 6.3-.8 9.2-3.7 10-10Z"/></svg>',
};

export function folioTile(w) {
  const t = TYPES[w.type] || TYPES.other;
  const meta = [w.version ? `v${w.version}` : '', w.updated || '', (w.files || []).length ? `${w.files.length} file${w.files.length === 1 ? '' : 's'}` : ''].filter(Boolean);
  // A work with its own picture is a card on the shelf, as it is in Aetheria's Library.
  if (w.thumb) {
    return cardTile({
      slug: w.slug, name: w.name, tagline: w.tagline, thumb: w.thumb, nsfw: w.nsfw, meta, world: w.world,
      eyebrow: `${t.one}${w.world ? ` · ${w.world}` : ''}`,
    }, { href: `#work-${w.slug}` });
  }
  return `<a class="folio glass" href="#work-${esc(w.slug)}" data-slug="${esc(w.slug)}" data-world="${esc(w.world || '')}">
    <span class="folio-icon">${TYPE_ICON[w.type] || TYPE_ICON.other}</span>
    <span class="folio-type">${esc(t.one)}${w.world ? ` · ${esc(w.world)}` : ''}${w.nsfw ? ' · <span class="flag">Mature</span>' : ''}</span>
    <span class="folio-name">${esc(w.name)}</span>
    ${w.tagline ? `<span class="folio-tagline">${esc(w.tagline)}</span>` : ''}
    ${meta.length ? `<span class="folio-meta">${meta.map(esc).join('<i>·</i>')}</span>` : ''}
  </a>`;
}

export async function render(main, onlyType, { setTitle }) {
  setTitle(onlyType === 'card' ? 'Cards' : 'Works');
  const [cards, works] = await Promise.all([loadCards().catch(() => []), loadWorks()]);
  const all = [...cards.map((c) => ({ ...c, type: 'card' })), ...works.map((w) => ({ ...w, type: TYPES[w.type] ? w.type : 'other' }))];
  const hasMature = all.some((c) => c.nsfw);
  const state = { q: '', type: onlyType || 'all', tags: new Set(), sort: 'featured', mature: !!store.get('aetheria.mature', false) };
  const present = Object.keys(TYPES).filter((k) => all.some((x) => x.type === k));
  const worlds = new Set(all.map((c) => c.world).filter(Boolean));

  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'Works',
      title: 'From the <em>workshop</em>',
      lede: 'Cards, lorebooks, presets and anything else made here and ready for other hands. Cards carry their lorebook inside the image: drop the PNG into Aetheria or SillyTavern.',
    })}
    <section class="gallery-controls" aria-label="Filter works">
      <div class="gallery-controls-row">
        <label class="search">
          <svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input line" id="g-q" type="search" placeholder="Search names, worlds, tags" autocomplete="off" aria-label="Search works">
        </label>
        <select class="select line" id="g-sort" aria-label="Sort">
          <option value="featured">Featured first</option>
          <option value="newest">Newest</option>
          <option value="name">By name</option>
        </select>
        ${hasMature ? `<label class="toggle"><input type="checkbox" id="g-mature" ${state.mature ? 'checked' : ''}> Unveil mature covers</label>` : ''}
      </div>
      ${present.length > 1 ? `<div class="type-row" role="tablist" aria-label="Kind of work" id="g-types">
        <button type="button" class="type-tab" role="tab" data-type="all" aria-selected="${state.type === 'all'}">All <span>${all.length}</span></button>
        ${present.map((k) => `<button type="button" class="type-tab" role="tab" data-type="${k}" aria-selected="${state.type === k}">${TYPES[k].label} <span>${all.filter((x) => x.type === k).length}</span></button>`).join('')}
      </div>` : ''}
      <div class="chip-row" id="g-tags" role="group" aria-label="Tags"></div>
      <div class="gallery-controls-row" style="justify-content:space-between">
        <span class="gallery-count" id="g-count" aria-live="polite"></span>
        ${worlds.size ? `<span class="starlines-note"><svg viewBox="0 0 34 12" aria-hidden="true"><path d="M2 10 Q17 -4 32 10"/></svg>Hover a card to see which others share its world.</span>` : ''}
      </div>
    </section>
    <div id="g-groups" class="works-groups${state.mature ? ' show-mature' : ''}"></div>
  </div>`;

  const groups = main.querySelector('#g-groups');
  const count = main.querySelector('#g-count');
  const tagRow = main.querySelector('#g-tags');

  function inType() { return all.filter((x) => state.type === 'all' || x.type === state.type); }

  function drawTags() {
    const counts = new Map();
    for (const c of inType()) for (const t of c.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    for (const t of [...state.tags]) if (!counts.has(t)) state.tags.delete(t);
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 18).map(([t]) => t);
    tagRow.innerHTML = tags.length ? `<span class="filter-label">Filter</span>${tags.map((t) => `<button type="button" class="chip" aria-pressed="${state.tags.has(t)}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}` : '';
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = inType().filter((c) => {
      if (state.tags.size && ![...state.tags].every((t) => (c.tags || []).includes(t))) return false;
      if (!q) return true;
      const hay = [c.name, c.tagline, c.world, c.creator, TYPES[c.type].one, ...(c.tags || [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    const date = (x) => String(x.added || x.updated || '');
    if (state.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (state.sort === 'newest') list = [...list].sort((a, b) => date(b).localeCompare(date(a)));
    else list = [...list].sort((a, b) => (!!b.featured - !!a.featured) || date(b).localeCompare(date(a)));
    return list;
  }

  function draw() {
    const list = filtered();
    const total = inType().length;
    count.textContent = `${list.length} of ${total} ${state.type === 'all' ? 'works' : TYPES[state.type].label.toLowerCase()}`;
    if (!list.length) {
      groups.innerHTML = `<div class="empty-state">${sigilSvg('nothing', { size: 80 })}<p>Nothing matches that. Clear a tag or try another word.</p></div>`;
      return;
    }
    const order = Object.keys(TYPES).filter((k) => list.some((x) => x.type === k));
    groups.innerHTML = order.map((k) => {
      const items = list.filter((x) => x.type === k);
      const heading = order.length > 1 || state.type === 'all' ? `<div class="section-head"><h2 class="section-title">${TYPES[k].label}</h2><span class="mono faint">${items.length}</span></div>` : '';
      return k === 'card' || items.every((x) => x.thumb)
        ? `<section class="works-group" aria-label="${TYPES[k].label}">${heading}<div class="gallery-grid" data-cards>${items.map((c, i) => (k === 'card' ? cardTile(c, { eager: i < 4 }) : folioTile(c))).join('')}<svg class="starlines" aria-hidden="true"></svg></div></section>`
        : `<section class="works-group" aria-label="${TYPES[k].label}">${heading}<div class="folio-grid">${items.map(folioTile).join('')}</div></section>`;
    }).join('');
    liftTiles(groups);
    const grid = groups.querySelector('[data-cards]');
    if (grid) wireStarlines(grid);
  }

  // Starlines: semantic links only. A card lights the cards that share its world.
  function wireStarlines(grid) {
    const svg = grid.querySelector('.starlines');
    const clear = () => { svg.innerHTML = ''; };
    const lines = (tile) => {
      const world = tile.dataset.world;
      svg.innerHTML = '';
      if (!world) return;
      const kin = [...grid.querySelectorAll('.tile')].filter((t) => t !== tile && t.dataset.world === world);
      if (!kin.length) return;
      const g = grid.getBoundingClientRect();
      const anchor = (t) => { const r = t.querySelector('.tile-art').getBoundingClientRect(); return [r.left - g.left + r.width / 2, r.top - g.top + r.height * 0.32]; };
      const [sx, sy] = anchor(tile);
      let html = '';
      for (const k of kin) {
        const [tx, ty] = anchor(k);
        const mx = (sx + tx) / 2;
        const my = Math.min(sy, ty) - Math.max(40, Math.abs(tx - sx) * 0.22);
        html += `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3.5"/>`;
      }
      svg.innerHTML = `${html}<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5"/>`;
      for (const p of svg.querySelectorAll('path')) p.style.setProperty('--len', String(Math.ceil(p.getTotalLength())));
    };
    grid.addEventListener('pointerover', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) lines(t); });
    grid.addEventListener('pointerout', (e) => { const t = e.target.closest('.tile'); if (t && !t.contains(e.relatedTarget)) clear(); });
    grid.addEventListener('focusin', (e) => { const t = e.target.closest('.tile'); if (t) lines(t); });
    grid.addEventListener('focusout', clear);
  }

  // Veiled covers reveal on the first tap instead of navigating.
  groups.addEventListener('click', (e) => {
    const t = e.target.closest('.tile.is-veiled');
    if (!t || groups.classList.contains('show-mature') || t.classList.contains('is-revealed')) return;
    e.preventDefault();
    t.classList.add('is-revealed');
  });

  main.querySelector('#g-q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  main.querySelector('#g-sort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });
  main.querySelector('#g-mature')?.addEventListener('change', (e) => {
    state.mature = e.target.checked; store.set('aetheria.mature', state.mature);
    groups.classList.toggle('show-mature', state.mature);
  });
  main.querySelector('#g-types')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    state.type = b.dataset.type;
    for (const x of main.querySelectorAll('[data-type]')) x.setAttribute('aria-selected', String(x === b));
    drawTags(); draw();
  });
  tagRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (!b) return;
    const t = b.dataset.tag;
    if (state.tags.has(t)) state.tags.delete(t); else state.tags.add(t);
    b.setAttribute('aria-pressed', String(state.tags.has(t)));
    draw();
  });
  drawTags();
  draw();
}
