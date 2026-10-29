// The map: Aetheria's Map Studio (components/ages/AgesMapStudio.js) on a plain
// canvas. The geometry, the inspection, the search and the atlas drawing are
// the engine's own (vendor/aetheria/world.js); this file holds the gestures,
// the chrome over the chart and the colours it is drawn in.
//
// The chart's *ink* (ground, grid, frame, labels) comes from the Binding at
// draw time, so Blossom gets a light chart. Its *data* colours (the elevation
// ramp, water, the biome legend carried in the world file) stay literal: they
// say what the terrain is, not what the page looks like.
import { esc, store } from '../../ui.js';

const LAYERS = {
  terrain: 'Terrain', biome: 'Ground', water: 'Water', vegetation: 'Vegetation',
  roads: 'Roads and rivers drawn', features: 'Places', regions: 'Regions', characters: 'People', events: 'Events', grid: 'Grid',
};
const DIAGNOSTIC_WORDS = {
  elevation: 'Height', slope: 'Slope', curvature: 'Curvature', aspect: 'Aspect', flow: 'Flow', watersheds: 'Watersheds',
  moisture: 'Moisture', temperature: 'Temperature', precipitation: 'Rainfall', biome: 'The land', geology: 'Rock',
  soil: 'Soil', vegetation: 'Vegetation', 'settlement-suitability': 'Where people would settle', 'invalid-features': 'What could not be placed',
};
export const diagnosticWord = (layer) => DIAGNOSTIC_WORDS[layer] || String(layer).replace(/-/g, ' ');

