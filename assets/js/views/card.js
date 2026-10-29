import { esc, cardTile, liftTiles, richText, starSvg, download, sigilSvg, slugify } from '../ui.js';
import { loadCards, loadCardFile } from '../data.js';
import { handoff } from '../handoff.js';
import { toV2, cardStats, fmtTokens, bookEntries } from '../lib/card.js';

export async function render(main, slug, { setTitle }) {
  const cards = await loadCards();
  const entry = cards.find((c) => c.slug === slug);
  if (!entry) {
    setTitle('Card not found');
    main.innerHTML = `<div class="page"><div class="empty-state glass">${sigilSvg(slug || '?', { size: 90 })}
      <h1 class="section-title">That card isn't on the table</h1>
      <p>It may have been renamed or taken down.</p><a class="btn" href="#gallery">Back to the gallery</a></div></div>`;
    return;
  }
  setTitle(entry.name);

  let full = null;
  let error = '';
  if (entry.file) {
    try { full = await loadCardFile(entry.file); } catch (e) { error = e.message; }
  }
  const d = full ? full.data : null;
  const stats = d ? cardStats(d) : entry.stats || {};
  const greetings = d ? [d.first_mes, ...(d.alternate_greetings || [])].filter((g) => g && g.trim()) : [];
  const lore = d ? bookEntries(d) : [];
  const siblings = cards.filter((c) => c !== entry && entry.world && c.world === entry.world);
  const extLinks = [...(entry.link ? [entry.link] : []), ...(entry.links || [])];

  const tabs = d ? [
    ['greetings', `Greetings (${greetings.length})`],
    ['description', 'Description'],
    ...(lore.length ? [['lore', `Lore (${lore.length})`]] : []),
    ...(d.creator_notes || d.scenario ? [['notes', 'Notes']] : []),
  ] : [];

  main.innerHTML = `<div class="page">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#gallery">Gallery</a><span aria-hidden="true">${starSvg('star')}</span><span>${esc(entry.name)}</span></nav>
    <article class="reader">
      <div class="reader-art">
        ${cardTile({ ...entry, thumb: entry.file || entry.cover || entry.thumb }, { tag: 'div', eager: true })}
        ${entry.nsfw ? '<p class="faint" style="font-size:.95rem">Mature card. Tap the cover to unveil it.</p>' : ''}
      </div>
      <div class="reader-main">
        <header style="display:flex;flex-direction:column;gap:10px">
          ${entry.world ? `<p class="eyebrow">${starSvg('eyebrow-star')}${esc(entry.world)}</p>` : ''}
          <h1 class="reader-name">${esc(entry.name)}</h1>
          ${entry.tagline ? `<p class="reader-tagline">${esc(entry.tagline)}</p>` : ''}
          ${entry.creator ? `<p class="dim">by ${esc(entry.creator)}${d && d.character_version ? ` <span class="mono faint">v${esc(d.character_version)}</span>` : ''}</p>` : ''}
        </header>
        ${(entry.tags || []).length ? `<div class="chip-row">${entry.tags.map((t) => `<span class="chip chip-static tagline-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="statline">
          <div class="stat"><span class="stat-val">${stats.permanent ? `≈${fmtTokens(stats.permanent)}` : '·'}</span><span class="stat-label">Permanent tokens</span></div>
          <div class="stat"><span class="stat-val">${stats.greetings ?? '·'}</span><span class="stat-label">Greetings</span></div>
          <div class="stat"><span class="stat-val">${stats.lore ?? 0}</span><span class="stat-label">Lore entries</span></div>
          ${full ? `<div class="stat"><span class="stat-val">${esc(full.spec.toUpperCase())}</span><span class="stat-label">Card spec</span></div>` : ''}
        </div>
        <div class="btn-row">
          ${entry.file ? `<a class="btn btn-gilt" href="${esc(entry.file)}" download="${esc(slugify(entry.name))}.png"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>Download card</a>` : ''}
          ${d ? '<button type="button" class="btn" id="dl-json">JSON</button><button type="button" class="btn" id="to-lens">Inspect in Lens</button><button type="button" class="btn btn-ghost" id="to-forge">Open in Forge</button>' : ''}
          ${extLinks.map((l) => `<a class="btn ${entry.file ? 'btn-ghost' : 'btn-gilt'}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || 'Visit')} ↗</a>`).join('')}
        </div>
        ${error ? `<p class="error-note">The card file couldn't be read: ${esc(error)}</p>` : ''}
        ${d ? `<div>
          <div class="tabs" role="tablist" aria-label="Card contents">${tabs.map(([id, label], i) => `<button type="button" class="tab" role="tab" id="tab-${id}" aria-controls="pane-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(label)}</button>`).join('')}</div>
          <div style="padding-top:24px">
            <section id="pane-greetings" role="tabpanel" aria-labelledby="tab-greetings">
              ${greetings.map((g, i) => `<div class="greeting glass"><p class="greeting-label">${i === 0 ? 'First message' : `Alternate greeting ${i}`}</p><div class="prose">${richText(g)}</div></div>`).join('')}
            </section>
            <section id="pane-description" role="tabpanel" aria-labelledby="tab-description" hidden><div class="prose">${richText(d.description)}</div>
              ${d.personality ? `<hr class="rule" style="margin:28px 0"><p class="greeting-label">Personality</p><div class="prose">${richText(d.personality)}</div>` : ''}</section>
            ${lore.length ? `<section id="pane-lore" role="tabpanel" aria-labelledby="tab-lore" hidden><div class="lore-list">${lore.map((e) => `
              <div class="lore-item glass"><h4>${esc(e.comment || e.name || 'Untitled entry')}</h4>
                <div class="keys">${(e.keys || []).map((k) => `<span class="key">${esc(k)}</span>`).join('')}${e.constant ? '<span class="flag flag-on">Constant</span>' : ''}</div>
                <div class="prose" style="font-size:1.02rem">${richText(e.content)}</div></div>`).join('')}</div></section>` : ''}
            ${d.creator_notes || d.scenario ? `<section id="pane-notes" role="tabpanel" aria-labelledby="tab-notes" hidden>
              ${d.creator_notes ? `<p class="greeting-label">Creator's notes</p><div class="prose">${richText(d.creator_notes)}</div>` : ''}
              ${d.scenario ? `<hr class="rule" style="margin:28px 0"><p class="greeting-label">Scenario</p><div class="prose">${richText(d.scenario)}</div>` : ''}
            </section>` : ''}
          </div>
        </div>` : ''}
      </div>
    </article>
    ${siblings.length ? `<section aria-labelledby="sib-title"><div class="section-head"><h2 class="section-title" id="sib-title">Also from ${esc(entry.world)}</h2></div>
      <div class="shelf">${siblings.map((c) => cardTile(c)).join('')}</div></section>` : ''}
  </div>`;

  liftTiles(main);

  // Tabs with arrow-key support
  const tabEls = [...main.querySelectorAll('[role=tab]')];
  const select = (tab) => {
    for (const t of tabEls) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      main.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
  };
  tabEls.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabEls[(i + (e.key === 'ArrowRight' ? 1 : tabEls.length - 1)) % tabEls.length];
      select(next); next.focus();
    });
  });

  const veiled = main.querySelector('.reader-art .tile.is-veiled');
  veiled?.addEventListener('click', () => veiled.classList.add('is-revealed'));

  if (d) {
    main.querySelector('#dl-json').addEventListener('click', () => download(JSON.stringify(toV2(d), null, 2), `${slugify(entry.name)}.json`, 'application/json'));
    main.querySelector('#to-lens').addEventListener('click', () => { handoff.lens = { file: entry.file }; location.hash = 'lens'; });
    main.querySelector('#to-forge').addEventListener('click', () => { handoff.forge = { file: entry.file }; location.hash = 'forge'; });
  }
}
