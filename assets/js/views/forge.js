import { esc, pageHead, cardTile, liftTiles, toast, download, store, slugify, readFileBytes, dropZone, confirmButton, rng, hash, STAR } from '../ui.js';
import { loadCards, loadCardFile } from '../data.js';
import { take, handoff } from '../handoff.js';
import { emptyCard, normaliseCard, readCardBytes, embedCard, toV2, tokenAnatomy, craftChecks, cardStats, estTokens, fmtTokens } from '../lib/card.js';
import { MACRO_GROUPS, COMMON_MACROS } from '../lib/macros.js';
import { meterHtml } from './lens.js';

const DRAFT = 'aetheria.forge.draft';
const ART = 'aetheria.forge.art';
const clone = (o) => JSON.parse(JSON.stringify(o));

const bytesToDataUrl = (bytes) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(new Blob([bytes], { type: 'image/png' })); });
function dataUrlToBytes(url) {
  const bin = atob(url.split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const canvasToBytes = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('The image could not be drawn.'))), 'image/png'));

function newEntry(id) {
  return { keys: [], content: '', extensions: {}, enabled: true, insertion_order: 100, case_sensitive: false, name: '', id, comment: '', selective: false, secondary_keys: [], constant: false, position: 'before_char' };
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    const key = /^\d+$/.test(k) ? Number(k) : k;
    if (o[key] == null || typeof o[key] !== 'object') o[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[key];
  });
  const last = keys[keys.length - 1];
  o[/^\d+$/.test(last) ? Number(last) : last] = value;
}

