// Unofficial make.fun client: one shell, four surfaces, each view a module loaded by a literal import().
// Routes: #/  #/bounty/<slug>  #/bounty/<slug>/leaderboard  #/u/<handle>  (?u=<handle> picks the profile panel)
export const VIEWS = { board: () => import('./views/board.js'), bounty: () => import('./views/bounty.js'), leaderboard: () => import('./views/leaderboard.js'), profile: () => import('./views/profile.js') };
export const API = 'https://make.fun/api';
// One copy of each API answer (url -> { etag, text, data, at }), and the requests in flight that panes share.
export const cache = new Map();
const inflight = new Map();
export const net = { requests: 0, revalidated: 0, cached: 0 };

// GET with an in-memory cache: fresh answers are reused, stale ones revalidated with If-None-Match (304, no body).
export async function getJSON(path, maxAge = 60e3) {
  const url = API + path, hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAge) return net.cached++, hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const job = (async () => {
    net.requests++;
    const res = await fetch(url, { cache: 'no-store', headers: hit?.etag ? { 'If-None-Match': hit.etag } : {} });
    if (res.status === 304 && hit) return net.revalidated++, (hit.at = Date.now()), hit.data;
    if (!res.ok) throw new Error(`${res.status} on ${path}`);
    const text = await res.text(), etag = res.headers.get('ETag');
    // ETags turn every minute even when nothing changed: an identical body keeps the old object, so views skip work.
    if (hit && hit.text === text) return Object.assign(hit, { etag, at: Date.now() }).data;
    const data = JSON.parse(text);
    cache.set(url, { etag, text, data, at: Date.now() });
    return data;
  })().finally(() => inflight.delete(url));
  inflight.set(url, job);
  return job;
}

// The live board: one request for every open bounty, reused by the bounty page header and the rail.
export const liveBoard = () => getJSON('/competitions?limit=100&status=open');
export const bountyOf = (slug) => getJSON(`/competitions/${encodeURIComponent(slug)}`);
// rows=first: 10 whole rows plus slim rows for the rest (a fifth of the bytes), made one list for the virtual view.
const slim = new WeakMap();
export async function leaderboardOf(slug) {
  const lb = await getJSON(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);
  if (!slim.has(lb)) {
    const k = lb.rank_key, rest = (lb.rest ?? []).map((r) => ({ ...r, values: { [k]: r.value, [k + '_low']: r.interval?.low, [k + '_high']: r.interval?.high } }));
    slim.set(lb, { ...lb, entries: [...(lb.entries ?? []), ...rest] });
  }
  // The same answer gives the same object, so an unchanged refresh repaints nothing.
  return slim.get(lb);
}
export const profileOf = (handle) => getJSON(`/profiles/${encodeURIComponent(handle)}`);

export function parseRoute(hash = location.hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const u = new URLSearchParams(query).get('u');
  if (parts[0] === 'bounty' && parts[1]) return { view: parts[2] === 'leaderboard' ? 'leaderboard' : 'bounty', slug: parts[1], handle: u };
  if (parts[0] === 'u' && parts[1]) return { view: 'profile', slug: null, handle: parts[1] };
  return { view: 'board', slug: null, handle: u };
}

// Keyed list patching: rows are reused by key, changed cells rewritten, nothing else touched.
export function patchRows(list, items, keyOf, make, update) {
  const old = new Map([...list.children].map((el) => [el.dataset.key, el]));
  let at = list.firstElementChild;
  for (const item of items) {
    const key = String(keyOf(item));
    let el = old.get(key);
    if (el) old.delete(key);
    else (el = make(item)), (el.dataset.key = key);
    update(el, item);
    if (el !== at) list.insertBefore(el, at);
    else at = at.nextElementSibling;
  }
  for (const el of old.values()) el.remove();
}

// Virtual list: only the rows in view (plus a margin) exist in the DOM, drawn into a pool of reused nodes.
export function virtualRows(viewport, rowHeight, draw) {
  const spacer = document.createElement('div'), pool = [];
  spacer.className = 'v-space';
  viewport.replaceChildren(spacer);
  let rows = [], first = -1, last = -1;
  const paint = (force) => {
    const top = viewport.scrollTop, h = viewport.clientHeight || 600;
    const a = Math.max(0, Math.floor(top / rowHeight) - 6), b = Math.min(rows.length, Math.ceil((top + h) / rowHeight) + 6);
    if (!force && a === first && b === last) return;
    (first = a), (last = b);
    for (let i = a; i < b; i++) {
      const el = (pool[i - a] ??= spacer.appendChild(document.createElement('div')));
      el.style.transform = `translateY(${i * rowHeight}px)`;
      el.hidden = false;
      draw(el, rows[i], i);
    }
    for (let j = b - a; j < pool.length; j++) pool[j].hidden = true;
    viewport.dataset.rendered = `${b - a} of ${rows.length} rows in the DOM`;
  };
  viewport.addEventListener('scroll', () => paint(false), { passive: true });
  addEventListener('resize', () => paint(true));
  return {
    set(next) { rows = next; spacer.style.height = `${rows.length * rowHeight}px`; paint(true); },
    scrollTo(i) { viewport.scrollTop = Math.max(0, i * rowHeight - viewport.clientHeight / 2); paint(false); },
  };
}

