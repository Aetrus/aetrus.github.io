// Blueprints: author-time fill slots, ported from the Grimoire (BlueprintSlots.kt).
// A slot is written [[Label: optional hint]]. Slots dedupe by label (case-insensitive),
// so [[Name]] used twice asks once. SillyTavern {{macros}} are left untouched.

const SLOT = /\[\[(.+?)]]/g;
const labelOf = (inner) => inner.split(':')[0].trim();
const hintOf = (inner) => (inner.includes(':') ? inner.slice(inner.indexOf(':') + 1).trim() : '');

export function parseSlots(body) {
  const seen = new Map();
  for (const m of body.matchAll(SLOT)) {
    const label = labelOf(m[1]);
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, { key, label, hint: hintOf(m[1]) });
  }
  return [...seen.values()];
}

export function renderBlueprint(body, values) {
  return body.replace(SLOT, (whole, inner) => {
    const label = labelOf(inner);
    if (!label) return whole;
    return values[label.toLowerCase()] ?? '';
  });
}

/** Clean a rendered blueprint: drop bullets left empty, collapse runs of blank lines. */
export function tidy(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .filter((l) => !/^\s*[-*•]\s*$/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Segments for a highlighted preview: [{ text } | { slot, label, value }]. */
export function blueprintSegments(body, values) {
  const out = [];
  let last = 0;
  for (const m of body.matchAll(SLOT)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    const label = labelOf(m[1]);
    if (!label) out.push({ text: m[0] });
    else out.push({ slot: label.toLowerCase(), label, value: values[label.toLowerCase()] || '' });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export const STARTER_BLUEPRINTS = [
  {
    id: 'starter-full-character-blueprint',
    name: 'Full Character Blueprint',
    note: "The Grimoire's starter. A complete spec sheet, field by field.",
    target: 'description',
    body: `Name: {{char}}

Appearance:
[[Appearance: build, height, hair, eyes, notable features, usual outfit]]

Personality:
[[Personality: core traits, temperament, how they come across to others]]

Mannerisms:
[[Mannerisms: gestures, body language, habits of expression]]

Speech & Voice:
[[Speech: tone, vocabulary, accent, catchphrases]]

Romance Style:
[[Romance: how they flirt, show affection, what they want in a partner]]

Hobbies & Interests:
[[Hobbies: pastimes, passions, how they spend free time]]

Habits & Quirks:
[[Habits: routines, tics, vices, little oddities]]

Background:
[[Background: where they come from, key history, what shaped them]]

Likes: [[Likes]]
Dislikes: [[Dislikes]]`,
  },
  {
    id: 'starter-close-third',
    name: 'Close-Third Description',
    note: 'Prose teaches voice, lists carry mechanics. Narration that thinks in the character’s cadence.',
    target: 'description',
    body: `[[Cold open: an ordinary moment on a day when nothing happens, two or three paragraphs, close third, in the character's own diction. Boring on purpose.]]

[[Facts, braided: appearance through how they use, hide or forget their body; history as the thing they circle and won't look at directly]]

[[How they want: what they do when they want someone or something, in their own biased framing, including the designed flaw where they misread, overplay or recover badly]]

[[Tendencies with weather: variance as state triggers the scene can check, e.g. after three nights without sleep, answers get shorter and truer]]

QUIRKS
- [[Quirk one: a tic that must never drift]]
- [[Quirk two]]
- [[Quirk three]]

RULES
- [[Voice rule: POV, tense, register floor]]
- Never narrate {{user}}'s thoughts, feelings, or actions.`,
  },
  {
    id: 'starter-greeting',
    name: 'Greeting Scene',
    note: 'One opening scene: a place, a task in progress, a line, a hook.',
    target: 'first_mes',
    body: `[[Where and when: the place, the hour, the weather, one sensory detail]]

[[Mid-task: what {{char}} is doing when the scene opens, something ordinary and specific]]

"[[First line: what {{char}} says, in their own voice]]"

[[The hook: one concrete thing that is wrong, new, or at stake, left for {{user}} to answer]]`,
  },
  {
    id: 'starter-lore-entry',
    name: 'World Lore Entry',
    note: 'A lorebook entry with the four things a model actually needs.',
    target: 'lore',
    body: `[[Name: the place, person or thing]] is [[What it is: one plain sentence]].

[[First sight: what a stranger notices first]]

[[Local knowledge: what people who live with it know that strangers don't]]

[[The rule: the cost, law or danger attached to it]]`,
  },
];
