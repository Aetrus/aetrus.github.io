import { esc, cardTile, liftTiles, starSvg, flourish, STAR } from '../ui.js';
import { loadCards, loadCreators, loadSite, loadWorks, loadPresets } from '../data.js';

/** An original astrolabe: graduated limb, a turning rete with star pointers, and the house star at the pole. */
function astrolabe() {
  const C = 250;
  const pt = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const f = (n) => n.toFixed(1);
  let ticks = '';
  for (let d = 0; d < 360; d += 2) {
    const long = d % 30 === 0, mid = d % 10 === 0;
    const [x1, y1] = pt(236, d), [x2, y2] = pt(long ? 222 : mid ? 227 : 231, d);
    ticks += `<line class="a-tick" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-width="${long ? 1.4 : 0.7}" stroke-opacity="${long ? 1 : mid ? 0.7 : 0.4}"/>`;
  }
  let nums = '';
  for (let d = 0; d < 360; d += 30) {
    const [x, y] = pt(210, d);
    nums += `<text class="a-num" x="${f(x)}" y="${f(y + 3)}" text-anchor="middle">${String(d).padStart(3, '0')}</text>`;
  }
  // almucantars: offset circles that read as a stereographic plate
  let plate = '';
  for (let i = 1; i <= 7; i++) {
    const r = 24 + i * 22, cy = C + 30 - i * 9;
    plate += `<ellipse class="a-ring a-faint" cx="${C}" cy="${f(cy)}" rx="${r}" ry="${f(r * 0.92)}" stroke-width="0.6"/>`;
  }
  for (let d = 0; d < 180; d += 30) {
    const [x1, y1] = pt(196, d), [x2, y2] = pt(196, d + 180);
    plate += `<line class="a-ring a-faint" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke-width="0.5"/>`;
  }
  // rete: an eccentric ecliptic ring plus pointer stars
  const pointers = [[150, 18], [176, 70], [128, 122], [188, 165], [112, 214], [160, 262], [138, 310]];
  let rete = `<circle class="a-arc" cx="${C}" cy="${C - 34}" r="134"/>`;
  rete += `<circle class="a-voice" cx="${C}" cy="${C - 34}" r="122" stroke-dasharray="2 6"/>`;
  const ex = C, ey = C - 34, er = 134;
  for (const [r, d] of pointers) {
    const [x, y] = pt(r, d);
    const ang = Math.atan2(y - ey, x - ex);
    const inside = Math.hypot(x - ex, y - ey) < er;
    const bx = ex + Math.cos(ang) * er, by = ey + Math.sin(ang) * er;
    // a slim flame from the ecliptic ring out (or in) to the star it points at
    const nx = -Math.sin(ang) * 5, ny = Math.cos(ang) * 5;
    const mx = (bx + x) / 2 + nx * (inside ? -1 : 1), my = (by + y) / 2 + ny * (inside ? -1 : 1);
    rete += `<path class="a-flame" d="M${f(bx - nx * 0.6)} ${f(by - ny * 0.6)} Q${f(mx)} ${f(my)} ${f(x)} ${f(y)} Q${f(mx - nx * 0.5)} ${f(my - ny * 0.5)} ${f(bx + nx * 0.6)} ${f(by + ny * 0.6)} Z"/>`;
    rete += `<path class="a-pointer" transform="translate(${f(x - 6)} ${f(y - 6)}) scale(0.5)" d="${STAR}"/>`;
  }
  // the rete's bracing: a few struts from the ring to the pole
  for (const d of [20, 140, 260]) {
    const a = ((d - 90) * Math.PI) / 180;
    rete += `<line class="a-arc" stroke-opacity="0.45" x1="${f(ex + Math.cos(a) * er)}" y1="${f(ey + Math.sin(a) * er)}" x2="${f(C + Math.cos(a) * 16)}" y2="${f(C + Math.sin(a) * 16)}"/>`;
  }
  // the rule: a straight alidade across the face
  const [r1x, r1y] = pt(228, 40), [r2x, r2y] = pt(228, 220);
  const rule = `<g class="a-rule"><line x1="${f(r1x)}" y1="${f(r1y)}" x2="${f(r2x)}" y2="${f(r2y)}" stroke="var(--accent-deep)" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.75"/><circle cx="${f(r1x)}" cy="${f(r1y)}" r="3" fill="var(--accent)"/></g>`;
  return `<svg viewBox="0 0 500 500" role="img" aria-label="An astrolabe turning slowly">
    <defs><radialGradient id="a-halo"><stop offset="0" stop-color="var(--lumen)" stop-opacity="0.22"/><stop offset="0.6" stop-color="var(--lumen)" stop-opacity="0.05"/><stop offset="1" stop-color="var(--lumen)" stop-opacity="0"/></radialGradient></defs>
    <circle class="a-halo" cx="${C}" cy="${C}" r="250"/>
    <circle class="a-plate" cx="${C}" cy="${C}" r="238"/>
    <circle class="a-ring a-draw" pathLength="1" cx="${C}" cy="${C}" r="243" stroke-width="1.6"/>
    <circle class="a-ring a-faint a-draw" pathLength="1" cx="${C}" cy="${C}" r="238" stroke-width="0.8"/>
    ${ticks}${nums}
    <circle class="a-ring a-faint a-draw" pathLength="1" cx="${C}" cy="${C}" r="198" stroke-width="0.8"/>
    ${plate}
    <g class="a-rete-wrap"><g class="a-rete">${rete}</g>
    ${rule}</g>
    <circle class="a-ring" cx="${C}" cy="${C}" r="16" stroke-width="1"/>
    <g class="a-core"><path transform="translate(${C - 30} ${C - 30}) scale(2.5)" d="${STAR}"/></g>
  </svg>`;
}

