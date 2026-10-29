// The worldbook: what is true of the world, entry by entry (Aetheria's
// components/ages/AgesWorldbook.js). Find, choose, correct. The shelves and
// filters fill the sheet; the open entry is written in the inspector.
import { esc } from '../../ui.js';
import { TIMELINE } from './engine.js';

const READ_AT_ONCE = 400;

const blankDraft = () => ({ name: '', category: 'landmark', summary: '', content: '', aliases: '', tags: '', visibility: 'public', knowledge: 'canonical', importance: 0.5, x: '', z: '' });
const entryDraft = (e) => ({
  id: e.id, name: e.name, category: e.category, summary: e.summary || '', content: e.content || '',
  aliases: (e.aliases || []).join(', '), tags: (e.tags || []).join(', '), visibility: e.visibility, knowledge: e.knowledge,
  importance: e.importance, x: Number.isFinite(e.position?.x) ? Math.round(e.position.x * 10) / 10 : '', z: Number.isFinite(e.position?.z) ? Math.round(e.position.z * 10) / 10 : '',
});
const opt = (v, l, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`;
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export class Worldbook {
  /**
   * opts: { core, worldId(), blocked() → reason or '', onChanged(), onJumpToMap(entry), onOpen(), say(text) }
   * `list` is the sheet's host, `editor` the inspector's.
   */
  constructor(list, editor, opts) {
    this.list = list; this.editor = editor; this.opts = opts; this.core = opts.core;
    this.f = { query: '', category: 'all', regionId: '', sort: 'name', includeArchived: false, more: false };
    this.entries = []; this.regions = []; this.revisions = []; this.total = 0;
    this.selectedId = null; this.draft = blankDraft(); this.mergeSourceId = ''; this.busy = false; this.message = '';
    this.loadedFor = null; this.openMade = false;
    this.wire();
  }
  get worldId() { return this.opts.worldId(); }

  async load(preferredId = this.selectedId) {
    const id = this.worldId; if (!id) return;
    const core = this.core; const f = this.f;
    const ask = { query: f.query, category: f.category, regionId: f.regionId || undefined, includeArchived: f.includeArchived, sort: f.sort, pageSize: 100, revisionPageSize: 100 };
    const read = []; let at = 1; let result;
    do {
      result = await core.agesWorldbook(id, TIMELINE, { ...ask, page: at });
      read.push(...(result.entries || []));
      at += 1;
    } while (result.has_more && read.length < READ_AT_ONCE);
    const regions = await core.agesWorldbook(id, TIMELINE, { category: 'region', sort: 'name', pageSize: 100 });
    if (id !== this.worldId) return;
    this.entries = read; this.regions = regions.entries || []; this.revisions = result.revisions || [];
    this.total = result.filtered_total ?? result.total ?? 0; this.allTotal = result.total ?? 0;
    this.hasMore = Boolean(result.has_more);
    const shelves = core.shelveWorldbook(read, { byName: f.sort === 'name' });
    const next = preferredId && read.some((e) => e.id === preferredId) ? preferredId : (preferredId === null && this.selectedId === null && this.loadedFor === id ? null : core.firstShelved(shelves)?.id || null);
    this.loadedFor = id;
    this.select(next, { quiet: true });
    this.renderList();
  }
  /** Open an entry from elsewhere (the map). */
  async reveal(entryId) {
    this.f = { ...this.f, query: '', category: 'all', regionId: '', includeArchived: true };
    this.renderFilters();
    await this.load(entryId);
    this.opts.onOpen?.();
  }
  select(id, { quiet = false } = {}) {
    this.selectedId = id;
    const e = this.selected();
    this.draft = e ? entryDraft(e) : blankDraft();
    this.mergeSourceId = '';
    if (!quiet) this.message = '';
    this.renderEditor();
    for (const b of this.list.querySelectorAll('[data-entry]')) {
      const on = b.dataset.entry === id; b.classList.toggle('is-open', on); b.setAttribute('aria-current', on ? 'true' : 'false');
    }
  }
  selected() { return this.entries.find((e) => e.id === this.selectedId) || null; }

  // ── The shelves ──────────────────────────────────────────────────────────
  render() { this.list.innerHTML = `<div class="wwb-filters" data-filters></div><div class="wwb-shelves" data-shelves></div>`; this.renderFilters(); this.renderList(); this.renderEditor(); }
  renderFilters() {
    const host = this.list.querySelector('[data-filters]'); if (!host) return;
    const core = this.core; const f = this.f;
    const on = [f.sort !== 'name', f.includeArchived].filter(Boolean).length;
    host.innerHTML = `
      <div class="wwb-row">
        <label class="search wwb-search"><input class="input" type="search" data-f="query" value="${esc(f.query)}" placeholder="Search names, other names, tags and text" aria-label="Search the worldbook" autocomplete="off"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></label>
        <select class="select" data-f="category" aria-label="Kind of entry">${opt('all', 'Every kind', f.category)}${core.KIND_ORDER.map((k) => opt(k, core.kindWord(k), f.category)).join('')}</select>
        <select class="select" data-f="regionId" aria-label="Region">${opt('', 'Every region', f.regionId)}${this.regions.map((r) => opt(r.id.replace(/^region:/, ''), r.name, f.regionId)).join('')}</select>
        <button type="button" class="btn btn-sm btn-ghost" data-wb="more" aria-expanded="${f.more}">${on ? `More filters · ${on} on` : 'More filters'}</button>
        <button type="button" class="btn btn-sm btn-gilt" data-wb="new">New entry</button>
      </div>
      ${f.more ? `<div class="wwb-row wwb-more">
        <select class="select" data-f="sort" aria-label="Order">${opt('name', 'By name', f.sort)}${opt('recent', 'Recently changed', f.sort)}${opt('importance', 'By importance', f.sort)}</select>
        <label class="toggle"><input type="checkbox" data-f="includeArchived" ${f.includeArchived ? 'checked' : ''}> Show archived entries</label>
      </div>` : ''}`;
  }
  renderList() {
    const host = this.list.querySelector('[data-shelves]'); if (!host) return;
    const core = this.core;
    const shelves = core.shelveWorldbook(this.entries, { byName: this.f.sort === 'name' });
    const made = shelves.find((s) => s.made)?.entries || [];
    const openMade = Boolean(this.f.query.trim()) || shelves.every((s) => s.made) || made.some((e) => e.id === this.selectedId) || this.openMade;
    host.innerHTML = `
      <p class="wwb-count">${this.total} ${this.total === 1 ? 'entry' : 'entries'}${made.length ? ` · ${made.length} made by the map` : ''}</p>
      ${shelves.map((shelf) => `<details class="wwb-shelf"${!shelf.made || openMade ? ' open' : ''} data-shelf="${esc(shelf.id)}">
        <summary><span>${esc(shelf.title)}</span><span class="wwb-shelf-n">${shelf.entries.length}</span></summary>
        ${shelf.made ? '<p class="field-hint wwb-made">Places the map drew from the land itself: where rivers meet, deltas, falls and the like.</p>' : ''}
        <ul class="wwb-entries">${shelf.entries.map((e) => `<li><button type="button" class="wwb-entry${e.id === this.selectedId ? ' is-open' : ''}" data-entry="${esc(e.id)}" aria-current="${e.id === this.selectedId}">
          <strong>${esc(e.name)}</strong><span>${esc(core.entryLine(e, { withKind: shelf.made }))}</span></button></li>`).join('')}</ul>
      </details>`).join('')}
      ${this.entries.length ? '' : '<p class="faint wwb-empty">No entries match these filters.</p>'}
      ${this.hasMore ? '<p class="field-hint">Only the first 400 are shelved here. Search to find the rest.</p>' : ''}
      <p class="field-hint wwb-foot">Fact, rumour, what a character knows, private and GM-only are all kept apart.</p>`;
  }

  // ── The entry ────────────────────────────────────────────────────────────
  renderEditor() {
    const host = this.editor; if (!host) return;
    const core = this.core; const d = this.draft; const e = this.selected();
    const locked = Boolean(e?.locked);
    const blocked = this.opts.blocked?.() || '';
    const dis = locked ? ' disabled' : '';
    const revs = e ? this.revisions.filter((r) => r.entryId === e.id) : [];
    const aside = [core.kindWord(d.category), core.truthWord(d.knowledge).toLowerCase(), locked ? 'locked' : ''].filter(Boolean).join(' · ');
    host.innerHTML = `
      <div class="wwb-card" aria-label="${e ? 'The entry' : 'A new entry'}">
        <header class="wwb-card-head"><p class="panel-sub">${esc(aside)}</p><h3 class="inspector-title">${esc(e ? (d.name || e.name) : 'A new entry')}</h3></header>
        ${!e ? `<label class="field"><span class="field-label">Name</span><input class="input" data-d="name" value="${esc(d.name)}" autocomplete="off"></label>` : ''}
        <label class="field"><span class="field-label">In a line</span><textarea class="textarea wwb-line" data-d="summary" rows="2"${dis}>${esc(d.summary)}</textarea></label>
        <label class="field"><span class="field-label">The whole entry</span><textarea class="textarea" data-d="content" rows="6"${dis}>${esc(d.content)}</textarea></label>
        <details class="wwb-fold"${e ? '' : ' open'}><summary><span>What it is</span><small>${esc(`${core.kindWord(d.category)} · ${core.truthWord(d.knowledge)} · importance ${Math.round(Number(d.importance || 0) * 100) / 100}`)}</small></summary>
          ${e ? `<label class="field"><span class="field-label">Name</span><input class="input" data-d="name" value="${esc(d.name)}" autocomplete="off"${dis}></label>` : ''}
          <div class="field-row">
            <label class="field"><span class="field-label">Kind</span><select class="select" data-d="category"${dis}>${core.KIND_ORDER.map((k) => opt(k, core.kindWord(k), d.category)).join('')}</select></label>
            <label class="field"><span class="field-label">Truth</span><select class="select" data-d="knowledge"${dis}>${opt('canonical', 'Canonical fact', d.knowledge)}${opt('rumor', 'Rumour', d.knowledge)}${opt('character', 'A character’s knowledge', d.knowledge)}</select></label>
          </div>
          <label class="field"><span class="field-label">Importance</span><input class="input mono" type="number" min="0" max="1" step="0.05" data-d="importance" value="${esc(d.importance)}"${dis}><span class="field-hint">0 to 1: the more it matters, the sooner it is sent.</span></label>
        </details>
        <details class="wwb-fold"><summary><span>Who may see it</span><small>${esc(core.seenWord(d.visibility))}</small></summary>
          <select class="select" data-d="visibility" aria-label="Who may see it"${dis}>${opt('public', 'Public (the story may use it)', d.visibility)}${opt('private', 'Private', d.visibility)}${opt('gm', 'GM only', d.visibility)}</select>
          <p class="field-hint">Only public entries are sent with a reply.</p>
        </details>
        <details class="wwb-fold"><summary><span>On the map</span><small>${esc(core.placeWord(d))}</small></summary>
          <div class="field-row">
            <label class="field"><span class="field-label">x, east</span><input class="input mono" data-d="x" value="${esc(d.x)}" inputmode="decimal" placeholder="x"${dis}></label>
            <label class="field"><span class="field-label">z, north</span><input class="input mono" data-d="z" value="${esc(d.z)}" inputmode="decimal" placeholder="z"${dis}></label>
          </div>
        </details>
        <details class="wwb-fold"><summary><span>Other names and tags</span><small>${esc(core.namesWord(d))}</small></summary>
          <label class="field"><span class="field-label">Also called</span><input class="input" data-d="aliases" value="${esc(d.aliases)}" placeholder="comma separated" autocomplete="off"${dis}></label>
          <label class="field"><span class="field-label">Tags</span><input class="input" data-d="tags" value="${esc(d.tags)}" placeholder="comma separated" autocomplete="off"${dis}></label>
        </details>
        ${e ? `<details class="wwb-fold"><summary><span>Where it came from</span><small>${Math.round(e.confidence * 100)}% sure · ${revs.length} ${revs.length === 1 ? 'revision' : 'revisions'}</small></summary>
          <p class="field-hint">From ${esc(e.source)}${e.sourceRef ? ` · ${esc(e.sourceRef)}` : ''} · changed ${esc(when(e.updatedAt))}</p>
          ${e.relationships?.length ? `<ul class="wwb-rels">${e.relationships.map((r) => `<li>${esc(r.type)} → <button type="button" class="wwb-link" data-reveal="${esc(r.targetId)}">${esc(r.label || this.entries.find((x) => x.id === r.targetId)?.name || r.targetId)}</button></li>`).join('')}</ul>` : ''}
          <label class="field"><span class="field-label">Merge another entry into this one</span>
            <select class="select" data-merge${dis}><option value="">Choose an entry…</option>${this.entries.filter((x) => x.id !== e.id && !x.archived).map((x) => opt(x.id, x.name, this.mergeSourceId)).join('')}</select></label>
          <div class="btn-row"><button type="button" class="btn btn-sm" data-wb="merge"${!this.mergeSourceId || locked || blocked ? ' disabled' : ''}>Merge</button></div>
          <p class="panel-sub wwb-revs-title">Revisions</p>
          ${revs.length ? `<ul class="wwb-revs">${revs.slice(0, 20).map((r) => `<li>${esc(when(r.t))} · ${esc(r.action)}${r.note ? ` · ${esc(r.note)}` : ''}</li>`).join('')}</ul>` : '<p class="field-hint">No revisions by hand yet.</p>'}
        </details>` : ''}
        <div class="btn-row wwb-actions">
          <button type="button" class="btn btn-gilt btn-sm" data-wb="save"${this.busy || locked || blocked ? ' disabled' : ''}>${this.busy ? 'Saving…' : e ? 'Save the correction' : 'Add the entry'}</button>
          ${e ? `<button type="button" class="btn btn-sm" data-wb="lock"${this.busy || blocked ? ' disabled' : ''}>${e.locked ? 'Unlock' : 'Lock'}</button>` : ''}
          ${e ? `<button type="button" class="btn btn-sm btn-ghost" data-wb="archive"${this.busy || locked || blocked ? ' disabled' : ''}>${e.archived ? 'Restore' : 'Archive'}</button>` : ''}
          ${e?.position ? '<button type="button" class="btn btn-sm btn-ghost" data-wb="map">Show on the map</button>' : ''}
        </div>
        ${blocked ? `<p class="field-hint" role="status">${esc(blocked)}</p>` : ''}
        ${this.message ? `<p class="wwb-message" role="status">${esc(this.message)}</p>` : ''}
      </div>`;
  }

  // ── Doing ────────────────────────────────────────────────────────────────
  wire() {
    let t = 0;
    this.list.addEventListener('input', (e) => {
      const el = e.target.closest('[data-f]'); if (!el) return;
      if (el.dataset.f === 'query') { this.f.query = el.value; clearTimeout(t); t = setTimeout(() => this.load().catch((err) => this.opts.say?.(err.message)), 220); }
    });
    this.list.addEventListener('change', (e) => {
      const el = e.target.closest('[data-f]'); if (!el || el.dataset.f === 'query') return;
      this.f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      this.load().catch((err) => this.opts.say?.(err.message));
    });
    this.list.addEventListener('toggle', (e) => {
      const d = e.target.closest?.('[data-shelf]'); if (d?.dataset.shelf === this.core.MADE_BY_MAP) this.openMade = d.open;
    }, true);
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.entry) { this.select(b.dataset.entry); this.opts.onOpen?.(); return; }
      if (b.dataset.wb === 'more') { this.f.more = !this.f.more; this.renderFilters(); this.list.querySelector('[data-wb="more"]')?.focus(); }
      if (b.dataset.wb === 'new') { this.select(null); this.opts.onOpen?.(); this.editor.querySelector('[data-d="name"]')?.focus(); }
    });
    this.editor.addEventListener('input', (e) => {
      const el = e.target.closest('[data-d]');
      if (el) { this.draft[el.dataset.d] = el.value; if (el.dataset.d === 'name' && this.selected()) { const h = this.editor.querySelector('.inspector-title'); if (h) h.textContent = el.value || this.selected().name; } }
    });
    this.editor.addEventListener('change', (e) => {
      if (e.target.matches('[data-merge]')) { this.mergeSourceId = e.target.value; const b = this.editor.querySelector('[data-wb="merge"]'); if (b) b.disabled = !this.mergeSourceId; }
      else if (e.target.matches('select[data-d]')) { this.draft[e.target.dataset.d] = e.target.value; }
    });
    this.editor.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.reveal) { this.reveal(b.dataset.reveal); return; }
      const act = b.dataset.wb;
      if (act === 'save') this.save();
      else if (act === 'lock') this.write(() => this.core.agesSetWorldbookEntryLock(this.worldId, this.selectedId, !this.selected().locked, TIMELINE), this.selectedId, this.selected().locked ? 'Unlocked.' : 'Locked. It cannot be changed until it is unlocked.');
      else if (act === 'archive') { const was = this.selected().archived; this.write(() => this.core.agesSetWorldbookEntryArchived(this.worldId, this.selectedId, !was, TIMELINE), was ? this.selectedId : null, was ? 'Restored.' : 'Archived. Show archived entries to find it again.'); }
      else if (act === 'merge') this.write(() => this.core.agesMergeWorldbookEntries(this.worldId, this.selectedId, this.mergeSourceId, TIMELINE), this.selectedId, 'Entries merged; the source was archived and both changes were recorded.');
      else if (act === 'map') this.opts.onJumpToMap?.(this.selected());
    });
  }
  async write(run, keepId, message) {
    if (this.busy) return;
    this.busy = true; this.renderEditor();
    try {
      await run();
      this.busy = false; this.message = message;
      await this.load(typeof keepId === 'function' ? keepId() : keepId);
      this.opts.onChanged?.();
    } catch (err) {
      this.busy = false; this.message = String(err?.message || err); this.renderEditor();
    }
  }
  async save() {
    const d = this.draft;
    if (!d.name.trim()) { this.message = 'Give the entry a name first.'; this.renderEditor(); return; }
    const placed = d.x !== '' && d.z !== '' && Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.z));
    let savedId = null;
    await this.write(async () => {
      const saved = await this.core.agesSaveWorldbookEntry(this.worldId, {
        ...(d.id ? { id: d.id } : {}),
        name: d.name.trim(), category: d.category, summary: d.summary.trim(), content: d.content.trim(),
        aliases: d.aliases.split(',').map((v) => v.trim()).filter(Boolean),
        tags: d.tags.split(',').map((v) => v.trim()).filter(Boolean),
        visibility: d.visibility, knowledge: d.knowledge, importance: Math.max(0, Math.min(1, Number(d.importance) || 0)),
        ...(placed ? { position: { x: Number(d.x), z: Number(d.z) } } : {}),
        sourceRef: 'Worldbook editor',
      }, TIMELINE);
      savedId = saved.id;
      this.selectedId = saved.id;
    }, () => savedId, 'Worldbook entry saved with a revision.');
  }
}
