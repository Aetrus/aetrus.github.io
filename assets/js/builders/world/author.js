// Shape the world: Aetheria's world author (components/ages/AgesWorldAuthor.js).
// Draw on the map, and every edit goes through the same reviewed, reversible
// revision as a change to the book. The operations are the engine's own
// (AgeAuthoringOperation, ages-engine/types.ts); the engine plans them.
import { esc } from '../../ui.js';

const TOOLS = [['place', 'Place'], ['line', 'Draw'], ['region', 'Region'], ['paint', 'Paint'], ['water', 'Water'], ['sculpt', 'Sculpt'], ['manage', 'Manage']];
// A world drawn as a map is drawn from its places, roads and areas: painting,
// sculpting and the water level belong to the older terrain.
const ATLAS_TOOLS = [['place', 'Place'], ['line', 'Draw'], ['region', 'Region'], ['towns', 'Towns'], ['manage', 'Manage']];
const TOOL_HINTS = {
  place: 'A town, a landmark, a ruin: one point on the map.',
  line: 'A road, a path or a river: two points or more.',
  region: 'A named stretch of country: three points or more round it.',
  paint: 'Change the vegetation, the ground or the weather inside a brush or a drawn shape.',
  water: 'Raise or lower the water over the whole world.',
  sculpt: 'Raise or cut the land itself inside a brush or a drawn shape.',
  towns: 'How a town’s streets and houses are laid out.',
  manage: 'Rename, describe, duplicate or remove a place you made.',
};

const titled = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const kindOfFeature = (f) => (f?.tags || []).find((t) => t.startsWith('kind:'))?.slice(5) || '';
const point = (v) => ({ x: Number(v.x), z: Number(v.z), unit: 'meter' });
const strings = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const relationships = (v) => String(v || '').split(',').flatMap((entry) => {
  const [type, targetId] = entry.split(':').map((p) => p.trim());
  return type && targetId ? [{ type, targetId }] : [];
});

export const createAuthorSession = () => ({
  enabled: false, tool: 'place', points: [], name: '', description: '', featureType: 'town', aliases: '', tags: '', relationships: '',
  protected: false, snap: true, lineType: 'road', layer: 'vegetation', value: '1', strength: 0.75,
  falloff: 'smooth', brushSize: 180, waterLevel: 0.2, selectedFeatureId: '', advancedConfirmed: false,
  atlasPlaceKind: 'house', atlasLineKind: 'road', atlasRegionKind: 'forest', townId: '', townLayout: '',
  manage: null,
});

const scopeFrom = (s) => (s.points.length >= 3
  ? { kind: 'polygon', points: s.points.map(point) }
  : { kind: 'point', point: point(s.points[0]), distance: Number(s.brushSize), distanceUnit: 'meter' });

const opt = (value, label, current) => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;

export class AuthorTools {
  /** opts: { core, getData(), isDisabled(), onPlan(op), onPlanTown(id, layout), onDrawing({ active, points, closed, label }) } */
  constructor(host, opts) {
    this.host = host; this.opts = opts; this.core = opts.core;
    this.s = createAuthorSession();
    host.addEventListener('click', (e) => this.click(e));
    host.addEventListener('input', (e) => this.input(e));
    host.addEventListener('change', (e) => this.input(e, true));
  }
  get data() { return this.opts.getData(); }
  get atlas() { const a = this.data?.document?.layers?.atlas; return a?.enabled ? a : null; }
  reset() { this.s = createAuthorSession(); this.render(); this.emitDrawing(); }
  set(patch, { rerender = true } = {}) {
    Object.assign(this.s, patch);
    if (rerender) this.render();
    this.emitDrawing();
  }
  needsPoints() { return !['water', 'manage', 'towns'].includes(this.s.tool); }
  minimum() { return this.s.tool === 'line' ? 2 : this.s.tool === 'region' ? 3 : 1; }
  emitDrawing() {
    const s = this.s;
    const active = s.enabled && this.needsPoints() && !this.opts.isDisabled();
    const closed = s.tool === 'region' || (['paint', 'sculpt'].includes(s.tool) && s.points.length >= 3);
    const world = this.data?.document?.identity?.name || 'the world';
    const label = active ? `Drawing · tap ${world} to ${s.points.length ? 'add a point' : 'begin'}` : '';
    this.opts.onDrawing?.({ active, points: this.needsPoints() ? s.points : [], closed, label });
  }
  /** A point set down on the map while drawing. */
  addPoint(p) {
    if (!this.s.enabled) return;
    this.s.points = this.s.tool === 'place' ? [p] : [...this.s.points, p];
    this.renderPoints(); this.syncReady(); this.emitDrawing();
  }

