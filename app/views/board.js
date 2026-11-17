// The bounty board: every open bounty with its live pot, entry fee, time left and entries, patched in place.
import { esc, usd, fee, num, timeLeft, stateOf, takesEntries, patchRows } from '../core.js';

// Taking entries first, soonest deadline first; then the ones closed and being judged, latest first.
export function order(items, now = Date.now()) {
  const live = items.filter((c) => takesEntries(c, now)).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const judging = items.filter((c) => !takesEntries(c, now)).sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
  return { live, judging };
}
export const defaultSlug = (items) => {
  const { live, judging } = order(items);
  return (live.find((c) => c.entryFeeUsd) ?? live[0] ?? judging[0])?.slug ?? null;
};

const filters = { open: 'Taking entries', judging: 'Judging', all: 'All' };
let ui = null;

function frame(pane) {
  pane.innerHTML = `<div class="pane-head"><h2>Live board</h2><span class="sub" id="b-count"></span></div>
<div class="b-tools"><input id="b-q" type="search" placeholder="Filter bounties" aria-label="Filter bounties" autocomplete="off">
<div class="seg" role="tablist">${Object.entries(filters).map(([k, v]) => `<button type="button" data-f="${k}"${k === 'open' ? ' aria-pressed="true"' : ''}>${v}</button>`).join('')}</div></div>
<div class="b-legend"><span>Live pot</span><span>Entry fee</span><span>Time left</span><span>Entries</span></div>
<nav class="b-list" id="b-list" aria-label="Bounties"></nav><p class="b-empty" id="b-empty" hidden>No bounty matches.</p>`;
  ui = { pane, list: pane.querySelector('#b-list'), q: pane.querySelector('#b-q'), filter: 'open', items: [], selected: null };
  ui.q.addEventListener('input', paint);
  pane.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    ui.filter = b.dataset.f;
    for (const x of pane.querySelectorAll('[data-f]')) x.toggleAttribute('aria-pressed', x === b);
    paint();
  });
}

function makeRow() {
  const a = document.createElement('a');
  a.className = 'b-row';
  a.innerHTML = `<span class="b-title"></span><span class="b-meta"><span class="pill"></span><span class="b-cat"></span></span>
<span class="b-stats"><b class="b-pot"></b><span class="b-fee"></span><span class="b-tl"></span><span class="b-n"></span></span>`;
  return a;
}
const set = (el, sel, text) => {
  const n = el.querySelector(sel);
  if (n.textContent !== text) n.textContent = text;
  return n;
};
function updateRow(a, c) {
  const [cls, label] = stateOf(c);
  a.href = `#/bounty/${encodeURIComponent(c.slug)}`;
  a.toggleAttribute('aria-current', c.slug === ui.selected);
  set(a, '.b-title', c.title);
  set(a, '.pill', label).className = `pill ${cls}`;
  set(a, '.b-cat', `${c.category ?? ''}${c.sponsor?.name ? ' · ' + c.sponsor.name : ''}`);
  set(a, '.b-pot', usd(c.potUsd ?? c.rewardAmount));
  set(a, '.b-fee', fee(c) === 'Free' ? 'no fee' : `${fee(c)} fee`).classList.toggle('paid', fee(c) !== 'Free');
  const tl = set(a, '.b-tl', timeLeft(c.deadline));
  tl.dataset.deadline = c.deadline;
  tl.classList.toggle('soon', takesEntries(c) && Date.parse(c.deadline) - Date.now() < 6 * 36e5);
  set(a, '.b-n', num(c.submissionCount));
}

function paint() {
  const q = ui.q.value.trim().toLowerCase();
  const { live, judging } = order(ui.items);
  const shown = (ui.filter === 'open' ? live : ui.filter === 'judging' ? judging : [...live, ...judging]).filter((c) => !q || `${c.title} ${c.category} ${c.slug}`.toLowerCase().includes(q));
  patchRows(ui.list, shown, (c) => c.slug, makeRow, updateRow);
  ui.pane.querySelector('#b-empty').hidden = shown.length > 0;
  const pot = live.reduce((s, c) => s + Number(c.potUsd ?? 0), 0);
  ui.pane.querySelector('#b-count').textContent = `${live.length} taking entries · ${usd(pot)} in live pots · ${judging.length} judging`;
}

export function show(pane, items, selected) {
  if (!ui || ui.pane !== pane || !pane.querySelector('#b-list')) frame(pane);
  // A bounty opened from a profile may be closed: show it under All so the selected row stays visible.
  if (selected && ui.selected !== selected && !order(items).live.some((c) => c.slug === selected) && items.some((c) => c.slug === selected)) {
    ui.filter = 'all';
    for (const x of pane.querySelectorAll('[data-f]')) x.toggleAttribute('aria-pressed', x.dataset.f === 'all');
  }
  ui.items = items;
  ui.selected = selected;
  paint();
  pane.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
}

export const describe = (c) => `${esc(c.title)}: ${usd(c.potUsd)} pot, ${fee(c)} entry, ${timeLeft(c.deadline)}`;
