// Writes Aetheria's starter set, Lantern Quay, into the Archive as the files Aetheria itself
// would export: the two cards as PNG cards with the lorebook bound in, the lorebook as World
// Info, the house preset as a SillyTavern preset, the world as an .aetheria-age package, and
// the pictures as covers for the gallery. Then it reads every file back the way this site and
// Aetheria read them, and stops if any does not come back whole.
//
//   cd tools/starter-set
//   npm install            (once)
//   node generate.mjs      (or: node generate.mjs "D:\path\to\Aetheria Experiemental\src")
//
//   --check        build and read back, write nothing
//   --full-world   the world as the full built package (about 7 MB) rather than a recipe
//
// Everything comes from Aetheria's source (src/starter/, src/presets/storyteller.js) through
// Aetheria's own code, bundled for Node with esbuild; nothing asks a model. Dates are the dates
// of the source files' last commits, and the world has a fixed identity, so running it again on
// the same source writes the same bytes. Needs Python with Pillow for the pictures.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WORLD, firstSentence, lorebookCopy, presetCopy, worldCopy } from './copy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '../..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const WORLD_MODE = argv.includes('--full-world') ? 'full' : 'recipe';
const src = resolve(argv.find((a) => !a.startsWith('--')) || process.env.AETHERIA_SRC
  || 'C:\\Users\\gjens\\Documents\\Antigravity creations\\Aetheria Experiemental\\src');
const repo = resolve(src, '..');
const cache = join(here, '.cache');

// Where each piece goes in the site, and the world's permanent identity (importing it twice
// offers to replace or merge, rather than adding a second Lantern Quay).
const WORLD_ID = 'age_lantern_quay_starter';
const CARD = {
  dilys: { slug: 'dilys-pengelly', file: 'cards/dilys-pengelly.png', thumb: 'covers/dilys-pengelly.webp' },
  ansel: { slug: 'ansel-truscott', file: 'cards/ansel-truscott.png', thumb: 'covers/ansel-truscott.webp' },
};
const WORK = {
  lorebook: { slug: 'lantern-quay-lorebook', file: 'works/lantern-quay-lorebook.json', thumb: 'covers/lantern-quay-lorebook.webp', cover: 'covers/lantern-quay-lorebook-large.webp' },
  preset: { slug: 'aetheria-storyteller', file: 'works/aetheria-storyteller.json', thumb: 'covers/aetheria-storyteller.webp', cover: 'covers/aetheria-storyteller-large.webp' },
  world: { slug: 'lantern-quay-world', file: 'works/lantern-quay.aetheria-age', thumb: 'covers/lantern-quay-world.webp', cover: 'covers/lantern-quay-world-large.webp' },
};
const BUILDER_BOOK = 'assets/js/builders/lorebook/lantern-quay.js';
const THUMB = { width: 520, height: 780, quality: 82 };

