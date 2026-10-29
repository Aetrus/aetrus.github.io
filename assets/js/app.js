// Aetheria Archive: shell, Bindings, and the hash router.
import { starfield } from './starfield.js';
import { $, $$, esc, store } from './ui.js';
import { loadSite } from './data.js';

export const BINDINGS = [
  { id: 'gilt', name: 'Gilt & Slate', mode: 'dark', note: 'Slate, frosted glass and gilt hairlines, with lapis for your own voice. The house.' },
  { id: 'moon', name: 'Moonlit Silver', mode: 'dark', note: 'Blue-black ink under a silver moon: pewter hairlines and ice-blue light.' },
  { id: 'verdigris', name: 'Verdigris & Brass', mode: 'dark', note: 'Green-black slate in brass and copper, leaves gone to verdigris.' },
  { id: 'blossom', name: 'Blossom & Rose Gold', mode: 'light', note: 'Blush glass over a rose-lilac morning, rose-gold hairlines. Plum ink.' },
  { id: 'plum', name: 'Plum & Blossom', mode: 'dark', note: 'Aubergine slate under a crescent moon, rose-gold hairlines, blossom-pink for your voice.' },
];

let sky = null;

export function applyBinding(id, { save = true } = {}) {
  const b = BINDINGS.find((x) => x.id === id) || BINDINGS[0];
  const root = document.documentElement;
  root.dataset.binding = b.id;
  root.dataset.mode = b.mode;
  if (save) store.set('aetheria.binding', b.id);
  for (const el of $$('[data-binding-choice]')) el.setAttribute('aria-pressed', String(el.dataset.bindingChoice === b.id));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--ink-900').trim() || '#0f1217';
  if (sky) requestAnimationFrame(() => sky.retint());
  document.dispatchEvent(new CustomEvent('binding', { detail: b }));
}

function bindingMenu() {
  const btn = $('.binding-orb');
  const menu = $('#binding-menu');
  menu.innerHTML = `<p class="menu-title">Binding</p>${BINDINGS.map((b) => `
    <button type="button" class="binding-choice" data-binding-choice="${b.id}" aria-pressed="false">
      <span class="specimen" data-specimen="${b.id}"><i></i><i></i><i></i></span>
      <span class="choice-text"><span class="choice-name">${esc(b.name)}</span><span class="choice-note">${esc(b.note)}</span></span>
    </button>`).join('')}`;
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('[aria-pressed="true"]')?.focus();
  });
  menu.addEventListener('click', (e) => {
    const c = e.target.closest('[data-binding-choice]');
    if (!c) return;
    applyBinding(c.dataset.bindingChoice);
    close();
    btn.focus();
  });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
}

// ── Router ────────────────────────────────────────────────────────────────
const VIEWS = {
  home: () => import('./views/home.js'),
  works: () => import('./views/gallery.js'),
  card: () => import('./views/card.js'),
  work: () => import('./views/work.js'),
  presets: () => import('./views/presets.js'),
  releases: () => import('./views/releases.js'),
  board: () => import('./views/board.js'),
  kindred: () => import('./views/kindred.js'),
  workshop: () => import('./views/workshop.js'),
  character: () => import('./views/builder-character.js'),
  preset: () => import('./views/builder-preset.js'),
  lorebook: () => import('./views/builder-lorebook.js'),
  world: () => import('./views/builder-world.js'),
  lens: () => import('./views/lens.js'),
  blueprints: () => import('./views/blueprints.js'),
  codex: () => import('./views/codex.js'),
  aetheria: () => import('./views/aetheria.js'),
};
const SECTION = { card: 'works', work: 'works', character: 'workshop', preset: 'workshop', lorebook: 'workshop', world: 'workshop', lens: 'workshop', blueprints: 'workshop', codex: 'workshop', releases: 'aetheria', board: 'aetheria' };
// Old names still land somewhere sensible (the Forge and Binder became the Character and Lorebook builders).
const ALIAS = { forge: 'character', binder: 'lorebook' };

function parseHash() {
  const name = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (name.startsWith('card-')) return { view: 'card', arg: name.slice(5) };
  if (name.startsWith('work-')) return { view: 'work', arg: name.slice(5) };
  if (name === 'gallery' || name === 'cards') return { view: 'works', arg: 'card' };
  if (name === 'bugs') return { view: 'board', arg: 'bug' };
  if (ALIAS[name] && VIEWS[ALIAS[name]]) return { view: ALIAS[name], arg: null };
  if (VIEWS[name]) return { view: name, arg: null };
  return { view: 'home', arg: null };
}

let cleanup = null;
let renderToken = 0;
let siteTitle = 'Aetheria Archive';

export function setTitle(t) { document.title = t ? `${t} · ${siteTitle}` : siteTitle; }

async function route() {
  const { view, arg } = parseHash();
  const token = ++renderToken;
  const main = $('#view');
  const section = SECTION[view] || view;
  for (const a of $$('[data-nav]')) {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  let mod;
  try { mod = await VIEWS[view](); } catch (e) { console.error(e); main.innerHTML = `<p class="error-note">This page failed to load. ${esc(e.message)}</p>`; return; }
  if (token !== renderToken) return;
  const swap = async () => {
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    main.dataset.view = view;
    main.innerHTML = '';
    try {
      cleanup = (await mod.render(main, arg, { setTitle })) || null;
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="page"><p class="error-note">Something went wrong drawing this page: ${esc(e.message)}</p></div>`;
    }
  };
  const first = !main.dataset.view;
  if (!first && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await document.startViewTransition(swap).updateCallbackDone.catch(() => {});
  } else {
    await swap();
  }
  if (!first) {
    window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    main.focus({ preventScroll: true });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  sky = starfield($('#sky'));
  bindingMenu();
  applyBinding(document.documentElement.dataset.binding || 'gilt', { save: false });
  $('.skip')?.addEventListener('click', (e) => { e.preventDefault(); $('#view').focus(); });
  window.addEventListener('hashchange', route);
  try {
    const site = await loadSite();
    siteTitle = site.title || siteTitle;
    const links = (site.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
    const foot = $('#colophon-links');
    if (foot) foot.innerHTML = links;
    const keeper = $('#colophon-keeper');
    if (keeper && site.keeper) keeper.textContent = site.keeper;
  } catch (e) { console.warn(e); }
  await route();
  document.documentElement.classList.add('is-ready');
}

boot();
