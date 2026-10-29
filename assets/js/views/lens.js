import { esc, pageHead, richText, starSvg, dropZone, readFileBytes, download, copyText, slugify, sigilSvg, toast } from '../ui.js';
import { loadCards, loadCardFile } from '../data.js';
import { take, handoff } from '../handoff.js';
import { readCardBytes, toV2, tokenAnatomy, craftChecks, fmtTokens, bookEntries, estTokens, cardStats } from '../lib/card.js';
import { lorebookRows } from '../lib/lorebook.js';

const KCLASS = { description: 'k-permanent', personality: 'k-permanent-2', scenario: 'k-permanent-3', system_prompt: 'k-permanent-2', post_history_instructions: 'k-permanent-3', mes_example: 'k-ephemeral', first_mes: 'k-greeting', lore: 'k-keyed' };
const FIELD_ORDER = [
  ['description', 'Description'], ['personality', 'Personality'], ['scenario', 'Scenario'], ['first_mes', 'First message'],
  ['mes_example', 'Example messages'], ['system_prompt', 'System prompt'], ['post_history_instructions', 'Post-history instructions'], ['creator_notes', "Creator's notes"],
];

export function meterHtml(anat) {
  const total = Math.max(1, anat.total);
  return `<div class="meter">
    <div class="meter-bar" role="img" aria-label="Token anatomy">${anat.parts.filter((p) => p.tokens).map((p) => `<span class="${KCLASS[p.key]}" style="flex-grow:${p.tokens / total}" title="${esc(p.label)}: ≈${p.tokens}"></span>`).join('')}</div>
    <div class="meter-legend">${anat.parts.map((p) => `<div><i class="${KCLASS[p.key]}"></i>${esc(p.label)}<b>${p.tokens ? `≈${fmtTokens(p.tokens)}` : '·'}</b></div>`).join('')}</div>
  </div>`;
}

export function checksHtml(checks) {
  return `<div class="checks">${checks.map((c) => `<details class="check"${c.level === 'look' ? ' open' : ''}>
    <summary><span class="sev sev-${c.level}">${c.level === 'pass' ? 'Clear' : c.level === 'note' ? 'Note' : 'Look'}</span><span class="check-title">${esc(c.title)}</span><span class="check-arrow" aria-hidden="true"></span></summary>
    <div class="check-body"><p>${esc(c.detail)}</p>
      ${c.hits.map((h) => `<div class="hit"><span class="where">${esc(h.field)}</span>${esc(h.before)}<mark>${esc(h.match)}</mark>${esc(h.after)}</div>`).join('')}
    </div></details>`).join('')}</div>`;
}

