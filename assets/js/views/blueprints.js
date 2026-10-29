import { esc, pageHead, copyText, store, toast, confirmButton } from '../ui.js';
import { handoff } from '../handoff.js';
import { STARTER_BLUEPRINTS, parseSlots, renderBlueprint, blueprintSegments, tidy } from '../lib/blueprints.js';

const CUSTOM = 'aetheria.blueprints';
const VALUES = 'aetheria.blueprint.values';
const TARGETS = { description: 'Description', first_mes: 'First message', lore: 'New lore entry' };

export async function render(main, _arg, { setTitle }) {
  setTitle('Blueprints');
  let custom = store.get(CUSTOM, []);
  let values = store.get(VALUES, {});
  let selected = STARTER_BLUEPRINTS[1].id;
  let editing = false;

  const all = () => [...STARTER_BLUEPRINTS, ...custom];
  const current = () => all().find((b) => b.id === selected) || all()[0];
  const isStarter = (b) => STARTER_BLUEPRINTS.some((s) => s.id === b.id);
  const vals = () => (values[selected] = values[selected] || {});

  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Workshop · Blueprints', title: '<em>Blueprints</em>', lede: 'Templates with questions built in. Write a slot as [[Label: hint]]; it becomes a field here. Fill the fields, then send the result to the Character builder.' })}
    </div>
    <div class="bp-layout">
      <aside class="bp-side panel glass">
        <p class="panel-sub">Blueprints</p>
        <div class="bp-list" id="bp-list"></div>
        <button type="button" class="btn btn-sm" id="bp-new">Write a new blueprint</button>
      </aside>
      <section class="panel glass" id="bp-form" aria-label="Fill the slots"></section>
      <section class="panel glass" aria-label="Result" style="gap:14px">
        <div class="section-head"><p class="panel-sub">Result</p><span class="mono faint" id="bp-filled"></span></div>
        <div class="bp-preview" id="bp-preview"></div>
        <hr class="rule">
        <div class="btn-row">
          <button type="button" class="btn btn-gilt" id="bp-send"></button>
          <button type="button" class="btn" id="bp-copy">Copy</button>
          <button type="button" class="btn btn-ghost" id="bp-clear">Clear answers</button>
        </div>
      </section>
    </div>
  </div>`;

  const $m = (s) => main.querySelector(s);

  function drawList() {
    $m('#bp-list').innerHTML = all().map((b) => `<button type="button" class="bp-item" data-id="${esc(b.id)}" aria-pressed="${b.id === selected}">
      <span class="bp-name">${esc(b.name)}</span><span class="bp-note">${esc(b.note || (isStarter(b) ? '' : 'Your blueprint, kept in this browser.'))}</span></button>`).join('');
  }

  function drawForm() {
    const b = current();
    const slots = parseSlots(b.body);
    const v = vals();
    $m('#bp-form').innerHTML = editing
      ? `<div class="section-head"><p class="panel-sub">Editing</p><span class="mono faint">${slots.length} slot${slots.length === 1 ? '' : 's'}</span></div>
        <label class="field"><span class="field-label">Name</span><input class="input" id="bp-name" value="${esc(b.name)}"></label>
        <label class="field"><span class="field-label">Sends to</span><select class="select" id="bp-target">${Object.entries(TARGETS).map(([k, l]) => `<option value="${k}" ${b.target === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Body</span><textarea class="textarea tall mono-area" id="bp-body" rows="16">${esc(b.body)}</textarea>
          <span class="field-hint">Slots: [[Label]] or [[Label: hint]]. A label used twice is asked once. {{macros}} pass through.</span></label>
        <div class="btn-row"><button type="button" class="btn btn-gilt" id="bp-done">Done</button><button type="button" class="btn btn-ghost btn-danger" id="bp-delete">Delete</button></div>`
      : `<div class="section-head"><h2 class="panel-title">${esc(b.name)}</h2>
          <button type="button" class="btn btn-sm btn-ghost" id="bp-edit">${isStarter(b) ? 'Duplicate to edit' : 'Edit'}</button></div>
        ${b.note ? `<p class="dim" style="font-size:1rem">${esc(b.note)}</p>` : ''}
        ${slots.length ? slots.map((s) => `<label class="field"><span class="field-label">${esc(s.label)}</span>
          <textarea class="textarea" rows="${s.hint.length > 70 ? 4 : 2}" data-slot="${esc(s.key)}" placeholder="${esc(s.hint)}">${esc(v[s.key] || '')}</textarea></label>`).join('')
          : '<p class="dim">This blueprint has no [[slots]] yet. Edit it to add some.</p>'}`;
    wireForm();
  }

  function drawPreview() {
    const b = current();
    const v = vals();
    const segs = blueprintSegments(b.body, v);
    $m('#bp-preview').innerHTML = segs.map((s) => (s.text !== undefined ? esc(s.text) : s.value ? `<span class="slot-filled">${esc(s.value)}</span>` : `<span class="slot-empty">${esc(s.label)}</span>`)).join('');
    const slots = parseSlots(b.body);
    const filled = slots.filter((s) => (v[s.key] || '').trim()).length;
    $m('#bp-filled').textContent = `${filled} of ${slots.length} filled`;
    $m('#bp-send').textContent = `Send to the character · ${TARGETS[b.target] || TARGETS.description}`;
  }

  const persist = () => { store.set(CUSTOM, custom); store.set(VALUES, values); };

  function wireForm() {
    const b = current();
    $m('#bp-edit')?.addEventListener('click', () => {
      if (isStarter(b)) {
        const copy = { id: `custom-${Date.now().toString(36)}`, name: `${b.name} (mine)`, note: '', target: b.target, body: b.body };
        custom.push(copy);
        values[copy.id] = { ...(values[b.id] || {}) };
        selected = copy.id;
      }
      editing = true; persist(); drawList(); drawForm(); drawPreview();
    });
    for (const ta of $m('#bp-form').querySelectorAll('[data-slot]')) {
      ta.addEventListener('input', () => { vals()[ta.dataset.slot] = ta.value; persist(); drawPreview(); });
    }
    if (editing) {
      const cb = custom.find((x) => x.id === selected);
      $m('#bp-name').addEventListener('input', (e) => { cb.name = e.target.value || 'Untitled blueprint'; persist(); drawList(); });
      $m('#bp-target').addEventListener('change', (e) => { cb.target = e.target.value; persist(); drawPreview(); });
      $m('#bp-body').addEventListener('input', (e) => { cb.body = e.target.value; persist(); drawPreview(); });
      $m('#bp-done').addEventListener('click', () => { editing = false; drawForm(); });
      confirmButton($m('#bp-delete'), () => {
        custom = custom.filter((x) => x.id !== selected);
        delete values[selected];
        selected = STARTER_BLUEPRINTS[0].id; editing = false;
        persist(); drawList(); drawForm(); drawPreview();
      }, 'Delete this blueprint?');
    }
  }

  $m('#bp-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-id]');
    if (!item) return;
    selected = item.dataset.id; editing = false;
    drawList(); drawForm(); drawPreview();
  });
  $m('#bp-new').addEventListener('click', () => {
    const nb = { id: `custom-${Date.now().toString(36)}`, name: 'Untitled blueprint', note: '', target: 'description', body: '[[First question: a hint for the writer]]\n\n[[Second question]]' };
    custom.push(nb); selected = nb.id; editing = true; persist();
    drawList(); drawForm(); drawPreview();
    $m('#bp-name')?.focus();
  });
  $m('#bp-copy').addEventListener('click', () => copyText(tidy(renderBlueprint(current().body, vals())), 'Blueprint copied'));
  confirmButton($m('#bp-clear'), () => { values[selected] = {}; persist(); drawForm(); drawPreview(); }, 'Clear every answer?');
  $m('#bp-send').addEventListener('click', () => {
    const b = current();
    const text = tidy(renderBlueprint(b.body, vals()));
    if (!text) { toast('Fill at least one slot first.'); return; }
    const title = b.target === 'lore' ? (vals().name || b.name) : b.name;
    handoff.character = { patch: { target: b.target || 'description', text, title } };
    location.hash = 'character';
  });

  drawList(); drawForm(); drawPreview();
}
