// Collection: every device waiting to go back to the customer, with one-tap Hand back / Close job.
import * as repo from '../repo.js?v=20261123224247';
import { statusLabel } from '../repo.js?v=20261123224247';
import { $, $$, esc, money, fmtDate } from '../ui.js?v=20261123224247';
import { handBack, closeJobModal } from './jobs.js?v=20261123224247';
import { go } from '../app.js?v=20261123224247';

let q = '';
const days = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));

// Waiting to be collected: Ready – fixed, Ready – not fixed, and quote declined (device still here). Oldest first.
export function waitingRows(jobs, quotes) {
  const rows = [];
  for (const j of jobs.filter(j => !repo.isClosed(j))) {
    if (j.status === 'ready' || j.status === 'unfixed') { rows.push({ j, why: statusLabel(j.status), since: j.statusAt }); continue; }
    const qs = quotes.filter(x => x.jobId === j.id);
    const dec = qs.filter(x => x.status === 'declined').map(x => x.respondedAt || x.createdAt).sort().pop();
    if (dec && !qs.some(x => x.status === 'accepted')) rows.push({ j, why: 'Quote declined', since: dec });
  }
  return rows.sort((a, b) => a.since.localeCompare(b.since)).map(r => ({ ...r, days: days(r.since) }));
}

export async function renderCollect(view) {
  const [jobs, quotes, payments] = await Promise.all([repo.listJobs(), repo.listQuotes(), repo.listPayments()]);
  const rows = waitingRows(jobs, quotes);
  view.innerHTML = `
    <div class="page-head"><h1>Collection</h1><span class="muted">${rows.length} waiting</span><span class="spacer"></span>
      <input type="search" id="col-q" placeholder="Search job no, name, phone, model" style="max-width:380px" autocomplete="off"></div>
    <p class="muted" style="margin:-6px 0 14px">Devices waiting for the customer. Tap <b>Collected</b> when they pick it up, or <b>Close job</b> if it was never collected (sold or recycled).</p>
    <div class="collect-list" id="col-list"></div>`;
  const input = $('#col-q', view); input.value = q;
  const draw = () => {
    q = input.value; const t = q.trim().toLowerCase(), d = repo.digits(t);
    const list = rows.filter(({ j }) => !t || [j.jobNo, j.customerName, j.model].some(v => (v || '').toLowerCase().includes(t))
      || (d.length >= 3 && repo.digits(j.customerPhone).includes(d)));
    $('#col-list', view).innerHTML = list.map(({ j, why, since }) => {
      const m$ = repo.jobMoney(j, payments.filter(p => p.jobId === j.id));
      const n = days(since);
      const owed = j.jobType === 'warranty' || j.quote === null ? '' : m$.due > 0 ? `<b>${money(m$.due)} to pay</b>` : '<span class="muted">Paid</span>';
      return `<div class="card collect-row" style="--sc:var(--s-${j.status === 'unfixed' ? 'unfixed' : j.status === 'ready' ? 'ready' : 'approval'})">
        <div class="grow">
          <div class="row" style="gap:8px"><b class="mono">${esc(j.jobNo)}</b><span class="pill" style="--sc:inherit">${esc(why)}</span>
            <span class="${n >= 30 ? 'tag hot' : 'muted'}">${n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`}</span></div>
          <div style="font-size:1.05rem;margin-top:4px"><b>${esc(j.customerName)}</b> · ${esc(j.model)}</div>
          <div class="muted">${esc(j.customerPhone || '')}${owed ? ' · ' : ''}${owed}</div>
        </div>
        <div class="collect-actions">
          <button class="btn primary big" data-hand="${j.id}">Collected</button>
          <button class="btn" data-closejob="${j.id}">Close job</button>
          <button class="btn ghost small" data-open="${j.id}">Open job</button>
        </div></div>`;
    }).join('') || `<div class="card empty">${rows.length ? 'Nothing matches that search.' : 'Nothing waiting to be collected. Jobs show here once you mark them <b>Ready</b>.'}</div>`;
    const byId = id => jobs.find(j => j.id === id);
    const again = () => renderCollect(view);
    $$('[data-hand]', view).forEach(b => b.onclick = () => handBack(byId(b.dataset.hand), again));
    $$('[data-closejob]', view).forEach(b => b.onclick = () => closeJobModal(byId(b.dataset.closejob), again));
    $$('[data-open]', view).forEach(b => b.onclick = () => go('job-' + b.dataset.open));
  };
  input.oninput = draw;
  draw();
}
