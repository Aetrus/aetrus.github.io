// The book of the world, built by hand: Aetheria's AgeBook (ages-engine/types.ts,
// validate.ts) and the World Document fields the bake reads beyond it, as a
// form over the engine's own vocabulary (ages-engine/dictionary.ts and
// languageDictionary.ts). In Aetheria the book is compiled from prose by a
// model; here each word is chosen. What is built from it is the same world.
import { esc } from '../../ui.js';
import { clone, group, numberField, rangeField, selectField, textField, areaField, fieldRow } from '../sheet.js';

// ── The vocabulary, named ──────────────────────────────────────────────────
// The engine keys its words as ids; these are the names they are shown by.
// The lines under them are the dictionary's own prose where it has some.
export const NAMES = {
  structure: { central_massif: 'A central massif', rift_valley: 'A rift valley', coastal_shelf: 'A coastal shelf', basin: 'A basin', scattered: 'Scattered ranges' },
  terrain: { flatlands: 'Flatlands', rolling_hills: 'Rolling hills', mesa_badlands: 'Mesas and badlands', alpine_extreme: 'Alpine', archipelago: 'Archipelago' },
  ground: { temperate_verdant: 'Green and temperate', desert_ochre: 'Desert ochre', volcanic_glass: 'Volcanic glass', glacial_pale: 'Glacial', ashen_grey: 'Ashen grey' },
  sky: { clear_azure: 'Clear azure', storm_violet: 'Storm violet', ember_dusk: 'Ember dusk', eternal_night: 'Eternal night', pale_white: 'Pale white' },
  sun: { white: 'White', gold: 'Gold', ember: 'Ember', blue: 'Blue' },
  latitude: { polar: 'Polar', temperate: 'Temperate', tropical: 'Tropical' },
  where: { north: 'In the north', south: 'In the south', east: 'In the east', west: 'In the west', center: 'At the centre', coastal: 'Along the coasts', everywhere: 'Everywhere' },
  landform: {
    plain: 'A plain', foothills: 'Foothills', mountain_chain: 'A mountain chain', canyon: 'Canyons', karst: 'Karst', dunes: 'Dunes',
    volcano: 'A volcano', glacier: 'Glacier ice', delta: 'A delta', wetland: 'Wetland', continental_shelf: 'A continental shelf',
    ocean_trench: 'An ocean trench', island_arc: 'An arc of islands',
  },
};
const LATITUDE_PROSE = {
  polar: 'cold country under a low sun',
  temperate: 'the middle latitudes, seasons in moderation',
  tropical: 'warm country under a high sun',
};
const LANDFORM_PROSE = {
  plain: 'the ground lowered and laid out flat', foothills: 'broken low hills over the land', mountain_chain: 'ridges thrown up along long lines',
  canyon: 'the land cut down along long lines', karst: 'stone towers and sinks, rock worn by water', dunes: 'long ripples of sand',
  volcano: 'one great cone at the world’s heart', glacier: 'high ground smoothed under ice', delta: 'low wet ground spreading to the water',
  wetland: 'low wet ground, standing water', continental_shelf: 'the land falling away eastward under shallow sea',
  ocean_trench: 'deep cuts where the sea floor drops', island_arc: 'a curving chain of islands',
};
const ATLAS_SCALE = {
  town: ['A town', 'a town and the ground about it'], district: ['A district', 'a few villages and the country between'],
  region: ['A region', 'a stretch of coast and country, a day’s ride across'], country: ['A country', 'a whole land, many days across'],
};
const SEA_SIDES = {
  west: 'To the west', north: 'To the north', east: 'To the east', south: 'To the south',
  northwest: 'To the northwest', northeast: 'To the northeast', southwest: 'To the southwest', southeast: 'To the southeast',
  around: 'All round: an island', none: 'Nowhere: inland',
};
const COASTS = { gentle: 'Gentle', bays: 'Bays and headlands', ragged: 'Ragged', cliffs: 'Cliffs', straight: 'Straight' };

