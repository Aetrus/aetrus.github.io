// The world engine, as the World builder uses it: Aetheria's own service and
// engine (bundled in vendor/aetheria/world.js), with the few web-side pieces
// Aetheria leaves to its shell: which resolution a new world is built at, the
// worker's main-thread fallback, a progress estimate while a bake runs, and a
// file to download instead of a save dialog.
import { store } from '../../ui.js';

let corePromise = null;
export const loadCore = () => (corePromise ||= import('../../vendor/aetheria/world.js'));
let starterPromise = null;
export const loadStarter = () => (starterPromise ||= import('../../vendor/aetheria/world-starter.js'));

/** The timeline the builder reads and writes: the world's own default one, which every story begins from. */
export const TIMELINE = 'timeline_main';

// ── Detail ─────────────────────────────────────────────────────────────────
// Aetheria builds every new world 256 cells across. A phone gets 128 unless
// its owner asks for more: the bake is quicker and the file a quarter the size.
export const DETAILS = [
  { value: 128, label: 'Light', hint: '128 cells across. Quick on a phone, and a quarter of the file.' },
  { value: 256, label: 'Full', hint: '256 cells across, as Aetheria builds a world.' },
];
const phoneLike = () => matchMedia('(max-width: 700px), (pointer: coarse)').matches;
export const detail = {
  get() { const v = Number(store.get('aetheria.world.detail')); return DETAILS.some((d) => d.value === v) ? v : (phoneLike() ? 128 : 256); },
  set(v) { store.set('aetheria.world.detail', Number(v)); },
};

// ── The worker, and the main thread when it cannot start ───────────────────
// The bundle's worker guard reads globalThis.__aeWorldNoWorker (build-world.sh).
const workerTrouble = (e) => e && e.name !== 'AbortError' && /worker|^Uncaught|Failed to/i.test(String(e.message || ''));
export async function withEngine(run) {
  try { return await run(); } catch (e) {
    if (globalThis.__aeWorldNoWorker || !workerTrouble(e)) throw e;
    globalThis.__aeWorldNoWorker = true;
    return run();
  }
}
export const onMainThread = () => Boolean(globalThis.__aeWorldNoWorker);

// ── Progress ───────────────────────────────────────────────────────────────
// A bake runs in one piece inside the worker, so its progress is an estimate
// from how long the last bake of that size took, said in the engine's stages.
const PHASES = {
  natural: ['Raising the land', 'Letting the water find its way down', 'Reading the weather', 'Laying out the ground', 'Drawing the map'],
  atlas: ['Laying out the coast', 'Setting down the places', 'Running the roads', 'Drawing the map'],
  plan: ['Reading the change', 'Rebuilding what it touches', 'Drawing the preview'],
  save: ['Keeping it in this browser'],
};
const msPerCell = () => Number(store.get('aetheria.world.msPerCell')) || 0.009;
export function progress(kind = 'natural', cells = 256 * 256, onTick = () => {}) {
  const phases = PHASES[kind] || PHASES.natural;
  const expected = 260 + msPerCell() * cells;
  const started = performance.now();
  let raf = 0; let done = false;
  const tick = () => {
    if (done) return;
    const t = performance.now() - started;
    const f = Math.min(0.96, 1 - Math.exp((-1.7 * t) / expected));
    onTick({ fraction: f, phase: phases[Math.min(phases.length - 1, Math.floor(f * phases.length))], seconds: t / 1000 });
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    finish({ learn = false } = {}) {
      done = true; cancelAnimationFrame(raf);
      const t = performance.now() - started;
      if (learn && cells > 0 && t > 40) store.set('aetheria.world.msPerCell', Math.max(0.002, Math.min(0.08, (t - 120) / cells)));
      onTick({ fraction: 1, phase: phases[phases.length - 1], seconds: t / 1000 });
    },
  };
}
/** Let the page paint before a bake that may run on this thread. */
export const nextPaint = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));

// ── Pictures ───────────────────────────────────────────────────────────────
/**
 * The map of a world grown from its land, from its RGBA grid. Row 0 of the grid
 * is the south edge; the picture is turned north up, as the map is drawn.
 */
