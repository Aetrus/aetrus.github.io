// Loads the archive's data: site settings, the card manifest (+ the cards themselves), and creators.
import { readCardBytes, cardStats } from './lib/card.js';
import { slugify } from './ui.js';

const memo = new Map();
const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch((e) => { memo.delete(key); throw e; })); return memo.get(key); };

export async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status}).`);
  return r.json();
}

export async function getBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

export const loadSite = () => once('site', () => getJSON('data/site.json'));
export const loadCreators = () => once('creators', () => getJSON('data/creators.json'));
export const loadWorks = () => once('works', () => getJSON('data/works.json').then((d) => d.works || []).catch(() => []));
export const loadPresets = () => once('presets', () => getJSON('data/presets.json'));

/** Public releases from GitHub, cached for ten minutes per visitor to spare the API limit. */
export const loadReleases = (repo) => once(`releases:${repo}`, async () => {
  const key = `aetheria.releases.${repo}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.at < 600000) return hit.data;
  } catch { /* no cache */ }
  const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub is rate-limiting this browser for a few minutes.' : `GitHub answered ${r.status}.`);
  const data = (await r.json()).filter((x) => !x.draft);
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full */ }
  return data;
});

function firstSentence(s) {
  const m = String(s || '').replace(/\s+/g, ' ').match(/^(.{12,140}?[.!?])(\s|$)/);
  return m ? m[1] : String(s || '').slice(0, 120);
}

/** One gallery entry from a manifest row plus (optionally) the parsed card. */
function toEntry(row, parsed) {
  const d = parsed ? parsed.data : null;
  const ext = (d && d.extensions) || {};
  const name = row.name || (d && d.name) || 'Untitled card';
  return {
    slug: row.slug || slugify(name),
    name,
    tagline: row.tagline ?? (ext.aetheria && ext.aetheria.tagline) ?? (d ? firstSentence(d.creator_notes) : ''),
    tags: row.tags || (d && d.tags) || [],
    world: row.world ?? (typeof ext.world === 'string' ? ext.world : ''),
    creator: row.creator || (d && d.creator) || '',
    nsfw: !!row.nsfw,
    file: row.file || null,
    thumb: row.thumb || null,
    cover: row.cover || null,
    link: row.link || null,
    links: row.links || [],
    featured: !!row.featured,
    added: row.added || '',
    stats: row.stats || (d ? cardStats(d) : null),
  };
}

export const loadCards = () => once('cards', async () => {
  const manifest = await getJSON('data/cards.json');
  const rows = manifest.cards || [];
  const entries = await Promise.all(rows.map(async (row) => {
    const complete = row.name && row.stats;
    if (!row.file || complete) return toEntry(row, null);
    try {
      const parsed = readCardBytes(await getBytes(row.file), row.file);
      cacheCard(row.file, parsed);
      return toEntry(row, parsed);
    } catch (e) {
      console.warn(`Gallery: ${row.file}: ${e.message}`);
      return toEntry({ ...row, name: row.name || row.file.split('/').pop() }, null);
    }
  }));
  const seen = new Set();
  for (const e of entries) { let s = e.slug, i = 2; while (seen.has(s)) s = `${e.slug}-${i++}`; e.slug = s; seen.add(s); }
  return entries;
});

const cardCache = new Map();
function cacheCard(file, parsed) { cardCache.set(file, parsed); }

/** Full card for the detail view, Lens and Forge. */
export async function loadCardFile(file) {
  const hit = cardCache.get(file);
  if (hit && hit.bytes) return hit;
  const bytes = await getBytes(file);
  const parsed = { ...readCardBytes(bytes, file), bytes };
  cardCache.set(file, parsed);
  return parsed;
}

export async function loadCardBytes(file) {
  const c = cardCache.get(file);
  if (c && c.bytes) return c.bytes;
  const bytes = await getBytes(file);
  cardCache.set(file, { ...(c || readCardBytes(bytes, file)), bytes });
  return bytes;
}
