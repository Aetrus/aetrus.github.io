// Small DOM and presentation helpers shared by every view.
import { fmtTokens } from './lib/card.js';

export const STAR = 'M12 0 C12.9 7.6 16.4 11.1 24 12 C16.4 12.9 12.9 16.4 12 24 C11.1 16.4 7.6 12.9 0 12 C7.6 11.1 11.1 7.6 12 0 Z';
export const flourish = (cls = '') => `<div class="flourish ${cls}" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="${STAR}"/></svg><i></i></div>`;
export const starSvg = (cls = 'star') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function slugify(s) {
  return String(s || 'card').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'card';
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Escaped text with {{macros}} as pills and *actions* in italics, split into paragraphs. */
export function richText(text, { pills = true } = {}) {
  const safe = esc(text || '');
  const withMacros = pills ? safe.replace(/\{\{([^{}]+)\}\}/g, '<span class="macro">{{$1}}</span>') : safe;
  const withItalics = withMacros.replace(/(^|[\s(“"])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return withItalics.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function macroText(text) {
  return esc(text || '').replace(/\{\{([^{}]+)\}\}/g, '<span class="macro">{{$1}}</span>');
}

/** A deterministic constellation sigil for anything without art. */
export function sigilSvg(name, { size = 120, cls = 'sigil' } = {}) {
  const R = rng(hash(String(name || '?')));
  const n = 5 + Math.floor(R() * 3);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.9;
    const r = 18 + R() * 24;
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  const order = pts.map((p, i) => i).sort((a, b) => Math.atan2(pts[a][1] - 50, pts[a][0] - 50) - Math.atan2(pts[b][1] - 50, pts[b][0] - 50));
  const path = order.slice(0, n - (R() > 0.5 ? 1 : 0)).map((i, k) => `${k ? 'L' : 'M'}${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2; const r1 = i % 3 ? 45 : 43;
    return `M${(50 + Math.cos(a) * r1).toFixed(1)} ${(50 + Math.sin(a) * r1).toFixed(1)} L${(50 + Math.cos(a) * 47).toFixed(1)} ${(50 + Math.sin(a) * 47).toFixed(1)}`;
  }).join(' ');
  const initial = esc(String(name || '?').trim().charAt(0).toUpperCase());
  return `<svg class="${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(name)}">
    <circle cx="50" cy="50" r="48" class="sg-ground"/>
    <circle cx="50" cy="50" r="47" class="sg-ring"/>
    <path d="${ticks}" class="sg-ticks"/>
    <path d="${path}" class="sg-lines"/>
    ${pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 0 ? 2.6 : 1.6}" class="sg-star"/>`).join('')}
    <text x="50" y="57" text-anchor="middle" class="sg-initial">${initial}</text>
  </svg>`;
}

/** The card tile used in the gallery, the home shelf and the Forge preview. */
export function cardTile(c, { href = `#card-${c.slug}`, tag = 'a', eager = false } = {}) {
  const veiled = c.nsfw ? ' is-veiled' : '';
  const art = c.thumb || c.cover || c.file;
  const media = art
    ? `<img src="${esc(art)}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async">`
    : `<div class="tile-sigil">${sigilSvg(c.name, { size: 140 })}</div>`;
  const stats = c.stats || {};
  // A work with a picture comes as a card too, its own line beneath.
  const statBits = Array.isArray(c.meta) ? c.meta.filter(Boolean) : [
    stats.permanent ? `≈${fmtTokens(stats.permanent)} tk` : null,
    stats.greetings ? `${stats.greetings} greet` : null,
    stats.lore ? `${stats.lore} lore` : null,
  ].filter(Boolean);
  const attrs = tag === 'a' ? `href="${esc(href)}"` : '';
  return `<${tag} class="tile${veiled}" ${attrs} data-slug="${esc(c.slug)}" data-world="${esc(c.world || '')}">
    <span class="tile-lift">
      <span class="tile-art">${media}<span class="tile-glare"></span>${c.nsfw ? '<span class="veil-label">Mature · tap to view</span>' : ''}</span>
      <span class="tile-body">
        ${c.eyebrow || c.world ? `<span class="tile-world">${esc(c.eyebrow || c.world)}</span>` : ''}
        <span class="tile-name">${esc(c.name)}</span>
        ${c.tagline ? `<span class="tile-tagline">${esc(c.tagline)}</span>` : ''}
        ${statBits.length ? `<span class="tile-stats">${statBits.map(esc).join('<i>·</i>')}</span>` : ''}
        ${c.link && !c.file ? `<span class="tile-out">on ${esc(c.link.label || 'the web')} ↗</span>` : ''}
      </span>
      <span class="tile-corners" aria-hidden="true">${starSvg('c1')}${starSvg('c2')}${starSvg('c3')}${starSvg('c4')}</span>
    </span>
  </${tag}>`;
}

/** Pointer-driven lift and tilt for any .tile inside root. */
export function liftTiles(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const t of root.querySelectorAll('.tile')) {
    if (t.dataset.lift) continue;
    t.dataset.lift = '1';
    t.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      t.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
      t.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`);
      t.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
      t.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    t.addEventListener('pointerleave', () => {
      t.style.setProperty('--rx', '0deg');
      t.style.setProperty('--ry', '0deg');
    });
  }
}

// ── Feedback ──────────────────────────────────────────────────────────────
let toastTimer;
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `${starSvg('toast-star')}<span>${esc(message)}</span>`;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2600);
}

export async function copyText(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? label : 'Copy failed. Select the text and copy it by hand.');
    return ok;
  }
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Saved ${filename}`);
}

export const readFileBytes = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));

/** Wire a drop zone (and its inner file input) to a handler that receives File objects. */
export function dropZone(zone, onFiles) {
  const input = zone.querySelector('input[type=file]');
  if (input) input.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('is-over');
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  });
}

// ── Local storage, always optional ────────────────────────────────────────
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/** Inline confirmation: swaps a button for "Sure? Yes / Cancel" instead of a dialog. */
export function confirmButton(btn, onConfirm, question = 'Sure?') {
  btn.addEventListener('click', () => {
    if (btn.dataset.confirming) return;
    btn.dataset.confirming = '1';
    const original = btn.innerHTML;
    const wrap = document.createElement('span');
    wrap.className = 'confirm-inline';
    wrap.innerHTML = `<span>${esc(question)}</span><button type="button" class="btn btn-sm btn-danger" data-yes>Yes</button><button type="button" class="btn btn-sm btn-ghost" data-no>Cancel</button>`;
    btn.replaceWith(wrap);
    const done = () => { wrap.replaceWith(btn); btn.innerHTML = original; delete btn.dataset.confirming; };
    wrap.querySelector('[data-yes]').addEventListener('click', () => { done(); onConfirm(); });
    wrap.querySelector('[data-no]').addEventListener('click', done);
    wrap.querySelector('[data-no]').focus();
  });
}

export function pageHead({ eyebrow, title, lede, extra = '' }) {
  return `<header class="page-head">
    <p class="eyebrow">${starSvg('eyebrow-star')}${esc(eyebrow)}</p>
    <h1 class="page-title">${title}</h1>
    ${lede ? `<p class="lede">${lede}</p>` : ''}
    ${extra}
  </header>`;
}

/*
 * Pictures that open large: any [data-shot] button under `root` (with
 * data-src, data-caption and data-credit) opens one shared viewer. Arrows step
 * through the pictures of the same group; Escape or a click outside closes it.
 */
export function shotViewer(root) {
  let dialog = document.querySelector('dialog.shot-viewer');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'shot-viewer';
    dialog.innerHTML = `<figure><img alt=""><figcaption><span class="shot-caption"></span><span class="shot-credit"></span></figcaption></figure>
      <button type="button" class="shot-step" data-step="-1" aria-label="Previous picture">‹</button>
      <button type="button" class="shot-step" data-step="1" aria-label="Next picture">›</button>
      <button type="button" class="shot-close" aria-label="Close">×</button>`;
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('.shot-close')) dialog.close();
      const step = e.target.closest('[data-step]');
      if (step) dialog.step?.(Number(step.dataset.step));
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') dialog.step?.(-1);
      if (e.key === 'ArrowRight') dialog.step?.(1);
    });
  }
  const show = (btn) => {
    const group = [...root.querySelectorAll(`[data-shot="${CSS.escape(btn.dataset.shot)}"]`)];
    let at = group.indexOf(btn);
    const paint = () => {
      const b = group[at];
      dialog.querySelector('img').src = b.dataset.src;
      dialog.querySelector('img').alt = b.querySelector('img')?.alt || '';
      dialog.querySelector('.shot-caption').textContent = b.dataset.caption || '';
      dialog.querySelector('.shot-credit').innerHTML = b.dataset.credit || '';
      for (const s of dialog.querySelectorAll('.shot-step')) s.hidden = group.length < 2;
    };
    dialog.step = (d) => { at = (at + d + group.length) % group.length; paint(); };
    paint();
    if (!dialog.open) dialog.showModal();
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shot]');
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    show(btn);
  });
}
