// An account's public profile: record, entries with their scores, payouts and links, from one request.
import { esc, usd, num, date, avatar, profileOf, timeLeft } from '../core.js';

const ord = (n) => (n == null ? '—' : n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));
let last = { key: null, data: null };

function entry(s) {
  const c = s.competition ?? {}, score = s.score?.display != null && /micro/.test(s.score?.column?.source ?? '') ? (s.score.value / 1e4).toFixed(1) + '%' : /^-?\d{5,}$/.test(s.score?.display ?? '') ? num(s.score.display) : s.score?.display;
  return `<li><a href="#/bounty/${encodeURIComponent(c.slug)}"><b>${esc(c.title ?? c.slug)}</b><span class="muted">${esc(s.title ?? '')}</span></a>
<span class="pe-res">${s.placement ? `<b class="place">${ord(s.placement)}</b>` : ''}${s.prize_usd ? `<b class="won">${usd(s.prize_usd)}</b>` : ''}${score != null ? `<span>${esc(score)}</span>` : ''}<small class="muted">${c.status === 'open' ? `<span data-deadline="${esc(c.deadline)}">${timeLeft(c.deadline)}</span>` : esc(c.status ?? '')}</small></span></li>`;
}

export async function show(pane, handle, full, slug) {
  if (!handle) return void (pane.innerHTML = '<div class="pane-head"><h2>Profile</h2></div><p class="muted pad">Pick a handle on the leaderboard.</p>');
  const p = await profileOf(handle).catch(() => null);
  const key = `${handle}|${full}|${slug}`;
  if (last.key === key && last.data === p) return;
  last = { key, data: p };
  if (!p) return void (pane.innerHTML = `<div class="pane-head"><h2>Profile</h2></div><div class="err"><h2>No profile for @${esc(handle)}</h2></div>`);
  const r = p.record ?? {}, sols = p.solutions ?? [], pays = p.payouts ?? [];
  const here = slug && sols.find((s) => s.competition?.slug === slug);
  const links = [p.github_login && `<a href="https://github.com/${esc(p.github_login)}" rel="noopener" target="_blank">GitHub ${esc(p.github_login)}</a>`, p.x && `<a href="https://x.com/${esc(p.x.username ?? p.x)}" rel="noopener" target="_blank">X</a>`, p.discord && 'Discord linked', p.wallet && `wallet ${esc(String(p.wallet.address ?? p.wallet).slice(0, 4))}…`].filter(Boolean);
  pane.innerHTML = `<div class="pane-head"><h2>Profile</h2>${full ? '<a class="more" href="#/">← board</a>' : `<a class="more" href="#/u/${encodeURIComponent(handle)}">Full profile →</a>`}</div>
<div class="pf-id">${avatar(p.avatar?.url_small ?? p.image, full ? 72 : 48)}<div><h3>${esc(p.display_name || '@' + p.handle)}${p.house ? ' <i class="pill">house</i>' : ''}</h3>
<span class="muted">@${esc(p.handle)} · joined ${date(p.joined_at).replace(/,? \d\d:\d\d UTC/, '')}${links.length ? ' · ' + links.join(' · ') : ''}</span>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}</div></div>
<div class="pf-rec"><div><b>${num(r.competitions_entered)}</b><span>entered</span></div><div><b>${num(r.competitions_won)}</b><span>won</span></div><div><b>${num(r.podium_finishes)}</b><span>podiums</span></div><div><b>${ord(r.best_placement)}</b><span>best</span></div><div class="won"><b>${usd(r.prize_usd ?? 0)}</b><span>prizes</span></div></div>
${here && !full ? `<p class="pf-here">In this bounty: <b>${esc(here.title)}</b></p>` : ''}
<h4>Entries <small class="muted">${num(sols.length)}</small></h4><ul class="pf-entries">${(full ? sols : sols.slice(0, 4)).map(entry).join('') || '<li class="muted">No public entries.</li>'}</ul>
${full ? `<h4>Payouts <small class="muted">${num(pays.length)}</small></h4><ul class="pf-pay">${pays.map((x) => `<li><a href="#/bounty/${encodeURIComponent(x.competition?.slug)}">${esc(x.competition?.title)}</a><span>${ord(x.place)} · <b class="won">${usd(x.amount_usd)}</b> · ${date(x.paid_at)}${x.explorer_url ? ` · <a href="${esc(x.explorer_url)}" rel="noopener" target="_blank">tx</a>` : ''}</span></li>`).join('') || '<li class="muted">No payouts yet.</li>'}</ul>` : ''}`;
}
