import { esc, pageHead, dropZone, readFileBytes, download, copyText, toast, slugify } from '../ui.js';
import { loadCards, loadCardFile } from '../data.js';
import { take, handoff } from '../handoff.js';
import { readCardBytes } from '../lib/card.js';
import { detectLorebook, toCharacterBook, toStandalone, lorebookRows } from '../lib/lorebook.js';
import { isPng } from '../lib/png.js';

const RENAMES = [
  ['key', 'keys'], ['keysecondary', 'secondary_keys'], ['order', 'insertion_order'], ['uid', 'id'],
  ['disable', 'enabled (inverted)'], ['position 0 / 1', '"before_char" / "after_char"'],
  ['position 2 to 7', 'extensions.aetherbot_position'], ['depth, role, sticky, …', 'extensions.*'],
];

export async function render(main, _arg, { setTitle }) {
  setTitle('Lorebook Binder');
  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Workshop · Lorebook Binder', title: 'Lorebook <em>Binder</em>', lede: "Bind a standalone World Info file into a card's character_book, or unbind one back out. Unknown fields ride along in extensions, so a round-trip loses nothing." })}
    </div>
    <div class="tool-grid">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <label class="dropzone" id="b-drop">
          <input type="file" accept=".json,.png,application/json,image/png" aria-label="Choose a lorebook or card">
          <svg viewBox="0 0 34 34" aria-hidden="true"><path d="M17 8c-3-2.2-7-2.6-11-1.9v20c4-.7 8-.3 11 1.9 3-2.2 7-2.6 11-1.9v-20c-4-.7-8-.3-11 1.9Zm0 0v20"/></svg>
          <strong>Drop a lorebook or a card</strong>
          <small>World Info JSON · character_book JSON · card PNG / JSON</small>
        </label>
        <details class="fold"><summary>Or paste JSON</summary><div class="fold-body">
          <textarea class="textarea mono-area" id="b-paste" rows="8" placeholder='{"entries": {"0": {"key": ["…"], "content": "…"}}}'></textarea>
          <div><button type="button" class="btn btn-sm" id="b-read">Read it</button></div>
        </div></details>
        <section class="panel glass" id="b-out" aria-live="polite"></section>
      </div>
      <aside class="tool-side">
        <section class="panel glass">
          <p class="panel-sub">Field map</p>
          <p class="dim" style="font-size:.98rem">Standalone World Info uses SillyTavern's internal names. Embedded books use the V2 spec's names. The Binder translates:</p>
          <div class="table-wrap" style="border:0"><table class="data" style="min-width:0"><thead><tr><th>World Info</th><th>character_book</th></tr></thead><tbody>
            ${RENAMES.map(([a, b]) => `<tr><td class="num">${esc(a)}</td><td class="num">${esc(b)}</td></tr>`).join('')}
          </tbody></table></div>
        </section>
      </aside>
    </div>
  </div>`;

  const out = main.querySelector('#b-out');

  function show(obj, name) {
    const kind = detectLorebook(obj);
    if (!kind) { out.innerHTML = '<p class="error-note">No lorebook found. Expected World Info (entries as an object), a character_book (entries as a list), or a card that contains one.</p>'; return; }
    const book = kind === 'card' ? (obj.data ? obj.data.character_book : obj.character_book) : obj;
    const embedded = kind !== 'standalone';
    const rows = lorebookRows(book, embedded ? 'character_book' : 'standalone');
    const converted = embedded ? toStandalone(book, name) : toCharacterBook(book);
    const bookName = book.name || name || 'lorebook';
    out.innerHTML = `<div class="section-head">
        <div><p class="panel-sub">${embedded ? (kind === 'card' ? 'Embedded in a card' : 'Embedded character_book') : 'Standalone World Info'}</p>
        <h2 class="panel-title">${esc(bookName)}</h2></div>
        <span class="mono faint">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Entry</th><th>Keys</th><th>Position</th><th>Order</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><span class="cell-name">${esc(r.name)}</span><br><span class="cell-content">${esc(r.content.slice(0, 120))}${r.content.length > 120 ? '…' : ''}</span></td>
          <td><div class="keys">${r.keys.map((k) => `<span class="key">${esc(k)}</span>`).join('')}${r.constant ? '<span class="flag flag-on">Constant</span>' : ''}${!r.enabled ? '<span class="flag">Off</span>' : ''}${r.selective ? '<span class="flag">Selective</span>' : ''}</div></td>
          <td>${esc(r.position)}</td><td class="num">${r.order}</td></tr>`).join('') || '<tr><td colspan="4" class="dim">This book has no entries.</td></tr>'}
      </tbody></table></div>
      <div class="btn-row">
        <button type="button" class="btn btn-gilt" id="b-dl">${embedded ? 'Unbind to World Info' : 'Bind as character_book'}</button>
        <button type="button" class="btn" id="b-copy">Copy result</button>
        <button type="button" class="btn btn-ghost" id="b-forge">Bind into the Forge card</button>
      </div>
      <details class="fold"><summary>Converted JSON<span class="sum-meta">${embedded ? 'World Info' : 'character_book'}</span></summary><div class="fold-body"><pre class="json-view">${esc(JSON.stringify(converted, null, 2).slice(0, 16000))}</pre></div></details>`;
    const json = () => JSON.stringify(converted, null, 2);
    out.querySelector('#b-dl').addEventListener('click', () => download(json(), `${slugify(bookName)}${embedded ? '' : '.character_book'}.json`, 'application/json'));
    out.querySelector('#b-copy').addEventListener('click', () => copyText(json(), 'Converted lorebook copied'));
    out.querySelector('#b-forge').addEventListener('click', () => {
      const cb = embedded ? book : converted;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('aetheria.forge.draft')); } catch { /* none */ }
      const data = saved && saved.data ? saved.data : { name: '' };
      data.character_book = JSON.parse(JSON.stringify(cb));
      handoff.forge = { data, imageBytes: null };
      toast('Lorebook bound into the Forge card');
      location.hash = 'forge';
    });
  }

  async function fromBytes(bytes, name) {
    try {
      if (isPng(bytes)) {
        const c = readCardBytes(bytes, name);
        if (!c.data.character_book) throw new Error('That card has no lorebook bound in.');
        show(c.data.character_book, c.data.name);
        return;
      }
      show(JSON.parse(new TextDecoder().decode(bytes)), name.replace(/\.json$/i, ''));
    } catch (e) { toast(e.message.includes('JSON') ? 'That file is not valid JSON.' : e.message); }
  }

  dropZone(main.querySelector('#b-drop'), async (files) => fromBytes(await readFileBytes(files[0]), files[0].name));
  main.querySelector('#b-read').addEventListener('click', () => {
    try { show(JSON.parse(main.querySelector('#b-paste').value), ''); } catch { toast('That is not valid JSON. Check for a missing brace or comma.'); }
  });

  const h = take('binder');
  if (h && h.json) { show(h.json, h.name); return; }
  const first = (await loadCards().catch(() => [])).find((c) => c.file);
  if (first) {
    try { const c = await loadCardFile(first.file); if (c.data.character_book) { show(c.data.character_book, c.data.name); return; } } catch { /* fall through */ }
  }
  out.innerHTML = '<p class="dim">Drop a lorebook above to begin.</p>';
}