const warnings = [];
const warn = (s) => { warnings.push(s); console.warn(`  ! ${s}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const say = (s) => console.log(s);

if (!fs.existsSync(join(src, 'starter', 'lanternQuay.js'))) {
  console.error(`Aetheria's source is not at ${src}. Pass its src folder as the first argument.`);
  process.exit(1);
}

// ── Dates: when each piece's source last changed, from git ────────────────
function git(args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function changed(file) {
  const rel = relative(repo, file).replace(/\\/g, '/');
  try {
    if (git(['status', '--porcelain', '--', rel])) warn(`${rel} has changes not yet committed; it is dated by the file instead.`);
    else { const t = git(['log', '-1', '--format=%ct', '--', rel]); if (t) return Number(t) * 1000; }
  } catch { /* not a git checkout */ }
  return Math.floor(fs.statSync(file).mtimeMs / 1000) * 1000;
}
function begun(file) {
  try { const t = git(['log', '--reverse', '--format=%ct', '--', relative(repo, file).replace(/\\/g, '/')]).split('\n')[0]; if (t) return Number(t) * 1000; } catch { /* no git */ }
  return Math.floor(fs.statSync(file).birthtimeMs / 1000) * 1000;
}
const S = {
  lantern: join(src, 'starter', 'lanternQuay.js'),
  portraits: join(src, 'starter', 'portraitData.js'),
  covers: join(src, 'starter', 'coverData.js'),
  storyteller: join(src, 'presets', 'storyteller.js'),
};
const T = {
  cards: Math.max(changed(S.lantern), changed(S.portraits)),
  cardsBegun: begun(S.lantern),
  lorebook: Math.max(changed(S.lantern), changed(S.covers)),
  preset: Math.max(changed(S.storyteller), changed(S.covers)),
  world: Math.max(changed(S.lantern), changed(S.covers)),
};
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const seconds = (ms) => Math.floor(ms / 1000);

// ── Aetheria's code, bundled for Node ─────────────────────────────────────
say(`Aetheria source: ${src}`);
fs.mkdirSync(cache, { recursive: true });
const bundle = join(cache, 'aetheria-starter.mjs');
const stubs = join(here, '..', 'aetheria-core', 'stubs');
await build({
  entryPoints: [join(here, 'entry.js')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node20',
  loader: { '.js': 'jsx' }, logLevel: 'warning', nodePaths: [join(here, 'node_modules')],
  alias: {
    'aetheria-src': src,
    '@capacitor/core': join(stubs, 'capacitor-core.js'),
    '@capacitor/filesystem': join(stubs, 'capacitor-none.js'),
    '@capawesome/capacitor-file-picker': join(stubs, 'capacitor-none.js'),
  },
});
const A = await import(pathToFileURL(bundle).href);

// The app's clock, held at a source date while it works, so what it stamps is that date.
const RealDate = Date;
const realNow = performance.now;
async function at(ms, fn) {
  class SourceDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(ms); }
    static now() { return ms; }
  }
  globalThis.Date = SourceDate;
  performance.now = () => 0;
  try { return await fn(); } finally { globalThis.Date = RealDate; performance.now = realNow; }
}
// Some of the app's importers talk to the console as they go.
async function quietly(fn) {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
}

// ── Pictures ──────────────────────────────────────────────────────────────
say('Pictures');
const dataBytes = (url) => Buffer.from(String(url).slice(String(url).indexOf(',') + 1), 'base64');
const jobs = [];
for (const key of A.STARTER_KEYS) {
  const webp = join(cache, `portrait-${key}.webp`);
  fs.writeFileSync(webp, dataBytes(A.STARTER_PORTRAITS[key]));
  jobs.push({ op: 'png', src: webp, out: join(cache, `portrait-${key}.png`) });
  jobs.push({ op: 'cover', src: webp, out: join(cache, `thumb-${key}.webp`), ...THUMB });
}
for (const part of Object.keys(WORK)) {
  const webp = join(cache, `cover-${part}.webp`);
  fs.writeFileSync(webp, dataBytes(A.STARTER_COVERS[part]));
  jobs.push({ op: 'cover', src: webp, out: join(cache, `thumb-${part}.webp`), ...THUMB });
}
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
try {
  const made = execFileSync(python, [join(here, 'images.py')], { input: JSON.stringify(jobs), encoding: 'utf8' });
  say(made.trim().split(/\r?\n/).map((line) => `  ${relative(cache, line)}`).join('\n'));
} catch (e) {
  console.error(`The pictures could not be made with ${python} (it needs Pillow: pip install pillow). ${e.message}`);
  process.exit(1);
}

// ── The lorebook ──────────────────────────────────────────────────────────
// As the app keeps it once the set is in (LorebookContext.importLorebookFromFile: normalizeLorebook),
// exported with its picture as Aetheria exports a volume (stripLorebookMeta).
say('Lorebook');
const META = A.lore.LOREBOOK_META_KEY;
const held = A.lore.normalizeLorebook({ ...clone(A.STARTER_LOREBOOK), [META]: { id: 'lantern-quay', name: A.STARTER_LOREBOOK.name, version: 1 }, name: A.STARTER_LOREBOOK.name });
const lorebookText = `${JSON.stringify(A.lore.stripLorebookMeta(A.lore.normalizeLorebook({ ...held, coverImage: A.STARTER_COVERS.lorebook })), null, 2)}`;
// Bound into each card as its own character_book, the way SillyTavern binds one (and Aetheria reads it back).
const characterBook = A.toCharacterBook(held);

// ── The cards ─────────────────────────────────────────────────────────────
// In through the app's own door (src/starter/portraits.js puts each card in its portrait, the
// importer reads it), then out as the app exports a character (cardForExport, embedCardInImage),
// with the book it is bound to carried inside.
say('Cards');
const cards = {};
for (const key of A.STARTER_KEYS) {
  const card = clone(A.STARTER_CARDS[key]);
  const name = `${card.data.name}.png`;
  const portrait = new Blob([fs.readFileSync(join(cache, `portrait-${key}.png`))], { type: 'image/png' });
  const arrived = await A.embedCardInImage(portrait, card);
  const read = await A.extractCardFromImage(new File([await arrived.arrayBuffer()], name, { type: 'image/png' }));
  const character = { id: key, ...A.cardFieldsForImport(read), character_book: characterBook, creation_date: seconds(T.cardsBegun) };
  const out = await at(T.cards, async () => A.embedCardInImage(portrait, A.cardForExport(character)));
  cards[key] = { card, bytes: new Uint8Array(await out.arrayBuffer()) };
}

// ── The preset ────────────────────────────────────────────────────────────
// As the app files it (PresetContext.importPreset, then updatePreset for its picture) and
// exports it (exportSillyTavernPreset).
say('Preset');
async function presetRoundTrip(text, name) {
  return at(T.preset, () => quietly(async () => {
    const imported = await A.importSillyTavernPreset(new File([text], name, { type: 'application/json' }));
    const kept = A.validateAndFixPreset({ id: 'aetheria-storyteller', ...imported, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const covered = A.validateAndFixPreset({ ...kept, coverImage: A.STARTER_COVERS.preset, updated_at: new Date().toISOString() });
    return A.exportSillyTavernPreset(covered).text();
  }));
}
const presetText = await presetRoundTrip(JSON.stringify(A.STARTER_PRESET, null, 2), `${A.STARTER_PRESET.name}.json`);

// ── The world ─────────────────────────────────────────────────────────────
// Built as the starter set builds it (agesBakeCompilerProposal from its structure, no model),
// given its picture (agesSetWorldCover), and exported by agesExportWorld. On the desktop that
// hands the file to a save dialog; here the hand-off is caught instead.
say('World');
await at(T.world, () => quietly(async () => {
  await A.agesBakeCompilerProposal(clone(A.WORLD_STRUCTURE), { originalProse: A.WORLD_BOOK, ageId: WORLD_ID });
  await A.agesSetWorldCover(WORLD_ID, A.STARTER_COVERS.world);
}));
async function exportWorld(mode) {
  let saved = null;
  globalThis.window = { electron: { ipcRenderer: { invoke: async (channel, payload) => {
    if (channel !== 'ages-world-export') throw new Error(`The export asked for ${channel}.`);
    saved = payload;
    return { success: true };
  } } } };
  try { await at(T.world, () => A.agesExportWorld(WORLD_ID, { mode, liveState: 'excluded', author: 'Aetheria' })); } finally { delete globalThis.window; }
  return saved.contents;
}
const worldText = await exportWorld(WORLD_MODE);

// ── Reading it all back ───────────────────────────────────────────────────
say('Reading back');
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isSeconds = (v) => Number.isInteger(v) && v > 1e9 && v < 1e11;

// What an entry does, field by field, as Aetheria keeps it: a book read back must do the same.
const BEHAVIOUR = ['key', 'keysecondary', 'comment', 'content', 'constant', 'selective', 'selectiveLogic', 'order', 'position', 'disable',
  'probability', 'useProbability', 'depth', 'matchWholeWords', 'caseSensitive', 'sticky', 'cooldown', 'delay', 'scanDepth', 'role',
  'excludeRecursion', 'preventRecursion', 'delayUntilRecursion', 'group', 'groupOverride', 'groupWeight', 'ignoreBudget', 'triggers'];
const behaviour = (book) => Object.values(book.entries || {}).sort((a, b) => a.uid - b.uid)
  .map((e) => { const c = A.canonicalEntry(e); return Object.fromEntries(BEHAVIOUR.map((k) => [k, c[k]])); });
const heldBehaviour = behaviour(held);
const sameBook = (book, where) => {
  const got = behaviour(book);
  if (got.length !== heldBehaviour.length) return check(false, `${where}: ${got.length} entries, not ${heldBehaviour.length}`);
  const off = [];
  got.forEach((e, i) => BEHAVIOUR.forEach((k) => { if (!same(e[k], heldBehaviour[i][k])) off.push(`${heldBehaviour[i].comment}.${k}`); }));
  return check(!off.length, `${where}: entries differ (${off.slice(0, 6).join(', ')})`);
};

// The desktop's own reader of a card's book (public/main/lorebooks.js), with Electron stood in for.
let desktopBook = null;
try {
  const require = createRequire(import.meta.url);
  const Module = require('module');
  const load = Module._load;
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'aetheria-starter-'));
  Module._load = function stand(request, ...rest) {
    if (request === 'electron') return { ipcMain: { handle() {}, on() {} }, app: { getPath: () => tmp } };
    return load.call(this, request, ...rest);
  };
  const log = console.log;
  console.log = () => {};
  try {
    const lorebooks = createRequire(join(repo, 'public', 'main', 'lorebooks.js'))(join(repo, 'public', 'main', 'lorebooks.js'));
    desktopBook = lorebooks({ lorebooksPath: tmp, showSaveDialog() {}, isUserPickedSavePath: () => false }).convertEmbeddedCharacterLorebook;
  } finally { Module._load = load; console.log = log; fs.rmSync(tmp, { recursive: true, force: true }); }
} catch (e) { warn(`The desktop's card-book reader could not be loaded, so it was not checked (${e.message}).`); }

const FIELDS = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt',
  'post_history_instructions', 'alternate_greetings', 'group_only_greetings', 'tags', 'creator', 'character_version'];
