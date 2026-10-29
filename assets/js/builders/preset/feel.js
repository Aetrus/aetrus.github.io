// "How it feels": how bold, how long a reply may run, how much of the story
// it reads; the exact numbers folded beneath (Aetheria's PresetSheet.js).
// The samplers the file carries besides (convertFromSillyTavernPreset keeps
// them, and Aetheria sends them to the providers that take them) fold under
// the numbers.
import { esc } from '../../ui.js';
import { core } from './core.js';
import { card, fold, marginNote, row, segmented } from './bits.js';

const steps = () => core.chain.FEEL_STEPS;
const withOther = (list) => [
  ...list.map((s) => ({ id: s.id, label: s.label, title: `${s.value.toLocaleString()}` })),
  { id: 'other', label: 'Other' },
];

const slider = (key, label, value, min, max, step) => `<input type="range" class="range ps-slider" aria-label="${esc(label)}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-act="feel-num" data-key="${key}" data-focus="feel:${key}:${label}">`;
const numberBox = (key, label, value, extra = '') => `<input class="input mono ps-num ps-numbox" type="number" inputmode="decimal" aria-label="${esc(label)}" value="${esc(value)}" data-act="feel-num" data-key="${key}" data-focus="feel:${key}:${label}:box"${extra}>`;
const live = (key, value) => `<span data-live="num:${key}">${esc(value)}</span>`;

export function values(draft) {
  return {
    temperature: draft.temperature ?? 0.9,
    maxTokens: draft.max_tokens ?? 4096,
    contextLimit: draft.max_context_length ?? 32768,
    topP: draft.top_p ?? 1,
    frequency: draft.frequency_penalty ?? 0,
    presence: draft.presence_penalty ?? 0,
  };
}

export const numbersAside = (v) => `Temperature ${v.temperature} · top P ${v.topP} · penalties ${v.frequency} / ${v.presence}`;

export function feelHead() {
  return { eyebrow: 'How it feels', sub: 'How bold the words are, how long a reply may run, how much of the story is read.' };
}

/** "\n" written as a backslash and an n, so a stop sequence of new lines can be read and typed. */
const shownSeq = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
export const readSeq = (line) => line.replace(/\\(n|t|\\)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : '\\'));

