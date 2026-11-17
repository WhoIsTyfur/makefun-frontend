// Formatting shared by every view: money, fees, countdowns, states, dates, avatars, scores.
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