const report = [];
for (const key of A.STARTER_KEYS) {
  const { card, bytes } = cards[key];
  const want = card.data;
  const name = want.name;
  // This site: the gallery, card page and Lens (lib/card.js), which reads ccv3 first.
  const siteRead = A.readCardBytes(bytes, `${name}.png`);
  check(siteRead.spec === 'v3' && same([...siteRead.chunks].sort(), ['ccv3', 'chara']), `${name}: the site reads ${siteRead.spec} from ${siteRead.chunks}`);
  FIELDS.forEach((f) => check(same(siteRead.data[f], want[f]), `${name}: the site reads ${f} differently`));
  check(isSeconds(siteRead.data.creation_date) && isSeconds(siteRead.data.modification_date), `${name}: V3 dates are not in seconds`);
  // Both chunks, as written: V2 in chara and V3 in ccv3, each with the book.
  const text = A.readTextChunks(bytes);
  const v2 = JSON.parse(A.base64ToUtf8(text.chara));
  const v3 = JSON.parse(A.base64ToUtf8(text.ccv3));
  check(v2.spec === 'chara_card_v2' && v2.spec_version === '2.0' && v3.spec === 'chara_card_v3' && v3.spec_version === '3.0', `${name}: the chunks carry ${v2.spec} and ${v3.spec}`);
  check(Array.isArray(v2.data.character_book?.entries) && Array.isArray(v3.data.character_book?.entries), `${name}: a chunk has no character_book`);
  check(isSeconds(v3.data.creation_date) && isSeconds(v3.data.modification_date), `${name}: ccv3 dates are not in seconds`);
  check(!('defaultLorebookIds' in (v2.data.extensions || {})), `${name}: a device-only extension went out`);
  const order = A.listChunks(bytes).map((c) => c.type);
  check(order[0] === 'IHDR' && order[order.length - 1] === 'IEND', `${name}: the PNG's chunks are out of order`);
  // Aetheria: extractCardFromImage, as Import reads a PNG card (chara first, where both are).
  const appRead = await A.extractCardFromImage(new File([bytes], `${name}.png`, { type: 'image/png' }));
  FIELDS.forEach((f) => check(same(appRead[f], want[f]), `${name}: Aetheria reads ${f} differently`));
  check(appRead.creation_date === seconds(T.cardsBegun) && appRead.modification_date === seconds(T.cards), `${name}: Aetheria reads other dates`);
  check(appRead.extensions?.aetheria_starter === key, `${name}: the starter mark is missing`);
  // The book, as each reader files it: the phone (saveLorebook: normalizeLorebook), the desktop
  // (convertEmbeddedCharacterLorebook) and this site's Lorebook builder.
  sameBook(A.lore.normalizeLorebook(appRead.character_book), `${name}: the book as the phone files it`);
  if (desktopBook) sameBook(desktopBook(name, appRead), `${name}: the book as the desktop files it`);
  sameBook(A.lorebookFromJson({ spec: 'chara_card_v2', data: siteRead.data }).book, `${name}: the book in the Lorebook builder`);
  report.push({ key, name, bytes: bytes.length, stats: A.cardStats(siteRead.data), data: siteRead.data });
}

