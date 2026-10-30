// Writes data/docs.json from the pages Aetheria's guide answers from
// (src/guide/pages in Aetheria Experimental), so the docs say what the app
// does: those pages are kept true at every commit there.
//
//   node tools/docs/generate.mjs [path to Aetheria's src]
//
// A paragraph that opens with a short sentence of its own ("The head. On an
// empty bench…") is a section: that sentence is its heading. Lines starting
// "- " are a list. The guide's own name and pronouns are written plainly.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', '..');
const src = path.resolve(process.argv[2] || 'C:/Users/gjens/Documents/Antigravity creations/Aetheria Experiemental/src');
const pagesDir = path.join(src, 'guide', 'pages');

// The order and grouping of the guide's own index (one line of it per group).
const index = fs.readFileSync(path.join(pagesDir, 'index.js'), 'utf8');
const files = Object.fromEntries([...index.matchAll(/import (\w+) from '\.\/([\w-]+)'/g)].map((m) => [m[1], m[2]]));
const listed = index.match(/GUIDE_PAGES = \[([\s\S]*?)\];/)[1].split('\n').map((l) => l.split(',').map((s) => s.trim()).filter(Boolean)).filter((l) => l.length);
const GROUPS = ['Around the house', 'In a story', 'Settings and the rest'];

const readPage = (file) => {
  const code = fs.readFileSync(path.join(pagesDir, `${file}.js`), 'utf8').replace(/export default page;\s*$/, 'page;');
  return vm.runInNewContext(code, {});
};

// The guide is whoever the reader chose; the docs name neither.
const PLAIN = { guide: 'your guide', they: 'they', them: 'them', their: 'their', They: 'They', Their: 'Their', themself: 'themself' };
const plain = (text) => text.replace(/(?<!\{)\{(guide|they|them|their|They|Their|themself)\}(?!\})/g, (_, k) => PLAIN[k]);

const LEAD = /^([A-Z][^.!?:]{1,48}?)\.\s+(?=\S)/;
function blocksOf(body) {
  const out = [];
  const paragraphs = plain(body).trim().split(/\n\s*\n/);
  paragraphs.forEach((para, n) => {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    let text = [];
    let list = null;
    const flushText = () => { if (text.length) { out.push({ type: 'p', text: text.join(' ') }); text = []; } };
    const flushList = () => { if (list) { out.push(list); list = null; } };
    lines.forEach((line, i) => {
      const item = /^(-|\d+\.)\s+(.*)$/.exec(line);
      if (item) {
        flushText();
        const type = item[1] === '-' ? 'ul' : 'ol';
        if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
        list.items.push(item[2]);
        return;
      }
      flushList();
      let rest = line;
      // A short first sentence that is a name, not a statement, heads its section.
      const lead = i === 0 && n > 0 ? LEAD.exec(line) : null;
      if (lead && lead[1].split(/\s+/).length <= 7 && !/\b(is|are|was|has|have|can|does|do|goes|go)\b/.test(lead[1])) {
        out.push({ type: 'h', text: lead[1] });
        rest = line.slice(lead[0].length);
      }
      text.push(rest);
    });
    flushText();
    flushList();
  });
  return out;
}

// Pictures for a page, from the shots taken in Aetheria (shots/app).
const FIGURES = {
  overview: [{ src: 'shots/app/welcome.webp', alt: 'The welcome to a new archive' }, { src: 'shots/app/guide-tour.webp', alt: 'Maelis beginning the first tour of the house', after: 'Getting around' }],
  table: [{ src: 'shots/app/table.webp', alt: 'The Table with Dilys, Ansel and the Lantern Quay lorebook on the bench', after: 'The head' }],
  library: [{ src: 'shots/app/library.webp', alt: "The Library's Characters deck" }],
  chat: [{ src: 'shots/app/story.webp', alt: 'A story page with the opening passage' }],
  phone: [{ src: 'shots/app/story-phone.webp', alt: 'A story on a phone', phone: true }],
  presets: [{ src: 'shots/app/preset-sheet.webp', alt: "The Aetheria Storyteller's preset sheet" }],
  world: [{ src: 'shots/app/world.webp', alt: 'The map of Lantern Quay, with the route panel beside it' }],
  studio: [{ src: 'shots/app/studio.webp', alt: 'The Studio, starting a new character' }],
  guide: [{ src: 'shots/app/guides.webp', alt: 'The choice of guide: Maelis or Ilario' }],
};

const version = JSON.parse(fs.readFileSync(path.join(src, '..', 'package.json'), 'utf8')).version;
const pages = [];
listed.forEach((names, g) => names.forEach((name) => {
  const page = readPage(files[name]);
  pages.push({
    id: page.id,
    title: plain(page.title),
    summary: plain(page.summary || ''),
    group: GROUPS[g] || GROUPS[GROUPS.length - 1],
    anchors: page.anchors || [],
    figures: FIGURES[page.id] || [],
    blocks: blocksOf(page.body || ''),
  });
}));

const out = { version, generated: new Date().toISOString().slice(0, 10), groups: GROUPS, pages };
fs.writeFileSync(path.join(site, 'data', 'docs.json'), JSON.stringify(out, null, 1));
const sections = pages.reduce((n, p) => n + p.blocks.filter((b) => b.type === 'h').length, 0);
console.log(`docs.json: ${pages.length} pages, ${sections} sections, Aetheria ${version}`);