// Formatting shared by every view.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const usd = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
export const fee = (c) => (c.entryFeeUsd == null || Number(c.entryFeeUsd) === 0 ? 'Free' : usd(c.entryFeeUsd));
export const num = (n) => Number(n ?? 0).toLocaleString('en-US');
export const takesEntries = (c, now = Date.now()) => c.status === 'open' && Date.parse(c.deadline) > now;
export function timeLeft(deadline, now = Date.now()) {
  const ms = Date.parse(deadline) - now, a = Math.abs(ms), m = Math.floor(a / 6e4), h = Math.floor(m / 60), d = Math.floor(h / 24);
  const span = d >= 2 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m ${String(Math.floor(a / 1e3) % 60).padStart(2, '0')}s`;
  return ms > 0 ? span : `closed ${span} ago`;
}
export const stateOf = (c) => (takesEntries(c) ? ['open', 'Taking entries'] : c.status === 'open' ? ['judging', 'Closed · judging'] : [c.status, c.status[0].toUpperCase() + c.status.slice(1)]);
export const date = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) + ' UTC' : '—');
export const avatar = (url, size = 40) => (url ? `<img class="av" width="${size}" height="${size}" alt="" crossorigin="anonymous" src="${esc(new URL(url, 'https://make.fun'))}">` : `<span class="av av-none" style="width:${size}px;height:${size}px"></span>`);
export function scoreText(lb, e) {
  const col = lb.columns?.find((c) => c.key === lb.rank_key);
  const v = e.values?.[lb.rank_key];
  if (v == null) return '—';
  return /micro/.test(col?.source ?? '') ? (v / 1e4).toFixed(1) + '%' : e.display?.[lb.rank_key] ?? String(v);
}

// The shell: built once; each route only fills or reshapes its four panes.
const app = document.getElementById('app');
app.innerHTML = `<header class="top"><a class="brand" href="#/"><b>fun</b>board</a>
<nav class="tabs" aria-label="Surfaces"><a data-tab="board" href="#/">Board</a><a data-tab="bounty">Bounty</a><a data-tab="leaderboard">Leaderboard</a><a data-tab="profile">Profile</a></nav>
<code class="addr" id="addr"></code><span class="net" id="net"></span></header>
<div class="grid"><section class="pane" id="p-board" aria-label="Bounty board"></section><section class="pane" id="p-bounty" aria-label="Bounty page"></section>
<section class="pane" id="p-lb" aria-label="Leaderboard"></section><section class="pane" id="p-profile" aria-label="Profile"></section></div>`;
const style = document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/views/theme.css' }));
const styled = new Promise((ok) => ['load', 'error'].forEach((t) => style.addEventListener(t, ok)));
export const panes = { board: app.querySelector('#p-board'), bounty: app.querySelector('#p-bounty'), lb: app.querySelector('#p-lb'), profile: app.querySelector('#p-profile') };
export const state = { route: null, slug: null, handle: null };

// One render per hash change: load the four view modules once, then let each fill its pane for the route.
let seq = 0;
async function render() {
  const run = ++seq, route = parseRoute();
  window.__shotReady = false;
  app.dataset.view = route.view;
  document.getElementById('addr').textContent = location.hash || '#/';
  const [board, bounty, leaderboard, profile] = await Promise.all([VIEWS.board(), VIEWS.bounty(), VIEWS.leaderboard(), VIEWS.profile(), styled]);
  try {
    const list = await liveBoard();
    const slug = route.slug ?? board.defaultSlug(list.items);
    if (run !== seq) return;
    Object.assign(state, { route, slug });
    board.show(panes.board, list.items, slug);
    const [lb] = await Promise.all([slug ? leaderboardOf(slug) : null, bounty.show(panes.bounty, slug, list.items, route.view === 'bounty' || route.view === 'board')]);
    if (run !== seq) return;
    const handle = route.handle ?? lb?.entries?.[0]?.handle ?? null;
    state.handle = handle;
    leaderboard.show(panes.lb, slug, lb, handle, route.view === 'leaderboard');
    await profile.show(panes.profile, handle, route.view === 'profile', slug);
    if (run !== seq) return;
    setTabs(slug, handle);
  } catch (err) {
    panes.bounty.innerHTML = `<div class="err"><h2>Could not reach make.fun</h2><p>${esc(err.message)}</p><a href="${esc(location.hash || '#/')}">Try again</a></div>`;
  }
  showNet();
  if (run === seq) window.__shotReady = true;
}

function setTabs(slug, handle) {
  const href = { board: '#/', bounty: slug && `#/bounty/${slug}`, leaderboard: slug && `#/bounty/${slug}/leaderboard`, profile: handle && `#/u/${handle}` };
  for (const a of app.querySelectorAll('[data-tab]')) {
    if (href[a.dataset.tab]) a.href = href[a.dataset.tab];
    a.toggleAttribute('aria-current', a.dataset.tab === state.route.view);
  }
}

export function showNet() {
  document.getElementById('net').textContent = `${net.requests} API requests · ${net.revalidated} revalidated (304) · ${net.cached} served from memory`;
}

// Live: once a minute revalidate what is on screen; unchanged answers return the same object and repaint nothing.
async function refresh() {
  if (document.hidden || !state.route) return;
  const before = [...cache.values()].map((h) => h.data);
  await Promise.allSettled([liveBoard(), state.slug && leaderboardOf(state.slug), state.handle && profileOf(state.handle)].filter(Boolean));
  if ([...cache.values()].some((h, i) => h.data !== before[i])) render();
  else showNet();
}
// Countdowns tick in place: one timer rewrites only the [data-deadline] cells.
function tick() {
  const now = Date.now();
  for (const el of app.querySelectorAll('[data-deadline]')) {
    const t = timeLeft(el.dataset.deadline, now);
    if (el.textContent !== t) el.textContent = t;
  }
}

addEventListener('hashchange', render);
setInterval(tick, 1000);
setInterval(refresh, 61e3);
render();