// The lorebook file: the Lorebook builder (fromJson) and Aetheria's import (normalizeLorebook).
{
  const json = JSON.parse(lorebookText);
  check(json.name === WORLD && typeof json.coverImage === 'string', 'Lorebook: its name or picture is missing');
  sameBook(A.lore.normalizeLorebook(json), 'Lorebook file in Aetheria');
  const { book, kind } = A.lorebookFromJson(json, { name: 'lantern-quay-lorebook' });
  check(kind === 'standalone', `Lorebook: the builder reads it as ${kind}`);
  sameBook(book, 'Lorebook file in the Lorebook builder');
  const claims = lorebookCopy(A.STARTER_LOREBOOK).claims;
  const entries = Object.values(A.STARTER_LOREBOOK.entries);
  if (entries.filter((e) => e.constant).length !== claims.constant || entries.some((e) => !e.constant && (e.matchWholeWords !== claims.wholeWords || e.sticky !== claims.sticky))) {
    warn('The lorebook no longer does what copy.mjs says of it (one entry always on, whole words, three replies): update lorebookCopy.');
  }
}

// The preset: read in and written out again by the app, it comes back the same.
{
  const json = JSON.parse(presetText);
  check(json.name === 'Aetheria Storyteller' && typeof json.extensions?.aetheria_cover === 'string', 'Preset: its name or picture is missing');
  // Aetheria keeps the edition mark on import but its export does not write it (ST_PASSTHROUGH_FIELDS).
  if (Number(json.aetheria_storyteller) !== A.STORYTELLER_EDITION) warn('Aetheria\'s preset export leaves out the edition mark (aetheria_storyteller), so the file is read as the first edition when it comes back in.');
  check(await presetRoundTrip(presetText, 'aetheria-storyteller.json') === presetText, 'Preset: it changes when Aetheria reads it in and writes it out again');
  for (const g of A.STORY_CHOICES) check(json.prompts.some((p) => p.identifier === `story_${g.id}`), `Preset: the choice "${g.header}" is missing`);
}

