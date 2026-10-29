import { esc, pageHead, sigilSvg, starSvg, STAR } from '../ui.js';
import { loadCreators } from '../data.js';

const avatarOf = (p, size = 88) => (p.avatar
  ? `<img class="avatar" src="${esc(p.avatar)}" alt="" width="${size}" height="${size}" loading="lazy">`
  : sigilSvg(p.name, { size }));

const linkButtons = (links = []) => links.map((l) => `<a class="btn btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('');

export async function render(main, _arg, { setTitle }) {
  setTitle('Kindred');
  const data = await loadCreators();
  const kindred = data.kindred || [];
  const lodestars = data.lodestars || [];
  const house = kindred.find((k) => k.house) || null;
  const others = kindred.filter((k) => k !== house);

  // Place everything on two rings of a star chart: kindred inside, lodestars outside.
  const placed = [];
  if (house) placed.push({ p: house, x: 50, y: 50, kind: 'house' });
  const GOLD = 2.399963;
  others.forEach((p, i) => {
    const a = -Math.PI / 2 + i * GOLD;
    const ring = 0.55 + 0.45 * ((i % 3) / 2);
    placed.push({ p, x: p.x ?? 50 + Math.cos(a) * 26 * ring, y: p.y ?? 50 + Math.sin(a) * 30 * ring, kind: 'kin' });
  });
  lodestars.forEach((p, i) => {
    const a = -Math.PI / 2 + Math.PI / lodestars.length + (i / lodestars.length) * Math.PI * 2;
    placed.push({ p, x: p.x ?? 50 + Math.cos(a) * 40, y: p.y ?? 50 + Math.sin(a) * 38, kind: 'lode' });
  });

  const shared = (a, b) => (a.tags || []).some((t) => (b.tags || []).includes(t));
  let linesSvg = '';
  for (let i = 0; i < 4; i++) linesSvg += `<ellipse class="c-grid" cx="50" cy="50" rx="${12 + i * 11}" ry="${13 + i * 11}" vector-effect="non-scaling-stroke" stroke-dasharray="${i % 2 ? '1 4' : 'none'}"/>`;
  for (let d = 0; d < 180; d += 30) {
    const a = (d * Math.PI) / 180;
    linesSvg += `<line class="c-grid" x1="${50 - Math.cos(a) * 48}" y1="${50 - Math.sin(a) * 48}" x2="${50 + Math.cos(a) * 48}" y2="${50 + Math.sin(a) * 48}" vector-effect="non-scaling-stroke"/>`;
  }
  const H = placed.find((q) => q.kind === 'house');
  for (const q of placed) {
    if (q.kind === 'kin' && H) linesSvg += `<line class="c-kin" x1="${H.x}" y1="${H.y}" x2="${q.x}" y2="${q.y}" vector-effect="non-scaling-stroke"/>`;
  }
  const kinPts = placed.filter((q) => q.kind !== 'lode');
  for (let i = 0; i < kinPts.length; i++) for (let j = i + 1; j < kinPts.length; j++) {
    if (kinPts[i].kind === 'house' || kinPts[j].kind === 'house') continue;
    if (shared(kinPts[i].p, kinPts[j].p)) linesSvg += `<line class="c-kin" stroke-opacity="0.3" x1="${kinPts[i].x}" y1="${kinPts[i].y}" x2="${kinPts[j].x}" y2="${kinPts[j].y}" vector-effect="non-scaling-stroke"/>`;
  }
  for (const q of placed) {
    if (q.kind === 'lode' && H) linesSvg += `<line class="c-link" x1="${H.x}" y1="${H.y}" x2="${q.x}" y2="${q.y}" vector-effect="non-scaling-stroke"/>`;
  }

  const starBtn = (q, i) => `<button type="button" class="chart-star${q.kind === 'house' ? ' is-house' : ''}${q.kind === 'lode' ? ' is-lodestar' : ''}" style="left:${q.x.toFixed(2)}%;top:${q.y.toFixed(2)}%" data-i="${i}" aria-pressed="false">
      <svg class="pt" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg><span class="nm">${esc(q.p.name)}</span></button>`;

  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'Kindred',
      title: 'Makers worth <em>following</em>',
      lede: 'Warm stars are creators whose work belongs beside ours. Cold stars are the lodestars every card-maker navigates by. Tap any star to read it.',
    })}
    <section class="chart-wrap glass" aria-label="Star chart of creators and resources">
      <div class="chart">
        <svg class="chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${linesSvg}</svg>
        ${placed.map(starBtn).join('')}
      </div>
    </section>
    <section class="chart-detail glass" id="k-detail" aria-live="polite"></section>

    ${kindred.length ? `<section aria-labelledby="kin-title" style="display:flex;flex-direction:column;gap:18px">
      <div class="section-head"><h2 class="section-title" id="kin-title">The kindred</h2><span class="mono faint">${kindred.length} maker${kindred.length === 1 ? '' : 's'}</span></div>
      <div class="kindred-grid">${kindred.map((p) => `<article class="kin-card glass">
        <div class="kin-head">${avatarOf(p, 60)}<div><h3 class="kin-name">${esc(p.name)}</h3>${p.role ? `<p class="kin-role">${esc(p.role)}</p>` : ''}</div></div>
        ${p.blurb ? `<p class="dim">${esc(p.blurb)}</p>` : ''}
        ${(p.tags || []).length ? `<div class="chip-row">${p.tags.map((t) => `<span class="chip chip-static tagline-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="kin-links">${linkButtons(p.links)}</div>
      </article>`).join('')}</div>
    </section>` : ''}

    ${lodestars.length ? `<section aria-labelledby="ls-title" style="display:flex;flex-direction:column;gap:12px">
      <div class="section-head"><h2 class="section-title" id="ls-title">Lodestars</h2><span class="mono faint">specs, frontends, libraries</span></div>
      <div class="lodestars">${lodestars.map((l) => `<a class="lodestar" href="${esc(l.url)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>
        <span style="min-width:0"><span class="ls-kind">${esc(l.kind || '')}</span><br><span class="ls-name">${esc(l.name)}</span><br><span class="ls-blurb">${esc(l.blurb || '')}</span></span>
        <span class="ls-arrow" aria-hidden="true">↗</span></a>`).join('')}</div>
    </section>` : ''}
  </div>`;

  const detail = main.querySelector('#k-detail');
  const buttons = [...main.querySelectorAll('.chart-star')];
  function show(i) {
    const q = placed[i];
    if (!q) return;
    buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    const p = q.p;
    const links = q.kind === 'lode' ? [{ label: 'Visit', url: p.url }] : p.links || [];
    detail.innerHTML = `${avatarOf(p, 88)}
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <p class="eyebrow">${starSvg('eyebrow-star')}${q.kind === 'house' ? 'The house' : q.kind === 'lode' ? esc(p.kind || 'Lodestar') : 'Kindred'}</p>
        <h3>${esc(p.name)}</h3>
        ${p.role ? `<p class="kin-role">${esc(p.role)}</p>` : ''}
        ${p.blurb ? `<p class="dim" style="max-width:62ch">${esc(p.blurb)}</p>` : ''}
        ${(p.tags || []).length ? `<div class="chip-row">${p.tags.map((t) => `<span class="chip chip-static tagline-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="btn-row">${linkButtons(links)}</div>
      </div>`;
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => show(i)));
  if (placed.length) show(0);
  else detail.innerHTML = '<p class="dim">No stars charted yet.</p>';
}
