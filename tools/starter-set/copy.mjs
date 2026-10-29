// The words the Archive shows for the starter set, kept here rather than in data/*.json because
// generate.mjs rewrites those entries on every run. Drawn from Aetheria's own: the cards'
// creator notes, the book's description, the preset's blocks and the guide's page on the set
// (src/guide/pages/starter.js and presets.js). Lists and numbers are read from the source, so
// they follow it; generate.mjs warns when the source says something these words do not.

export const WORLD = 'Lantern Quay';

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const number = (n) => NUMBERS[n] || String(n);
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const quoted = (items) => listed(items.map((s) => `"${s}"`));

/** The first sentence of a card's creator notes, as the gallery takes a tagline (assets/js/data.js). */
export function firstSentence(s) {
  const m = String(s || '').replace(/\s+/g, ' ').match(/^(.{12,140}?[.!?])(\s|$)/);
  return m ? m[1] : String(s || '').slice(0, 120);
}

/** The lorebook's entry, from its book (STARTER_LOREBOOK). */
export function lorebookCopy(book) {
  const entries = Object.values(book.entries);
  const keyed = entries.filter((e) => !e.constant);
  return {
    tagline: firstSentence(book.description),
    tags: [WORLD, 'starter', 'World Info'],
    description: [
      `The book of what is true in Lantern Quay, as it comes with Aetheria: ${number(entries.length)} World Info entries for the Works, the Tideright, the wreck of the Constance, the Cape Morrow lens and the people of the town.`,
      '',
      `- The town itself is always on.`,
      `- The other ${number(keyed.length)} fire on their keys as whole words ("inn" is the Tidewater Inn, never "dinner") and stay for that reply and the two after it.`,
      '- It names who the hobnailed boots could belong to, and leaves it to the story.',
      '',
      'Dilys Pengelly and Ansel Truscott each carry it bound into their card. This is the book on its own, as Aetheria exports it, with its picture. Import it in Aetheria (Library → Lorebooks → Import) or as World Info in SillyTavern.',
    ].join('\n'),
    // What the words above say of the entries; generate.mjs checks the book still does this.
    claims: { constant: 1, wholeWords: true, sticky: 3 },
  };
}

/** The preset's entry, from the preset file and the groups of choices (src/presets/storyteller.js). */
export function presetCopy({ preset, choices, tones, edition }) {
  const order = (preset.prompt_order || [])[0]?.order || [];
  const byId = new Map((preset.prompts || []).map((p) => [p.identifier, p]));
  const optionIds = new Set(choices.flatMap((g) => g.options.map((o) => `story_${g.id}_${o.id}`)));
  const toneIds = new Set(tones.map((t) => `story_tone_${t.id}`));
  const offByDefault = order
    .filter((o) => o.enabled === false && !optionIds.has(o.identifier) && !toneIds.has(o.identifier))
    .map((o) => byId.get(o.identifier)?.name).filter(Boolean);
  const question = (g) => g.header.replace(/^━\s*/, '').replace(/\s*\(one\)\s*$/, '').replace(/\{\{user\}\}/g, 'your character');
  const usual = (g) => (g.options.find((o) => o.on) || g.options[0]).name;
  const editionWord = ['', 'first', 'second', 'third', 'fourth', 'fifth'][edition] || `edition ${edition}`;
  return {
    tagline: `The house preset, ${editionWord} edition`,
    tags: ['starter', 'chat completion', 'SillyTavern'],
    description: [
      `"Aetheria Storyteller", the house preset that comes with Aetheria, ${editionWord} edition. In a new archive it is the one new stories use.`,
      '',
      'It is written for collaborative fiction in small blocks that each do one thing: never writing your character for you (nor hearing what they only think), people who know only what they have seen, voices from their own lives, facts that stay facts, prose tested against its own draft, no echo of your last line.',
      '',
      `${number(choices.length).replace(/^./, (c) => c.toUpperCase())} choices, one block on in each group. Each starts at its usual:`,
      '',
      ...choices.map((g) => `- ${question(g)} *${usual(g)}*`),
      '',
      `Then ${number(tones.length)} tones that can be on together, all off at first: ${listed(tones.map((t) => t.name))}.`,
      '',
      `Off until you want them: ${quoted(offByDefault)}. Last of all, after the history, "The turn" restates the essentials.`,
      '',
      `Sampling: temperature ${preset.temperature}, ${Number(preset.openai_max_context).toLocaleString('en-GB')} context and ${Number(preset.openai_max_tokens).toLocaleString('en-GB')} response tokens (room for models that reason before they write; "How long?" sets how long a reply is).`,
      '',
      'It is a SillyTavern chat-completion preset, so it opens there too. "The model\'s habits" is filled by Aetheria; in another app `{{model_habits}}` is left as written, so switch that block off there.',
    ].join('\n'),
  };
}

/** The world's entry, from its book and structure (WORLD_BOOK, WORLD_STRUCTURE). */
export function worldCopy({ structure, mode }) {
  const named = structure.operations
    .filter((op) => op.op === 'add' && /^layers\.atlas\.(places|areas|ways|relief)$/.test(op.path) && op.value?.name)
    .map((op) => op.value.name.replace(/^The /, 'the '));
  return {
    tagline: String(structure.summary || '').replace(/^Lantern Quay:\s*/, '').replace(/^./, (c) => c.toUpperCase()),
    tags: [WORLD, 'starter', 'map'],
    description: [
      'Lantern Quay as a world with a map, the one the starter set builds on your device: a small harbour town on a cold, foggy coast, built up a cliff above its harbour, with the Tidewater Inn halfway up the cliff path and the Works at the top; Gull Rock off the strand, a tidal island reached by a stone causeway that floods at high water; and inland a heather moor with a ring of standing stones called the Teeth and a flooded sand quarry.',
      '',
      `What its book sets down: ${listed(named)}.`,
      '',
      mode === 'recipe'
        ? 'Built from the structure Aetheria writes out for it and laid out as a map by Aetheria\'s own world engine, with no model asked. This file is a recipe package: the world\'s book, its document and its picture. It travels light, and Aetheria and the World builder rebuild the map from it exactly when they open it.'
        : 'Built from the structure Aetheria writes out for it and laid out as a map by Aetheria\'s own world engine, with no model asked. This file is the full built world, with its picture.',
      '',
      'In Aetheria, bring it in with Import (or "Import a world…" in the World): it waits under Review until you choose "Add to the library". Bringing a world in turns "Worlds in stories" on.',
    ].join('\n'),
  };
}
