// Feature requests and bug reports, stored in Supabase. Anyone can post and vote;
// status changes, replies and hiding spam happen in the Supabase Table Editor.
import { esc, pageHead, starSvg, sigilSvg, toast, store } from '../ui.js';
import { loadSite } from '../data.js';

const KINDS = {
  feature: { route: 'board', title: 'Feature requests', heading: 'What should Aetheria <em>do next?</em>', cta: 'Request a feature', one: 'request',
    lede: 'Ask for what you want Aetheria to do, and vote for the requests you want most. The most-voted ones get looked at first.',
    body: 'What would you like Aetheria to do, and what would it help you with?' },
  bug: { route: 'bugs', title: 'Bug reports', heading: 'Tell me what <em>broke</em>', cta: 'Report a bug', one: 'report',
    lede: 'Something went wrong in Aetheria? Describe what happened and how to make it happen again. Voting on a report says it happens to you too.',
    body: 'What happened:\n\nWhat you expected:\n\nSteps to make it happen:\n1. ' },
};
const STATUS = { new: 'New', planned: 'Planned', in_progress: 'In progress', done: 'Done', wont_fix: "Won't fix", duplicate: 'Duplicate' };
const PLATFORM = { windows: 'Windows', android: 'Android', other: 'Other' };

function api(cfg) {
  const headers = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' };
  const call = async (path, opts = {}) => {
    const r = await fetch(`${cfg.url}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!r.ok) {
      let msg = `The board answered ${r.status}.`;
      try { const j = await r.json(); if (j.message) msg = j.message; } catch { /* keep */ }
      throw new Error(msg);
    }
    return r.status === 204 ? null : r.json();
  };
  return {
    list: (kind) => call(`board_items?select=id,kind,title,body,platform,app_version,author,status,reply,votes,created_at&kind=eq.${kind}&order=votes.desc,created_at.desc&limit=300`),
    create: (row) => call('board_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }),
    vote: (id, voter) => call('rpc/board_vote', { method: 'POST', body: JSON.stringify({ p_item: id, p_voter: voter }) }),
  };
}

function voterId() {
  let v = store.get('aetheria.voter');
  if (!v) { v = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`; store.set('aetheria.voter', v); }
  return v;
}
const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export async function render(main, arg, { setTitle }) {
  const kind = arg === 'bug' ? 'bug' : 'feature';
  const K = KINDS[kind];
  setTitle(K.title);
  const site = await loadSite().catch(() => ({}));
  const cfg = site.board || {};
  const board = cfg.url && cfg.key ? api(cfg) : null;
  const voted = new Set(store.get('aetheria.voted', []));
  const openedAt = Date.now();
  const state = { status: 'open', sort: 'votes', items: [] };

  main.innerHTML = `<div class="page">
    <div class="tool-head">
      ${pageHead({ eyebrow: 'Aetheria · Board', title: K.heading, lede: K.lede })}
    </div>
    <nav class="board-tabs" aria-label="Boards">
      <a href="#board" class="board-tab" ${kind === 'feature' ? 'aria-current="page"' : ''}>Feature requests</a>
      <a href="#bugs" class="board-tab" ${kind === 'bug' ? 'aria-current="page"' : ''}>Bug reports</a>
    </nav>
    <div class="tool-grid board-grid">
      <section style="display:flex;flex-direction:column;gap:16px;min-width:0" aria-label="${K.title}">
        <div class="gallery-controls-row">
          <div class="chip-row" id="b-status" role="group" aria-label="Status">
            <button type="button" class="chip" data-status="open" aria-pressed="true">Open</button>
            <button type="button" class="chip" data-status="planned" aria-pressed="false">Planned</button>
            <button type="button" class="chip" data-status="done" aria-pressed="false">Done</button>
            <button type="button" class="chip" data-status="all" aria-pressed="false">Everything</button>
          </div>
          <select class="select line" id="b-sort" aria-label="Sort" style="margin-left:auto"><option value="votes">Most votes</option><option value="new">Newest</option></select>
        </div>
        <div id="b-list" class="tickets" aria-live="polite"><div class="panel glass"><p class="dim">Opening the board…</p></div></div>
      </section>
      <aside class="tool-side">
        <form class="panel glass" id="b-form" novalidate>
          <p class="panel-sub">${K.cta}</p>
          <label class="field"><span class="field-label">Title</span><input class="input" id="b-title" maxlength="120" required placeholder="${kind === 'bug' ? 'Short description of the problem' : 'One line for the idea'}"></label>
          <label class="field"><span class="field-label">Details</span><textarea class="textarea" id="b-body" rows="7" maxlength="4000" required>${kind === 'bug' ? esc(K.body) : ''}</textarea>${kind === 'feature' ? `<span class="field-hint">${esc(K.body)}</span>` : ''}</label>
          <div class="two">
            <label class="field"><span class="field-label">Platform</span><select class="select" id="b-platform"><option value="">Any</option><option value="windows">Windows</option><option value="android">Android</option><option value="other">Other</option></select></label>
            <label class="field"><span class="field-label">Version</span><input class="input" id="b-version" maxlength="32" placeholder="${kind === 'bug' ? 'e.g. 1.6.5' : 'optional'}"></label>
          </div>
          <label class="field"><span class="field-label">Your name <span class="mono">optional</span></span><input class="input" id="b-author" maxlength="40" placeholder="Shown with your post"></label>
          <label class="hp" aria-hidden="true">Website <input id="b-website" tabindex="-1" autocomplete="off"></label>
          <p class="field-hint">Posts are public. Leave out API keys, emails and anything personal.</p>
          <button type="submit" class="btn btn-gilt" id="b-submit">Post ${K.one}</button>
        </form>
      </aside>
    </div>
  </div>`;

  const list = main.querySelector('#b-list');

  function ticket(it) {
    const isVoted = voted.has(it.id);
    const long = it.body.length > 360;
    return `<article class="ticket glass" data-id="${it.id}">
      <button type="button" class="vote" data-vote="${it.id}" aria-pressed="${isVoted}" aria-label="${isVoted ? 'Voted' : 'Vote for this'}: ${esc(it.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C12.9 7.6 16.4 11.1 24 12 16.4 12.9 12.9 16.4 12 24 11.1 16.4 7.6 12.9 0 12 7.6 11.1 11.1 7.6 12 0Z"/></svg>
        <span class="vote-count">${it.votes}</span>
      </button>
      <div class="ticket-main">
        <h3 class="ticket-title">${esc(it.title)}</h3>
        <p class="ticket-meta"><span class="status status-${esc(it.status)}">${esc(STATUS[it.status] || it.status)}</span>
          ${it.platform ? `<span>${esc(PLATFORM[it.platform] || it.platform)}</span>` : ''}${it.app_version ? `<span class="mono">v${esc(String(it.app_version).replace(/^v/i, ''))}</span>` : ''}
          <span>${esc(ago(it.created_at))}</span>${it.author ? `<span>by ${esc(it.author)}</span>` : ''}</p>
        <div class="ticket-body${long ? ' is-clamped' : ''}">${esc(it.body)}</div>
        ${long ? '<button type="button" class="linkish" data-more>Read all</button>' : ''}
        ${it.reply ? `<div class="reply"><span class="reply-by">${starSvg('star')} Atrus</span>${esc(it.reply)}</div>` : ''}
      </div>
    </article>`;
  }

  function draw() {
    let items = state.items.filter((it) => {
      if (state.status === 'all') return true;
      if (state.status === 'open') return ['new', 'planned', 'in_progress'].includes(it.status);
      if (state.status === 'planned') return it.status === 'planned' || it.status === 'in_progress';
      if (state.status === 'done') return it.status === 'done';
      return true;
    });
    items = [...items].sort(state.sort === 'new' ? (a, b) => b.created_at.localeCompare(a.created_at) : (a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
    list.innerHTML = items.length ? items.map(ticket).join('')
      : `<div class="empty-state glass">${sigilSvg(kind, { size: 72 })}<p>${state.items.length ? 'Nothing with that status.' : `No ${K.one}s yet. Be the first.`}</p></div>`;
  }

  async function load() {
    if (!board) { list.innerHTML = '<div class="empty-state glass"><p>The board isn\'t connected yet.</p></div>'; return; }
    try {
      state.items = await board.list(kind);
      draw();
    } catch (e) {
      list.innerHTML = `<div class="empty-state glass">${sigilSvg('asleep', { size: 72 })}<h3 class="panel-title">The board is resting</h3><p style="max-width:46ch">It couldn't be reached just now. Try again in a little while.</p></div>`;
      console.warn('board:', e.message);
    }
  }

  list.addEventListener('click', async (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { more.previousElementSibling.classList.remove('is-clamped'); more.remove(); return; }
    const b = e.target.closest('[data-vote]');
    if (!b || !board) return;
    const id = Number(b.dataset.vote);
    if (voted.has(id)) { toast('You already voted for this.'); return; }
    b.disabled = true;
    try {
      const count = await board.vote(id, voterId());
      voted.add(id); store.set('aetheria.voted', [...voted]);
      const it = state.items.find((x) => x.id === id);
      if (it) it.votes = Number(count) || it.votes;
      b.setAttribute('aria-pressed', 'true');
      b.querySelector('.vote-count').textContent = String(it ? it.votes : count);
    } catch (err) { toast(`Vote didn't go through: ${err.message}`); }
    b.disabled = false;
  });

  main.querySelector('#b-status').addEventListener('click', (e) => {
    const c = e.target.closest('[data-status]');
    if (!c) return;
    state.status = c.dataset.status;
    for (const x of main.querySelectorAll('[data-status]')) x.setAttribute('aria-pressed', String(x === c));
    draw();
  });
  main.querySelector('#b-sort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });

  main.querySelector('#b-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!board) return;
    const v = (id) => main.querySelector(id).value.trim();
    const title = v('#b-title');
    const body = v('#b-body');
    if (main.querySelector('#b-website').value) return; // a bot filled the hidden field
    if (title.length < 4) { toast('Give it a title of at least 4 characters.'); main.querySelector('#b-title').focus(); return; }
    if (body.length < 10 || (kind === 'bug' && body === K.body.trim())) { toast('Add a few words of detail first.'); main.querySelector('#b-body').focus(); return; }
    if (Date.now() - openedAt < 3000) { toast('One moment, then post again.'); return; }
    const btn = main.querySelector('#b-submit');
    btn.disabled = true;
    try {
      const [row] = await board.create({ kind, title, body, platform: v('#b-platform') || null, app_version: v('#b-version') || null, author: v('#b-author') || null });
      state.items.unshift(row);
      state.status = 'open';
      for (const x of main.querySelectorAll('[data-status]')) x.setAttribute('aria-pressed', String(x.dataset.status === 'open'));
      state.sort = 'new'; main.querySelector('#b-sort').value = 'new';
      draw();
      main.querySelector('#b-form').reset();
      if (kind === 'bug') main.querySelector('#b-body').value = K.body;
      toast(kind === 'bug' ? 'Bug reported. Thank you.' : 'Request posted. Thank you.');
    } catch (err) { toast(`Couldn't post: ${err.message}`); }
    btn.disabled = false;
  });

  load();
}