  render() {
    const data = this.data; const s = this.s; const core = this.core;
    if (!data) { this.host.innerHTML = ''; return; }
    const atlas = this.atlas;
    const tools = atlas ? ATLAS_TOOLS : TOOLS;
    if (!tools.some(([id]) => id === s.tool)) s.tool = 'place';
    const disabled = this.opts.isDisabled();
    const K = core.ATLAS_AUTHOR_KINDS;
    const choice = (list, v) => (list.includes(v) ? v : list[0]);
    const placeKind = choice(K.place, s.atlasPlaceKind); const lineKind = choice(K.line, s.atlasLineKind); const regionKind = choice(K.region, s.atlasRegionKind);
    let body = '';
    if (s.tool === 'towns' && atlas) body = this.townsHtml(atlas, disabled);
    else if (s.tool === 'manage') body = this.manageHtml(atlas, disabled);
    else {
      const fields = [];
      if (s.tool === 'water') {
        fields.push(`<label class="field"><span class="field-label">Water level<output class="mono" data-out="waterLevel">${Math.round(s.waterLevel * 100)}%</output></span>
          <input type="range" class="range" min="0" max="0.85" step="0.01" value="${esc(s.waterLevel)}" data-s="waterLevel" data-num aria-label="Water level"></label>`);
      } else {
        if (atlas && ['place', 'line', 'region'].includes(s.tool)) {
          const list = K[s.tool]; const v = s.tool === 'place' ? placeKind : s.tool === 'line' ? lineKind : regionKind;
          const key = s.tool === 'place' ? 'atlasPlaceKind' : s.tool === 'line' ? 'atlasLineKind' : 'atlasRegionKind';
          fields.push(`<label class="field"><span class="field-label">Kind</span><select class="select" data-s="${key}" aria-label="Kind">${list.map((k) => opt(k, titled(core.atlasKindLabel(k)), v)).join('')}</select></label>`);
        }
        if (!atlas && ['place', 'line'].includes(s.tool)) {
          const list = s.tool === 'place' ? ['town', 'landmark', 'ruin', 'portal', 'point-of-interest', 'object'] : ['road', 'path', 'river', 'border', 'route'];
          const key = s.tool === 'place' ? 'featureType' : 'lineType';
          fields.push(`<label class="field"><span class="field-label">Kind</span><select class="select" data-s="${key}">${list.map((t) => opt(t, titled(t.replace(/-/g, ' ')), s[key])).join('')}</select></label>`);
        }
        if (s.tool === 'paint') {
          fields.push(`<label class="field"><span class="field-label">What it changes</span><select class="select" data-s="layer">${[['vegetation', 'Vegetation'], ['biome', 'The ground'], ['geology', 'The rock'], ['weather', 'The weather'], ['anomaly', 'Something wrong']].map(([v, l]) => opt(v, l, s.layer)).join('')}</select></label>`);
        }
        const optional = s.tool === 'paint' || s.tool === 'sculpt';
        fields.push(`<label class="field"><span class="field-label">Name</span><input class="input" data-s="name" value="${esc(s.name)}" placeholder="${optional ? 'Optional' : 'Needed'}" autocomplete="off"></label>`);
        fields.push(`<label class="field"><span class="field-label">Description</span><textarea class="textarea wa-short" data-s="description" rows="2">${esc(s.description)}</textarea></label>`);
        if (['place', 'line'].includes(s.tool)) {
          fields.push(`<div class="field-row"><label class="field"><span class="field-label">Also called</span><input class="input" data-s="aliases" value="${esc(s.aliases)}" placeholder="comma separated" autocomplete="off"></label>
            <label class="field"><span class="field-label">Tags</span><input class="input" data-s="tags" value="${esc(s.tags)}" placeholder="comma separated" autocomplete="off"></label></div>`);
          if (!atlas) fields.push(`<label class="field"><span class="field-label">Relationships</span><input class="input" data-s="relationships" value="${esc(s.relationships)}" placeholder="ally:glass-harbor" autocomplete="off"><span class="field-hint">type:target-id, separated by commas.</span></label>`);
        }
        if (['paint', 'sculpt'].includes(s.tool)) {
          fields.push(`<div class="field-row">
            <label class="field"><span class="field-label">${s.tool === 'sculpt' ? 'Height change, m' : 'Value'}</span><input class="input mono" data-s="value" value="${esc(s.value)}" autocomplete="off"></label>
            <label class="field"><span class="field-label">Brush radius, m</span><input class="input mono" type="number" min="1" max="5000" data-s="brushSize" data-num value="${esc(s.brushSize)}"></label>
            <label class="field"><span class="field-label">Strength</span><input class="input mono" type="number" min="-1" max="1" step="0.05" data-s="strength" data-num value="${esc(s.strength)}"></label>
            <label class="field"><span class="field-label">Falloff</span><select class="select" data-s="falloff">${[['smooth', 'Smooth'], ['linear', 'Linear'], ['hard', 'Hard']].map(([v, l]) => opt(v, l, s.falloff)).join('')}</select></label>
          </div>`);
        }
        if (!atlas) fields.push(`<label class="toggle wa-check"><input type="checkbox" data-s="protected" ${s.protected ? 'checked' : ''}> Protect from later changes</label>`);
        if (!atlas && s.tool === 'place') fields.push(`<label class="toggle wa-check"><input type="checkbox" data-s="snap" ${s.snap ? 'checked' : ''}> Settle it onto the terrain</label>`);
        if (s.tool === 'sculpt') fields.push(`<label class="toggle wa-check"><input type="checkbox" data-s="advancedConfirmed" ${s.advancedConfirmed ? 'checked' : ''}> I understand sculpting rebuilds terrain, rivers, ecology and routes.</label>`);
      }
      body = `${fields.join('')}
        ${this.needsPoints() ? `<p class="field-hint wa-points-note" data-points-note></p><div class="wa-points" data-points></div>` : ''}
        <div class="btn-row">
          <button type="button" class="btn btn-gilt btn-sm" data-wa="review">Review this edit</button>
          ${this.needsPoints() ? '<button type="button" class="btn btn-sm btn-ghost" data-wa="clear">Clear points</button><button type="button" class="btn btn-sm btn-ghost" data-wa="undo-point">Undo point</button>' : ''}
        </div>`;
    }
    this.host.innerHTML = `
      <div class="wa-head"><p class="panel-sub">Shape the world</p>${s.enabled && this.needsPoints() ? '<span class="wa-live">drawing</span>' : ''}</div>
      <p class="wa-note">Draw on the map. Every edit is previewed as a revision you apply or cancel, and can be undone.</p>
      <div class="chip-row wa-tools" role="group" aria-label="Authoring tool">
        ${tools.map(([id, label]) => `<button type="button" class="chip" data-tool="${id}" aria-pressed="${s.tool === id}" title="${esc(TOOL_HINTS[id])}">${esc(label)}</button>`).join('')}
      </div>
      <p class="field-hint">${esc(TOOL_HINTS[s.tool])}</p>
      ${this.needsPoints() ? `<button type="button" class="btn btn-sm ${s.enabled ? 'btn-gilt' : ''}" data-wa="draw" aria-pressed="${s.enabled}"${disabled ? ' disabled' : ''}>${s.enabled ? 'Pause drawing' : 'Draw on the map'}</button>` : ''}
      <div class="wa-body">${body}</div>`;
    this.renderPoints(); this.syncReady();
  }
  townsHtml(atlas, disabled) {
    const s = this.s; const core = this.core;
    const towns = atlas.places.filter((p) => core.isSettlement(p.kind));
    if (!towns.length) return '<p class="field-hint">This world has no town yet. Set one down with Place.</p>';
    const town = towns.find((p) => p.id === s.townId) || towns[0];
    const now = town.layout || atlas.towns || 'generated';
    const want = s.townLayout || now;
    return `<label class="field"><span class="field-label">Town</span><select class="select" data-s="townId" data-reset="townLayout">${towns.map((p) => opt(p.id, p.name, town.id)).join('')}</select></label>
      <div class="chip-row" role="group" aria-label="How the town is laid out">
        ${[['generated', 'Laid out from the book'], ['manual', 'Only what you place']].map(([k, l]) => `<button type="button" class="chip" data-town-layout="${k}" aria-pressed="${want === k}">${l}</button>`).join('')}
      </div>
      <p class="field-hint">${want === 'manual'
        ? `${esc(town.name)} keeps only the places the book names and those you set down, with the streets that reach them. Place a house, an inn or a shop inside it with Place and the streets come to it.`
        : `The streets, squares and houses of ${esc(town.name)} are laid out round the places the book names. Anything you set down inside it with Place is added, and the streets reach it.`}</p>
      <div class="btn-row"><button type="button" class="btn btn-gilt btn-sm" data-wa="town" data-town="${esc(town.id)}" data-layout="${want}"${disabled || want === now ? ' disabled' : ''}>Review this change</button></div>`;
  }
  manageHtml(atlas, disabled) {
    const s = this.s; const core = this.core;
    const features = this.data.authoredFeatures || [];
    const f = features.find((x) => x.id === s.selectedFeatureId);
    if (f && (!s.manage || s.manage.id !== f.id)) {
      s.manage = { id: f.id, name: f.name || '', description: f.description || '', aliases: (f.aliases || []).join(', '), tags: (f.tags || []).filter((t) => t !== 'atlas' && !t.startsWith('kind:') && !t.startsWith('alias:')).join(', ') };
    }
    const m = s.manage || {};
    return `<label class="field"><span class="field-label">A place you made</span>
        <select class="select" data-s="selectedFeatureId"><option value="">Choose a place…</option>
        ${features.map((x) => opt(x.id, `${x.name} · ${atlas && kindOfFeature(x) ? core.atlasKindLabel(kindOfFeature(x)) : x.type}${x.protected ? ' · protected' : ''}`, s.selectedFeatureId)).join('')}</select>
        ${features.length ? '' : '<span class="field-hint">Nothing is set down by hand yet. Place something first.</span>'}</label>
      ${f ? `<label class="field"><span class="field-label">Name</span><input class="input" data-m="name" value="${esc(m.name)}" autocomplete="off"></label>
        <label class="field"><span class="field-label">Also called</span><input class="input" data-m="aliases" value="${esc(m.aliases)}" placeholder="comma separated" autocomplete="off"></label>
        <label class="field"><span class="field-label">Description</span><textarea class="textarea wa-short" data-m="description" rows="3">${esc(m.description)}</textarea></label>
        <label class="field"><span class="field-label">Tags</span><input class="input" data-m="tags" value="${esc(m.tags)}" autocomplete="off"></label>
        <div class="btn-row">
          <button type="button" class="btn btn-gilt btn-sm" data-wa="update"${disabled ? ' disabled' : ''}>Review edit</button>
          <button type="button" class="btn btn-sm" data-wa="duplicate"${disabled ? ' disabled' : ''}>Duplicate</button>
          ${atlas ? '' : `<button type="button" class="btn btn-sm" data-wa="protect"${disabled ? ' disabled' : ''}>${f.protected ? 'Unprotect' : 'Protect'}</button>`}
          <button type="button" class="btn btn-sm btn-danger" data-wa="delete"${disabled || f.protected ? ' disabled' : ''}>Delete</button>
        </div>` : ''}`;
  }
  renderPoints() {
    const s = this.s;
    const list = this.host.querySelector('[data-points]');
    const note = this.host.querySelector('[data-points-note]');
    if (!list || !note) return;
    const min = this.minimum();
    note.textContent = `${s.enabled ? `Tap the map to ${s.points.length ? 'add another point' : 'begin'}.` : 'Turn on drawing, then tap the map.'} ${s.tool === 'place' ? 'A second tap moves the point.' : `This needs at least ${min} ${min === 1 ? 'point' : 'points'}.`}`;
    const first = s.points[0] && this.data ? this.core.inspectMapCell(this.data, s.points[0].x, s.points[0].z) : null;
    list.innerHTML = s.points.map((p, i) => `<span>${i + 1}: ${this.core.coordinate(p.x)}, ${this.core.coordinate(p.z)}</span>`).join('')
      + (first && !this.atlas ? `<p class="field-hint wa-ground">${esc(first.water)} · ${Math.round(first.elevation)} m · ${Math.round(first.slopeDegrees)}° slope${first.slopeDegrees > 35 ? ' · steep for building' : ''}</p>` : '');
  }
  ready() {
    const s = this.s;
    if (this.opts.isDisabled()) return false;
    if (this.needsPoints() && s.points.length < this.minimum()) return false;
    if (!['paint', 'sculpt', 'water'].includes(s.tool) && !s.name.trim()) return false;
    if (s.tool === 'sculpt' && !s.advancedConfirmed) return false;
    return true;
  }
  syncReady() {
    const b = this.host.querySelector('[data-wa="review"]'); if (b) b.disabled = !this.ready();
    const c = this.host.querySelector('[data-wa="clear"]'); if (c) c.disabled = !this.s.points.length;
    const u = this.host.querySelector('[data-wa="undo-point"]'); if (u) u.disabled = !this.s.points.length;
  }
  input(e, committed = false) {
    const el = e.target;
    if (el.dataset.s) {
      const key = el.dataset.s;
      const v = el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value) : el.value;
      this.s[key] = v;
      if (key === 'waterLevel') { const o = this.host.querySelector('[data-out="waterLevel"]'); if (o) o.textContent = `${Math.round(v * 100)}%`; }
      if (el.dataset.reset) this.s[el.dataset.reset] = '';
      if (committed && el.tagName === 'SELECT') { if (key === 'selectedFeatureId') this.s.manage = null; this.render(); }
      else this.syncReady();
      return;
    }
    if (el.dataset.m && this.s.manage) this.s.manage[el.dataset.m] = el.value;
  }
  click(e) {
    const b = e.target.closest('button'); if (!b || !this.host.contains(b)) return;
    const s = this.s;
    if (b.dataset.tool) { this.set({ tool: b.dataset.tool, points: [], enabled: !['water', 'manage', 'towns'].includes(b.dataset.tool) }); return; }
    if (b.dataset.townLayout) { this.set({ townLayout: b.dataset.townLayout }); return; }
    const act = b.dataset.wa;
    if (act === 'draw') this.set({ enabled: !s.enabled });
    else if (act === 'clear') { s.points = []; this.renderPoints(); this.syncReady(); this.emitDrawing(); }
    else if (act === 'undo-point') { s.points = s.points.slice(0, -1); this.renderPoints(); this.syncReady(); this.emitDrawing(); }
    else if (act === 'review') { const op = this.operation(); if (op) this.opts.onPlan(op); }
    else if (act === 'town') this.opts.onPlanTown(b.dataset.town, b.dataset.layout);
    else if (['update', 'duplicate', 'protect', 'delete'].includes(act)) {
      const f = (this.data.authoredFeatures || []).find((x) => x.id === s.selectedFeatureId);
      if (!f) return;
      const m = s.manage || {};
      const op = act === 'update' ? { op: 'feature.update', featureId: f.id, patch: { name: m.name, description: m.description, aliases: strings(m.aliases), tags: strings(m.tags) } }
        : act === 'duplicate' ? { op: 'feature.duplicate', featureId: f.id }
          : act === 'protect' ? { op: 'feature.protect', featureId: f.id, protected: !f.protected }
            : { op: 'feature.delete', featureId: f.id };
      if (act === 'update' && !String(m.name || '').trim()) return;
      this.opts.onPlan(op);
    }
  }
  /** The operation the session describes (AgesWorldAuthor's review()). */
  operation() {
    const s = this.s; const atlas = this.atlas; const K = this.core.ATLAS_AUTHOR_KINDS;
    const choice = (list, v) => (list.includes(v) ? v : list[0]);
    const placeKind = choice(K.place, s.atlasPlaceKind); const lineKind = choice(K.line, s.atlasLineKind); const regionKind = choice(K.region, s.atlasRegionKind);
    const pts = s.points.map((p) => ({ x: p.x, z: p.z }));
    if (atlas && s.tool === 'place') return { op: 'feature.create', snap: false, feature: { type: this.core.isSettlement(placeKind) ? 'town' : 'landmark', atlasKind: placeKind, name: s.name, description: s.description, position: pts[0], aliases: strings(s.aliases), tags: strings(s.tags) } };
    if (atlas && s.tool === 'line') {
      const water = this.core.WATER_KIND_BY_ID.has(lineKind);
      return { op: 'feature.create', feature: { type: water ? 'river' : lineKind === 'path' ? 'path' : lineKind === 'wall' ? 'border' : 'road', atlasKind: lineKind, name: s.name, description: s.description, geometry: { kind: 'line', points: pts }, aliases: strings(s.aliases), tags: strings(s.tags) } };
    }
    if (atlas && s.tool === 'region') return { op: 'region.create', region: { name: s.name, description: s.description, atlasKind: regionKind, scope: { kind: 'polygon', points: pts.map(point) }, exclusions: [], tags: strings(s.tags) } };
    if (s.tool === 'place') return { op: 'feature.create', snap: s.snap, feature: { type: s.featureType, name: s.name, description: s.description, position: pts[0], aliases: strings(s.aliases), tags: strings(s.tags), relationships: relationships(s.relationships), protected: s.protected } };
    if (s.tool === 'line') return { op: 'feature.create', feature: { type: s.lineType, name: s.name, description: s.description, geometry: { kind: 'line', points: pts }, aliases: strings(s.aliases), tags: strings(s.tags), relationships: relationships(s.relationships), protected: s.protected } };
    if (s.tool === 'region') return { op: 'region.create', region: { name: s.name, description: s.description, scope: { kind: 'polygon', points: pts.map(point) }, exclusions: [], protected: s.protected, tags: strings(s.tags) } };
    if (s.tool === 'paint') return { op: 'environment.paint', edit: { name: s.name || `${s.layer} mask`, description: s.description, layer: s.layer, scope: scopeFrom(s), value: /^-?\d+(\.\d+)?$/.test(String(s.value)) ? Number(s.value) : s.value, strength: Number(s.strength), falloff: s.falloff, protected: s.protected } };
    if (s.tool === 'water') return { op: 'water.set', level: Number(s.waterLevel) };
    if (s.tool === 'sculpt') return { op: 'terrain.sculpt', explicit: true, edit: { name: s.name || 'Terrain sculpt', description: s.description, scope: scopeFrom(s), value: Number(s.value), strength: Number(s.strength), falloff: s.falloff, protected: s.protected } };
    return null;
  }
}
