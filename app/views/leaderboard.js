// A bounty's leaderboard: every entry in one virtual list (only the rows in view exist), filterable by handle.
import { esc, num, scoreText, virtualRows, date } from '../core.js';

const ROW = 34;
let ui = null;

function frame(pane) {
  pane.innerHTML = `<div class="pane-head"><h2>Leaderboard</h2><a class="more" id="lb-full"></a></div><div class="sub lb-sub" id="lb-sub"></div>
<div class="lb-tools"><input id="lb-q" type="search" placeholder="Find a handle" aria-label="Find a handle" autocomplete="off"><span class="sub" id="lb-rendered"></span></div>
<div class="lb-cols"><span>#</span><span>Entrant</span><span class="wide">Entry</span><span class="num">Score</span><span class="wide num">90% range</span><span class="wide num">Received UTC</span></div>
<div class="lb-view" id="lb-view" role="list"></div>`;
  ui = { pane, view: pane.querySelector('#lb-view'), q: pane.querySelector('#lb-q'), lb: null, rows: [], slug: null, handle: null, ver: 0 };
  ui.list = virtualRows(ui.view, ROW, draw);
  ui.q.addEventListener('input', filter);
}

function draw(el, e) {
  const stamp = `${e.submission_id}|${ui.ver}|${e.handle === ui.handle}`;
  if (el.dataset.stamp === stamp) return; // the same row, data and selection: nothing to redraw
  el.dataset.stamp = stamp;
  el.className = `lb-row${e.handle === ui.handle ? ' sel' : ''}${e.house ? ' house' : ''}`;
  el.setAttribute('role', 'listitem');
  const lo = e.values?.[ui.lb.rank_key + '_low'], hi = e.values?.[ui.lb.rank_key + '_high'];
  const pct = Math.max(2, Math.min(100, (e.values?.[ui.lb.rank_key] ?? 0) / 1e4));
  el.innerHTML = `<span class="rk">${e.rank ?? '—'}</span><a class="h" href="${esc(link(e.handle))}">${esc(e.handle ?? '—')}${e.house ? ' <i>house</i>' : ''}</a>
<span class="t wide" title="${esc(e.title)}">${esc(e.title ?? '')}</span><span class="sc num"><i style="width:${pct.toFixed(1)}%"></i>${scoreText(ui.lb, e)}</span>
<span class="wide num muted">${lo != null && hi != null ? `${(lo / 1e4).toFixed(1)}–${(hi / 1e4).toFixed(1)}` : '—'}</span><span class="wide num muted">${date(e.received_at).replace(',', '').replace(' UTC', '')}</span>`;
}
// A handle picks the profile panel and keeps this bounty in view.
const link = (h) => `#/bounty/${encodeURIComponent(ui.slug)}${ui.full ? '/leaderboard' : ''}?u=${encodeURIComponent(h)}`;

function filter() {
  const q = ui.q.value.trim().toLowerCase();
  ui.ver++;
  ui.rows = (ui.lb?.entries ?? []).filter((e) => !q || `${e.handle} ${e.title}`.toLowerCase().includes(q));
  ui.list.set(ui.rows);
  ui.pane.querySelector('#lb-rendered').textContent = ui.view.dataset.rendered ?? '';
}

export function show(pane, slug, lb, handle, full) {
  if (!ui || ui.pane !== pane || !pane.querySelector('#lb-view')) frame(pane);
  const same = ui.lb === lb && ui.slug === slug && ui.full === full;
  const moved = ui.handle !== handle;
  Object.assign(ui, { lb, slug, handle, full });
  const fullLink = pane.querySelector('#lb-full');
  fullLink.href = full ? `#/bounty/${encodeURIComponent(slug)}` : `#/bounty/${encodeURIComponent(slug)}/leaderboard`;
  fullLink.textContent = full ? '← bounty page' : 'Full leaderboard →';
  if (!lb) return void (pane.querySelector('#lb-sub').textContent = 'No leaderboard.');
  const n = lb.entries?.length ?? 0;
  pane.querySelector('#lb-sub').innerHTML = n
    ? `${num(n)} ranked · ${esc(lb.phase?.title ?? '')} phase · ${lb.phase?.scores === 'live' ? 'scores live' : 'scores final'}${lb.phase?.placements_held ? ' · places unofficial until results' : ''}`
    : `No entries listed yet${lb.phase?.placements_held ? ': placements are held until the results' : ''}.`;
  if (!same) filter();
  else if (moved) ui.list.set(ui.rows);
  if (moved && !ui.q.value) {
    const i = ui.rows.findIndex((e) => e.handle === handle);
    if (i > 8) ui.list.scrollTo(i);
  }
  pane.querySelector('#lb-rendered').textContent = ui.view.dataset.rendered ?? '';
}
