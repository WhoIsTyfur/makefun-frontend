// Unofficial make.fun client: one shell, four surfaces, each view a module loaded by a literal import().
import { esc, timeLeft } from './views/util.js';
// Routes: #/  #/bounty/<slug>  #/bounty/<slug>/leaderboard  #/u/<handle>  (?u=<handle> picks the profile panel)
export const VIEWS = { board: () => import('./views/board.js'), bounty: () => import('./views/bounty.js'), leaderboard: () => import('./views/leaderboard.js'), profile: () => import('./views/profile.js') };
export const API = 'https://make.fun/api';
// One copy of each API answer (url -> { etag, text, data, at }), and the requests in flight that panes share.
export const cache = new Map();
const inflight = new Map();
export const net = { requests: 0, revalidated: 0, unchanged: 0, cached: 0 };

// GET with an in-memory cache: fresh answers are reused; stale ones are revalidated by ETag. make.fun's 304s carry no
// CORS header, so a script-set If-None-Match fails cross-origin: cache 'no-cache' has the browser send If-None-Match
// from its HTTP cache and merge the 304 into the stored answer, which does carry it.
export async function getJSON(path, maxAge = 20e3) {
  const url = API + path, hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAge) return net.cached++, hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const job = (async () => {
    net.requests++;
    if (hit) net.revalidated++;
    const res = await fetch(url, { cache: 'no-cache' }).catch((err) => {
      if (hit) return null; // offline or blocked: keep showing the last good answer
      throw err;
    });
    if (!res) return hit.data;
    if (!res.ok) throw new Error(`${res.status} on ${path}`);
    const text = await res.text(), etag = res.headers.get('ETag');
    // ETags turn every minute even when nothing changed: an identical body keeps the old object, so views skip work.
    if (hit && hit.text === text) return net.unchanged++, Object.assign(hit, { etag, at: Date.now() }).data;
    const data = JSON.parse(text);
    cache.set(url, { etag, text, data, at: Date.now() });
    return data;
  })().finally(() => inflight.delete(url));
  inflight.set(url, job);
  return job;
}

// The live board: one request for every open bounty, reused by the bounty page header and the rail.
export const liveBoard = () => getJSON('/competitions?limit=100&status=open');
export const bountyOf = (slug) => getJSON(`/competitions/${encodeURIComponent(slug)}?submissions=summary`);
// rows=first: 10 whole rows plus slim rows for the rest (a fifth of the bytes), made one list for the virtual view.
const withAllRows = new WeakMap();
export async function leaderboardOf(slug) {
  const lb = await getJSON(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);
  if (!withAllRows.has(lb)) {
    const k = lb.rank_key, rest = (lb.rest ?? []).map((r) => ({ ...r, values: { [k]: r.value, [k + '_low']: r.interval?.low, [k + '_high']: r.interval?.high } }));
    withAllRows.set(lb, { ...lb, entries: [...(lb.entries ?? []), ...rest] });
  }
  // The same answer gives the same object, so an unchanged refresh repaints nothing.
  return withAllRows.get(lb);
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

// The shell: built once; each route only fills or reshapes its four panes.
const app = document.getElementById('app');
app.innerHTML = `<header class="top"><a class="brand" href="#/"><b>fun</b>board</a>
<nav class="tabs" aria-label="Surfaces"><a data-tab="board" href="#/">Board</a><a data-tab="bounty">Bounty</a><a data-tab="leaderboard">Leaderboard</a><a data-tab="profile">Profile</a></nav>
<code class="addr" id="addr"></code><span class="net" id="net"></span></header>
<div class="grid"><section class="pane" id="p-board" aria-label="Bounty board"></section><section class="pane" id="p-bounty" aria-label="Bounty page"></section>
<section class="pane" id="p-lb" aria-label="Leaderboard"></section><section class="pane" id="p-profile" aria-label="Profile"></section></div>
<footer class="foot" id="foot"></footer>`;
const style = document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/views/theme.css' }));
const styled = new Promise((ok) => ['load', 'error'].forEach((t) => style.addEventListener(t, ok)));
export const panes = { board: app.querySelector('#p-board'), bounty: app.querySelector('#p-bounty'), lb: app.querySelector('#p-lb'), profile: app.querySelector('#p-profile') };
export const state = { route: null, slug: null, handle: null };

// One render per hash change: load the four view modules once, then let each fill its pane for the route.
let seq = 0, viewBase = { ...net };
async function render() {
  const run = ++seq, route = parseRoute();
  viewBase = { ...net };
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
    leaderboard.show(panes.lb, slug, lb, handle, route.view === 'leaderboard', list.items.find((c) => c.slug === slug)?.rewardsNow);
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

// What this view cost, measured: requests sent, answers revalidated (304) and answers served from memory.
export function showNet() {
  const d = (k) => net[k] - viewBase[k], at = new Date().toISOString().slice(11, 19);
  document.getElementById('net').innerHTML = `<i class="dot"></i>this view: ${d('requests')} API request${d('requests') === 1 ? '' : 's'} · ${d('cached')} from memory${d('revalidated') ? ` · ${d('revalidated')} revalidated, ${d('unchanged')} unchanged` : ''} · ${at} UTC`;
  const rendered = document.getElementById('lb-view')?.dataset.rendered;
  document.getElementById('foot').textContent = `First load: index.html alone (one inline import) · 4 views by import() · ${net.requests} API requests this session, ${net.revalidated} revalidated by ETag${net.unchanged ? ` (${net.unchanged} unchanged, not repainted)` : ''} · rows patched in place${rendered ? ` · virtual leaderboard: ${rendered}` : ''}`;
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
