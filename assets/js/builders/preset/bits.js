// Small pieces of the Preset sheet, drawn after Aetheria's own ui primitives:
// SettingsCard, SettingsRow, ChoiceChips (segmented), Toggle, Disclosure,
// MarginNote, IconButton. Every interactive piece carries data-focus, so the
// sheet can put the focus back after it redraws a section.
import { esc } from '../../ui.js';

export const ICON = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5"/></svg>',
};

const attrs = (o = {}) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');
/** data: { key: 'x', dir: '1' } as data-key="x" data-dir="1". */
const dataAttrs = (o = {}) => attrs(Object.fromEntries(Object.entries(o).map(([k, v]) => [`data-${k}`, v])));

/** A card of settings (Aetheria's SettingsCard): a title, a quiet aside, its rows. */
export function card({ title = '', titleHtml = '', aside = '', asideLive = '', body = '', label = '', cls = '', id = '' }) {
  return `<section class="ps-card${cls ? ` ${cls}` : ''}"${id ? ` id="${esc(id)}"` : ''} aria-label="${esc(label || title)}">
    ${title || titleHtml || aside ? `<header class="ps-card-head"><h3 class="ps-card-title">${titleHtml || esc(title)}</h3>${aside ? `<span class="ps-card-aside"${asideLive ? ` data-live="${esc(asideLive)}"` : ''}>${esc(aside)}</span>` : ''}</header>` : ''}
    <div class="ps-card-body">${body}</div>
  </section>`;
}

/** A row of a card (SettingsRow): its label and hint, and a control at its end. */
export function row({ label = '', labelHtml = '', hint = '', control = '', cls = '' }) {
  return `<div class="ps-row${cls ? ` ${cls}` : ''}"><div class="ps-row-text"><span class="ps-row-label">${labelHtml || esc(label)}</span>${hint ? `<span class="ps-row-hint">${esc(hint)}</span>` : ''}</div>${control ? `<div class="ps-row-control">${control}</div>` : ''}</div>`;
}

/**
 * A segmented choice (ChoiceChips look="segmented"): radios drawn as one
 * strip. `act` names the action; each option sends its id as data-value.
 */
export function segmented({ act, value, options, label = '', data = {}, disabled = false, focus = '' }) {
  return `<div class="ps-seg" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${options.map((o) => {
    const on = String(o.id) === String(value);
    return `<button type="button" role="radio" class="ps-seg-opt" aria-checked="${on}" tabindex="${on || (value == null && o === options[0]) ? '0' : '-1'}" data-act="${esc(act)}" data-value="${esc(o.id)}"${dataAttrs(data)}${o.title ? ` title="${esc(o.title)}"` : ''}${disabled ? ' disabled' : ''} data-focus="${esc(`${focus || act}:${o.id}`)}">${esc(o.label)}</button>`;
  }).join('')}</div>`;
}

/** A switch (Toggle). With `text`, the label is shown beside it; else `label` is for screen readers. */
export function toggle({ checked, label, act, data = {}, focus = '', text = '', disabled = false }) {
  return `<label class="toggle ps-toggle"${text ? '' : ` title="${esc(label)}"`}><input type="checkbox" role="switch" data-act="${esc(act)}"${dataAttrs(data)} ${checked ? 'checked' : ''}${disabled ? ' disabled' : ''} aria-label="${esc(label)}" data-focus="${esc(focus || `${act}:${Object.values(data).join(':')}`)}">${text ? `<span>${esc(text)}</span>` : ''}</label>`;
}

/** An icon button (IconButton). */
export function iconButton({ icon, label, act, data = {}, focus = '', current = false, disabled = false, cls = '' }) {
  return `<button type="button" class="ps-icon${cls ? ` ${cls}` : ''}" data-act="${esc(act)}"${dataAttrs(data)} aria-label="${esc(label)}" title="${esc(label)}"${current ? ' aria-current="true"' : ''}${disabled ? ' disabled' : ''} data-focus="${esc(focus || `${act}:${Object.values(data).join(':')}`)}">${ICON[icon] || ''}</button>`;
}

/** A plain button. */
export function button({ text, act, data = {}, cls = '', focus = '', disabled = false, attrs: more = {} }) {
  return `<button type="button" class="btn btn-sm${cls ? ` ${cls}` : ''}" data-act="${esc(act)}"${dataAttrs(data)}${attrs(more)}${disabled ? ' disabled' : ''} data-focus="${esc(focus || `${act}:${Object.values(data).join(':')}`)}">${esc(text)}</button>`;
}

/** A disclosure (Disclosure): a fold with a title and an aside. */
export function fold({ title, aside = '', body, open = false, id = '', cls = '' }) {
  return `<details class="ps-fold${cls ? ` ${cls}` : ''}"${open ? ' open' : ''}${id ? ` data-fold="${esc(id)}"` : ''}><summary><span class="ps-fold-title">${esc(title)}</span>${aside ? `<span class="ps-fold-aside">${esc(aside)}</span>` : ''}</summary><div class="ps-fold-body">${body}</div></details>`;
}

/** A margin note (MarginNote): an eyebrow and a few quiet lines. */
export const marginNote = (eyebrow, text) => `<aside class="ps-note"><p class="ps-note-eyebrow">${esc(eyebrow)}</p><p>${esc(text)}</p></aside>`;

/** Field chrome around any control: a label above, a hint below. */
export function field({ label, labelHtml = '', control, hint = '', forId = '', group = false }) {
  const tag = group ? 'div' : 'label';
  return `<${tag} class="field ps-field"${group ? ' role="group"' : ''}${forId && !group ? ` for="${esc(forId)}"` : ''}${group ? ` aria-label="${esc(label)}"` : ''}><span class="field-label">${labelHtml || esc(label)}</span>${control}${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}</${tag}>`;
}

export const meta = (text, cls = '') => `<p class="ps-meta${cls ? ` ${cls}` : ''}">${esc(text)}</p>`;

/** "1st", "2nd", "11th": a place in the order. */
export const ordinal = (n) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n.toLocaleString()}${suffix}`;
};

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