const GLYPHS = {
  gallery: '<svg class="door-glyph" viewBox="0 0 100 100"><rect x="30" y="14" width="46" height="66" rx="4" transform="rotate(10 53 47)"/><rect x="22" y="20" width="46" height="66" rx="4"/><rect x="26" y="24" width="38" height="58" rx="2"/></svg>',
  kindred: '<svg class="door-glyph" viewBox="0 0 100 100"><path d="M14 70 34 34l24 16 28-30"/><circle cx="14" cy="70" r="3"/><circle cx="34" cy="34" r="3"/><circle cx="58" cy="50" r="3"/><circle cx="86" cy="20" r="3"/><circle cx="50" cy="50" r="44"/></svg>',
  presets: '<svg class="door-glyph" viewBox="0 0 100 100"><path d="M10 28h80M10 50h80M10 72h80"/><circle cx="30" cy="28" r="7"/><circle cx="66" cy="50" r="7"/><circle cx="44" cy="72" r="7"/></svg>',
  workshop: '<svg class="door-glyph" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="18"/><path d="M50 4v14M50 82v14M4 50h14M82 50h14M18 18l10 10M72 72l10 10M18 82l10-10M72 28l10-10"/></svg>',
};

export async function render(main, _arg, { setTitle }) {
  setTitle('');
  const [cards, creators, site, works, presetData] = await Promise.all([
    loadCards().catch(() => []),
    loadCreators().catch(() => ({ kindred: [], lodestars: [] })),
    loadSite().catch(() => ({})),
    loadWorks(),
    loadPresets().catch(() => ({ presets: [] })),
  ]);
  const presetCount = (presetData.presets || []).length;
  const workCount = cards.length + works.length;
  const shelf = [...cards].sort((a, b) => (b.featured - a.featured) || String(b.added).localeCompare(String(a.added))).slice(0, 10);
  const worlds = new Set(cards.map((c) => c.world).filter(Boolean));
  const kin = (creators.kindred || []).length;

  main.innerHTML = `<div class="page">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow rise">${starSvg('eyebrow-star')}The Aetheria Archive</p>
        <h1 class="hero-title rise rise-2"><span class="line">Characters,</span><span class="line">kindred, and</span><span class="line gilt">the instruments.</span></h1>
        <p class="hero-lede rise rise-3">${esc(site.tagline || 'Cards from the workshop, the makers worth following, and the Grimoire’s card-making tools, open right here in your browser.')}</p>
        <div class="btn-row rise rise-4">
          <a class="btn btn-gilt" href="#works">Browse the works</a>
          <a class="btn" href="#workshop">Open the workshop</a>
        </div>
        <p class="hero-meta"><span><b>${workCount}</b> work${workCount === 1 ? '' : 's'}</span><span><b>${presetCount}</b> presets credited</span><span><b>5</b> instruments</span></p>
      </div>
      <div class="astrolabe" aria-hidden="false">${astrolabe()}</div>
    </section>

    ${shelf.length ? `<section class="rise rise-3" aria-labelledby="shelf-title">
      <div class="section-head"><h2 class="section-title" id="shelf-title">On the table</h2><a class="section-link" href="#works">All works →</a></div>
      <div class="shelf" id="shelf">${shelf.map((c) => cardTile(c)).join('')}</div>
    </section>` : ''}

    <section class="epigraph" aria-label="From Aetheria's Direction">
      ${flourish('narrow')}
      <blockquote>The intuition is in handling things. <em>The table links what’s related with light.</em></blockquote>
      <cite>Aetheria · Direction</cite>
    </section>

    <section class="doors" aria-label="Sections">
      <a class="door glass" href="#works">${GLYPHS.gallery}
        <span class="door-num">I · ${workCount} works</span>
        <h2 class="door-title">Works</h2>
        <p class="door-text">Cards with their lorebooks bound in, standalone lorebooks and more. Download a card and drop it straight into Aetheria or SillyTavern.</p>
        <span class="door-foot">Enter <span aria-hidden="true">→</span></span>
      </a>
      <a class="door glass" href="#presets">${GLYPHS.presets}
        <span class="door-num">II · ${presetCount} presets</span>
        <h2 class="door-title">Presets</h2>
        <p class="door-text">The community's SillyTavern presets, traced to where each creator posted them, with a note on what each is like and full credit.</p>
        <span class="door-foot">Enter <span aria-hidden="true">→</span></span>
      </a>
      <a class="door glass" href="#kindred">${GLYPHS.kindred}
        <span class="door-num">III · ${kin} maker${kin === 1 ? '' : 's'}</span>
        <h2 class="door-title">Kindred</h2>
        <p class="door-text">A star chart of fellow creators and the open libraries where cards can be downloaded.</p>
        <span class="door-foot">Enter <span aria-hidden="true">→</span></span>
      </a>
      <a class="door glass" href="#workshop">${GLYPHS.workshop}
        <span class="door-num">IV · 5 instruments</span>
        <h2 class="door-title">Workshop</h2>
        <p class="door-text">The Grimoire's tools in the browser: forge a card, read one under the lens, fill a blueprint, bind a lorebook.</p>
        <span class="door-foot">Enter <span aria-hidden="true">→</span></span>
      </a>
    </section>
  </div>`;
  liftTiles(main);
}