/** A cover for cards without art: the card's own constellation, in the active Binding. */
async function sigilCover(name, tagline) {
  const W = 800, H = 1200;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  const ink = v('--ink-900', '#0f1217'), ink2 = v('--ink-700', '#242936'), gilt = v('--brass-300', '#ecc97f'), text = v('--ivory', '#ebe6ee');
  const bg = g.createRadialGradient(W / 2, H * 0.38, 40, W / 2, H * 0.45, H * 0.8);
  bg.addColorStop(0, ink2); bg.addColorStop(1, ink);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const R = rng(hash(name || 'card'));
  for (let i = 0; i < 420; i++) { g.globalAlpha = 0.2 + R() * 0.6; g.fillStyle = text; g.beginPath(); g.arc(R() * W, R() * H, R() * 1.4 + 0.3, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  const cx = W / 2, cy = H * 0.4;
  g.strokeStyle = gilt; g.lineWidth = 1.5; g.globalAlpha = 0.6;
  g.beginPath(); g.arc(cx, cy, 250, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.3; g.beginPath(); g.arc(cx, cy, 232, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const r1 = i % 6 ? 244 : 236; g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * 250, cy + Math.sin(a) * 250); g.stroke(); }
  const pts = Array.from({ length: 6 + Math.floor(R() * 3) }, (_, i, arr) => { const a = (i / 7) * Math.PI * 2 + R(); const r = 70 + R() * 130; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  g.globalAlpha = 0.75; g.lineWidth = 1.4; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.globalAlpha = 1; g.fillStyle = gilt;
  for (const [x, y] of pts) { g.save(); g.translate(x - 9, y - 9); g.scale(0.75, 0.75); g.fill(new Path2D(STAR)); g.restore(); }
  try { await document.fonts.load('600 84px "Cormorant Garamond"'); } catch { /* fallback font */ }
  g.fillStyle = text; g.textAlign = 'center';
  g.font = '600 84px "Cormorant Garamond", Georgia, serif';
  g.fillText(name || 'Untitled', cx, H * 0.78, W - 100);
  if (tagline) { g.globalAlpha = 0.7; g.font = 'italic 34px "EB Garamond", Georgia, serif'; g.fillText(tagline.slice(0, 60), cx, H * 0.78 + 64, W - 100); }
  return canvasToBytes(c);
}

/** Square/portrait cropper. Resolves with PNG bytes, or null if cancelled. */
function openCropper(url) {
  return new Promise((resolve) => {
    const shell = document.createElement('div');
    shell.className = 'cropper';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'Crop the portrait');
    shell.innerHTML = `<div class="cropper-card">
      <div class="section-head"><h2 class="panel-title">Crop the portrait</h2>
        <div class="chip-row" role="group" aria-label="Shape"><button type="button" class="chip" data-aspect="portrait" aria-pressed="true">2 : 3</button><button type="button" class="chip" data-aspect="square" aria-pressed="false">1 : 1</button></div></div>
      <div class="crop-stage" id="crop-stage"><canvas></canvas></div>
      <label class="field"><span class="field-label">Zoom</span><input type="range" class="range" id="crop-zoom" min="1" max="4" step="0.01" value="1"></label>
      <p class="field-hint">Drag to move the image inside the frame.</p>
      <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button><button type="button" class="btn btn-gilt" data-act="use">Use this crop</button></div>
    </div>`;
    document.body.appendChild(shell);
    const stage = shell.querySelector('#crop-stage');
    const canvas = stage.querySelector('canvas');
    const g = canvas.getContext('2d');
    const zoom = shell.querySelector('#crop-zoom');
    const img = new Image();
    let base = 1, z = 1, ox = 0, oy = 0, sw = 0, sh = 0, dpr = 1;

    const clamp = () => {
      const w = img.naturalWidth * base * z, h = img.naturalHeight * base * z;
      ox = Math.min(0, Math.max(sw - w, ox));
      oy = Math.min(0, Math.max(sh - h, oy));
    };
    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, sw, sh);
      g.drawImage(img, ox, oy, img.naturalWidth * base * z, img.naturalHeight * base * z);
    };
    const layout = () => {
      const r = stage.getBoundingClientRect();
      const cxRel = sw ? (sw / 2 - ox) / (img.naturalWidth * base * z) : 0.5;
      const cyRel = sh ? (sh / 2 - oy) / (img.naturalHeight * base * z) : 0.5;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      sw = r.width; sh = r.height;
      canvas.width = Math.round(sw * dpr); canvas.height = Math.round(sh * dpr);
      base = Math.max(sw / img.naturalWidth, sh / img.naturalHeight);
      ox = sw / 2 - cxRel * img.naturalWidth * base * z;
      oy = sh / 2 - cyRel * img.naturalHeight * base * z;
      clamp(); draw();
    };
    const zoomTo = (nz, px = sw / 2, py = sh / 2) => {
      const k = nz / z;
      ox = px - (px - ox) * k; oy = py - (py - oy) * k; z = nz;
      zoom.value = String(z); clamp(); draw();
    };
    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => { if (!drag) return; ox += e.clientX - drag.x; oy += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; clamp(); draw(); });
    stage.addEventListener('pointerup', () => { drag = null; });
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 0.93))), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoom.addEventListener('input', () => zoomTo(Number(zoom.value)));
    shell.querySelector('[role=group]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aspect]');
      if (!b) return;
      for (const x of shell.querySelectorAll('[data-aspect]')) x.setAttribute('aria-pressed', String(x === b));
      stage.classList.toggle('square', b.dataset.aspect === 'square');
      requestAnimationFrame(layout);
    });
    const close = (val) => { window.removeEventListener('resize', layout); document.removeEventListener('keydown', onKey); shell.remove(); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);
    shell.querySelector('[data-act=cancel]').addEventListener('click', () => close(null));
    shell.querySelector('[data-act=use]').addEventListener('click', async () => {
      const square = stage.classList.contains('square');
      const OW = 800, OH = square ? 800 : 1200;
      const out = document.createElement('canvas');
      out.width = OW; out.height = OH;
      const k = OW / sw;
      out.getContext('2d').drawImage(img, ox * k, oy * k, img.naturalWidth * base * z * k, img.naturalHeight * base * z * k);
      try { close(await canvasToBytes(out)); } catch (e) { toast(e.message); close(null); }
    });
    img.onload = () => { layout(); shell.querySelector('[data-act=use]').focus(); };
    img.onerror = () => { toast('That image could not be opened.'); close(null); };
    img.src = url;
  });
}