const titled = (s) => { const t = String(s || '').replace(/[_-]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

// Readouts in words, after the compiler's own definitions of each scalar.
export const WORDS = {
  intensity: (v) => `${v < 0.2 ? 'gentle' : v < 0.45 ? 'moderate' : v < 0.75 ? 'strong' : 'extreme'} · ${Number(v).toFixed(2)}`,
  vegetation: (v) => `${v < 0.1 ? 'barren' : v < 0.3 ? 'sparse' : v < 0.6 ? 'green' : v < 0.85 ? 'thick' : 'overgrown'} · ${Number(v).toFixed(2)}`,
  water: (v) => `${v < 0.05 ? 'dry' : v < 0.15 ? 'scattered lakes' : v < 0.35 ? 'narrow seas' : v < 0.65 ? 'half drowned' : v < 0.8 ? 'mostly sea' : 'islands'} · ${Number(v).toFixed(2)}`,
  fog: (v) => `${v < 0.15 ? 'crystal air' : v < 0.4 ? 'a little haze' : v < 0.7 ? 'fog in the low places' : 'cannot see far'} · ${Number(v).toFixed(2)}`,
  rain: (v) => `${v < 0.15 ? 'dry as bone' : v < 0.4 ? 'little rain' : v < 0.7 ? 'rain enough' : 'rain without end'} · ${Number(v).toFixed(2)}`,
  strength: (v) => `${v < 0.1 ? 'still' : v < 0.35 ? 'a breeze' : v < 0.65 ? 'steady' : v < 0.85 ? 'strong' : 'a gale'} · ${Number(v).toFixed(2)}`,
  reach: (v) => `${Math.round(Number(v) * 100)}% of the world`,
  landform: (v) => `${v < 0.3 ? 'a trace' : v < 0.7 ? 'marked' : 'dominant'} · ${Number(v).toFixed(2)}`,
};
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const windWord = (deg) => `from the ${COMPASS[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8]} · ${Math.round(Number(deg))}°`;

// Little drawings of each shape of land, in the line of a profile.
const GLYPHS = {
  central_massif: 'M2 22 C14 21 18 6 30 5 C42 6 46 21 58 22',
  rift_valley: 'M2 9 C10 7 18 8 24 10 L28 21 L32 21 L36 10 C42 8 50 7 58 9',
  coastal_shelf: 'M2 6 C14 6 24 9 34 15 C42 19 48 21 58 22 M36 22 H58',
  basin: 'M2 7 C8 5 12 7 16 12 C22 20 38 20 44 12 C48 7 52 5 58 7',
  scattered: 'M2 20 L10 12 L15 17 L22 8 L28 18 L36 11 L42 19 L49 9 L58 20',
  flatlands: 'M2 17 C14 16 22 18 32 17 C42 16 50 18 58 17',
  rolling_hills: 'M2 18 C8 10 14 10 20 16 C26 21 32 12 38 12 C44 12 50 20 58 15',
  mesa_badlands: 'M2 20 H10 V11 H22 V15 H30 V7 H42 V16 H50 V12 H58',
  alpine_extreme: 'M2 21 L9 9 L13 15 L20 3 L26 14 L31 7 L38 18 L44 5 L50 15 L58 21',
  archipelago: 'M2 19 H58 M6 19 C9 12 14 12 17 19 M26 19 C29 9 35 9 38 19 M46 19 C48 14 52 14 54 19',
};
const glyph = (id) => (GLYPHS[id] ? `<svg class="wb-glyph" viewBox="0 0 60 26" aria-hidden="true"><path d="${GLYPHS[id]}"/></svg>` : '');

// ── The draft ──────────────────────────────────────────────────────────────
// { kind, name, seed, book, extras, atlas, prose }: the book as the form holds it.
const DEFAULT_EXTRAS = { temperature: { mode: 'derived', min: 4, max: 22 }, rainfall: { mode: 'derived', amount: 0.5 }, wind: { direction: 270, strength: 0.5 }, landforms: [], regime: 'temperate' };

const bookPart = (book) => ({
  structure: { form: book.structure.form }, terrain: { profile: book.terrain.profile, intensity: book.terrain.intensity },
  ground: { palette: book.ground.palette, vegetation: book.ground.vegetation }, sky: { palette: book.sky.palette },
  climate: { latitude: book.climate.latitude }, water: { level: book.water.level }, fog: { density: book.fog.density },
  suns: [...(book.suns || [])], regions: (book.regions || []).map((r) => ({ where: r.where, modifier: r.modifier || '', physics: r.physics || '' })),
  unmapped: [...(book.unmapped || [])],
});

export function blankDraft(core, kind = 'natural') {
  const book = clone(core.dictionary.DEFAULT_BOOK);
  const draft = {
    kind, name: '', seed: '', book: bookPart(book), extras: clone(DEFAULT_EXTRAS),
    atlas: { scale: 'region', sea: { side: 'west', coast: 'gentle', reach: 0.3 }, ground: 'meadow', towns: 'generated' },
    prose: '',
  };
  return draft;
}

export function draftFromDocument(core, doc) {
  const book = core.worldDocumentToBook(doc);
  const L = doc.layers;
  const t = L.climate.temperature || {};
  const r = L.hydrology.rainfall || {};
  const a = L.atlas || {};
  return {
    kind: a.enabled ? 'atlas' : 'natural',
    name: doc.identity.name, seed: doc.identity.masterSeed,
    book: bookPart(book),
    extras: {
      temperature: { mode: t.mode === 'fixed' ? 'fixed' : 'derived', min: Number.isFinite(t.min) ? t.min : 4, max: Number.isFinite(t.max) ? t.max : 22 },
      rainfall: { mode: r.mode === 'fixed' ? 'fixed' : 'derived', amount: Number.isFinite(r.amount) ? r.amount : 0.5 },
      wind: { direction: Number(L.climate.prevailingWind?.direction ?? 270), strength: Number(L.climate.prevailingWind?.strength ?? 0.5) },
      landforms: (L.topography.landforms || []).filter((l) => !l.scope || l.scope.kind === 'global').map((l) => ({ id: l.id, kind: l.kind, intensity: Number(l.intensity) })),
      regime: L.hydrology.systems?.rainfallRegime || 'temperate',
    },
    atlas: {
      scale: a.scale || 'region',
      sea: { side: a.sea?.side || 'west', coast: a.sea?.coast || 'gentle', reach: Number(a.sea?.reach ?? 0.3) },
      ground: a.ground || 'meadow', towns: a.towns || 'generated',
    },
    prose: doc.source?.originalProse || '',
  };
}

export const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The book as the engine is given it (a raw book, checked by validateAgeBook). */
export function rawBook(draft) {
  const b = draft.book;
  return {
    seed: (draft.seed || draft.name || 'Unnamed Age').trim(),
    structure: { ...b.structure }, terrain: { ...b.terrain }, ground: { ...b.ground }, sky: { ...b.sky },
    climate: { ...b.climate }, water: { ...b.water }, fog: { ...b.fog }, suns: [...b.suns],
    regions: b.regions.map((r) => ({ where: r.where, ...(r.modifier ? { modifier: r.modifier } : {}), ...(r.physics ? { physics: r.physics } : {}) })),
    features: [], unmapped: b.unmapped.map((s) => String(s).trim()).filter(Boolean),
  };
}

const stableLandformId = (kind, i) => `landform_${kind}_${i + 1}`;

/**
 * Lays the fields the flat book cannot say onto a World Document: the
 * climate's temperature and wind, the rain, the landforms, the atlas. Only
 * what the draft changes from `base` is written, so an untouched world plans
 * no change.
 */
export function applyExtras(core, doc, draft, base = null, now = Date.now()) {
  const L = doc.layers;
  const before = base ? draftFromDocument(core, base) : null;
  const ex = draft.extras;
  const changed = (key) => !before || JSON.stringify(before.extras[key]) !== JSON.stringify(ex[key]);
  if (changed('temperature')) {
    L.climate.temperature = ex.temperature.mode === 'fixed'
      ? { mode: 'fixed', min: Math.min(Number(ex.temperature.min), Number(ex.temperature.max)), max: Math.max(Number(ex.temperature.min), Number(ex.temperature.max)), unit: 'celsius' }
      : { mode: 'derived', unit: 'celsius' };
  }
  if (changed('rainfall')) {
    L.hydrology.rainfall = ex.rainfall.mode === 'fixed' ? { mode: 'fixed', amount: Number(ex.rainfall.amount) } : { mode: 'climate-derived' };
  }
  if (changed('wind')) L.climate.prevailingWind = { direction: ((Number(ex.wind.direction) % 360) + 360) % 360, strength: Number(ex.wind.strength) };
  if (changed('regime')) L.hydrology.systems.rainfallRegime = ex.regime;
  if (changed('landforms')) {
    const placed = (L.topography.landforms || []).filter((l) => l.scope && l.scope.kind !== 'global');
    L.topography.landforms = [
      ...placed,
      ...ex.landforms.map((l, i) => ({ id: l.id || stableLandformId(l.kind, i), kind: l.kind, intensity: Number(l.intensity), scope: { kind: 'global' } })),
    ];
  }
  if (draft.kind === 'atlas') {
    const a = L.atlas;
    const at = draft.atlas;
    if (!base || !a.enabled) a.enabled = true;
    if (!before || before.atlas.scale !== at.scale) a.scale = at.scale;
    if (!before || JSON.stringify(before.atlas.sea) !== JSON.stringify(at.sea)) a.sea = { side: at.sea.side, coast: at.sea.coast, reach: Number(at.sea.reach) };
    if (!before || before.atlas.ground !== at.ground) a.ground = at.ground;
    if (!before || before.atlas.towns !== at.towns) a.towns = at.towns;
  }
  // Chosen by hand, not read from prose.
  Object.entries(doc.provenance || {}).forEach(([path, record]) => {
    if (record?.source === 'prose' && record.updatedAt === now) doc.provenance[path] = { source: 'manual', updatedAt: now, note: 'Chosen by hand in the Aetheria Archive world builder.' };
  });
  return doc;
}

/**
 * The World Document the draft describes: a new one (createWorldDocument), or
 * the world's own rebuilt from the book the way Aetheria's "Rebuild from the
 * book" does (updateWorldDocumentFromBook), with the extras laid on.
 */
export function candidateFrom(core, draft, base = null) {
  const raw = rawBook(draft);
  const { book, warnings } = core.validateAgeBook(raw);
  const now = Date.now();
  const name = (draft.name || '').trim() || raw.seed;
  const doc = base
    ? core.updateWorldDocumentFromBook(base, book, { now, rawCompiled: raw, originalProse: draft.prose, name })
    : core.createWorldDocument(book, { now, name, masterSeed: raw.seed, originalProse: draft.prose, rawCompiled: raw });
  applyExtras(core, doc, draft, base, now);
  return { doc, warnings, book, raw };
}

// ── The form ───────────────────────────────────────────────────────────────
const choices = ({ path, label, value, options, columns = '' }) => `
  <div class="wb-choices${columns ? ` wb-choices-${columns}` : ''}" role="radiogroup" aria-label="${esc(label)}" data-choices="${esc(path)}">
    ${options.map((o) => {
      const on = String(o.value) === String(value);
      return `<button type="button" class="wb-choice" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-choose="${esc(path)}" data-value="${esc(o.value)}">
        ${o.art || ''}<span class="wb-choice-text"><strong>${esc(o.label)}</strong>${o.prose ? `<small>${esc(o.prose)}</small>` : ''}</span>
      </button>`;
    }).join('')}
  </div>`;

const stopsGradient = (stops) => `linear-gradient(90deg, ${stops.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ')})`;

function nameGroup(core, draft, existing) {
  return group('Name', `
    ${fieldRow(
      textField({ path: 'name', label: 'Name', value: draft.name, placeholder: 'Kethra, the Shattered Noon', hint: 'What the world is called.' }),
      existing
        ? `<div class="field"><span class="field-label">Seed</span><p class="wb-seed mono">${esc(draft.seed)}</p><span class="field-hint">A world keeps its seed. A new world grows different land.</span></div>`
        : `<label class="field"><span class="field-label">Seed</span>
            <span class="wb-seed-row"><input class="input mono" data-path="seed" data-kind="text" value="${esc(draft.seed)}" placeholder="the name, if left empty" autocomplete="off" spellcheck="false" aria-label="Seed"><button type="button" class="btn btn-sm btn-ghost" data-act="reseed" title="Another seed">Another</button></span>
            <span class="field-hint">The words the land is grown from. The same seed grows the same land.</span></label>`,
    )}`);
}

function sunRows(core, draft) {
  const S = core.dictionary.SUN_COLORS;
  const suns = draft.book.suns;
  return `<div class="wb-rows" data-rows="suns">
    ${suns.map((sun, i) => `<div class="wb-row">
      <span class="wb-sun" style="--sun:${esc(S[sun]?.[0] || '#fff')}" aria-hidden="true"></span>
      ${selectField({ path: `book.suns.${i}`, label: i === 0 ? 'The brightest sun' : `Sun ${i + 1}`, value: sun, options: Object.keys(S).map((k) => ({ value: k, label: `${NAMES.sun[k]} · ${S[k][1]}` })) })}
      <button type="button" class="btn btn-sm btn-ghost wb-remove" data-remove="suns" data-index="${i}" aria-label="Take away this sun">Remove</button>
    </div>`).join('') || '<p class="faint wb-none">No sun at all.</p>'}
    ${suns.length < 3 ? '<button type="button" class="btn btn-sm" data-add="suns">Add a sun</button>' : ''}
  </div>`;
}

function regionRows(draft) {
  const regions = draft.book.regions;
  return `<div class="wb-rows" data-rows="regions">
    ${regions.map((r, i) => `<div class="wb-row wb-row-region">
      ${selectField({ path: `book.regions.${i}.where`, label: 'Where', value: r.where, options: Object.entries(NAMES.where).map(([value, label]) => ({ value, label })) })}
      ${selectField({ path: `book.regions.${i}.modifier`, label: 'The ground there', value: r.modifier, options: [{ value: '', label: 'As the land is' }, { value: 'scarred', label: 'Scarred · torn and spiked' }] })}
      ${selectField({ path: `book.regions.${i}.physics`, label: 'Its water', value: r.physics, options: [{ value: '', label: 'Runs downhill' }, { value: 'inverted_flow', label: 'Runs uphill' }] })}
      <button type="button" class="btn btn-sm btn-ghost wb-remove" data-remove="regions" data-index="${i}" aria-label="Take away this region">Remove</button>
    </div>`).join('') || '<p class="faint wb-none">No region is marked apart.</p>'}
    ${regions.length < 6 ? '<button type="button" class="btn btn-sm" data-add="regions">Mark a region</button>' : ''}
  </div>`;
}

function landformRows(core, draft) {
  const kinds = core.AGE_LANGUAGE_DICTIONARY.landforms;
  const list = draft.extras.landforms;
  return `<div class="wb-rows" data-rows="landforms">
    ${list.map((l, i) => `<div class="wb-row wb-row-landform">
      ${selectField({ path: `extras.landforms.${i}.kind`, label: 'Landform', value: l.kind, options: kinds.map((k) => ({ value: k, label: `${NAMES.landform[k] || titled(k)} · ${LANDFORM_PROSE[k] || ''}` })) })}
      ${rangeField({ path: `extras.landforms.${i}.intensity`, label: 'How strongly', value: l.intensity, min: 0, max: 1, step: 0.05, format: WORDS.landform })}
      <button type="button" class="btn btn-sm btn-ghost wb-remove" data-remove="landforms" data-index="${i}" aria-label="Take away this landform">Remove</button>
    </div>`).join('') || '<p class="faint wb-none">The land as the shape and profile make it.</p>'}
    ${list.length < 8 ? '<button type="button" class="btn btn-sm" data-add="landforms">Add a landform</button>' : ''}
  </div>`;
}

function skyGroup(core, draft) {
  const D = core.dictionary;
  return group('Sky', `
    ${choices({ path: 'book.sky.palette', label: 'Sky', value: draft.book.sky.palette, columns: 'wide', options: Object.keys(D.SKY_PALETTES).map((k) => {
      const r = D.SKY_PALETTES[k].render;
      return { value: k, label: NAMES.sky[k] || titled(k), prose: D.SKY_PALETTES[k].prose, art: `<span class="wb-swatch" style="background:linear-gradient(180deg, ${r.hemiSky}, ${r.bg} 60%, ${r.fog})" aria-hidden="true"></span>` };
    }) })}
    ${rangeField({ path: 'book.fog.density', label: 'Fog', value: draft.book.fog.density, min: 0, max: 1, step: 0.01, format: WORDS.fog, hint: '0 is crystal air; 1, you cannot see far.' })}
    <div class="field"><span class="field-label">Suns, brightest first</span>${sunRows(core, draft)}</div>`);
}

function climateGroup(core, draft, { atlas = false } = {}) {
  const ex = draft.extras;
  const regimes = core.AGE_LANGUAGE_DICTIONARY.hydrology.rainfallRegimes;
  return group('Climate', `
    ${choices({ path: 'book.climate.latitude', label: 'Latitude', value: draft.book.climate.latitude, columns: 'three', options: Object.keys(core.dictionary.LATITUDES).map((k) => ({ value: k, label: NAMES.latitude[k], prose: LATITUDE_PROSE[k] })) })}
    ${fieldRow(
      selectField({ path: 'extras.temperature.mode', label: 'Temperature', value: ex.temperature.mode, options: [{ value: 'derived', label: 'As the latitude and height make it' }, { value: 'fixed', label: 'Held between two values' }] }),
      ex.temperature.mode === 'fixed' ? numberField({ path: 'extras.temperature.min', label: 'Coldest, °C', value: ex.temperature.min, min: -60, max: 60, step: 1 }) : '',
      ex.temperature.mode === 'fixed' ? numberField({ path: 'extras.temperature.max', label: 'Warmest, °C', value: ex.temperature.max, min: -60, max: 60, step: 1 }) : '',
    )}
    ${atlas
      ? selectField({ path: 'extras.regime', label: 'Rain', value: ex.regime, options: regimes.map((r) => ({ value: r, label: titled(r) })), hint: 'How the year’s rain falls. It colours the ground the map grows.' })
      : `${fieldRow(
        selectField({ path: 'extras.rainfall.mode', label: 'Rain', value: ex.rainfall.mode, options: [{ value: 'derived', label: 'As the wind and the land make it' }, { value: 'fixed', label: 'Set by hand' }] }),
        ex.rainfall.mode === 'fixed' ? rangeField({ path: 'extras.rainfall.amount', label: 'How much', value: ex.rainfall.amount, min: 0, max: 1, step: 0.01, format: WORDS.rain }) : '',
      )}
      ${fieldRow(
        rangeField({ path: 'extras.wind.direction', label: 'Prevailing wind', value: ex.wind.direction, min: 0, max: 359, step: 1, format: windWord, hint: 'Where the weather comes from. Rain falls on the hills that face it.' }),
        rangeField({ path: 'extras.wind.strength', label: 'Its strength', value: ex.wind.strength, min: 0, max: 1, step: 0.01, format: WORDS.strength }),
      )}`}`);
}

function keptGroup(draft) {
  return group('Kept off the map', `
    <label class="field"><span class="field-label">What the world cannot show</span>
      <textarea class="textarea" id="f-book-unmapped" data-path="book.unmapped" data-kind="lines" rows="3" placeholder="the rivers sing at dusk&#10;no one remembers the old king">${esc(draft.book.unmapped.join('\n'))}</textarea>
      <span class="field-hint">One thing to a line, up to eight. The world keeps them as unresolved, and is a little unstable for each.</span></label>`);
}

function proseGroup(draft) {
  return group('The descriptive book', `
    ${areaField({ path: 'prose', label: 'The world in prose', value: draft.prose, rows: 5, tokens: false, placeholder: 'Describe the place as you would to a reader: its land and water, its weather, what it feels like to stand there.', hint: 'Kept with the world, and read by the story in Aetheria. Writing the world from prose happens in Aetheria.' })}`);
}

/** The whole form, for a world grown from its land or one drawn as a map. */
export function bookFormHtml(core, draft, { existing = false } = {}) {
  const D = core.dictionary;
  const b = draft.book;
  const kind = existing ? '' : group('What kind of world', choices({
    path: 'kind', label: 'What kind of world', value: draft.kind, columns: 'two', options: [
      { value: 'natural', label: 'Grown from the land', prose: 'Terrain grown cell by cell from the words below: its heights, water, weather and ground.' },
      { value: 'atlas', label: 'Drawn as a map', prose: 'Places and how they relate. Set the sea and the ground here, then set down towns, roads and woods on the map.' },
    ],
  }));
  if (draft.kind === 'atlas') {
    const A = draft.atlas;
    return `${kind}${nameGroup(core, draft, existing)}
      ${group('The map', `
        ${choices({ path: 'atlas.scale', label: 'How much the map holds', value: A.scale, columns: 'two', options: Object.entries(ATLAS_SCALE).map(([value, [label, prose]]) => ({ value, label, prose })) })}
        ${fieldRow(
          selectField({ path: 'atlas.sea.side', label: 'The sea', value: A.sea.side, options: Object.entries(SEA_SIDES).map(([value, label]) => ({ value, label })) }),
          selectField({ path: 'atlas.sea.coast', label: 'Its coast', value: A.sea.coast, options: Object.entries(COASTS).map(([value, label]) => ({ value, label })) }),
        )}
        ${A.sea.side === 'none' ? '' : rangeField({ path: 'atlas.sea.reach', label: 'How far the sea reaches in', value: A.sea.reach, min: 0.1, max: 0.6, step: 0.01, format: WORDS.reach })}
        ${selectField({ path: 'atlas.ground', label: 'The ground no area claims', value: A.ground, options: core.LAND_KINDS.map((k) => ({ value: k.id, label: `${titled(k.label)} · ${k.prose}` })) })}
        ${choices({ path: 'atlas.towns', label: 'Towns', value: A.towns, columns: 'two', options: [
          { value: 'generated', label: 'Laid out from the book', prose: 'Streets, squares and houses grow round the places you name.' },
          { value: 'manual', label: 'Only what you place', prose: 'A town holds only what you set down in it, and the streets that reach it.' },
        ] })}`)}
      ${skyGroup(core, draft)}
      ${climateGroup(core, draft, { atlas: true })}
      ${keptGroup(draft)}
      ${proseGroup(draft)}`;
  }
  const palette = D.GROUND_PALETTES;
  return `${kind}${nameGroup(core, draft, existing)}
    ${group('The shape of the land', `
      ${choices({ path: 'book.structure.form', label: 'Structure', value: b.structure.form, options: Object.keys(D.STRUCTURE_FORMS).map((k) => ({ value: k, label: NAMES.structure[k] || titled(k), prose: D.STRUCTURE_FORMS[k], art: glyph(k) })) })}
      ${choices({ path: 'book.terrain.profile', label: 'Terrain', value: b.terrain.profile, options: Object.keys(D.TERRAIN_PROFILES).map((k) => ({ value: k, label: NAMES.terrain[k] || titled(k), prose: D.TERRAIN_PROFILES[k].prose, art: glyph(k) })) })}
      ${rangeField({ path: 'book.terrain.intensity', label: 'Intensity', value: b.terrain.intensity, min: 0, max: 1, step: 0.01, format: WORDS.intensity, hint: '0 is the gentle version of the terrain; 1, the extreme.' })}
      <div class="field"><span class="field-label">Landforms</span>${landformRows(core, draft)}<span class="field-hint">Laid over the whole land: a chain of mountains, a field of dunes.</span></div>`)}
    ${group('Ground', `
      ${choices({ path: 'book.ground.palette', label: 'Ground', value: b.ground.palette, columns: 'wide', options: Object.keys(palette).map((k) => ({
        value: k, label: NAMES.ground[k] || titled(k), prose: palette[k].prose,
        art: `<span class="wb-swatch" style="background:${stopsGradient(palette[k].stops)}" aria-hidden="true"></span>`,
      })) })}
      ${biomesHtml(core, b.ground.palette)}
      ${rangeField({ path: 'book.ground.vegetation', label: 'Vegetation', value: b.ground.vegetation, min: 0, max: 1, step: 0.01, format: WORDS.vegetation, hint: '0 is barren; 1, overgrown.' })}`)}
    ${group('Water', `
      ${rangeField({ path: 'book.water.level', label: 'How much is under water', value: b.water.level, min: 0, max: 1, step: 0.01, format: WORDS.water, hint: '0 is dry; 0.2, narrow seas; 0.5, half drowned; 0.85, islands.' })}`)}
    ${skyGroup(core, draft)}
    ${climateGroup(core, draft)}
    ${group('Regions', `<p class="field-hint wb-lead">Parts of the world set apart: ground torn by something wrong, or water that runs uphill.</p>${regionRows(draft)}`)}
    ${keptGroup(draft)}
    ${proseGroup(draft)}`;
}

/** The nine kinds of ground a palette grows, by name and colour. */
export function biomesHtml(core, palette) {
  const p = core.dictionary.GROUND_PALETTES[palette];
  if (!p) return '';
  const B = core.dictionary.BIOMES;
  return `<div class="wb-biomes" data-biomes aria-label="The ground it grows">
    ${p.biomes.flat().map((id) => `<span class="wb-biome" title="${esc(B[id]?.[1] || '')}"><i style="background:${esc(B[id]?.[0] || '#777')}"></i>${esc(core.biomeName(id))}</span>`).join('')}
  </div>`;
}

/** Wiring for the parts bindSheet does not cover: choices, rows, the seed. */
export function wireBookForm(root, { get, onChange, onStructure }) {
  const choose = (btn) => {
    const draft = get();
    const path = btn.dataset.choose;
    const keys = path.split('.');
    let o = draft; keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys[keys.length - 1]] = btn.dataset.value;
    for (const b of root.querySelectorAll(`[data-choose="${CSS.escape(path)}"]`)) {
      const on = b === btn; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    }
    onChange(path, btn.dataset.value);
  };
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-choose]');
    if (c && root.contains(c)) { choose(c); return; }
    const add = e.target.closest('[data-add]');
    const rem = e.target.closest('[data-remove]');
    const draft = get();
    if (add) {
      const what = add.dataset.add;
      if (what === 'suns') draft.book.suns.push(draft.book.suns.length ? 'white' : 'gold');
      if (what === 'regions') draft.book.regions.push({ where: 'north', modifier: '', physics: '' });
      if (what === 'landforms') draft.extras.landforms.push({ kind: 'mountain_chain', intensity: 0.5 });
      onStructure(what, `[data-rows="${what}"] [data-add], [data-rows="${what}"] .wb-row:last-of-type select`);
    } else if (rem) {
      const what = rem.dataset.remove; const i = Number(rem.dataset.index);
      if (what === 'suns') draft.book.suns.splice(i, 1);
      if (what === 'regions') draft.book.regions.splice(i, 1);
      if (what === 'landforms') draft.extras.landforms.splice(i, 1);
      onStructure(what, `[data-rows="${what}"] [data-add]`);
    } else if (e.target.closest('[data-act="reseed"]')) {
      const words = ['ash', 'brine', 'cinder', 'dusk', 'ember', 'fen', 'gale', 'harrow', 'iris', 'jade', 'kestrel', 'lantern', 'mere', 'noon', 'oriel', 'quill', 'rook', 'sable', 'thorn', 'umber', 'vale', 'willow', 'yew'];
      const pick = () => words[Math.floor(Math.random() * words.length)];
      draft.seed = `${(draft.name || 'Unnamed').trim()} · ${pick()} ${Math.floor(Math.random() * 900 + 100)}`;
      const input = root.querySelector('[data-path="seed"]'); if (input) input.value = draft.seed;
      onChange('seed', draft.seed);
    }
  });
  // A radiogroup moves with the arrow keys, as radios do.
  root.addEventListener('keydown', (e) => {
    const c = e.target.closest('[data-choose]');
    if (!c || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const all = [...root.querySelectorAll(`[data-choose="${CSS.escape(c.dataset.choose)}"]`)];
    const i = all.indexOf(c);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + all.length) % all.length;
    e.preventDefault(); all[next].focus(); choose(all[next]);
  });
}