// The world: the engine's own reader checks it, a recipe rebuilds the full world exactly, and the
// app's import takes it.
{
  const { world, metadata } = A.inspectPortableWorld(worldText);
  check(metadata.checksumVerified && metadata.packageManifest.packageType === WORLD_MODE, 'World: the package does not check out');
  check(world.document.identity.name === WORLD && world.worldId === WORLD_ID && Boolean(world.coverDataUrl), 'World: its name, identity or picture is missing');
  if (WORLD_MODE === 'recipe') {
    const full = await exportWorld('full');
    const built = A.inspectPortableWorld(full).world;
    const names = Object.keys(JSON.parse(full).arrays || {});
    const off = names.filter((n) => Buffer.compare(Buffer.from(built[n].buffer, built[n].byteOffset, built[n].byteLength), Buffer.from(world[n].buffer, world[n].byteOffset, world[n].byteLength)) !== 0);
    check(names.length > 0 && !off.length, `World: the recipe rebuilds differently (${off.join(', ')})`);
  }
  const staged = await quietly(() => A.agesStageWorldFile(worldText));
  check(staged?.success && staged.summary?.name === WORLD, 'World: Aetheria\'s import does not take it');
  const added = await quietly(() => A.agesResolveWorldImport(staged.importId, 'duplicate'));
  check(added?.success, 'World: Aetheria\'s import could not add it');
}

