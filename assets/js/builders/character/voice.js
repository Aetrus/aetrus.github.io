// CharacterSheet → Voice, for the web: one voice per engine, kept on the card at
// extensions.aetheria.voices (speechPlan.js). Only this browser's own voices can
// be heard here; the other engines are kept as settings and play in Aetheria.
import { esc } from '../../ui.js';
import * as core from '../../vendor/aetheria/character.js';

const sp = core.speech;
const FIXED = {
  openai: sp.OPENAI_VOICES.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })),
  gemini: sp.GEMINI_VOICES.map((id) => ({ id, name: id })),
  kokoro: sp.KOKORO_VOICES.map((id) => ({ id, name: id })),
};

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);
export const systemVoiceAvailable = () => !!synth();

/** This browser's voices, once they have loaded (some browsers list them late). */
export function listSystemVoices() {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((res) => {
    const done = () => { s.removeEventListener?.('voiceschanged', done); res(s.getVoices()); };
    s.addEventListener?.('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

const nameOf = (d) => (d?.name || '').trim() || 'This character';
const sampleFor = (d) => `I am ${nameOf(d)}. This is how I sound when the story is read aloud.`;

function control(engine, value, emptyLabel, label, systemVoices) {
  const id = `cb-voice-${engine.id}`;
  if (engine.id === 'system' && !systemVoiceAvailable()) return { id, html: '<p class="field-hint">This device offers no built-in voices.</p>' };
  if (engine.id === 'hume') {
    return { id, html: `<input class="input" id="${id}" data-voice-engine="hume" value="${esc(value)}" placeholder="${esc(emptyLabel || 'A low, unhurried voice')}" autocomplete="off">` };
  }
  const listed = engine.id === 'system'
    ? systemVoices.map((v) => ({ id: v.voiceURI || v.name, name: `${v.name} · ${v.lang}` }))
    : FIXED[engine.id];
  if (listed) {
    const known = listed.some((v) => v.id === value);
    return {
      id,
      html: `<select class="select" id="${id}" data-voice-engine="${esc(engine.id)}">
        <option value="">${esc(emptyLabel)}</option>
        ${value && !known ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : ''}
        ${listed.map((v) => `<option value="${esc(v.id)}"${v.id === value ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}
      </select>`,
    };
  }
  return {
    id,
    html: `<input class="input mono" id="${id}" data-voice-engine="${esc(engine.id)}" data-trim value="${esc(value)}" placeholder="${esc(`Voice id · empty for ${String(emptyLabel || 'the default').toLowerCase()}`)}" autocomplete="off" spellcheck="false">`,
  };
}

function choiceHtml(engine, value, { lead = false, systemVoices = [] } = {}) {
  const label = engine.label;
  const emptyLabel = engine.describes ? 'Empty: the narrator’s voice' : 'The narrator’s voice';
  const c = control(engine, value, emptyLabel, label, systemVoices);
  const canHear = engine.id === 'system' && systemVoiceAvailable();
  return `<div class="cb-voice-choice${lead ? ' is-lead' : ''}">
    <div class="cb-voice-row">
      <div class="field"><label class="field-label" for="${c.id}">${esc(label)}${value.trim() ? '<span class="mono">their own</span>' : ''}</label>${c.html}</div>
      ${canHear ? `<button type="button" class="btn btn-sm" data-voice-hear="${esc(engine.id)}" aria-label="Hear ${esc(label)}">Hear it</button>` : ''}
    </div>
    ${engine.id === 'elevenlabs' ? '<p class="field-hint">ElevenLabs voices belong to your account; Aetheria lists them for you. Here, type a voice id.</p>' : ''}
    <p class="cb-voice-problem" data-voice-problem="${esc(engine.id)}" role="alert" hidden></p>
  </div>`;
}

/** The section's body. `open` shows the other engines. */
export function voiceBody(d, { systemVoices = [], open = false } = {}) {
  const voices = sp.voicesOfCharacter(d);
  const engines = sp.SPEECH_ENGINES;
  const current = engines.find((e) => e.id === 'system') || engines[0];
  const others = engines.filter((e) => e.id !== current.id);
  const name = nameOf(d);
  const rules = sp.speechRulesOf({});
  return `
    <p class="cb-lede">When a passage is read aloud, ${esc(name)}’s lines are spoken in this voice. Without one, the narrator’s voice reads them. It is kept on the card, so it goes with it.</p>
    ${choiceHtml(current, voices[current.id] || '', { lead: true, systemVoices })}
    <div><button type="button" class="btn btn-sm btn-ghost" data-act="voice-others" aria-expanded="${open}" aria-controls="cb-voice-others">${open ? 'Hide the other engines' : 'Voices for the other engines'}</button></div>
    <div class="cb-voice-others" id="cb-voice-others"${open ? '' : ' hidden'}>
      <p class="field-hint">These engines speak in Aetheria. Choose a voice here and it travels with the card.</p>
      ${others.map((e) => choiceHtml(e, voices[e.id] || '')).join('')}
    </div>
    <hr class="rule">
    <p class="cb-meta">${rules.mode === 'one'
      ? `Passages are read in one voice: ${esc(name)}’s when ${esc(name)} wrote them. To hear each quoted line in its speaker’s voice, choose “Narration and speech” in Aetheria’s Workshop → Voice.`
      : `A quoted line is ${esc(name)}’s when the words beside it say so (“said ${esc(name)}”, “${esc(name)} asked”, “${esc(name)}:”) or when ${esc(name)} wrote the passage.`}</p>`;
}

export const voiceBadge = (d) => ((sp.voicesOfCharacter(d).system || '').trim() ? 'Their own voice' : 'The narrator’s voice');

/** Set one engine's voice on the draft (cleared when empty), as Aetheria does. */
export function setVoice(d, engine, value) {
  d.extensions = sp.withCharacterVoice(d.extensions, engine, value);
}

/** Speak the sample in this browser's chosen voice. Resolves with a problem sentence, or ''. */
export async function hear(d, engine) {
  const s = synth();
  if (!s || engine !== 'system') return 'Only this browser’s own voices can be heard here.';
  const chosen = (sp.voicesOfCharacter(d).system || '').trim();
  const all = await listSystemVoices();
  const voice = chosen ? all.find((v) => v.voiceURI === chosen || v.name === chosen) : null;
  if (chosen && !voice) return 'That voice is not on this device. Choose another, or leave it to the narrator.';
  return new Promise((res) => {
    try {
      s.cancel();
      const u = new SpeechSynthesisUtterance(sampleFor(d));
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onend = () => res('');
      u.onerror = (e) => res(e?.error && e.error !== 'canceled' && e.error !== 'interrupted' ? 'The voice did not answer.' : '');
      s.speak(u);
      setTimeout(() => res(''), 12000);
    } catch { res('The voice did not answer.'); }
  });
}

export const stopSpeaking = () => { try { synth()?.cancel(); } catch { /* */ } };
