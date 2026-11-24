// Finished: every job that has been collected or closed, newest first, with search and filters.
import * as repo from '../repo.js?v=20261124204956';
import { $, $$, esc, fmtDate, money } from '../ui.js?v=20261124204956';
import { go } from '../app.js?v=20261124204956';

const KINDS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'collected', label: 'Collected', test: j => j.status === 'collected' },
  { id: 'closed', label: 'Closed (not collected)', test: j => j.status === 'closed' },
  { id: 'repaired', label: 'Repaired', test: j => (j.outcome || 'repaired') === 'repaired' && j.status === 'collected' },
  { id: 'notfixed', label: 'Not repaired / declined', test: j => ['unrepairable', 'declined', 'cancelled'].includes(j.outcome) },
  { id: 'insurance', label: 'Insurance reports', test: j => j.jobType === 'insurance' },
];
const PERIODS = [
  { id: 'all', label: 'All time', days: null },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 3 months', days: 90 },
  { id: '365', label: 'Last year', days: 365 },
];
const state = { q: '', kind: 'all', period: 'all' };
const finishedAt = j => j.closedAt || j.collectedAt || j.statusAt || j.createdAt;

export async function renderFinished(view) {
  const jobs = (await repo.listJobs()).filter(repo.isClosed).sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));
  view.innerHTML = `
    <div class="page-head"><h1>Finished jobs</h1><span class="muted" id="fin-count"></span><span class="spacer"></span>
      <input type="search" id="fin-q" placeholder="Search job no, name, phone, model, IMEI" style="max-width:380px" autocomplete="off"></div>
    <p class="muted" style="margin:-6px 0 12px">Devices that have been handed back to the customer, or closed without being collected (sold, stripped, e-waste).</p>
    <div class="chips" id="fin-kind" style="margin-bottom:8px"></div>
    <div class="chips" id="fin-period" style="margin-bottom:14px"></div>
    <div class="collect-list" id="fin-list"></div>`;
  const search = $('#fin-q', view);
  search.value = state.q;
  const draw = () => {
    const q = state.q.trim().toLowerCase(), qd = repo.digits(q);
    const period = PERIODS.find(p => p.id === state.period);
    const since = period.days ? Date.now() - period.days * 864e5 : 0;
    const inPeriod = jobs.filter(j => new Date(finishedAt(j)).getTime() >= since);
    const kind = KINDS.find(k => k.id === state.kind);
    $('#fin-kind', view).innerHTML = KINDS.map(k => `<button class="chip ${k.id === state.kind ? 'on' : ''}" data-k="${k.id}">${esc(k.label)} <span class="num">${inPeriod.filter(k.test).length}</span></button>`).join('');
    $('#fin-period', view).innerHTML = PERIODS.map(p => `<button class="chip ${p.id === state.period ? 'on' : ''}" data-p="${p.id}">${esc(p.label)}</button>`).join('');
    const list = inPeriod.filter(j => kind.test(j) && (!q
      || [j.jobNo, j.customerName, j.model, j.serial, j.reportNo].some(v => (v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && repo.digits(j.customerPhone).includes(qd))));
    $('#fin-count', view).textContent = `${list.length} job${list.length === 1 ? '' : 's'}`;
    const shown = list.slice(0, 200);
    $('#fin-list', view).innerHTML = shown.map(j => {
      const col = j.status === 'closed' ? 'var(--s-closed)' : 'var(--s-collected)';
      return `<button class="card collect-row" data-id="${j.id}" style="--sc:${col};text-align:left;width:100%">
        <div class="grow">
          <div class="row" style="gap:8px"><b class="mono">${esc(j.jobNo)}</b>
            <span class="pill" style="--sc:${col}">${j.status === 'closed' ? 'Closed' : 'Collected'}</span>
            ${j.outcome ? `<span class="tag">${esc(repo.outcomeLabel(j.outcome))}</span>` : ''}
            ${j.jobType === 'insurance' ? `<span class="tag">Insurance${j.reportNo ? ' ' + esc(j.reportNo) : ''}</span>` : ''}
            ${j.jobType === 'warranty' ? '<span class="tag">Warranty</span>' : ''}</div>
          <div style="font-size:1.05rem;margin-top:4px"><b>${esc(j.customerName)}</b> · ${esc(j.model)}</div>
          <div class="muted">${esc((j.faults || []).join(', ') || j.faultNotes || '')}</div>
          <div class="muted">Booked ${fmtDate(j.createdAt)} · ${j.status === 'closed' ? 'closed' : 'collected'} ${fmtDate(finishedAt(j))}${j.collectedByName ? ` by ${esc(j.collectedByName)}` : ''}${j.paidAmount ? ` · paid ${money(j.paidAmount)}${j.paidMethod ? ' ' + esc(j.paidMethod) : ''}` : ''}${j.warrantyUntil ? ` · warranty to ${fmtDate(j.warrantyUntil)}` : ''}</div>
        </div></button>`;
    }).join('') || '<div class="card empty">No finished jobs match.</div>';
    if (list.length > shown.length) $('#fin-list', view).insertAdjacentHTML('beforeend', `<p class="muted">Showing the newest 200 of ${list.length}. Search to find older ones.</p>`);
    $$('[data-k]', view).forEach(b => b.onclick = () => { state.kind = b.dataset.k; draw(); });
    $$('[data-p]', view).forEach(b => b.onclick = () => { state.period = b.dataset.p; draw(); });
    $$('[data-id]', view).forEach(b => b.onclick = () => go('job-' + b.dataset.id));
  };
  search.oninput = () => { state.q = search.value; draw(); };
  draw();
}
