// Aetheria downloads: every public GitHub release, newest first, with its patch notes.
import { esc, pageHead, starSvg, sigilSvg } from '../ui.js';
import { loadSite, loadReleases } from '../data.js';
import { markdown } from '../lib/markdown.js';

const PLATFORMS = [
  { key: 'windows', label: 'Windows', test: /\.(exe|msi|msix)$/i, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5 10.5 4.5v7H3.5zM12 4.3l8.5-1.3v8.5H12zM3.5 12.8h7v7l-7-1zM12 12.8h8.5V21L12 19.8z"/></svg>' },
  { key: 'android', label: 'Android', test: /\.(apk|aab)$/i, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17.5zM6.5 9a5.5 5.5 0 0 1 11 0zM8.5 5 7 3M15.5 5 17 3M4 11v5M20 11v5"/><circle cx="10" cy="7" r=".6"/><circle cx="14" cy="7" r=".6"/></svg>' },
  { key: 'mac', label: 'macOS', test: /\.(dmg|pkg)$/i, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/></svg>' },
  { key: 'linux', label: 'Linux', test: /\.(appimage|deb|rpm|tar\.gz)$/i, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="m8 10 3 2-3 2M12.5 15h4"/></svg>' },
];
const FILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/></svg>';
const platformOf = (name) => PLATFORMS.find((p) => p.test.test(name)) || { key: 'file', label: 'File', icon: FILE_ICON };
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
export const relDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export function assetButtons(rel, { primary = true } = {}) {
  const assets = (rel.assets || []).filter((a) => !/\.(blockmap|yml|yaml|sha256|sig)$/i.test(a.name));
  if (!assets.length) return '<p class="faint">This release has no files attached.</p>';
  const order = (a) => { const i = PLATFORMS.findIndex((p) => p.test.test(a.name)); return i < 0 ? 99 : i; };
  return `<div class="dl-row">${[...assets].sort((a, b) => order(a) - order(b)).map((a, i) => {
    const p = platformOf(a.name);
    return `<a class="dl ${primary && i === 0 ? 'dl-primary' : ''}" href="${esc(a.browser_download_url)}" rel="noopener">
      <span class="dl-icon">${p.icon}</span>
      <span class="dl-text"><span class="dl-label">${esc(p.label)}</span><span class="dl-file">${esc(a.name)}</span></span>
      <span class="dl-size mono">${size(a.size)}</span></a>`;
  }).join('')}</div>`;
}

const title = (r) => esc(r.name || r.tag_name);

export async function render(main, _arg, { setTitle }) {
  setTitle('Downloads');
  const site = await loadSite().catch(() => ({}));
  const repo = site.releases && site.releases.repo;
  const repoUrl = repo ? `https://github.com/${repo}/releases` : '';

  main.innerHTML = `<div class="page">
    ${pageHead({
      eyebrow: 'Aetheria · Downloads',
      title: 'Builds &amp; <em>patch notes</em>',
      lede: 'The newest Aetheria build for Windows and Android, straight from its GitHub release, with every earlier version and what changed in each.',
    })}
    <div id="r-out"><div class="panel glass"><p class="dim">Asking GitHub for the latest builds…</p></div></div>
  </div>`;
  const out = main.querySelector('#r-out');

  if (!repo) { out.innerHTML = '<div class="empty-state glass"><p>No release repository is set in data/site.json.</p></div>'; return; }
  let releases;
  try { releases = await loadReleases(repo); } catch (e) {
    out.innerHTML = `<div class="empty-state glass">${sigilSvg('offline', { size: 80 })}<h2 class="section-title">GitHub didn't answer</h2>
      <p>${esc(e.message)} The builds are still on GitHub itself.</p><a class="btn" href="${esc(repoUrl)}" target="_blank" rel="noopener">All releases on GitHub ↗</a></div>`;
    return;
  }
  if (!releases.length) {
    out.innerHTML = `<div class="empty-state glass">${sigilSvg('aetheria', { size: 90 })}
      <h2 class="section-title">No public build yet</h2>
      <p style="max-width:52ch">When a release is published it appears here on its own, with the installer, the APK and its patch notes.</p>
      <div class="btn-row" style="justify-content:center"><a class="btn" href="#board">Request a feature</a><a class="btn btn-ghost" href="${esc(repoUrl)}" target="_blank" rel="noopener">Watch on GitHub ↗</a></div></div>`;
    return;
  }
  const latest = releases.find((r) => !r.prerelease) || releases[0];
  const rest = releases.filter((r) => r !== latest);
  out.innerHTML = `<section class="release-hero glass" aria-labelledby="r-latest">
      <div class="release-head">
        <p class="eyebrow">${starSvg('eyebrow-star')}${latest.prerelease ? 'Preview build' : 'Latest release'}</p>
        <h2 class="release-title" id="r-latest">${title(latest)}</h2>
        <p class="mono faint">${esc(latest.tag_name)} · ${relDate(latest.published_at)}</p>
      </div>
      ${assetButtons(latest)}
      ${latest.body ? `<div class="prose notes">${markdown(latest.body)}</div>` : '<p class="faint">No patch notes for this release.</p>'}
    </section>
    ${rest.length ? `<section aria-labelledby="r-older" style="display:flex;flex-direction:column;gap:12px;margin-top:48px">
      <div class="section-head"><h2 class="section-title" id="r-older">Earlier builds</h2><span class="mono faint">${rest.length}</span></div>
      ${rest.map((r) => `<details class="fold"><summary>${title(r)}${r.prerelease ? ' <span class="flag">Preview</span>' : ''}<span class="sum-meta">${relDate(r.published_at)}</span></summary>
        <div class="fold-body">${assetButtons(r, { primary: false })}${r.body ? `<div class="prose notes">${markdown(r.body)}</div>` : ''}</div></details>`).join('')}
    </section>` : ''}
    <p class="faint" style="margin-top:28px">Found a problem in a build? <a href="#bugs">Report it on the bug board</a>. Every release also lives on <a href="${esc(repoUrl)}" target="_blank" rel="noopener">GitHub</a>.</p>`;
}