export async function render(main, _arg, { setTitle }) {
  setTitle('Card Forge');
  let d = emptyCard();
  let art = null;
  let artUrl = null;
  let banner = '';
  let v3 = store.get('aetheria.forge.v3', true);
  let lastField = null;
  let fromStore = false;

  const h = take('forge') || {};
  const saved = store.get(DRAFT);
  try {
    if (h.file) {
      const c = await loadCardFile(h.file);
      d = clone(c.data); art = c.bytes || null;
      banner = `Opened <b>${esc(d.name)}</b> from the gallery. Your edits save as a draft in this browser.`;
    } else if (h.data) {
      d = normaliseCard({ spec: 'chara_card_v2', data: clone(h.data) }).data; art = h.imageBytes || null;
      banner = h.blank ? '' : `Opened <b>${esc(d.name || 'a card')}</b>. Your edits save as a draft in this browser.`;
    } else if (saved && saved.data) {
      d = normaliseCard({ spec: 'chara_card_v2', data: saved.data }).data;
      const a = store.get(ART);
      art = a ? dataUrlToBytes(a) : null;
      fromStore = true;
    } else {
      const first = (await loadCards()).find((c) => c.file);
      if (first) {
        const c = await loadCardFile(first.file);
        d = clone(c.data); art = c.bytes || null;
        banner = `Showing <b>${esc(d.name)}</b> from the gallery as an example. Start a blank card or import your own whenever you like.`;
      }
    }
  } catch (e) { console.warn(e); }

  if (h.patch) {
    const { target, text } = h.patch;
    if (target === 'lore') {
      if (!d.character_book) d.character_book = { name: `${d.name || 'Card'} lore`, entries: [], extensions: {} };
      const e = newEntry(d.character_book.entries.length);
      e.content = text; e.comment = h.patch.title || 'New entry'; e.name = e.comment;
      d.character_book.entries.push(e);
      banner = 'Added the blueprint as a new lorebook entry. Give it keys below.';
    } else {
      d[target] = d[target] && d[target].trim() ? `${d[target].trim()}\n\n${text}` : text;
      banner = d[target] === text ? `Placed the blueprint in <b>${target === 'first_mes' ? 'the first message' : 'the description'}</b>.` : `Appended the blueprint to <b>${target === 'first_mes' ? 'the first message' : 'the description'}</b>.`;
    }
  }
  if (!d.extensions || typeof d.extensions !== 'object') d.extensions = {};
  if (!d.extensions.aetheria || typeof d.extensions.aetheria !== 'object') d.extensions.aetheria = {};

  const refreshArtUrl = () => {
    if (artUrl) URL.revokeObjectURL(artUrl);
    artUrl = art ? URL.createObjectURL(new Blob([art], { type: 'image/png' })) : null;
  };
  refreshArtUrl();

  const field = (path, label, { input = false, rows = 4, cls = '', hint = '', placeholder = '' } = {}) => {
    const val = getPath(d, path);
    const show = Array.isArray(val) ? val.join(', ') : val ?? '';
    return `<label class="field"><span class="field-label">${esc(label)}${input ? '' : `<span class="mono" data-count="${esc(path)}"></span>`}</span>
      ${input
        ? `<input class="input" id="f-${esc(path.replace(/\./g, '-'))}" data-path="${esc(path)}"${Array.isArray(val) ? ' data-list="1"' : ''} value="${esc(show)}" placeholder="${esc(placeholder)}" autocomplete="off">`
        : `<textarea class="textarea ${cls}" id="f-${esc(path.replace(/\./g, '-'))}" data-path="${esc(path)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(show)}</textarea>`}
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
  };

  const greetingsHtml = () => `
    ${field('first_mes', 'First message', { rows: 9, cls: 'tall', placeholder: 'The scene the player walks into.' })}
    ${(d.alternate_greetings || []).map((g, i) => `<div class="list-item">
      <div class="list-item-head"><p class="panel-sub">Greeting ${i + 2}</p><button type="button" class="btn btn-sm btn-ghost" data-del-greet="${i}">Remove</button></div>
      ${field(`alternate_greetings.${i}`, 'Text', { rows: 7 })}</div>`).join('')}
    <div><button type="button" class="btn btn-sm" id="add-greet">Add a greeting</button></div>`;

  const loreHtml = () => {
    const entries = (d.character_book && d.character_book.entries) || [];
    return `${d.character_book ? field('character_book.name', 'Book name', { input: true, placeholder: 'Lorebook name' }) : ''}
      ${entries.map((e, i) => `<div class="list-item">
        <div class="list-item-head"><p class="panel-sub">Entry ${i + 1}</p><button type="button" class="btn btn-sm btn-ghost" data-del-lore="${i}">Remove</button></div>
        <div class="two">${field(`character_book.entries.${i}.comment`, 'Name', { input: true, placeholder: 'What this entry is' })}${field(`character_book.entries.${i}.keys`, 'Keys', { input: true, placeholder: 'comma, separated, words' })}</div>
        ${field(`character_book.entries.${i}.content`, 'Content', { rows: 4 })}
        <div class="btn-row">
          <label class="toggle"><input type="checkbox" data-path="character_book.entries.${i}.constant" ${e.constant ? 'checked' : ''}> Constant</label>
          <label class="toggle"><input type="checkbox" data-path="character_book.entries.${i}.enabled" ${e.enabled !== false ? 'checked' : ''}> Enabled</label>
          <select class="select" style="width:auto" data-path="character_book.entries.${i}.position" aria-label="Position">
            <option value="before_char" ${e.position !== 'after_char' ? 'selected' : ''}>Before character</option>
            <option value="after_char" ${e.position === 'after_char' ? 'selected' : ''}>After character</option>
          </select>
        </div></div>`).join('')}
      <div class="btn-row"><button type="button" class="btn btn-sm" id="add-lore">Add an entry</button>${entries.length ? '<button type="button" class="btn btn-sm btn-ghost" id="lore-binder">Open in Binder</button>' : ''}</div>`;
  };

  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Workshop · Card Forge', title: 'Card <em>Forge</em>', lede: 'Every Character Card V2 field, a lorebook, and a portrait, pressed into one PNG.' })}
    </div>
    ${banner ? `<div class="banner" id="f-banner"><span>${banner}</span></div>` : ''}
    <div class="tool-grid forge-grid">
      <form class="forge-form" id="forge-form" style="display:flex;flex-direction:column;gap:14px;min-width:0" autocomplete="off" onsubmit="return false">
        <div class="macro-bar glass" id="macro-bar">
          <span class="bar-label">Insert</span>
          ${COMMON_MACROS.map((m) => `<button type="button" class="macro-chip" data-macro="${esc(m)}">${esc(m.replace('::a::b::c', '::…'))}</button>`).join('')}
          <button type="button" class="btn btn-sm btn-ghost" id="macro-all" aria-expanded="false">All macros</button>
          <div class="macro-more" id="macro-more" hidden>${MACRO_GROUPS.map((g) => `<h5>${esc(g.name)}</h5><div class="chip-row">${g.macros.map((m) => `<button type="button" class="macro-chip" data-macro="${esc(m.token)}" title="${esc(m.description)}">${esc(m.label)}</button>`).join('')}</div>`).join('')}</div>
        </div>

        <details class="fold" open><summary>Identity</summary><div class="fold-body">
          <div class="two">${field('name', 'Name', { input: true, placeholder: 'Character name' })}${field('creator', 'Creator', { input: true, placeholder: 'Your handle' })}</div>
          ${field('extensions.aetheria.tagline', 'Tagline', { input: true, placeholder: 'One line for the gallery', hint: 'Shown under the name in the gallery. Stored in extensions, so other apps ignore it.' })}
          <div class="three">${field('extensions.world', 'World', { input: true, placeholder: 'Shared world name' })}${field('character_version', 'Version', { input: true, placeholder: '1.0' })}${field('tags', 'Tags', { input: true, placeholder: 'Romance, Horror' })}</div>
        </div></details>

        <details class="fold" open><summary>Description<span class="sum-meta" data-sum="description"></span></summary><div class="fold-body">
          ${field('description', 'Description', { rows: 14, cls: 'tall', placeholder: 'Who they are, in a voice the model can learn from.', hint: 'Rides in every prompt. Need a structure? <a href="#blueprints">Fill a blueprint</a> and send it here.' })}
        </div></details>

        <details class="fold"><summary>Personality &amp; scenario</summary><div class="fold-body">
          ${field('personality', 'Personality', { rows: 3 })}
          ${field('scenario', 'Scenario', { rows: 3 })}
        </div></details>

        <details class="fold" open><summary>Greetings<span class="sum-meta" data-sum="greetings"></span></summary><div class="fold-body" id="greet-body">${greetingsHtml()}</div></details>

        <details class="fold"><summary>Example messages</summary><div class="fold-body">
          ${field('mes_example', 'Examples', { rows: 8, cls: 'mono-area', placeholder: '<START>\n{{user}}: …\n{{char}}: …', hint: 'Separate exchanges with &lt;START&gt;. Teaches voice early, then scrolls out of context.' })}
        </div></details>

        <details class="fold"><summary>Prompt overrides</summary><div class="fold-body">
          ${field('system_prompt', 'System prompt', { rows: 4, hint: 'Replaces the global system prompt. Include <span class="macro">{{original}}</span> to keep it.' })}
          ${field('post_history_instructions', 'Post-history instructions', { rows: 4, hint: 'Read after the chat history; the strongest position in the prompt.' })}
        </div></details>

        <details class="fold"${(d.character_book && d.character_book.entries.length) ? ' open' : ''}><summary>Lorebook<span class="sum-meta" data-sum="lore"></span></summary><div class="fold-body" id="lore-body">${loreHtml()}</div></details>

        <details class="fold"><summary>Creator's notes</summary><div class="fold-body">
          ${field('creator_notes', "Creator's notes", { rows: 4, hint: 'Shown to people browsing the card. Never sent to the model.' })}
        </div></details>
      </form>

      <aside class="tool-side">
        <section class="panel glass f-portrait">
          <div id="f-preview"></div>
          <div class="portrait-actions">
            <label class="btn btn-sm" style="position:relative;overflow:hidden">Choose portrait<input type="file" id="f-art" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer" aria-label="Choose a portrait image"></label>
            <button type="button" class="btn btn-sm btn-ghost" id="f-recrop" ${art ? '' : 'disabled'}>Re-crop</button>
            <button type="button" class="btn btn-sm btn-ghost" id="f-noart" ${art ? '' : 'disabled'}>Remove</button>
          </div>
          <p class="field-hint" id="f-art-note"></p>
        </section>
        <section class="panel glass f-anatomy">
          <p class="panel-sub">Token anatomy</p>
          <div id="f-meter"></div>
          <button type="button" class="btn btn-sm btn-ghost" id="f-lens"></button>
        </section>
        <section class="panel glass f-export">
          <div class="btn-row">
            <button type="button" class="btn btn-gilt" id="f-png"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>Press PNG</button>
            <button type="button" class="btn" id="f-json">JSON</button>
          </div>
          <label class="toggle"><input type="checkbox" id="f-v3" ${v3 ? 'checked' : ''}> Also write the V3 (ccv3) chunk</label>
          <hr class="rule">
          <label class="dropzone" id="f-import" style="padding:16px">
            <input type="file" accept=".png,.json,image/png,application/json" aria-label="Import a card">
            <strong style="font-size:1.1rem">Import a card</strong><small>PNG or JSON · drop or choose</small>
          </label>
          <button type="button" class="btn btn-sm btn-ghost" id="f-blank">Start a blank card</button>
          <p class="field-hint" id="f-saved"></p>
        </section>
      </aside>
    </div>
  </div>`;

  const form = main.querySelector('#forge-form');
  const $m = (s) => main.querySelector(s);

  // ── Live side panel ──
  function side() {
    const stats = cardStats(d);
    const entry = {
      slug: 'draft', name: d.name || 'Untitled card', tagline: getPath(d, 'extensions.aetheria.tagline') || '',
      world: getPath(d, 'extensions.world') || '', stats, thumb: artUrl,
    };
    $m('#f-preview').innerHTML = cardTile(entry, { tag: 'div', eager: true });
    liftTiles($m('#f-preview'));
    $m('#f-art-note').textContent = art ? '' : 'No portrait yet. The PNG will get a constellation cover drawn from the name.';
    $m('#f-meter').innerHTML = `<p class="big-number">≈${fmtTokens(stats.permanent)}<small>permanent</small></p>${meterHtml(tokenAnatomy(d))}`;
    const notes = craftChecks(d).filter((c) => c.level !== 'pass').length;
    $m('#f-lens').textContent = notes ? `${notes} craft note${notes === 1 ? '' : 's'} · inspect in Lens` : 'Craft checks clear · inspect in Lens';
    for (const el of main.querySelectorAll('[data-count]')) {
      const v = getPath(d, el.dataset.count);
      el.textContent = typeof v === 'string' && v ? `≈${fmtTokens(estTokens(v))} tk` : '';
    }
    const sum = (k, t) => { const el = main.querySelector(`[data-sum="${k}"]`); if (el) el.textContent = t; };
    sum('description', d.description ? `≈${fmtTokens(estTokens(d.description))} tk` : '');
    sum('greetings', String(stats.greetings));
    sum('lore', stats.lore ? `${stats.lore} entries` : '');
    $m('#f-recrop').disabled = !art; $m('#f-noart').disabled = !art;
  }

  // ── Saving ──
  let saveTimer;
  let artDirty = !fromStore;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = store.set(DRAFT, { data: d, at: Date.now() });
      if (artDirty) { artDirty = false; saveArt(); }
      $m('#f-saved').textContent = ok ? `Draft saved in this browser at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'This browser is not keeping drafts (private mode?). Export before you leave.';
    }, 400);
  };
  async function saveArt() {
    if (!art) { store.remove(ART); return; }
    const url = await bytesToDataUrl(art);
    if (!store.set(ART, url)) $m('#f-saved').textContent = 'The portrait is too large to keep in the draft. Export before you leave.';
  }
  let sideTimer;
  const changed = () => { clearTimeout(sideTimer); sideTimer = setTimeout(side, 180); save(); };

  form.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const path = el.dataset.path;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.list) val = String(val).split(',').map((s) => s.trim()).filter(Boolean);
    setPath(d, path, val);
    const m = path.match(/^character_book\.entries\.(\d+)\.comment$/);
    if (m) d.character_book.entries[Number(m[1])].name = val;
    changed();
  });
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.matches('select[data-path], input[type=checkbox][data-path]')) return;
    setPath(d, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value);
    changed();
  });
  form.addEventListener('focusin', (e) => { if (e.target.matches('textarea[data-path], input.input[data-path]')) lastField = e.target; });

  // ── Macros ──
  $m('#macro-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-macro]');
    if (chip) {
      const el = lastField && document.contains(lastField) ? lastField : null;
      if (!el) { toast('Click into a field first, then pick a macro.'); return; }
      const tok = chip.dataset.macro;
      const s = el.selectionStart ?? el.value.length, en = el.selectionEnd ?? el.value.length;
      el.setRangeText(tok, s, en, 'end');
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (e.target.closest('#macro-all')) {
      const more = $m('#macro-more');
      more.hidden = !more.hidden;
      $m('#macro-all').setAttribute('aria-expanded', String(!more.hidden));
    }
  });
  // keep the caret where it was when a chip is pressed
  $m('#macro-bar').addEventListener('mousedown', (e) => { if (e.target.closest('[data-macro]')) e.preventDefault(); });

  // ── Lists ──
  const redrawGreetings = () => { $m('#greet-body').innerHTML = greetingsHtml(); wireLists(); side(); };
  const redrawLore = () => { $m('#lore-body').innerHTML = loreHtml(); wireLists(); side(); };
  function wireLists() {
    $m('#add-greet').onclick = () => { d.alternate_greetings = [...(d.alternate_greetings || []), '']; redrawGreetings(); save(); main.querySelector(`[data-path="alternate_greetings.${d.alternate_greetings.length - 1}"]`)?.focus(); };
    for (const b of main.querySelectorAll('[data-del-greet]')) confirmButton(b, () => { d.alternate_greetings.splice(Number(b.dataset.delGreet), 1); redrawGreetings(); save(); }, 'Remove this greeting?');
    $m('#add-lore').onclick = () => {
      if (!d.character_book) d.character_book = { name: `${d.name || 'Card'} lore`, entries: [], extensions: {} };
      d.character_book.entries.push(newEntry(d.character_book.entries.length));
      redrawLore(); save();
      main.querySelector(`[data-path="character_book.entries.${d.character_book.entries.length - 1}.comment"]`)?.focus();
    };
    for (const b of main.querySelectorAll('[data-del-lore]')) confirmButton(b, () => { d.character_book.entries.splice(Number(b.dataset.delLore), 1); redrawLore(); save(); }, 'Remove this entry?');
    const lb = $m('#lore-binder');
    if (lb) lb.onclick = () => { handoff.binder = { json: d.character_book, name: d.name }; location.hash = 'binder'; };
  }
  wireLists();

  // ── Portrait ──
  let sourceUrl = null;
  $m('#f-art').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(f);
    const bytes = await openCropper(sourceUrl);
    if (bytes) { art = bytes; refreshArtUrl(); side(); saveArt(); toast('Portrait set'); }
  });
  $m('#f-recrop').addEventListener('click', async () => {
    const url = sourceUrl || artUrl;
    if (!url) return;
    const bytes = await openCropper(url);
    if (bytes) { art = bytes; refreshArtUrl(); side(); saveArt(); }
  });
  confirmButton($m('#f-noart'), () => { art = null; refreshArtUrl(); side(); saveArt(); }, 'Remove the portrait?');

  // ── Export / import ──
  $m('#f-v3').addEventListener('change', (e) => { v3 = e.target.checked; store.set('aetheria.forge.v3', v3); });
  $m('#f-png').addEventListener('click', async () => {
    if (!d.name.trim()) { toast('Give the card a name first.'); $m('[data-path="name"]').focus(); return; }
    try {
      const base = art || await sigilCover(d.name, getPath(d, 'extensions.aetheria.tagline'));
      download(embedCard(base, d, { v3 }), `${slugify(d.name)}.png`, 'image/png');
    } catch (e) { toast(`The PNG could not be pressed: ${e.message}`); }
  });
  $m('#f-json').addEventListener('click', () => download(JSON.stringify(toV2(d), null, 2), `${slugify(d.name || 'card')}.json`, 'application/json'));
  $m('#f-lens').addEventListener('click', () => { handoff.lens = { data: clone(d) }; location.hash = 'lens'; });

  const loadInto = (data, bytes, label, blank = false) => {
    if (artUrl) URL.revokeObjectURL(artUrl);
    handoff.forge = { data, imageBytes: bytes, blank };
    render(main, null, { setTitle }).then(() => toast(label));
  };
  dropZone($m('#f-import'), async (files) => {
    try {
      const f = files[0];
      const bytes = await readFileBytes(f);
      const parsed = readCardBytes(bytes, f.name);
      loadInto(parsed.data, parsed.container === 'png' ? bytes : null, `Imported ${parsed.data.name || f.name}`);
    } catch (e) { toast(e.message); }
  });
  confirmButton($m('#f-blank'), () => loadInto(emptyCard(), null, 'Blank card ready', true), 'Clear the Forge?');

  side();
  if (h.file || h.data || h.patch) save();
  return () => { if (artUrl) URL.revokeObjectURL(artUrl); if (sourceUrl) URL.revokeObjectURL(sourceUrl); };
}
