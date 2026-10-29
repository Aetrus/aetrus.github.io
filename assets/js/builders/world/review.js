// A revision waiting for review: what Aetheria's world pane sets at the top of
// the room (AgesPanel.js, pendingReview). The plan is the engine's
// (ages-engine/changePlan.ts); this is how it reads.
import { esc } from '../../ui.js';

const LAYER_WORDS = {
  topography: 'the land', hydrology: 'the water', climate: 'the climate', ecology: 'the ground', atmosphere: 'the sky',
  physics: 'the world’s laws', authoredFeatures: 'what is made by hand', liveState: 'the story so far', atlas: 'the map', identity: 'the name', source: 'the book',
};
const TARGET_WORDS = {
  topography: 'terrain', hydrology: 'rivers and seas', climate: 'climate', ecology: 'ground and growth', atmosphere: 'sky',
  physics: 'laws', map: 'the map', 'three-materials': 'materials', navigation: 'routes', context: 'what the story is told',
};
const PATH_WORDS = [
  [/^identity\.name$/, 'Name'],
  [/topography\.structure\.form$/, 'Structure'], [/topography\.terrain\.profile$/, 'Terrain'], [/topography\.terrain\.intensity$/, 'Terrain intensity'],
  [/topography\.landforms/, 'Landforms'], [/topography\.worldScale/, 'The world’s size'],
  [/ecology\.ground\.palette$/, 'Ground'], [/ecology\.ground\.vegetation$/, 'Vegetation'], [/ecology\.vegetationStructure/, 'Vegetation'],
  [/hydrology\.(water\.level|seaLevel)$/, 'Water level'], [/hydrology\.rainfall/, 'Rain'], [/hydrology\.flowAnomalies/, 'Water running uphill'], [/hydrology\.systems\.rainfallRegime/, 'Rain'],
  [/atmosphere\.sky\.palette$/, 'Sky'], [/atmosphere\.fog\.density$/, 'Fog'], [/atmosphere\.suns/, 'Suns'],
  [/climate\.climate\.latitude$/, 'Latitude'], [/climate\.temperature/, 'Temperature'], [/climate\.prevailingWind/, 'Prevailing wind'],
  [/authoredFeatures\.regions/, 'Regions'], [/authoredFeatures\.features/, 'Places made by hand'], [/authoredFeatures\.namedRegions/, 'Named regions'],
  [/authoredFeatures\.environmentalEdits/, 'Painted and sculpted ground'], [/authoredFeatures\.authoringLog/, 'The record of edits'],
  [/atlas\.places/, 'Places'], [/atlas\.areas/, 'Areas'], [/atlas\.ways/, 'Roads and ways'], [/atlas\.waters/, 'Waters'], [/atlas\.relief/, 'Cliffs and hills'],
  [/atlas\.(coast|land)/, 'The coastline'], [/atlas\.plans/, 'Town plans'], [/atlas\.sea/, 'The sea'], [/atlas\.ground$/, 'The ground'], [/atlas\.scale$/, 'How much the map holds'], [/atlas\.towns$/, 'Towns'],
  [/atlas\.enabled$/, 'Drawn as a map'], [/atlas\.notes/, 'Layout notes'],
  [/physics\.gravity/, 'Gravity'], [/physics\.timeRate$/, 'How fast time runs'], [/physics\./, 'The world’s laws'], [/atmosphere\.moons/, 'Moons'], [/atmosphere\./, 'The sky'], [/climate\.seasons/, 'Seasons'],
];
const noise = (path) => /^provenance\.|^source\.|\.meta\.|authoringLog|^identity\.(updatedAt|lastBakedAt)$/.test(path);
export const changeLabel = (path) => {
  const hit = PATH_WORDS.find(([re]) => re.test(path));
  if (hit) return hit[1];
  return path.replace(/^layers\./, '').replace(/\[id=([^\]]+)\]/g, ' · $1').replace(/\./g, ' › ');
};
const short = (v) => {
  if (v === undefined) return 'nothing';
  if (v === null) return 'none';
  if (typeof v === 'string') return v.replace(/_/g, ' ');
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.length ? (v.every((x) => typeof x === 'string') ? v.join(', ').replace(/_/g, ' ') : `${v.length} ${v.length === 1 ? 'item' : 'items'}`) : 'none';
  if (typeof v === 'object') return v.name ? String(v.name) : v.kind ? String(v.kind).replace(/_/g, ' ') : 'set';
  return String(v);
};
const clip = (s, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const CHOICE_WORDS = { preserve: 'Keep it there', move: 'Move it to safer ground', 'adapt-terrain': 'Give it ground to stand on', remove: 'Take it away' };
const FIELD_WORDS = { position: 'moved', geometry: 'redrawn', scope: 'reshaped', name: 'renamed', description: 'described anew', aliases: 'other names', tags: 'tags', protected: 'protection', at: 'moved', line: 'redrawn', shape: 'reshaped', layout: 'laid out anew', parent: 'in another town', fixed: 'fixed in place', kind: 'kind' };
const LIST_WORDS = [
  [/authoredFeatures\.features$/, 'A place'], [/authoredFeatures\.namedRegions$/, 'A region'], [/authoredFeatures\.environmentalEdits$/, 'Painted ground'],
  [/atlas\.places$/, 'A place'], [/atlas\.areas$/, 'An area'], [/atlas\.ways$/, 'A way'], [/atlas\.waters$/, 'A water'], [/atlas\.relief$/, 'Relief'], [/atlas\.plans$/, 'A town plan'],
];

/**
 * The changes worth reading: a thing in a list (a place, a region) read as one
 * line by its name ("Glass Harbor · moved"), the rest by what they are; and
 * how many changes are only the record. `names` maps ids to names.
 */
export function readableChanges(plan, names = new Map()) {
  const shown = []; let record = 0;
  const seen = new Map();
  const layers = new Set();
  for (const c of plan.changes || []) {
    // A difference only in what JSON drops (an undefined field) is no change to read.
    if (JSON.stringify(c.before) === JSON.stringify(c.after)) continue;
    if (noise(c.path)) { record += 1; continue; }
    const thing = /^(.*?)\[id=([^\]]+)\](?:\.([^.[]+))?/.exec(c.path);
    if (thing && LIST_WORDS.some(([re]) => re.test(thing[1]))) {
      const [, list, id, field] = thing;
      if (field === 'provenance') { record += 1; continue; }
      layers.add(c.layer);
      const key = `${list}|${id}`;
      const name = names.get(id) || c.after?.name || c.before?.name || (LIST_WORDS.find(([re]) => re.test(list))[1]);
      let item = seen.get(key);
      if (!item) { item = { label: name, fields: new Set(), count: 0, path: c.path }; seen.set(key, item); shown.push(item); }
      item.count += 1;
      if (!field) item.whole = c.before === undefined ? 'set down' : c.after === undefined ? 'taken away' : 'changed';
      else if (field === 'name') { item.fields.add(`renamed from ${clip(short(c.before), 30)}`); }
      else item.fields.add(FIELD_WORDS[field] || field.replace(/([A-Z])/g, ' $1').toLowerCase());
      continue;
    }
    layers.add(c.layer);
    const label = changeLabel(c.path);
    if (seen.has(label)) { seen.get(label).count += 1; continue; }
    const item = { label, before: clip(short(c.before)), after: clip(short(c.after)), count: 1, path: c.path };
    seen.set(label, item); shown.push(item);
  }
  shown.forEach((item) => {
    if (item.fields) { item.what = item.whole || [...item.fields].join(', ') || 'changed'; item.count = 1; }
  });
  return { shown, record, layers: [...layers] };
}

/** The engine's messages name things by id; these name them by name. */
export function humanise(text, names = new Map()) {
  let out = String(text || '');
  const resolved = /^Conflict (\S+?) will be resolved by (.+)\.$/.exec(out);
  if (resolved) {
    const id = resolved[1].replace(/^[a-z-]+:/, '').split(':')[0];
    out = `${names.get(id) || 'It'} will be ${{ preserve: 'kept as it is', move: 'moved to safer ground', 'adapt terrain': 'given ground to stand on', remove: 'taken away' }[resolved[2]] || resolved[2]}.`;
  }
  return out.replace(/\b((?:feature|region|edit)_[a-z0-9_]+)(?::[^\s]*)?/g, (m, id) => names.get(id) || m);
}

/**
 * The review card. `pending`: { plan, authoring, prose_patch, proseStatus, proseText, title, note }.
 * Buttons carry data-review="apply|cancel|map", data-conflict + data-choice, data-prose.
 */
export function reviewHtml(core, pending, { busy = false, full = false, onMap = false, names = new Map() } = {}) {
  if (!pending) return '';
  const plan = pending.plan;
  const { shown, record, layers: touched } = readableChanges(plan, names);
  const blocking = (plan.conflicts || []).some((c) => c.blocking && !plan.conflictResolutions?.[c.id]);
  const targets = (plan.affectedTargets || []).map((t) => TARGET_WORDS[t] || t).filter((v, i, a) => a.indexOf(v) === i);
  const layers = touched.filter((l) => l !== 'source').map((l) => LAYER_WORDS[l] || l);
  const list = full ? shown : shown.slice(0, 8);
  const status = pending.proseStatus || 'structured-only';
  return `<section class="wrv${blocking ? ' is-blocked' : ''}" aria-label="A revision, waiting for you">
    <header class="wrv-head">
      <p class="panel-sub">${plan.requiresTerrainBake ? 'A structural rebuild' : 'A selective update'}, waiting for you</p>
      <h3 class="inspector-title">${esc(pending.title || 'A revision')}</h3>
    </header>
    ${pending.note ? `<p class="wrv-note">${esc(pending.note)}</p>` : ''}
    <p class="wrv-note">${layers.length ? `It changes ${esc(layers.join(', '))}` : 'It changes no generated field'}${targets.length ? `, and rebuilds ${esc(targets.join(', '))}.` : '.'}</p>
    ${list.length ? `<ul class="wrv-changes">${list.map((c) => `<li><span>${esc(c.label)}${c.count > 1 ? ` <i>×${c.count}</i>` : ''}</span>${c.what ? `<b class="wrv-what">${esc(c.what)}</b>` : `<b>${esc(c.before)} <em aria-label="becomes">→</em> ${esc(c.after)}</b>`}</li>`).join('')}
      ${!full && shown.length > list.length ? `<li class="wrv-more">…and ${shown.length - list.length} more, under Changes</li>` : ''}</ul>` : ''}
    ${record ? `<p class="field-hint">${record} ${record === 1 ? 'change' : 'changes'} to the record of where things came from.</p>` : ''}
    ${(plan.warnings || []).map((w) => `<p class="wrv-warn">${esc(humanise(w, names))}</p>`).join('')}
    ${pending.authoring && pending.prose_patch ? `
      <div class="wrv-prose">
        <p class="panel-sub">The book, round-trip</p>
        <p class="field-hint">Only this line is proposed for the descriptive book; the rest of it is kept exactly as written.</p>
        <blockquote class="wrv-line">${esc(pending.prose_patch.addition.trim())}</blockquote>
        <div class="chip-row" role="group" aria-label="What happens to the descriptive book">
          ${[['accepted', 'Accept the wording'], ['modified', 'Use my edit'], ['structured-only', 'Change the world only'], ['rejected', 'Reject the wording']]
            .map(([k, l]) => `<button type="button" class="chip" data-prose="${k}" aria-pressed="${status === k}">${l}</button>`).join('')}
        </div>
        ${status === 'modified' ? `<label class="field"><span class="field-label">The book, as you would have it</span><textarea class="textarea mono wrv-edit" data-prose-text rows="6">${esc(pending.proseText || '')}</textarea></label>` : ''}
      </div>` : ''}
    ${(plan.conflicts || []).length ? `<div class="wrv-conflicts"><p class="panel-sub">Placement and protection</p>
      ${plan.conflicts.map((c) => {
        const done = plan.conflictResolutions?.[c.id];
        return `<div class="wrv-conflict${c.blocking && !done ? ' is-blocking' : ''}"><p>${esc(humanise(c.message, names))}</p>
          ${done ? `<p class="field-hint">Resolved: ${esc((CHOICE_WORDS[done] || done.replace(/-/g, ' ')).toLowerCase())}</p>` : `<div class="chip-row">${c.choices.map((ch) => `<button type="button" class="chip" data-conflict="${esc(c.id)}" data-choice="${esc(ch)}"${busy ? ' disabled' : ''}>${esc(CHOICE_WORDS[ch] || ch.replace(/-/g, ' '))}</button>`).join('')}</div>`}
        </div>`;
      }).join('')}</div>` : ''}
    ${(plan.placementIssues || []).length ? `<p class="wrv-warn">Placed items stay where they are. Repair choices are listed; cancel to edit first.</p>` : ''}
    <div class="btn-row wrv-actions">
      <button type="button" class="btn btn-gilt btn-sm" data-review="apply"${busy || blocking ? ' disabled' : ''}>${busy ? 'Applying…' : 'Apply revision'}</button>
      <button type="button" class="btn btn-sm" data-review="cancel"${busy ? ' disabled' : ''}>Cancel</button>
      ${onMap ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-review="map">See it on the map</button>'}
    </div>
    <p class="field-hint">The map shows a preview; the saved world has not changed.</p>
  </section>`;
}