export function rgbaPicture(rgba, resolution) {
  const grid = document.createElement('canvas'); grid.width = resolution; grid.height = resolution;
  grid.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), resolution, resolution), 0, 0);
  const c = document.createElement('canvas'); c.width = resolution; c.height = resolution;
  const ctx = c.getContext('2d');
  ctx.translate(0, resolution); ctx.scale(1, -1); ctx.drawImage(grid, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Aetheria keeps a grown world's card picture as its grid lies, south up; the
 * builder keeps it north up, as its map reads. Run after the engine redraws it.
 */
/**
 * After an authored change to a world drawn as a map, Aetheria's
 * agesCommitAuthoringPlan keeps the plan's document as it was before it was
 * laid out (it sets the preview's document back to the pending one), so the
 * new place has no streets and the coast is the old one until the next
 * rebuild. The layout is seeded, so laying the kept document out again gives
 * exactly what the preview showed and the grids were baked from.
 */
export async function relayAtlas(core, worldId) {
  const world = await core.getWorld(worldId);
  if (!world?.document?.layers?.atlas?.enabled) return;
  core.prepareAtlasDocument(world.document);
  await core.putWorld(world);
}

export async function northUp(core, worldId) {
  const world = await core.getWorld(worldId);
  if (!world || world.document?.layers?.atlas?.enabled || !world.mapRgba?.length) return;
  const url = rgbaPicture(world.mapRgba, world.manifest.resolution);
  if (world.mapDataUrl === url) return;
  world.mapDataUrl = url;
  await core.putWorld(world);
}

// ── Building a new world from a book ───────────────────────────────────────
/**
 * Aetheria's agesBake for a world not yet made (services/agesEngineService.ts:
 * agesBake, and bakeNewDocument for one drawn as a map), at the resolution
 * chosen here rather than its fixed 256. `document` is the World Document the
 * book describes (book.js candidateFrom).
 */
export async function buildWorld(core, { document, resolution = 256, onProgress }) {
  const atlas = Boolean(document.layers?.atlas?.enabled);
  if (atlas) core.prepareAtlasDocument(document);
  const validation = core.validateWorldDocument(document);
  if (!validation.valid) throw new Error(`Invalid World Document: ${validation.errors.join(' ')}`);
  const now = Date.now();
  const meter = progress(atlas ? 'atlas' : 'natural', resolution * resolution, onProgress);
  let baked;
  try {
    await nextPaint();
    baked = await withEngine(() => core.bakeWorldAsync(document, resolution));
  } finally { meter.finish({ learn: Boolean(baked) && !atlas }); }
  const worldId = document.identity.ageId;
  document.identity.lastBakedAt = now; document.identity.updatedAt = now;
  baked.manifest.world_id = worldId;
  const world = {
    ...baked,
    worldId,
    document,
    mapDataUrl: (atlas && core.atlasPicture(document.layers.atlas)) || rgbaPicture(baked.mapRgba, baked.manifest.resolution),
    state: document.layers.liveState.timelines[document.layers.liveState.defaultTimelineId]?.state,
    createdAt: now,
    updatedAt: now,
    formatVersion: core.AGE_WORLD_FORMAT_VERSION,
    generatorVersion: core.AGE_GENERATOR_VERSION,
    derivedCache: core.buildDerivedCache(document, {}, undefined, now),
  };
  await core.putWorld(world);
  return { world_id: worldId, name: document.identity.name, instability: baked.manifest.instability, notes: document.layers.atlas?.notes || [] };
}

/** A quick look at a book: baked small, off the page's thread when the worker is there. */
export async function previewBook(core, document, resolution = 64) {
  const baked = await withEngine(() => core.bakeWorldAsync(document, resolution));
  return rgbaPicture(baked.mapRgba, baked.manifest.resolution);
}

// ── Export ─────────────────────────────────────────────────────────────────
/**
 * What Aetheria's exportWorld does on the web (ages-engine/storage.ts): the
 * world serialised by the engine's own portable format, named the engine's
 * way. Returned for the page to hand over as a download.
 */
export async function exportWorld(core, worldId, options = {}) {
  const world = await core.getWorld(worldId);
  if (!world) throw new Error('That world is no longer in this browser.');
  const contents = core.serializeWorld(world, { ...options, includePreview: options.includePreview !== false, appVersion: '1.1.5' });
  return { filename: core.ageFileName(world), contents };
}

export const sizeWord = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