if (problems.length) {
  console.error(`\nNot written: ${problems.length} thing${problems.length === 1 ? '' : 's'} did not read back.\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
say('  every file reads back in this site\'s readers and Aetheria\'s');

// ── The Archive's entries ─────────────────────────────────────────────────
const readJson = (p) => JSON.parse(fs.readFileSync(join(site, p), 'utf8'));
const today = day(RealDate.now());
const cardsJson = readJson('data/cards.json');
const worksJson = readJson('data/works.json');
const upsert = (list, entry, keep) => {
  const i = list.findIndex((x) => x.slug === entry.slug);
  if (i < 0) { list.push(entry); return; }
  for (const k of keep) if (list[i][k] !== undefined) entry[k] = list[i][k];
  list[i] = entry;
};
for (const r of report) {
  upsert(cardsJson.cards, {
    file: CARD[r.key].file,
    thumb: CARD[r.key].thumb,
    slug: CARD[r.key].slug,
    name: r.name,
    tagline: firstSentence(r.data.creator_notes),
    world: WORLD,
    tags: r.data.tags,
    creator: r.data.creator,
    stats: r.stats,
    featured: true,
    added: today,
  }, ['featured', 'added']);
}
const presetJson = JSON.parse(presetText);
const pieces = {
  lorebook: { type: 'lorebook', name: A.STARTER_LOREBOOK.name, world: WORLD, version: String(A.STARTER_VERSION), updated: day(T.lorebook), label: 'World Info JSON', ...lorebookCopy(A.STARTER_LOREBOOK) },
  preset: { type: 'preset', name: presetJson.name, world: '', version: String(A.STORYTELLER_EDITION), updated: day(T.preset), label: 'Preset JSON', ...presetCopy({ preset: presetJson, choices: A.STORY_CHOICES, tones: A.STORY_TONES, edition: A.STORYTELLER_EDITION }) },
  world: { type: 'world', name: A.WORLD_NAME, world: WORLD, version: String(A.STARTER_VERSION), updated: day(T.world), label: WORLD_MODE === 'recipe' ? 'World package (recipe)' : 'World package', ...worldCopy({ structure: A.WORLD_STRUCTURE, mode: WORLD_MODE }) },
};
for (const [part, p] of Object.entries(pieces)) {
  upsert(worksJson.works, {
    slug: WORK[part].slug,
    type: p.type,
    name: p.name,
    tagline: p.tagline,
    world: p.world,
    tags: p.tags,
    version: p.version,
    updated: p.updated,
    featured: true,
    thumb: WORK[part].thumb,
    cover: WORK[part].cover,
    description: p.description,
    files: [{ label: p.label, url: WORK[part].file }],
    links: [],
  }, ['featured']);
}

// ── Writing ───────────────────────────────────────────────────────────────
const outputs = [
  ...A.STARTER_KEYS.flatMap((key) => [[CARD[key].file, cards[key].bytes], [CARD[key].thumb, fs.readFileSync(join(cache, `thumb-${key}.webp`))]]),
  [WORK.lorebook.file, `${lorebookText}\n`],
  [WORK.preset.file, `${presetText}\n`],
  [WORK.world.file, worldText],
  ...Object.keys(WORK).flatMap((part) => [[WORK[part].thumb, fs.readFileSync(join(cache, `thumb-${part}.webp`))], [WORK[part].cover, dataBytes(A.STARTER_COVERS[part])]]),
  [BUILDER_BOOK, `// Aetheria's starter lorebook, Lantern Quay, as it comes with the app (src/starter/lanternQuay.js, STARTER_LOREBOOK).\n// Written by tools/starter-set (node generate.mjs). Do not edit by hand.\nexport default ${JSON.stringify(A.STARTER_LOREBOOK, null, 1)};\n`],
  ['data/cards.json', `${JSON.stringify(cardsJson, null, 2)}\n`],
  ['data/works.json', `${JSON.stringify(worksJson, null, 2)}\n`],
];
const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
say(CHECK ? '\nWould write (--check: nothing written)' : '\nWritten');
for (const [rel, content] of outputs) {
  const buf = Buffer.isBuffer(content) || content instanceof Uint8Array ? Buffer.from(content) : Buffer.from(content, 'utf8');
  const path = join(site, rel);
  const before = fs.existsSync(path) ? fs.readFileSync(path) : null;
  const state = !before ? 'new' : before.equals(buf) ? 'unchanged' : 'changed';
  if (!CHECK && state !== 'unchanged') { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, buf); }
  say(`  ${rel.padEnd(42)} ${size(buf.length).padStart(7)}  ${state}`);
}
say(`\nDated: cards ${day(T.cards)} (made ${day(T.cardsBegun)}), lorebook ${day(T.lorebook)}, preset ${day(T.preset)}, world ${day(T.world)}. World package: ${WORLD_MODE}.`);
if (warnings.length) say(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} above.`);
