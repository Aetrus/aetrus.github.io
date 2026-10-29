// The Preset Archive: community SillyTavern presets, each traced to where its
// creator posted it. Nothing is re-hosted; every link goes to the creator.
import { esc, pageHead, starSvg, sigilSvg, flourish } from '../ui.js';
import { loadPresets } from '../data.js';

const handle = (p) => `${p.noU ? '' : 'u/'}${esc(p.creator || 'unknown')}`;
const by = (p) => `by ${p.creatorUrl ? `<a href="${esc(p.creatorUrl)}" target="_blank" rel="noopener">${handle(p)}</a>` : handle(p)}${p.aka ? ` <span class="faint">(${esc(p.aka)})</span>` : ''}`;

const plate = (p) => `<article class="preset glass" id="preset-${esc(p.slug)}">
  <header class="preset-head">
    <div class="preset-title"><h3 class="preset-name">${esc(p.name)}</h3>${p.version ? `<span class="preset-version">${esc(p.version)}</span>` : ''}${p.nsfw ? '<span class="flag">Mature</span>' : ''}</div>
    <p class="preset-by">${by(p)}</p>
  </header>
  ${(p.models || []).length ? `<div class="models">${p.models.map((m) => `<span class="model">${esc(m)}</span>`).join('')}</div>` : ''}
  ${(p.style || []).length ? `<p class="preset-style">${p.style.map(esc).join(' · ')}</p>` : ''}
  ${p.summary ? `<p class="preset-summary">${esc(p.summary)}</p>` : ''}
  ${(p.variants || []).length ? `<p class="preset-meta"><span>Also</span>${p.variants.map(esc).join(' · ')}</p>` : ''}
  ${(p.basedOn || []).length ? `<p class="preset-meta"><span>Built on</span>${p.basedOn.map(esc).join(' · ')}</p>` : ''}
  ${(p.notes || []).length ? `<ul class="preset-notes">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  <footer class="preset-foot">
    ${p.home ? `<a class="btn btn-sm btn-gilt" href="${esc(p.home)}" target="_blank" rel="noopener">Get it${p.homeLabel ? ` on ${esc(p.homeLabel)}` : ''} ↗</a>` : '<span class="faint">Link pending</span>'}
    ${p.updated ? `<span class="mono faint">updated ${esc(p.updated)}</span>` : ''}
  </footer>
</article>`;

const row = (p) => `<li class="listed" id="preset-${esc(p.slug)}">
  <div class="listed-main"><span class="listed-name">${esc(p.name)}</span>${p.version ? ` <span class="preset-version">${esc(p.version)}</span>` : ''}<span class="listed-by">${by(p)}</span></div>
  ${p.summary ? `<p class="listed-note">${esc(p.summary)}</p>` : ''}
  <a class="listed-link" href="${esc(p.home)}" target="_blank" rel="noopener">${p.homeLabel === 'Reddit' ? 'Creator on Reddit' : `On ${esc(p.homeLabel || 'the web')}`} ↗</a>