export async function render(main, _arg, { setTitle }) {
  setTitle('Card Lens');
  const cards = await loadCards().catch(() => []);
  const fromGallery = cards.filter((c) => c.file);

  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Workshop · Card Lens', title: 'Card <em>Lens</em>', lede: 'Drop a card to read what is inside it: the spec, the chunks, where its tokens go, and what the craft checks notice.' })}
    </div>
    <section style="display:flex;flex-direction:column;gap:12px">
      <label class="dropzone" id="lens-drop">
        <input type="file" accept=".png,.json,image/png,application/json" aria-label="Choose a card file">
        <svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="15" cy="15" r="9.5"/><path d="m22 22 8 8"/></svg>
        <strong>Drop a card here, or choose a file</strong>
        <small>PNG with chara / ccv3 chunks, or V1 · V2 · V3 JSON</small>
      </label>
      ${fromGallery.length ? `<div class="chip-row" aria-label="Inspect a gallery card"><span class="faint" style="font-size:.95rem;align-self:center">Or from the gallery:</span>${fromGallery.map((c) => `<button type="button" class="chip" data-file="${esc(c.file)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    </section>
    <div id="lens-out"></div>
  </div>`;

  const out = main.querySelector('#lens-out');
  let objectUrl = null;

  function inspect(parsed, { name = '', bytes = null, file = null } = {}) {
    const d = parsed.data;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = bytes && parsed.container === 'png' ? URL.createObjectURL(new Blob([bytes], { type: 'image/png' })) : null;
    const anat = tokenAnatomy(d);
    const checks = craftChecks(d);
    const rows = d.character_book ? lorebookRows(d.character_book, 'character_book') : [];
    const allText = [d.description, d.personality, d.scenario, d.first_mes, d.mes_example, d.system_prompt, d.post_history_instructions, ...(d.alternate_greetings || [])].join('\n');
    const macros = new Set((allText.match(/\{\{[^{}]+\}\}/g) || []).map((m) => m.toLowerCase()));
    const words = (allText.match(/\S+/g) || []).length;
    const looks = checks.filter((c) => c.level !== 'pass').length;
    const greetings = [d.first_mes, ...(d.alternate_greetings || [])].filter((g) => g && g.trim());

    out.innerHTML = `<div class="tool-grid">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <section class="panel glass">
          <div class="lens-head">
            <div class="lens-thumb">${objectUrl ? `<img src="${objectUrl}" alt="">` : sigilSvg(d.name, { size: 80 })}</div>
            <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
              <p class="panel-sub">${esc(name || (parsed.container === 'png' ? 'PNG card' : 'JSON card'))}</p>
              <h2 class="reader-name" style="font-size:clamp(1.8rem,1.4rem + 1.6vw,2.6rem)">${esc(d.name || 'Unnamed card')}</h2>
              <div class="badges">
                <span class="badge ok">${esc(parsed.spec.toUpperCase())}</span>
                <span class="badge">${parsed.container.toUpperCase()}</span>
                ${parsed.container === 'png' ? `<span class="badge ${parsed.chunks.includes('chara') ? 'ok' : 'off'}">chara</span><span class="badge ${parsed.chunks.includes('ccv3') ? 'ok' : 'off'}">ccv3</span>` : ''}
                ${parsed.size ? `<span class="badge">${parsed.size.width}×${parsed.size.height}</span>` : ''}
                ${d.creator ? `<span class="badge">by ${esc(d.creator)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-sm" id="l-forge">Open in the Character builder</button>
            <button type="button" class="btn btn-sm" id="l-json">Download V2 JSON</button>
            ${rows.length ? '<button type="button" class="btn btn-sm" id="l-binder">Open its lorebook</button>' : ''}
            <button type="button" class="btn btn-sm btn-ghost" id="l-entry" title="A ready-made row for data/cards.json">Copy gallery entry</button>
          </div>
        </section>

        <section class="panel glass" aria-labelledby="l-checks">
          <div class="section-head"><h3 class="panel-title" id="l-checks">Craft checks</h3><span class="mono faint">${looks ? `${looks} to review` : 'all clear'}</span></div>
          ${checksHtml(checks)}
        </section>

        <section style="display:flex;flex-direction:column;gap:12px" aria-label="Fields">
          ${FIELD_ORDER.filter(([k]) => d[k] && d[k].trim()).map(([k, label], i) => `<details class="fold"${i === 0 ? ' open' : ''}>
            <summary>${esc(label)}<span class="sum-meta">≈${fmtTokens(estTokens(d[k]))} tk</span></summary>
            <div class="fold-body"><div class="prose" style="font-size:1.05rem">${richText(d[k])}</div></div></details>`).join('')}
          ${(d.alternate_greetings || []).length ? `<details class="fold"><summary>Alternate greetings<span class="sum-meta">${d.alternate_greetings.length}</span></summary>
            <div class="fold-body">${d.alternate_greetings.map((g, i) => `<p class="greeting-label">Greeting ${i + 2}</p><div class="prose" style="font-size:1.05rem">${richText(g)}</div>`).join('<hr class="rule">')}</div></details>` : ''}
          ${rows.length ? `<details class="fold"><summary>Lorebook<span class="sum-meta">${rows.length} entries</span></summary><div class="fold-body">
            <div class="table-wrap"><table class="data"><thead><tr><th>Entry</th><th>Keys</th><th>Position</th><th>Order</th></tr></thead><tbody>
              ${rows.map((r) => `<tr><td><span class="cell-name">${esc(r.name)}</span><br><span class="cell-content">${esc(r.content.slice(0, 140))}${r.content.length > 140 ? '…' : ''}</span></td>
                <td><div class="keys">${r.keys.map((k) => `<span class="key">${esc(k)}</span>`).join('')}${r.constant ? '<span class="flag flag-on">Constant</span>' : ''}${!r.enabled ? '<span class="flag">Off</span>' : ''}</div></td>
                <td>${esc(r.position)}</td><td class="num">${r.order}</td></tr>`).join('')}
            </tbody></table></div></div></details>` : ''}
          <details class="fold"><summary>Raw V2 JSON</summary><div class="fold-body"><pre class="json-view">${esc(JSON.stringify(toV2(d), null, 2).slice(0, 20000))}</pre></div></details>
        </section>
      </div>

      <aside class="tool-side">
        <section class="panel glass">
          <p class="panel-sub">Token anatomy</p>
          <p class="big-number">≈${fmtTokens(anat.permanent)}<small>permanent</small></p>
          ${meterHtml(anat)}
          <p class="field-hint">Solid gilt rides in every prompt. Hatched blue teaches early, then scrolls out. Dotted green arrives only when a key is said. Estimates; real counts depend on the model's tokenizer.</p>
        </section>
        <section class="panel glass">
          <div class="statline" style="border:0">
            <div class="stat"><span class="stat-val">${greetings.length}</span><span class="stat-label">Greetings</span></div>
            <div class="stat"><span class="stat-val">${bookEntries(d).length}</span><span class="stat-label">Lore</span></div>
            <div class="stat"><span class="stat-val">${macros.size}</span><span class="stat-label">Macros</span></div>
            <div class="stat"><span class="stat-val">${fmtTokens(words)}</span><span class="stat-label">Words</span></div>
          </div>
          ${(d.tags || []).length ? `<div class="chip-row">${d.tags.map((t) => `<span class="chip chip-static tagline-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        </section>
      </aside>
    </div>`;

    out.querySelector('#l-forge').addEventListener('click', () => { handoff.character = file ? { file } : { data: d, imageBytes: parsed.container === 'png' ? bytes : null }; location.hash = 'character'; });
    out.querySelector('#l-json').addEventListener('click', () => download(JSON.stringify(toV2(d), null, 2), `${slugify(d.name)}.json`, 'application/json'));
    out.querySelector('#l-binder')?.addEventListener('click', () => { handoff.lorebook = { json: d.character_book, name: d.name }; location.hash = 'lorebook'; });
    out.querySelector('#l-entry').addEventListener('click', () => {
      const ext = d.extensions || {};
      const slug = slugify(d.name);
      const entry = {
        file: `cards/${slug}.png`, slug, name: d.name,
        tagline: (ext.aetheria && ext.aetheria.tagline) || '',
        world: typeof ext.world === 'string' ? ext.world : '',
        tags: d.tags || [], creator: d.creator || '', stats: cardStats(d),
        featured: false, added: new Date().toISOString().slice(0, 10),
      };
      copyText(JSON.stringify(entry, null, 2), 'Gallery entry copied. Paste it into data/cards.json');
    });
  }

  async function openFile(f) {
    try {
      const bytes = await readFileBytes(f);
      inspect(readCardBytes(bytes, f.name), { name: f.name, bytes });
    } catch (e) { toast(e.message); }
  }
  async function openGallery(file) {
    try {
      const c = await loadCardFile(file);
      const bytes = c.bytes || null;
      inspect(c, { name: file.split('/').pop(), bytes, file });
    } catch (e) { toast(e.message); }
  }

  dropZone(main.querySelector('#lens-drop'), (files) => openFile(files[0]));
  main.querySelector('.chip-row')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-file]');
    if (b) openGallery(b.dataset.file);
  });

  const h = take('lens');
  if (h && h.file) await openGallery(h.file);
  else if (h && h.data) inspect({ spec: 'v2', data: h.data, container: 'json', chunks: [], size: null }, { name: 'From the Character builder' });
  else if (fromGallery.length) await openGallery(fromGallery[fromGallery.length - 1].file);
  else out.innerHTML = `<div class="empty-state glass">${starSvg('star')}<p>Drop a card above to begin.</p></div>`;

  return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
}