export function feelBody(app) {
  const draft = app.S.draft;
  const exact = app.S.exact;
  const v = values(draft);
  const { bold: BOLD, reply: REPLY, reach: REACH } = steps();
  const stepOf = core.chain.stepOf;
  const boldStep = exact.bold ? 'other' : stepOf(v.temperature, BOLD);
  const replyStep = exact.reply ? 'other' : stepOf(v.maxTokens, REPLY);
  const reachStep = exact.reach ? 'other' : stepOf(v.contextLimit, REACH);

  const temperatureRow = (where) => row({ labelHtml: `Temperature: ${live('temperature', v.temperature)}`, hint: 'Higher wanders further from the likely word.', control: slider('temperature', `Temperature${where}`, v.temperature, 0, 2, 0.05) });
  const maxTokensRow = (where) => row({ label: 'Max response tokens', hint: 'The longest a reply may run; some models count their thinking against it.', control: numberBox('max_tokens', `Max response tokens${where}`, v.maxTokens, ' min="1" step="1"') });
  const contextRow = (where) => row({ label: 'Context limit', hint: 'The full request budget, including the response allowance.', control: numberBox('max_context_length', `Context limit${where}`, v.contextLimit, ' min="1" step="1"') });

  const more = [
    ['top_k', 'Top K', 'Only the K likeliest words are considered; 0 leaves it off.', draft.top_k ?? 0, ' min="0" step="1"'],
    ['min_p', 'Min P', 'Words less likely than this share of the likeliest are left out; 0 leaves it off.', draft.min_p ?? 0, ' min="0" max="1" step="0.01"'],
    ['top_a', 'Top A', 'Cuts unlikely words by how sure the likeliest is; 0 leaves it off.', draft.top_a ?? 0, ' min="0" max="1" step="0.01"'],
    ['typical_p', 'Typical P', '1 leaves it off.', draft.typical_p ?? 1, ' min="0" max="1" step="0.01"'],
    ['tfs', 'Tail-free sampling', '1 leaves it off.', draft.tfs ?? 1, ' min="0" max="1" step="0.01"'],
    ['repetition_penalty', 'Repetition penalty', '1 leaves it off; above 1 discourages repeating.', draft.repetition_penalty ?? 1, ' min="0" step="0.01"'],
    ['repetition_penalty_range', 'Repetition range', 'How many recent tokens the penalty looks back over.', draft.repetition_penalty_range ?? 256, ' min="0" step="1"'],
    ['seed', 'Seed', '-1 is a new seed each time.', draft.seed ?? -1, ' step="1"'],
  ];
  const seqs = Array.isArray(draft.stop_sequences) ? draft.stop_sequences : [];

  const numbers = fold({
    title: 'The numbers',
    aside: numbersAside(v),
    id: 'numbers',
    open: app.S.folds.numbers,
    body: [
      temperatureRow(''),
      row({ labelHtml: `Top P: ${live('top_p', v.topP)}`, hint: '1 lets every word be considered; lower keeps to the likeliest few.', control: slider('top_p', 'Top P', v.topP, 0, 1, 0.01) }),
      row({ labelHtml: `Frequency penalty: ${live('frequency_penalty', v.frequency)}`, hint: 'Above 0 discourages repeating the same words.', control: slider('frequency_penalty', 'Frequency penalty', v.frequency, -2, 2, 0.05) }),
      row({ labelHtml: `Presence penalty: ${live('presence_penalty', v.presence)}`, hint: 'Above 0 pushes it toward new subjects.', control: slider('presence_penalty', 'Presence penalty', v.presence, -2, 2, 0.05) }),
      maxTokensRow(''),
      contextRow(''),
      fold({
        title: 'What else the file carries',
        aside: 'for the providers that take them',
        id: 'samplers',
        open: app.S.folds.samplers,
        cls: 'ps-fold-inner',
        body: `<p class="ps-meta">Kept from the preset file and sent to the providers that take them: OpenRouter, OpenAI-format proxies and local servers mostly; Claude and Gemini take few of these.</p>
          ${more.map(([key, label, hint, value, extra]) => row({ label, hint, control: numberBox(key, label, value, extra) })).join('')}
          ${row({ label: 'Stop sequences', hint: 'One a line; the reply stops where one appears. Write \\n for a new line.', control: `<textarea class="textarea mono ps-stops" rows="${Math.max(2, Math.min(6, seqs.length + 1))}" aria-label="Stop sequences" data-act="feel-stops" data-focus="feel-stops" spellcheck="false">${esc(seqs.map(shownSeq).join('\n'))}</textarea>` })}`,
      }),
    ].join(''),
  });

  const notes = `<div class="ps-notes" aria-label="About these settings">
    ${marginNote('When in doubt', 'Balanced. Most good presets leave these near the middle and let the words do the work.')}
    ${marginNote('Some models choose their own', 'Claude from 4.7 on refuses temperature and top P, so they are not sent to it (Haiku still takes them). Gemini 3 does best left at 1. The penalties go to OpenAI, OpenRouter, OpenAI-format proxies and local servers, not to Claude or Gemini.')}
    ${marginNote('On Ollama', 'How much of the story it reads is also how much room Ollama gives the model.')}
  </div>`;

  return `<div class="ps-room">
    <div class="ps-room-main">
      ${card({
    title: 'How bold',
    body: row({ label: 'How far from the likeliest word it may wander', hint: 'Steady keeps close; adventurous surprises, now and then strangely.', control: segmented({ act: 'feel-step', value: boldStep, options: withOther(BOLD), data: { which: 'bold' }, label: 'How bold' }), cls: 'ps-row-wide' })
          + (boldStep === 'other' ? temperatureRow(' (other)') : ''),
  })}
      ${card({
    title: 'Length and reach',
    body: row({ label: 'The longest a reply may run', hint: `A ceiling, not a target: the preset’s own choices say how long to write. Now ${v.maxTokens.toLocaleString()} tokens.`, control: segmented({ act: 'feel-step', value: replyStep, options: withOther(REPLY), data: { which: 'reply' }, label: 'The longest a reply may run' }), cls: 'ps-row-wide' })
          + (replyStep === 'other' ? maxTokensRow(' (other)') : '')
          + row({ label: 'How much of the story it reads', hint: `The whole request, the reply included. Less is cheaper; memory carries what falls out. Now ${v.contextLimit.toLocaleString()} tokens.`, control: segmented({ act: 'feel-step', value: reachStep, options: withOther(REACH), data: { which: 'reach' }, label: 'How much of the story it reads' }), cls: 'ps-row-wide' })
          + (reachStep === 'other' ? contextRow(' (other)') : ''),
  })}
      ${numbers}
    </div>
    ${notes}
  </div>`;
}

/** A named step chosen: its number, or Other kept open on the number it has. */
export function pickStep(app, which, id) {
  const field = { bold: 'temperature', reply: 'max_tokens', reach: 'max_context_length' }[which];
  const list = steps()[which];
  app.S.exact = { ...app.S.exact, [which]: id === 'other' };
  if (id !== 'other') app.S.draft[field] = list.find((s) => s.id === id).value;
}
