// Portraits for the Character builder: the old Forge's 2:3 / 1:1 cropper and its
// constellation "sigil cover", so a card always leaves with an image.
import { toast, rng, hash, STAR } from '../../ui.js';

const canvasToBytes = (canvas) => new Promise((res, rej) => canvas.toBlob(
  (b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('The image could not be drawn.'))),
  'image/png',
));

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('That image could not be opened.'));
    img.src = url;
  });
}

/** Any image blob as PNG bytes, scaled to fit within max × max·1.5 (PNG blobs pass through untouched). */
export async function toPngBytes(blob, { max = 1600 } = {}) {
  if (blob.type === 'image/png') return new Uint8Array(await blob.arrayBuffer());
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, max / img.naturalWidth, (max * 1.5) / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await canvasToBytes(c);
  } finally { URL.revokeObjectURL(url); }
}

/** A cover for a card without art: the card's own constellation, in the active Binding. */
export async function sigilCover(name, tagline = '') {
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
  const pts = Array.from({ length: 6 + Math.floor(R() * 3) }, (_, i) => { const a = (i / 7) * Math.PI * 2 + R(); const r = 70 + R() * 130; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
  g.globalAlpha = 0.75; g.lineWidth = 1.4; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  g.globalAlpha = 1; g.fillStyle = gilt;
  for (const [x, y] of pts) { g.save(); g.translate(x - 9, y - 9); g.scale(0.75, 0.75); g.fill(new Path2D(STAR)); g.restore(); }
  try { await document.fonts.load('600 84px "Cormorant Garamond"'); await document.fonts.load('italic 34px "EB Garamond"'); } catch { /* fallback font */ }
  g.fillStyle = text; g.textAlign = 'center';
  g.font = '600 84px "Cormorant Garamond", Georgia, serif';
  g.fillText(name || 'Untitled', cx, H * 0.78, W - 100);
  if (tagline) { g.globalAlpha = 0.7; g.font = 'italic 34px "EB Garamond", Georgia, serif'; g.fillText(tagline.slice(0, 60), cx, H * 0.78 + 64, W - 100); }
  return canvasToBytes(c);
}

/**
 * The portrait cropper: a 2:3 or 1:1 frame to drag and zoom the image in.
 * Resolves with PNG bytes, or null if cancelled. "Keep it whole" keeps the
 * image uncropped (scaled down if it is very large).
 */
export function openCropper(url, { shape = 'portrait' } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const shell = document.createElement('div');
    shell.className = 'cb-cropper';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-labelledby', 'cb-crop-title');
    shell.innerHTML = `<div class="cb-cropper-card">
      <div class="cb-cropper-head"><h2 class="panel-title" id="cb-crop-title">Crop the portrait</h2>
        <div class="cb-shape" role="group" aria-label="Shape">
          <button type="button" class="chip" data-aspect="portrait" aria-pressed="${shape !== 'square'}">2 : 3</button>
          <button type="button" class="chip" data-aspect="square" aria-pressed="${shape === 'square'}">1 : 1</button>
        </div></div>
      <div class="cb-crop-stage${shape === 'square' ? ' square' : ''}" tabindex="0" aria-label="The image inside the frame. Drag, or use the arrow keys, to move it."><canvas></canvas></div>
      <label class="field"><span class="field-label">Zoom</span><input type="range" class="range" data-zoom min="1" max="4" step="0.01" value="1"></label>
      <p class="field-hint">Drag to move the image inside the frame.</p>
      <div class="btn-row cb-cropper-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" data-act="whole">Keep it whole</button>
        <button type="button" class="btn btn-gilt" data-act="use">Use this crop</button>
      </div>
    </div>`;
    document.body.appendChild(shell);
    const stage = shell.querySelector('.cb-crop-stage');
    const canvas = stage.querySelector('canvas');
    const g = canvas.getContext('2d');
    const zoom = shell.querySelector('[data-zoom]');
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
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); stage.classList.add('is-dragging'); });
    stage.addEventListener('pointermove', (e) => { if (!drag) return; ox += e.clientX - drag.x; oy += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; clamp(); draw(); });
    const end = () => { drag = null; stage.classList.remove('is-dragging'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 0.93))), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 10;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) { e.preventDefault(); ox += moves[e.key][0]; oy += moves[e.key][1]; clamp(); draw(); }
      if (e.key === '+' || e.key === '=') zoomTo(Math.min(4, z * 1.08));
      if (e.key === '-') zoomTo(Math.max(1, z * 0.93));
    });
    zoom.addEventListener('input', () => zoomTo(Number(zoom.value)));
    shell.querySelector('.cb-shape').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aspect]');
      if (!b) return;
      for (const x of shell.querySelectorAll('[data-aspect]')) x.setAttribute('aria-pressed', String(x === b));
      stage.classList.toggle('square', b.dataset.aspect === 'square');
      requestAnimationFrame(layout);
    });
    const close = (val) => {
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey, true);
      shell.remove();
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); return; }
      if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const f = [...shell.querySelectorAll('button, input, [tabindex="0"]')].filter((x) => !x.disabled);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', layout);
    shell.addEventListener('click', (e) => { if (e.target === shell) close(null); });
    shell.querySelector('[data-act=cancel]').addEventListener('click', () => close(null));
    shell.querySelector('[data-act=whole]').addEventListener('click', async () => {
      try {
        const k = Math.min(1, 1600 / img.naturalWidth, 2400 / img.naturalHeight);
        const out = document.createElement('canvas');
        out.width = Math.round(img.naturalWidth * k); out.height = Math.round(img.naturalHeight * k);
        out.getContext('2d').drawImage(img, 0, 0, out.width, out.height);
        close(await canvasToBytes(out));
      } catch (e) { toast(e.message); close(null); }
    });
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

export const pngUrl = (bytes) => (bytes ? URL.createObjectURL(new Blob([bytes], { type: 'image/png' })) : null);
