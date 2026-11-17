// A bounty's page: summary, live pot, fee, time left, rewards table, dates, status, description and rules.
// The header paints at once from the board's own item; one request for the detail adds the rules and dates.
import { esc, usd, fee, num, timeLeft, stateOf, date, bountyOf } from '../core.js';

// A small Markdown subset (headings, lists, paragraphs, `code`, **bold**, links), escaped before it is shaped.
export function md(text = '') {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_, t, u) => `<a href="${u.startsWith('/') ? 'https://make.fun' + u : u}" rel="noopener" target="_blank">${t}</a>`);
  const out = [];
  let list = null;
  for (const block of String(text).split(/\n{2,}/)) {
    for (const line of block.split('\n')) {
      const h = /^(#{1,4})\s+(.*)/.exec(line), li = /^\s*[-*]\s+(.*)/.exec(line);
      if (li) { if (!list) out.push('<ul>'), (list = true); out.push(`<li>${inline(li[1])}</li>`); continue; }
      if (list) out.push('</ul>'), (list = null);
      if (h) out.push(`<h4>${inline(h[2])}</h4>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (list) out.push('</ul>');
  return out.join('');
}

const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

export function rewardsTable(c) {
  const rows = c.rewardsNow?.length ? c.rewardsNow : Object.entries(c.rewards ?? {}).map(([p, v]) => ({ place: +p, amountUsd: v, baseUsd: v, feeShareUsd: 0 }));
  if (!rows.length) return '<p class="muted">No rewards table published.</p>';
  const fees = rows.some((r) => Number(r.feeShareUsd) > 0);
  return `<table class="prizes"><thead><tr><th>Place</th><th>Prize now</th>${fees ? '<th>Base + fee share</th>' : ''}</tr></thead><tbody>${rows
    .map((r) => `<tr${r.place <= 3 ? ' class="top3"' : ''}><td>${ord(r.place)}</td><td class="num"><b>${usd(r.amountUsd)}</b></td>${fees ? `<td class="num muted">${usd(r.baseUsd)} + ${usd(r.feeShareUsd)}</td>` : ''}</tr>`)
    .join('')}</tbody></table>`;
}

function header(c, slug) {
  const [cls, label] = stateOf(c);
  return `<div class="bp-head"><div class="crumbs"><a href="#/">Board</a> / <span>${esc(c.category ?? 'Bounty')}</span><span class="pill ${cls}">${label}</span></div>
<h1>${esc(c.title)}</h1><p class="lede">${esc(c.summary ?? '')}</p></div>
<div class="stats"><div class="stat pot"><span>Live pot</span><b>${usd(c.potUsd ?? c.rewardAmount)}</b><small>${usd(c.rewardAmount)}${Number(c.entryFeesUsd) > 0 ? ` + ${usd(c.entryFeesUsd)} fees` : ' reward'}</small></div>
<div class="stat"><span>Entry fee</span><b>${fee(c)}</b><small>${c.entryFeePayers ? `${num(c.entryFeePayers)} paid` : 'per account'}</small></div>
<div class="stat"><span>Time left</span><b data-deadline="${esc(c.deadline)}">${timeLeft(c.deadline)}</b><small>ends ${date(c.deadline).replace(',', '').replace(' UTC', '')}</small></div>
<div class="stat"><span>Entries</span><b>${num(c.submissionCount)}</b><small><a href="#/bounty/${encodeURIComponent(slug)}/leaderboard">leaderboard →</a></small></div></div>`;
}

function dates(c, d) {
  const rows = [['Published', c.publishedAt], ['Opens', d?.opensAt], ['Deadline', c.deadline], ...(d?.phases ?? []).filter((p) => p.ends_at && p.ends_at !== c.deadline).map((p) => [p.title + ' ends', p.ends_at]), ['Resolved', d?.resolvedAt]].filter(([, v]) => v);
  const [, label] = stateOf(c);
  return `<dl class="dates"><dt>Status</dt><dd>${label}${d ? ` · ${d.acceptingSubmissions ? 'accepting submissions' : 'not accepting submissions'}` : ''}</dd>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${date(v)}</dd>`).join('')}
<dt>Judged by</dt><dd>${esc(c.resolution?.method ?? '—')}${c.harnessKind ? ` · ${esc(c.harnessKind)}` : ''}</dd></dl>`;
}

let last = { slug: null, item: null, detail: null };

export async function show(pane, slug, items, visible) {
  if (!slug) return void (pane.innerHTML = '<p class="muted pad">No bounty is open right now.</p>');
  let c = items.find((x) => x.slug === slug);
  const quick = !!c;
  if (last.slug !== slug || last.item !== c) {
    if (c) {
      pane.innerHTML = `${header(c, slug)}<div class="bp-cols"><section><h3>Rewards</h3>${rewardsTable(c)}</section><section><h3>Dates</h3>${dates(c)}</section></div>
<section class="prose"><h3>Description</h3>${md(c.description)}</section><section class="prose" id="bp-rules"><h3>Rules</h3><p class="muted">Loading rules…</p></section>`;
    } else pane.innerHTML = '<p class="muted pad">Loading bounty…</p>';
  }
  const d = await bountyOf(slug).catch(() => null);
  if (!d && !c) return void (pane.innerHTML = '<div class="err"><h2>Bounty not found</h2><a href="#/">Back to the board</a></div>');
  if (last.slug === slug && last.item === c && last.detail === d) return;
  c = c ?? d;
  last = { slug, item: quick ? c : null, detail: d };
  pane.innerHTML = `${header(c, slug)}<div class="bp-cols"><section><h3>Rewards <small class="muted">live pot ${usd(c.potUsd)}</small></h3>${rewardsTable(c)}</section><section><h3>Dates</h3>${dates(c, d)}</section></div>
<section class="prose"><h3>Description</h3>${md(c.description)}</section>
<details class="prose rules"${visible === 'open' ? ' open' : ''}><summary><h3>Rules</h3><span class="muted">${d?.rules ? `${num(d.rules.length)} characters · ${(d.rules.match(/^## /gm) ?? []).length} sections` : 'not published'}</span></summary>${md(d?.rules ?? '')}</details>`;
}