</li>`;

export async function render(main, _arg, { setTitle }) {
  setTitle('Preset Archive');
  let data = { source: {}, presets: [] };
  try { data = await loadPresets(); } catch { /* empty */ }
  const everyone = data.presets || [];
  const presets = everyone.filter((p) => p.catalogued !== false && !p.honorable);
  const honorable = everyone.filter((p) => p.honorable);
  const listed = everyone.filter((p) => p.catalogued === false);
  const src = data.source || {};
  const models = [...new Set(presets.flatMap((p) => p.models || []))].sort();
  const state = { q: '', model: '', sort: 'name' };

  const credit = src.url ? `<p class="source-credit">${starSvg('star')} Compiled from <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title || 'the community preset list on r/SillyTavernAI')}</a>${src.curator ? ` kept by ${esc(src.curator)}` : ''}${src.checked ? `, last checked ${esc(src.checked)}` : ''}.</p>` : '';

  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'Preset Archive',
      title: 'Presets, <em>credited</em>',
      lede: 'The SillyTavern presets people keep reaching for, each traced back to where its creator posted it, with a note on what it is like to use. Nothing is re-hosted here: every link goes to the creator, so you always get their latest version.',
      extra: credit,
    })}
    ${everyone.length ? `<section class="gallery-controls" aria-label="Filter presets">
      <div class="gallery-controls-row">
        <label class="search"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input line" id="p-q" type="search" placeholder="Search presets, creators, styles" autocomplete="off" aria-label="Search presets"></label>
        <select class="select line" id="p-sort" aria-label="Sort"><option value="name">By name</option><option value="updated">Recently updated</option><option value="creator">By creator</option></select>
      </div>
      ${models.length ? `<div class="chip-row" id="p-models" role="group" aria-label="Model"><span class="filter-label">Built for</span><button type="button" class="chip" data-model="" aria-pressed="true">Any model</button>${models.map((m) => `<button type="button" class="chip" data-model="${esc(m)}" aria-pressed="false">${esc(m)}</button>`).join('')}</div>` : ''}
      <span class="gallery-count" id="p-count" aria-live="polite"></span>
    </section>
    <section class="preset-grid" id="p-grid" aria-label="Presets"></section>
    ${honorable.length ? `<section aria-labelledby="p-hon" style="display:flex;flex-direction:column;gap:18px">
      <div class="section-head"><h2 class="section-title" id="p-hon">Honourable mentions</h2><span class="mono faint">bodies of work</span></div>
      <p class="dim" style="max-width:62ch;margin-top:-6px">Creators the list singles out for guides, libraries and presets that much of the rest builds on.</p>
      <div class="preset-grid">${honorable.map(plate).join('')}</div></section>` : ''}
    ${listed.length ? `<section aria-labelledby="p-listed" style="display:flex;flex-direction:column;gap:14px">
      <div class="section-head"><h2 class="section-title" id="p-listed">Also on the list</h2><span class="mono faint">${listed.length} presets</span></div>
      <p class="dim" style="max-width:62ch;margin-top:-6px">These are on the community list too, but nothing outside Reddit could be read to describe them yet, so they're credited without a summary. Each link goes to the creator.</p>
      <ul class="listed-list">${listed.map(row).join('')}</ul></section>` : ''}
    ${flourish('narrow')}
    <section class="credits" aria-labelledby="p-credits">
      <h2 class="section-title" id="p-credits">The creators</h2>
      <p class="dim" style="max-width:62ch">Every preset here belongs to the person who wrote it. If one of these is yours and you'd like the summary changed or the entry removed, say so on the request board.</p>
      <ul class="credit-list">${[...new Map(everyone.map((p) => [p.creator, p])).values()].sort((a, b) => String(a.creator).toLowerCase().replace(/^-/, '').localeCompare(String(b.creator).toLowerCase().replace(/^-/, ''))).map((p) => {
        const theirs = everyone.filter((x) => x.creator === p.creator).map((x) => `<a href="#presets" data-jump="${esc(x.slug)}">${esc(x.name)}</a>`).join(', ');
        return `<li><span class="credit-name">${p.creatorUrl ? `<a href="${esc(p.creatorUrl)}" target="_blank" rel="noopener">${handle(p)}</a>` : handle(p)}</span><span class="credit-works">${theirs}</span></li>`;
      }).join('')}</ul>
    </section>` : `<section class="empty-state glass">${sigilSvg('presets', { size: 90 })}
      <h2 class="section-title">The archive is being catalogued</h2>
      <p style="max-width:52ch">Each preset is being traced to its creator's own post and summarised before it goes up. Check back soon.</p></section>`}
  </div>`;

  if (!everyone.length) return;
  const grid = main.querySelector('#p-grid');
  const count = main.querySelector('#p-count');
  function draw() {
    const q = state.q.trim().toLowerCase();
    let list = presets.filter((p) => (!state.model || (p.models || []).includes(state.model))
      && (!q || [p.name, p.creator, p.summary, ...(p.style || []), ...(p.models || [])].join(' ').toLowerCase().includes(q)));
    if (state.sort === 'updated') list = [...list].sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    else if (state.sort === 'creator') list = [...list].sort((a, b) => String(a.creator).localeCompare(String(b.creator)) || a.name.localeCompare(b.name));
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    count.textContent = `${list.length} of ${presets.length} catalogued presets`;
    grid.innerHTML = list.length ? list.map(plate).join('') : '<p class="dim">No preset matches that. Try another model or word.</p>';
  }
  main.querySelector('#p-q').addEventListener('input', (e) => { state.q = e.target.value; draw(); });
  main.querySelector('#p-sort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });
  main.querySelector('#p-models')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    state.model = b.dataset.model;
    for (const x of main.querySelectorAll('[data-model]')) x.setAttribute('aria-pressed', String(x === b));
    draw();
  });
  main.querySelector('.credit-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-jump]');
    if (!a) return;
    e.preventDefault();
    state.q = ''; state.model = '';
    main.querySelector('#p-q').value = '';
    for (const x of main.querySelectorAll('[data-model]')) x.setAttribute('aria-pressed', String(x.dataset.model === ''));
    draw();
    const el = main.querySelector(`#preset-${CSS.escape(a.dataset.jump)}`);
    if (!el) return;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('is-lit');
    setTimeout(() => el?.classList.remove('is-lit'), 1600);
  });
  draw();
}