const hexRgb = (hex) => {
  const parsed = parseInt(String(hex || '#777777').replace('#', ''), 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
};

function createLayer(resolution, pixel) {
  const canvas = document.createElement('canvas');
  canvas.width = resolution; canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  const rgba = new Uint8ClampedArray(resolution * resolution * 4);
  for (let i = 0; i < resolution * resolution; i += 1) {
    const c = pixel(i); const o = i * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = c[3];
  }
  ctx.putImageData(new ImageData(rgba, resolution, resolution), 0, 0);
  return canvas;
}

/** Map Studio's raster layers, from a world's grids. */
function buildRasterLayers(data) {
  const { resolution, height_min: min, height_max: max, biome_legend: legend } = data.manifest;
  const span = Math.max(max - min, 1e-6);
  const terrain = createLayer(resolution, (i) => {
    const e = (data.height[i] - min) / span;
    const shade = Math.max(0.45, 1 - data.slope[i] * 0.32);
    return [(62 + e * 132) * shade, (54 + e * 122) * shade, (47 + e * 112) * shade, 255];
  });
  const colours = {};
  const biome = createLayer(resolution, (i) => {
    if (data.belowSea[i] || data.lakes[i] || data.rivers[i]) return [0, 0, 0, 0];
    const id = data.biomeId[i];
    const rgb = colours[id] || (colours[id] = hexRgb(legend[String(id)]?.color));
    return [rgb[0], rgb[1], rgb[2], 104];
  });
  const water = createLayer(resolution, (i) => {
    if (data.rivers[i]) return [74, 112, 180, 230];
    if (data.lakes[i]) return [55, 89, 145, 210];
    if (data.belowSea[i]) return [28, 51, 91, 225];
    return [0, 0, 0, 0];
  });
  const vegetation = createLayer(resolution, (i) => {
    const d = data.vegetationDensity[i];
    return d > 0.04 ? [35, 102, 55, Math.min(135, d * 150)] : [0, 0, 0, 0];
  });
  return { terrain, biome, water, vegetation };
}

/** The kinds of ground that cover most of the world, most first. */
function commonGround(data, most = 5) {
  const counts = new Map();
  for (let i = 0; i < data.biomeId.length; i += 1) {
    if (data.belowSea[i] || data.lakes[i] || data.rivers[i]) continue;
    counts.set(data.biomeId[i], (counts.get(data.biomeId[i]) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, most)
    .map(([id]) => data.manifest.biome_legend[String(id)]).filter(Boolean);
}

const drawRaster = (ctx, layer, rect) => {
  if (!layer) return;
  ctx.save();
  ctx.translate(rect.left, rect.top + rect.height);
  ctx.scale(1, -1);
  ctx.drawImage(layer, 0, 0, rect.width, rect.height);
  ctx.restore();
};

const geometryPoints = (geometry) => {
  if (!geometry) return [];
  const source = geometry.points || geometry.coordinates || geometry;
  if (!Array.isArray(source)) return [];
  return source.flatMap((p) => (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [{ x: Number(p[0]), z: Number(p[1]) }]
    : p && Number.isFinite(p.x) && Number.isFinite(p.z) ? [{ x: Number(p.x), z: Number(p.z) }] : []));
};

/** The zoom at which a world covers a plate of `size` (Map Studio's coverZoom). */
const coverZoom = (size, spatial) => {
  if (!spatial?.width || !spatial?.depth || !size?.width || !size?.height) return 1;
  const contain = Math.min(size.width / spatial.width, size.height / spatial.depth);
  const cover = Math.max(size.width / spatial.width, size.height / spatial.depth);
  return contain > 0 ? Math.min(12, cover / contain) : 1;
};

// The Binding's ink, resolved to colours a canvas can take (color-mix included).
let probe = null;
function resolveColour(expr) {
  if (!probe) { probe = document.createElement('i'); probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'; document.body.append(probe); }
  probe.style.color = ''; probe.style.color = expr;
  const v = getComputedStyle(probe).color;
  const rgb = v.match(/^rgba?\(([^)]+)\)/);
  if (rgb) return `rgba(${rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).join(',')},${rgb[1].split(/[\s,/]+/).filter(Boolean)[3] ?? 1})`;
  const srgb = v.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/);
  if (srgb) return `rgba(${Math.round(srgb[1] * 255)},${Math.round(srgb[2] * 255)},${Math.round(srgb[3] * 255)},${srgb[4] ?? 1})`;
  return v || '#888';
}
const readInk = () => ({
  ground: resolveColour('var(--ink-850)'),
  plate: resolveColour('var(--ink-700)'),
  grid: resolveColour('var(--line-soft)'),
  frame: resolveColour('var(--line-strong)'),
  label: resolveColour('var(--text)'),
  halo: resolveColour('var(--ink-900)'),
  accent: resolveColour('var(--accent)'),
  accentContrast: resolveColour('var(--ink-900)'),
  warning: resolveColour('var(--signal-warning)'),
  region: resolveColour('color-mix(in srgb, var(--voice) 14%, transparent)'),
  voice: resolveColour('var(--voice)'),
});

const TEMPLATE = `
  <canvas class="wmap-canvas" tabindex="0"></canvas>
  <div class="wmap-chrome">
    <div class="wmap-bar" role="toolbar" aria-label="The map">
      <span class="wmap-group" role="group" aria-label="What a click does">
        <button type="button" class="wmap-tool" data-mode="view" aria-pressed="true" title="Look around, and pin a point to read it (V)">View</button>
        <button type="button" class="wmap-tool" data-mode="edit" aria-pressed="false" title="Drag the places you made to move them, through review (E)">Edit</button>
      </span>
      <span class="wmap-group">
        <button type="button" class="wmap-tool" data-act="fit" title="The whole world (F)">Fit</button>
        <button type="button" class="wmap-tool wmap-icon" data-act="zoom-in" aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button type="button" class="wmap-tool wmap-icon" data-act="zoom-out" aria-label="Zoom out" title="Zoom out (−)">−</button>
      </span>
      <span class="wmap-group" data-atlas-only hidden>
        <button type="button" class="wmap-tool" data-act="town" title="Close in on the first town">The town</button>
      </span>
      <span class="wmap-group" data-atlas-only hidden role="group" aria-label="How the map looks" data-looks></span>
      <label class="wmap-select" data-natural-only hidden><span class="sr-only">What the map shows</span><select data-diag aria-label="What the map shows"></select></label>
      <button type="button" class="wmap-tool" data-act="layers" aria-expanded="false" aria-controls="wmap-layers">Layers</button>
    </div>
    <div class="wmap-search">
      <input class="wmap-find" type="search" placeholder="Find a place…" aria-label="Find a place on the map" autocomplete="off" spellcheck="false">
      <div class="wmap-results" hidden role="listbox" aria-label="Places found"></div>
    </div>
    <div class="wmap-layers" id="wmap-layers" hidden></div>
  </div>
  <p class="wmap-preview" hidden>Preview · the saved world has not changed</p>
  <p class="wmap-drawing" hidden></p>
  <div class="wmap-edit" hidden role="group" aria-label="Moving places">
    <button type="button" class="wmap-tool" data-move="undo">Undo move</button>
    <button type="button" class="wmap-tool" data-move="redo">Redo move</button>
    <button type="button" class="wmap-tool wmap-strong" data-move="review">Review move</button>
    <button type="button" class="wmap-tool" data-move="cancel">Cancel</button>
  </div>
  <div class="wmap-legend" hidden aria-label="What the ground is"></div>
  <div class="wmap-compass" aria-hidden="true">N<span>▲</span></div>
  <div class="wmap-scale" aria-hidden="true"><i></i><span></span></div>`;

export class MapStudio {
  /**
   * opts: { onInspect(spot), onAuthorPoint(point), onReviewMoves(moves), onDiagnostic(layer), onSelect(entry) }
   */
  constructor(host, core, opts = {}) {
    this.host = host; this.core = core; this.opts = opts;
    host.classList.add('wmap');
    host.innerHTML = TEMPLATE;
    this.canvas = host.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.size = { width: 640, height: 480 };
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.fitted = true;
    this.mode = 'view';
    this.layers = { terrain: true, biome: true, water: true, vegetation: true, roads: true, features: true, regions: true, characters: true, events: true, grid: false };
    this.quality = store.get('aetheria.world.mapQuality', 'medium');
    this.palette = store.get('aetheria.world.mapPalette', 'natural');
    this.look = store.get('aetheria.world.atlasLook', null);
    this.selected = [];
    this.pendingMoves = []; this.moveHistory = []; this.moveIndex = -1;
    this.pointers = new Map(); this.drag = null;
    this.hover = null; this.pinned = null;
    this.data = null; this.state = null; this.saved = null; this.preview = null;
    this.diagLayer = 'biome'; this.diagImage = null;
    this.authoring = { active: false, points: [], closed: false, label: '' };
    this.disabled = false;
    this.ink = readInk();
    this.frame = 0;
    this.listeners = [];
    this.wire();
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  get atlas() { const a = this.data?.document?.layers?.atlas; return a?.enabled ? a : null; }
  get spatial() { return this.data?.manifest?.spatial; }
  get viewport() { return { ...this.size, ...this.view }; }
  ppm() { return this.core.fitPixelsPerMeter(this.size, this.spatial) * this.view.zoom; }
  maxZoom() { return this.atlas && this.spatial ? Math.max(12, 4 / this.core.fitPixelsPerMeter(this.size, this.spatial)) : 12; }

  /** The saved world's map data and live state. */
  setWorld(data, state) {
    const changed = data?.worldId !== this.saved?.worldId;
    this.saved = data; this.state = state || null;
    if (changed) { this.diagLayer = 'biome'; this.diagImage = null; }
    this.show(this.preview || data, { reset: changed });
  }
  /** A plan's preview (its map data), or null to show the saved world again. */
  setPreview(data) {
    this.preview = data || null;
    this.host.querySelector('.wmap-preview').hidden = !this.preview;
    this.show(this.preview || this.saved, { reset: false });
  }
  show(data, { reset }) {
    this.data = data || null;
    this.raster = data && !this.atlas ? buildRasterLayers(data) : null;
    this.entries = data ? this.core.searchableMapEntries(data, this.state) : [];
    this.legend = data && !this.atlas ? commonGround(data) : [];
    if (reset) {
      this.selected = []; this.pinned = null; this.hover = null; this.cancelMoves();
      this.fit();
    } else if (this.fitted) this.view = this.coverView();
    this.syncChrome();
    this.opts.onInspect?.(this.spot());
    this.schedule();
  }
  setState(state) { this.state = state || null; if (this.data) this.entries = this.core.searchableMapEntries(this.data, this.state); this.schedule(); }
  setDisabled(disabled) { this.disabled = Boolean(disabled); this.host.classList.toggle('is-disabled', this.disabled); this.syncChrome(); }
  setAuthoring({ active = false, points = [], closed = false, label = '' } = {}) {
    this.authoring = { active, points, closed, label };
    const note = this.host.querySelector('.wmap-drawing');
    note.hidden = !active; note.textContent = label;
    this.canvas.classList.toggle('is-drawing', active);
    this.schedule();
  }
  setDiagnostic(layer, image) {
    this.diagLayer = layer || 'biome'; this.diagImage = image || null;
    const sel = this.host.querySelector('[data-diag]'); if (sel) sel.value = this.diagLayer;
    this.renderLegend();
    this.schedule();
  }

  // ── View ─────────────────────────────────────────────────────────────────
  coverView() { return { zoom: coverZoom(this.size, this.spatial), panX: 0, panY: 0 }; }
  fit() { this.fitted = true; this.view = this.coverView(); this.schedule(); }
  move(next) { this.fitted = false; this.view = this.clamp(typeof next === 'function' ? next(this.view) : next); this.schedule(); }
  /** Keeps the world on the plate: it covers the view when larger, and stays inside it when smaller. */
  clamp(v) {
    if (!this.spatial) return v;
    const rect = this.core.mapScreenRect({ ...this.size, ...v }, this.spatial);
    const { width: W, height: H } = this.size;
    let { panX, panY } = v;
    if (rect.width >= W) { if (rect.left > 0) panX -= rect.left; else if (rect.left + rect.width < W) panX += W - (rect.left + rect.width); }
    else panX = Math.max(-(W / 2), Math.min(W / 2, panX));
    if (rect.height >= H) { if (rect.top > 0) panY -= rect.top; else if (rect.top + rect.height < H) panY += H - (rect.top + rect.height); }
    else panY = Math.max(-(H / 2), Math.min(H / 2, panY));
    return { ...v, panX, panY };
  }
  zoomBy(f) { this.move((v) => ({ ...v, zoom: Math.max(0.65, Math.min(this.maxZoom(), v.zoom * f)) })); }
  focusWorld(x, z, zoom = 2.5) {
    if (!this.data) return;
    const next = Math.max(1, Math.min(this.maxZoom(), zoom));
    const base = this.core.fitPixelsPerMeter(this.size, this.spatial) * next;
    this.move({ zoom: next, panX: -x * base, panY: z * base });
  }
  focusTown() {
    const town = this.atlas?.places?.find((p) => this.core.isSettlement(p.kind) && p.at);
    if (!town) { this.fit(); return; }
    this.focusWorld(town.at.x, town.at.z, Math.min(this.maxZoom(), 0.9 / this.core.fitPixelsPerMeter(this.size, this.spatial)));
  }
  /** Centre on a point and pin it, as a jump from the worldbook or the search does. */
  goTo(x, z, { zoom = 3, entryId = null } = {}) {
    this.focusWorld(x, z, this.atlas ? Math.max(zoom, 0.6 / this.core.fitPixelsPerMeter(this.size, this.spatial)) : zoom);
    this.pinned = { x, z };
    if (entryId) this.selected = [String(entryId).replace(/^(feature|generated|region):/, '')];
    this.opts.onInspect?.(this.spot());
    this.schedule();
  }
  clearPin() { this.pinned = null; this.selected = []; this.opts.onInspect?.(this.spot()); this.schedule(); }
  lookName() {
    if (this.look && this.core.ATLAS_LOOKS[this.look]) return this.look;
    return document.documentElement.dataset.mode === 'light' ? 'parchment' : 'gilt';
  }

  // ── What is under the pointer ───────────────────────────────────────────
  /** The point being read: the pinned one, else the one under the pointer. */
  spot() {
    if (!this.data) return null;
    const point = this.pinned || this.hover;
    const pinned = Boolean(this.pinned);
    const reach = 28 / Math.max(this.ppm(), 1e-6);
    const entry = this.entries.find((e) => this.selected.includes(e.id))
      || (point ? this.core.nearestMapEntry(this.entries, point.x, point.z, reach) : null);
    if (!point && !entry) return null;
    const cell = point ? this.core.inspectMapCell(this.data, point.x, point.z) : null;
    const atlasSpot = this.atlas && point ? this.core.describeAtlasPoint(this.atlas, point, reach) : null;
    return { point, pinned, entry, cell, atlasSpot, atlas: this.atlas, preview: Boolean(this.preview) };
  }
  entryWord(entry) {
    const tags = entry?.source?.tags || [];
    const kind = tags.find((t) => t.startsWith('kind:'))?.slice(5);
    return tags.includes('atlas') && kind ? this.core.atlasKindLabel(kind) : this.core.mapKindWord(entry?.kind);
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); }); }
  draw() {
    const { canvas, ctx, data } = this;
    if (!data || !ctx) return;
    const cap = this.quality === 'low' ? 1 : this.quality === 'high' ? 2 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const { width, height } = this.size;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    const ink = this.ink; const core = this.core; const vp = this.viewport; const spatial = this.spatial;
    const toScreen = (x, z) => core.worldToScreen(x, z, vp, spatial);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = this.quality !== 'low';
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ink.ground; ctx.fillRect(0, 0, width, height);
    const rect = core.mapScreenRect(vp, spatial);
    const atlas = this.atlas;
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.left, rect.top, rect.width, rect.height); ctx.clip();
    ctx.fillStyle = ink.plate; ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
    ctx.filter = this.palette === 'high-contrast' && !atlas ? 'grayscale(1) contrast(1.28) brightness(1.08)' : 'none';
    if (atlas) {
      const a = core.screenToWorld(0, 0, vp, spatial); const b = core.screenToWorld(width, height, vp, spatial);
      core.drawAtlas(ctx, atlas, {
        toScreen, ppm: this.ppm(), width, height,
        bounds: { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) },
      }, { look: this.lookName(), story: this.layers.characters ? { entities: this.state?.entities, pins: this.state?.pins } : null, time: 0 });
    } else if (this.diagImage && !this.preview && this.diagLayer !== 'biome') {
      ctx.save(); ctx.translate(rect.left, rect.top + rect.height); ctx.scale(1, -1);
      ctx.drawImage(this.diagImage, 0, 0, rect.width, rect.height); ctx.restore();
    } else if (this.raster) {
      if (this.layers.terrain) drawRaster(ctx, this.raster.terrain, rect);
      if (this.layers.biome) drawRaster(ctx, this.raster.biome, rect);
      if (this.layers.water) drawRaster(ctx, this.raster.water, rect);
      if (this.layers.vegetation) drawRaster(ctx, this.raster.vegetation, rect);
    }
    ctx.filter = 'none';

    const path = (points, { close = false, stroke = ink.accent, fill = null, width: w = 1.5, dash = null } = {}) => {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach((p, i) => { const s = toScreen(p.x, p.z); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      if (close) ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.save(); if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); ctx.restore();
    };

    if (this.layers.grid) {
      const raw = 90 / this.ppm(); const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
      const step = (raw / mag > 5 ? 5 : raw / mag > 2 ? 2 : 1) * mag;
      ctx.strokeStyle = ink.grid; ctx.lineWidth = 1;
      for (let x = Math.ceil(spatial.minX / step) * step; x <= spatial.maxX; x += step) {
        const a = toScreen(x, spatial.minZ); const b = toScreen(x, spatial.maxZ);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let z = Math.ceil(spatial.minZ / step) * step; z <= spatial.maxZ; z += step) {
        const a = toScreen(spatial.minX, z); const b = toScreen(spatial.maxX, z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // An atlas draws its own places, ways and ground; only what is not its own is drawn over it.
    const owned = (item) => Boolean(atlas) && (item.tags || []).includes('atlas');
    if (this.layers.regions) (data.namedRegions || []).filter((r) => !owned(r)).forEach((region) => {
      const scope = region.scope || {};
      if (scope.kind === 'polygon' && scope.points?.length) path(scope.points, { close: true, stroke: region.protected ? ink.warning : ink.voice, fill: ink.region });
      else if (scope.kind === 'line' && scope.points?.length) path(scope.points, { stroke: ink.voice });
      else if (scope.point) { const s = toScreen(scope.point.x, scope.point.z); ctx.strokeStyle = ink.voice; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.stroke(); }
    });
    if (this.layers.roads) (data.authoredFeatures || []).filter((f) => !owned(f) && ['road', 'path', 'river', 'border', 'route'].includes(f.type)).forEach((f) => {
      path(geometryPoints(f.geometry), { stroke: f.type === 'river' ? 'rgba(110,150,220,0.95)' : ink.accent, width: 2.2, dash: f.type === 'border' ? [6, 4] : null });
    });

    const pts = this.authoring.points || [];
    if (pts.length) {
      path(pts, { close: this.authoring.closed, stroke: ink.accent, width: 3, fill: this.authoring.closed ? 'rgba(255,240,168,0.12)' : null });
      pts.forEach((p) => { const s = toScreen(p.x, p.z); ctx.fillStyle = ink.accent; ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = ink.halo; ctx.lineWidth = 1.5; ctx.stroke(); });
    }

    if (this.layers.events) {
      ctx.fillStyle = 'rgba(255,185,92,0.78)';
      (this.state?.events || []).forEach((ev) => {
        if (!Number.isFinite(ev.x) || !Number.isFinite(ev.z)) return;
        const s = toScreen(ev.x, ev.z); ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill();
      });
    }
    if (this.layers.characters && !atlas) Object.entries(this.state?.entities || {}).forEach(([name, entity]) => {
      path((entity.trail || []).map(([x, z]) => ({ x, z })), { stroke: 'rgba(118,205,222,0.65)', width: 1.3 });
      if (!Number.isFinite(entity.x) || !Number.isFinite(entity.z)) return;
      const s = toScreen(entity.x, entity.z);
      ctx.fillStyle = name === 'party' ? '#f0b66f' : '#7acddd';
      ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2); ctx.fill();
      this.label(entity.name || (name === 'party' ? 'You' : name), s.x + 8, s.y - 7);
    });

    const moving = new Map(this.pendingMoves.map((m) => [m.id, m]));
    if (this.layers.features) this.entries.filter((e) => ['generated', 'authored', 'pin'].includes(e.kind)).forEach((entry) => {
      const m = moving.get(entry.id); const x = m?.x ?? entry.x; const z = m?.z ?? entry.z;
      const s = toScreen(x, z);
      const chosen = this.selected.includes(entry.id);
      if (atlas && entry.kind !== 'generated') {
        if (chosen || m) { ctx.strokeStyle = ink.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, Math.PI * 2); ctx.stroke(); }
        return;
      }
      ctx.fillStyle = entry.kind === 'authored' ? '#f1cf88' : entry.kind === 'pin' ? '#df9564' : '#b9a3dc';
      ctx.strokeStyle = chosen ? ink.label : ink.halo;
      ctx.lineWidth = chosen ? 3 : 1.5;
      ctx.beginPath();
      if (entry.kind === 'authored') ctx.rect(s.x - 5, s.y - 5, 10, 10); else ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (this.view.zoom > 1.7 || chosen || entry.kind === 'authored') this.label(entry.name, s.x + 8, s.y - 6);
    });

    if (this.pinned) {
      const s = toScreen(this.pinned.x, this.pinned.z);
      ctx.save();
      ctx.strokeStyle = ink.halo; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = ink.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x - 14, s.y); ctx.lineTo(s.x - 5, s.y); ctx.moveTo(s.x + 5, s.y); ctx.lineTo(s.x + 14, s.y);
      ctx.moveTo(s.x, s.y - 14); ctx.lineTo(s.x, s.y - 5); ctx.moveTo(s.x, s.y + 5); ctx.lineTo(s.x, s.y + 14); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = ink.frame; ctx.lineWidth = 1;
    ctx.strokeRect(rect.left + 0.5, rect.top + 0.5, rect.width - 1, rect.height - 1);
    this.drawScale();
  }
  label(text, x, y) {
    const { ctx, ink } = this;
    ctx.save();
    ctx.font = '500 13px "EB Garamond", Georgia, serif';
    ctx.lineWidth = 3; ctx.strokeStyle = ink.halo; ctx.lineJoin = 'round';
    ctx.strokeText(String(text), x, y);
    ctx.fillStyle = ink.label; ctx.fillText(String(text), x, y);
    ctx.restore();
  }
  drawScale() {
    const bar = this.core.niceScaleBar(this.viewport, this.spatial);
    const el = this.host.querySelector('.wmap-scale');
    el.querySelector('i').style.width = `${Math.round(bar.pixels)}px`;
    el.querySelector('span').textContent = bar.label;
  }

  // ── Chrome ───────────────────────────────────────────────────────────────
  syncChrome() {
    const h = this.host; const atlas = this.atlas; const data = this.data;
    for (const el of h.querySelectorAll('[data-atlas-only]')) el.hidden = !atlas;
    for (const el of h.querySelectorAll('[data-natural-only]')) el.hidden = Boolean(atlas) || !data;
    const looks = h.querySelector('[data-looks]');
    if (atlas && !looks.childElementCount) {
      looks.innerHTML = Object.values(this.core.ATLAS_LOOKS).map((l) => `<button type="button" class="wmap-tool" data-look="${esc(l.id)}" aria-pressed="false">${esc(l.name)}</button>`).join('');
    }
    for (const b of looks.querySelectorAll('[data-look]')) b.setAttribute('aria-pressed', String(b.dataset.look === this.lookName()));
    const sel = h.querySelector('[data-diag]');
    const available = data?.manifest?.diagnostics?.available || ['biome'];
    if (!atlas && sel && sel.dataset.for !== String(data?.worldId)) {
      sel.innerHTML = available.map((l) => `<option value="${esc(l)}">${esc(diagnosticWord(l))}</option>`).join('');
      sel.dataset.for = String(data?.worldId);
    }
    if (sel) { sel.value = this.diagLayer; sel.disabled = Boolean(this.preview); }
    for (const b of h.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode));
    h.querySelector('[data-mode="edit"]').disabled = this.disabled;
    h.querySelector('.wmap-edit').hidden = this.mode !== 'edit';
    this.syncMoves();
    this.renderLayers();
    this.renderLegend();
    this.canvas.setAttribute('aria-label', data ? `Map of ${data.document?.identity?.name || data.manifest?.book?.seed || 'the world'}. Arrows pan, plus and minus zoom, F fits the world.` : 'Map');
  }
  syncMoves() {
    const t = this.host.querySelector('.wmap-edit');
    t.querySelector('[data-move="undo"]').disabled = this.moveIndex < 0;
    t.querySelector('[data-move="redo"]').disabled = this.moveIndex >= this.moveHistory.length - 1;
    t.querySelector('[data-move="review"]').disabled = !this.pendingMoves.length || this.disabled;
    t.querySelector('[data-move="cancel"]').disabled = !this.pendingMoves.length;
  }
  renderLayers() {
    const panel = this.host.querySelector('.wmap-layers');
    const atlas = this.atlas;
    const names = atlas ? ['characters', 'features', 'grid'] : Object.keys(LAYERS);
    panel.innerHTML = `<p class="wmap-panel-title">On the map</p>
      ${names.map((n) => `<label class="wmap-check"><input type="checkbox" data-layer="${n}" ${this.layers[n] ? 'checked' : ''}> ${esc(LAYERS[n])}</label>`).join('')}
      ${atlas ? '' : `<p class="wmap-panel-title">Drawn</p>
      <label class="wmap-check"><input type="radio" name="wmap-palette" data-palette="natural" ${this.palette !== 'high-contrast' ? 'checked' : ''}> In natural colours</label>
      <label class="wmap-check"><input type="radio" name="wmap-palette" data-palette="high-contrast" ${this.palette === 'high-contrast' ? 'checked' : ''}> High contrast, colour-safe</label>`}
      <p class="wmap-panel-title">Sharpness</p>
      <select class="select" data-quality aria-label="Map sharpness">
        ${[['low', 'Low, for slow devices'], ['medium', 'Medium'], ['high', 'High']].map(([v, l]) => `<option value="${v}"${this.quality === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>`;
  }
  renderLegend() {
    const el = this.host.querySelector('.wmap-legend');
    const diag = !this.atlas && this.data && this.diagImage && this.diagLayer !== 'biome' && !this.preview;
    if (diag) {
      // The engine's diagnostic colours (naturalRuntime diagnosticMapRgba): a ramp, or a colour to each one.
      const categorical = ['watersheds', 'geology', 'soil'].includes(this.diagLayer);
      el.hidden = false;
      el.innerHTML = `<p class="wmap-panel-title">${esc(diagnosticWord(this.diagLayer))}</p>${this.diagLayer === 'invalid-features'
        ? '<div><i style="background:#ff232d"></i>Could not be placed</div>'
        : categorical ? '<div class="wmap-note">A colour to each one</div>'
          : '<div class="wmap-ramp" aria-hidden="true"></div><div class="wmap-ramp-ends"><span>low</span><span>high</span></div>'}`;
      return;
    }
    const show = !this.atlas && this.data && this.layers.biome;
    el.hidden = !show;
    if (!show) return;
    const name = (b) => this.core.biomeName(b);
    el.innerHTML = `<p class="wmap-panel-title">The land</p>${this.legend.map((b) => `<div title="${esc(b.prose || '')}"><i style="background:${esc(b.color)}"></i>${esc(name(b))}</div>`).join('')}
      ${this.layers.water ? '<div><i style="background:#376397"></i>Water</div>' : ''}`;
  }
  search(q) {
    const box = this.host.querySelector('.wmap-results');
    const query = q.trim();
    if (!query || !this.data) { box.hidden = true; box.innerHTML = ''; return; }
    const found = this.core.searchMapEntries(this.data, this.state, query).filter((e) => !(e.source?.tags || []).includes('atlas-place'));
    this.found = found;
    box.hidden = false;
    box.innerHTML = found.length
      ? found.map((e, i) => `<button type="button" class="wmap-result" role="option" data-found="${i}">${esc(e.name)}<span>${esc(this.entryWord(e))}</span></button>`).join('')
      : '<p class="wmap-result is-empty">Nothing on the map by that name.</p>';
  }
  jumpTo(entry) {
    this.goTo(entry.x, entry.z, { zoom: 2.5, entryId: entry.id });
    this.selected = [entry.id];
    const input = this.host.querySelector('.wmap-find'); input.value = '';
    this.search('');
    this.opts.onInspect?.(this.spot());
    this.schedule();
  }

  // ── Moving places (Edit) ────────────────────────────────────────────────
  cancelMoves() { this.pendingMoves = []; this.moveHistory = []; this.moveIndex = -1; if (this.host.isConnected) this.syncMoves(); this.schedule(); }
  undoMove() { if (this.moveIndex < 0) return; this.pendingMoves = this.moveHistory[this.moveIndex].before; this.moveIndex -= 1; this.syncMoves(); this.schedule(); }
  redoMove() { if (this.moveIndex >= this.moveHistory.length - 1) return; this.moveIndex += 1; this.pendingMoves = this.moveHistory[this.moveIndex].after; this.syncMoves(); this.schedule(); }
  setMode(mode) { this.mode = mode; if (mode !== 'edit') this.cancelMoves(); this.syncChrome(); this.schedule(); }

  // ── Gestures ─────────────────────────────────────────────────────────────
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  worldAt(e) { const p = this.local(e); return { ...this.core.screenToWorld(p.x, p.y, this.viewport, this.spatial), screen: p }; }
  on(el, type, fn, opts) { el.addEventListener(type, fn, opts); this.listeners.push(() => el.removeEventListener(type, fn, opts)); }

  wire() {
    const c = this.canvas; const h = this.host;
    this.on(c, 'pointerdown', (e) => this.down(e));
    this.on(c, 'pointermove', (e) => this.moveP(e));
    this.on(c, 'pointerup', (e) => this.up(e));
    this.on(c, 'pointercancel', (e) => this.up(e));
    this.on(c, 'pointerleave', () => { if (!this.drag) { this.hover = null; if (!this.pinned) this.opts.onInspect?.(this.spot()); } });
    this.on(c, 'wheel', (e) => this.wheel(e), { passive: false });
    this.on(c, 'keydown', (e) => this.key(e));
    this.on(h, 'click', (e) => {
      const b = e.target.closest('button'); if (!b || !h.contains(b)) return;
      if (b.dataset.mode) this.setMode(b.dataset.mode);
      else if (b.dataset.act === 'fit') this.fit();
      else if (b.dataset.act === 'zoom-in') this.zoomBy(1.4);
      else if (b.dataset.act === 'zoom-out') this.zoomBy(1 / 1.4);
      else if (b.dataset.act === 'town') this.focusTown();
      else if (b.dataset.act === 'layers') {
        const p = h.querySelector('.wmap-layers'); p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden));
      } else if (b.dataset.look) { this.look = b.dataset.look; store.set('aetheria.world.atlasLook', this.look); this.syncChrome(); this.schedule(); this.opts.onLook?.(); }
      else if (b.dataset.found !== undefined) this.jumpTo(this.found[Number(b.dataset.found)]);
      else if (b.dataset.move === 'undo') this.undoMove();
      else if (b.dataset.move === 'redo') this.redoMove();
      else if (b.dataset.move === 'cancel') this.cancelMoves();
      else if (b.dataset.move === 'review' && this.pendingMoves.length) {
        const moves = this.pendingMoves.map((m) => ({ id: m.id, x: m.x, z: m.z }));
        Promise.resolve(this.opts.onReviewMoves?.(moves)).then((ok) => { if (ok !== false) this.cancelMoves(); });
      }
    });
    this.on(h, 'change', (e) => {
      const t = e.target;
      if (t.dataset.layer) { this.layers[t.dataset.layer] = t.checked; this.renderLegend(); this.schedule(); }
      else if (t.dataset.palette) { this.palette = t.dataset.palette; store.set('aetheria.world.mapPalette', this.palette); this.schedule(); }
      else if (t.dataset.quality !== undefined) { this.quality = t.value; store.set('aetheria.world.mapQuality', this.quality); this.schedule(); }
      else if (t.dataset.diag !== undefined) this.opts.onDiagnostic?.(t.value);
    });
    const find = h.querySelector('.wmap-find');
    this.on(find, 'input', () => this.search(find.value));
    this.on(find, 'keydown', (e) => {
      if (e.key === 'Enter' && this.found?.length) { e.preventDefault(); this.jumpTo(this.found[0]); }
      if (e.key === 'Escape') { find.value = ''; this.search(''); }
    });
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.max(240, Math.round(entry.contentRect.width));
      const height = Math.max(240, Math.round(entry.contentRect.height));
      if (width === this.size.width && height === this.size.height) return;
      this.size = { width, height };
      if (this.fitted) this.view = this.coverView();
      this.schedule();
    });
    ro.observe(h);
    this.listeners.push(() => ro.disconnect());
    const retint = () => { this.ink = readInk(); this.syncChrome(); this.schedule(); };
    this.on(document, 'binding', retint);
    document.fonts?.ready?.then(() => this.schedule());
  }

  down(e) {
    if (!this.data) return;
    this.canvas.focus({ preventScroll: true });
    // While a revision waits (disabled) the map still pans, zooms and reads; it does not take edits.
    if (this.authoring.active && !this.disabled && e.button === 0 && e.pointerType !== 'touch') {
      const w = this.worldAt(e); this.opts.onAuthorPoint?.({ x: w.x, z: w.z }); return;
    }
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    const screen = this.local(e); const world = this.worldAt(e);
    this.pointers.set(e.pointerId, screen);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.drag = { type: 'pinch', startDistance: Math.hypot(a.x - b.x, a.y - b.y), startView: { ...this.view }, startWorld: this.core.screenToWorld(mid.x, mid.y, this.viewport, this.spatial) };
      return;
    }
    if (this.mode === 'edit' && !this.disabled) {
      const radius = 22 / Math.max(this.ppm(), 1e-6);
      const authored = this.core.nearestMapEntry(this.entries.filter((x) => x.kind === 'authored'), world.x, world.z, radius);
      if (authored) {
        const sel = e.shiftKey
          ? (this.selected.includes(authored.id) ? this.selected.filter((id) => id !== authored.id) : [...this.selected, authored.id])
          : (this.selected.includes(authored.id) ? this.selected : [authored.id]);
        this.selected = sel;
        const moving = new Map(this.pendingMoves.map((m) => [m.id, m]));
        const originals = this.entries.filter((x) => sel.includes(x.id) && x.kind === 'authored')
          .map((x) => ({ id: x.id, x: moving.get(x.id)?.x ?? x.x, z: moving.get(x.id)?.z ?? x.z }));
        this.drag = { type: 'feature', startWorld: world, originals, moved: false, others: this.pendingMoves.filter((m) => !sel.includes(m.id)) };
        this.canvas.classList.add('is-dragging');
        this.opts.onInspect?.(this.spot());
        this.schedule();
        return;
      }
    }
    this.startPan(e, screen);
  }
  startPan(e, screen = this.local(e)) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    this.pointers.set(e.pointerId, screen);
    this.drag = { type: 'pan', start: screen, startView: { ...this.view }, moved: false, startedAt: performance.now() };
    this.canvas.classList.add('is-dragging');
  }
  moveP(e) {
    if (!this.data) return;
    const screen = this.local(e);
    if (e.pointerType !== 'touch') {
      this.hover = this.core.screenToWorld(screen.x, screen.y, this.viewport, this.spatial);
      if (!this.pinned && !this.drag) this.inspectSoon();
    }
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, screen);
    const d = this.drag; if (!d) return;
    if (d.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.max(0.65, Math.min(this.maxZoom(), d.startView.zoom * (dist / Math.max(d.startDistance, 1))));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = this.core.fitPixelsPerMeter(this.size, this.spatial) * zoom;
      this.move({ zoom, panX: mid.x - this.size.width / 2 - d.startWorld.x * k, panY: mid.y - this.size.height / 2 + d.startWorld.z * k });
      return;
    }
    if (d.type === 'pan') {
      const dx = screen.x - d.start.x; const dy = screen.y - d.start.y;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) this.move({ ...d.startView, panX: d.startView.panX + dx, panY: d.startView.panY + dy });
      return;
    }
    if (d.type === 'feature') {
      const w = this.core.screenToWorld(screen.x, screen.y, this.viewport, this.spatial);
      const dx = w.x - d.startWorld.x; const dz = w.z - d.startWorld.z;
      if (Math.hypot(dx, dz) * this.ppm() > 3) d.moved = true;
      this.pendingMoves = [...d.others, ...d.originals.map((o) => ({ id: o.id, x: o.x + dx, z: o.z + dz }))];
      this.schedule();
    }
  }
  up(e) {
    if (!this.data) return;
    const d = this.drag; const screen = this.local(e);
    const world = this.core.screenToWorld(screen.x, screen.y, this.viewport, this.spatial);
    this.pointers.delete(e.pointerId);
    if (d?.type === 'feature' && d.moved) {
      const before = [...d.others, ...d.originals];
      const after = this.pendingMoves;
      this.moveHistory = this.moveHistory.slice(0, this.moveIndex + 1);
      this.moveHistory.push({ before, after });
      this.moveIndex = this.moveHistory.length - 1;
      this.syncMoves();
    } else if (d?.type === 'pan' && !d.moved) {
      if (this.authoring.active && !this.disabled && e.pointerType === 'touch') {
        this.opts.onAuthorPoint?.({ x: world.x, z: world.z });
      } else {
        const radius = 24 / Math.max(this.ppm(), 1e-6);
        const entry = this.core.nearestMapEntry(this.entries, world.x, world.z, radius);
        if (entry) this.selected = e.shiftKey ? [...new Set([...this.selected, entry.id])] : [entry.id];
        else if (!e.shiftKey) this.selected = [];
        const inside = this.core.inspectMapCell(this.data, world.x, world.z) || this.atlas;
        this.pinned = inside ? { x: world.x, z: world.z } : null;
        this.opts.onInspect?.(this.spot());
        if (entry) this.opts.onSelect?.(entry);
      }
    }
    if (this.pointers.size === 0) { this.drag = null; this.canvas.classList.remove('is-dragging'); }
    else if (d?.type === 'pinch' && this.pointers.size === 1) {
      const [rest] = [...this.pointers.values()];
      this.drag = { type: 'pan', start: rest, startView: { ...this.view }, moved: true };
    }
    this.schedule();
  }
  inspectSoon() {
    if (this.inspecting) return;
    this.inspecting = requestAnimationFrame(() => { this.inspecting = 0; this.opts.onInspect?.(this.spot()); });
  }
  wheel(e) {
    if (!this.data) return;
    e.preventDefault();
    const p = this.local(e);
    const before = this.core.screenToWorld(p.x, p.y, this.viewport, this.spatial);
    const zoom = Math.max(0.65, Math.min(this.maxZoom(), this.view.zoom * Math.exp(-e.deltaY * 0.0012)));
    const k = this.core.fitPixelsPerMeter(this.size, this.spatial) * zoom;
    this.move({ zoom, panX: p.x - this.size.width / 2 - before.x * k, panY: p.y - this.size.height / 2 + before.z * k });
  }
  key(e) {
    const step = e.shiftKey ? 90 : 34;
    if (e.key === 'ArrowLeft') this.move((v) => ({ ...v, panX: v.panX + step }));
    else if (e.key === 'ArrowRight') this.move((v) => ({ ...v, panX: v.panX - step }));
    else if (e.key === 'ArrowUp') this.move((v) => ({ ...v, panY: v.panY + step }));
    else if (e.key === 'ArrowDown') this.move((v) => ({ ...v, panY: v.panY - step }));
    else if (e.key === '+' || e.key === '=') this.zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.4);
    else if (e.key.toLowerCase() === 'f') this.fit();
    else if (e.key.toLowerCase() === 'v') this.setMode('view');
    else if (e.key.toLowerCase() === 'e' && !this.disabled) this.setMode('edit');
    else if (e.key === 'Escape') {
      if (!this.pinned && !this.selected.length && !this.pendingMoves.length) return;
      this.clearPin(); this.cancelMoves();
    } else return;
    e.preventDefault();
  }
  destroy() { cancelAnimationFrame(this.frame); this.listeners.forEach((off) => off()); this.listeners = []; }
}
