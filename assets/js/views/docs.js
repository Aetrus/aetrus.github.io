// The docs: the pages Aetheria's own guide answers from (tools/docs writes
// data/docs.json from them), one page at a time, with the shots of the rooms
// they describe.
import { esc, pageHead, starSvg, shotViewer } from '../ui.js';
import { loadDocs } from '../data.js';

// What is on screen is quoted in the pages ("Begin with these"); it is shown as a label.
const inline = (text) => esc(text)
  .replace(/&quot;((?:(?!&quot;).){1,80}?)&quot;/g, '<span class="label">“$1”</span>')
  .replace(/→/g, '<span class="faint">→</span>');

const figure = (f, page) => `<button type="button" class="docs-figure" data-shot="docs" data-src="${esc(f.src)}" data-caption="${esc(f.alt)}" data-credit="${esc(page.title)}"${f.phone ? ' style="max-width:280px"' : ''}><img src="${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy"></button>`;

function pageHtml(page) {
  const figs = [...page.figures];
  const placed = (heading) => {
    const at = figs.findIndex((f) => f.after === heading);
    return at < 0 ? '' : figure(figs.splice(at, 1)[0], page);
  };
  const lead = figs.find((f) => !f.after);
  if (lead) figs.splice(figs.indexOf(lead), 1);
  const blocks = page.blocks.map((b) => {
    if (b.type === 'h') return `<h2 id="${esc(page.id)}-${esc(b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(b.text)}</h2>${placed(b.text)}`;
    if (b.type === 'ul' || b.type === 'ol') return `<${b.type}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${b.type}>`;
    return `<p>${inline(b.text)}</p>`;
  }).join('');
  return `<article class="docs-page">
    <p class="eyebrow">${starSvg('eyebrow-star')}${esc(page.group)}</p>
    <h1 class="page-title">${esc(page.title)}</h1>
    <p class="docs-summary">${esc(page.summary)}</p>
    ${lead ? figure(lead, page) : ''}
    ${blocks}
    ${figs.map((f) => figure(f, page)).join('')}
  </article>`;
}

export async function render(main, arg, { setTitle }) {
  let docs;
  try { docs = await loadDocs(); } catch { docs = null; }
  if (!docs || !docs.pages?.length) { main.innerHTML = '<p class="dim">The docs could not be loaded.</p>'; return; }
  const page = docs.pages.find((p) => p.id === arg) || docs.pages[0];
  setTitle(`${page.title} · Docs`);

  const nav = docs.groups.map((g) => `<p class="docs-group">${esc(g)}</p>${docs.pages.filter((p) => p.group === g)
    .map((p) => `<a href="#docs-${esc(p.id)}" data-title="${esc(`${p.title} ${p.summary}`.toLowerCase())}"${p.id === page.id ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('')}`).join('');

  main.innerHTML = `<div class="page">
    ${pageHead({ eyebrow: 'Aetheria', title: 'The guide to <em>every room</em>', lede: 'What each part of Aetheria does, from the pages its own guide answers from. They are kept true to the app at every change, so this is what the app does now.', extra: `<p class="docs-asof">As of Aetheria ${esc(docs.version)} · written ${esc(docs.generated)}</p>` })}
    <div class="docs">
      <nav class="docs-nav" aria-label="Docs pages">
        <label class="search"><svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
          <input class="input line" id="d-q" type="search" placeholder="Find a page" autocomplete="off" aria-label="Find a page"></label>
        ${nav}
      </nav>
      ${pageHtml(page)}
    </div>
  </div>`;

  shotViewer(main);
  main.querySelector('#d-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const a of main.querySelectorAll('.docs-nav a')) a.hidden = Boolean(q) && !a.dataset.title.includes(q);
  });
}
