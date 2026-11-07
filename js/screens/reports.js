// Owner reports: takings, profit, turnaround, technicians (with commission), top repairs, where customers come from.
// Every figure is worked out from the jobs and the payments ledger; demo data is left out.
import * as repo from '../repo.js?v=20261107143707';
import { STATUSES } from '../repo.js?v=20261107143707';
import { $, $$, esc, money, fmtDate } from '../ui.js?v=20261107143707';
import { deviceType } from '../devices.js?v=20261107143707';

const RANGES = [
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'year', label: 'Last 12 months', days: 365 },
];
let range = 'month';

function bounds(id) {
  const now = new Date();
  const key = d => d.toLocaleDateString('en-CA');
  const r = RANGES.find(x => x.id === id);
  if (id === 'month') return { from: key(new Date(now.getFullYear(), now.getMonth(), 1)), to: key(now) };
  if (id === 'last') return { from: key(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: key(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return { from: key(new Date(now.getTime() - (r.days - 1) * 86400000)), to: key(now) };
}

const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const round = n => Math.round(n * 100) / 100;

function countBy(list, keyFn) {
  const m = new Map();
  for (const x of list) for (const k of [].concat(keyFn(x)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// Horizontal bars, one hue, labels in text colour; value printed at the end of each bar.
function hbars(rows, fmt = v => v, empty = 'Nothing in this period yet.') {
  if (!rows.length) return `<p class="muted" style="margin:0">${empty}</p>`;
  const max = Math.max(...rows.map(r => r[1]), 1);
  return `<div class="hbars">${rows.map(([label, v]) => `
    <div class="hbar" title="${esc(label)}: ${esc(fmt(v))}"><span class="hl">${esc(label)}</span>
      <span class="ht"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></span><b class="num">${esc(fmt(v))}</b></div>`).join('')}</div>`;
}

// Takings per day: columns on a zero baseline with a light grid, hover shows the exact figure.
function dayColumns(from, to, byDay) {
  const days = [];
  for (let d = new Date(from + 'T12:00'); d.toLocaleDateString('en-CA') <= to; d = new Date(d.getTime() + 86400000)) days.push(d.toLocaleDateString('en-CA'));
  const vals = days.map(k => Math.max(0, byDay.get(k) || 0));
  const max = Math.max(...vals, 1);
  const step = days.length > 60 ? 7 : days.length > 20 ? 5 : 1;
  return `<div class="cols" role="img" aria-label="Takings per day">
    ${days.map((k, i) => `<div class="col" title="${fmtDate(k)}: ${money(vals[i])}"><i style="height:${vals[i] ? Math.max(2, (vals[i] / max) * 100) : 0}%"></i>
      <span>${i % step === 0 ? new Date(k + 'T12:00').getDate() : ''}</span></div>`).join('')}
  </div><div class="cols-scale muted num"><span>R0</span><span>${money(max)}</span></div>`;
}

export async function renderReports(view) {
  if (!repo.auth.isOwner()) { view.innerHTML = '<div class="card empty"><h2>Only the owner can see reports</h2></div>'; return; }
  const [allJobs, allPay, staff] = await Promise.all([repo.listJobs(), repo.listPayments(), repo.listStaff()]);
  const jobs = allJobs.filter(repo.countsAsReal), pay = allPay.filter(repo.countsAsReal);
  const { from, to } = bounds(range);
  const inRange = iso => { if (!iso) return false; const k = repo.dayKey(iso); return k >= from && k <= to; };

  const payR = pay.filter(p => inRange(p.createdAt));
  const takings = round(sum(payR.filter(p => p.kind !== 'expense'), repo.signed));
  const costs = round(sum(payR.filter(p => p.kind === 'expense'), p => p.amount));
  const booked = jobs.filter(j => inRange(j.createdAt));
  const collected = jobs.filter(j => j.status === 'collected' && inRange(j.collectedAt));
  const payByJob = new Map();
  for (const p of pay) if (p.jobId) (payByJob.get(p.jobId) || payByJob.set(p.jobId, []).get(p.jobId)).push(p);
  const jobRevenue = j => round(sum((payByJob.get(j.id) || []).filter(p => p.kind !== 'expense'), repo.signed));
  const jobCost = j => round(sum((payByJob.get(j.id) || []).filter(p => p.kind === 'expense'), p => p.amount));
  const paidJobs = collected.filter(j => j.jobType !== 'warranty');
  const avgJob = paidJobs.length ? sum(paidJobs, jobRevenue) / paidJobs.length : 0;
  const turnaround = collected.length ? sum(collected, j => (new Date(j.collectedAt) - new Date(j.createdAt)) / 86400000) / collected.length : 0;
  const open = jobs.filter(j => j.status !== 'collected');
  const late = open.filter(j => j.dueDate && j.dueDate < repo.todayKey() && j.status !== 'ready');
  const warrantyRate = collected.length ? collected.filter(j => j.jobType === 'warranty').length / collected.length : 0;

  const byDay = new Map();
  for (const p of payR) if (p.kind !== 'expense') byDay.set(repo.dayKey(p.createdAt), (byDay.get(repo.dayKey(p.createdAt)) || 0) + repo.signed(p));

  // Technicians: jobs collected in the period, takings, profit after part costs, commission on that profit.
  const techRows = staff.map(s => {
    const mine = collected.filter(j => j.technicianId === s.id);
    const rev = round(sum(mine, jobRevenue)), cost = round(sum(mine, jobCost));
    return { s, jobs: mine.length, rev, profit: round(rev - cost), commission: round((rev - cost) * (s.commissionPct || 0) / 100) };
  }).filter(r => r.jobs);
  const unassigned = collected.filter(j => !j.technicianId).length;

  const expensesByCat = [...payR.filter(p => p.kind === 'expense').reduce((m, p) => m.set(p.category || 'Other', (m.get(p.category || 'Other') || 0) + Number(p.amount)), new Map())].sort((a, b) => b[1] - a[1]);

  view.innerHTML = `
    <div class="page-head"><h1>Reports</h1><span class="spacer"></span><span class="muted">${fmtDate(from)} – ${fmtDate(to)}</span></div>
    <div class="chips" style="margin-bottom:16px">${RANGES.map(r => `<button class="chip ${r.id === range ? 'on' : ''}" data-r="${r.id}">${r.label}</button>`).join('')}</div>
    <div class="stat-row">
      <div class="stat"><span>Takings</span><b class="num">${money(takings)}</b><small>deposits + payments − refunds</small></div>
      <div class="stat"><span>Costs</span><b class="num">${money(costs)}</b><small>parts + shop expenses</small></div>
      <div class="stat"><span>Profit</span><b class="num">${money(takings - costs)}</b><small>${takings ? Math.round(((takings - costs) / takings) * 100) + '% margin' : '—'}</small></div>
      <div class="stat"><span>Average repair</span><b class="num">${money(avgJob)}</b><small>${paidJobs.length} paid job${paidJobs.length === 1 ? '' : 's'} collected</small></div>
    </div>
    <div class="stat-row">
      <div class="stat"><span>Booked in</span><b class="num">${booked.length}</b></div>
      <div class="stat"><span>Collected</span><b class="num">${collected.length}</b></div>
      <div class="stat"><span>Average turnaround</span><b class="num">${collected.length ? turnaround.toFixed(1) + ' days' : '—'}</b></div>
      <div class="stat"><span>Open now</span><b class="num">${open.length}</b><small>${late.length ? `<span style="color:var(--danger)">${late.length} late</span>` : 'none late'}${collected.length ? ` · ${Math.round(warrantyRate * 100)}% warranty returns` : ''}</small></div>
    </div>
    <div class="report-grid">
      <div class="card wide"><h2>Takings per day</h2>${dayColumns(from, to, byDay)}</div>
      <div class="card"><h2>Technicians</h2>
        ${techRows.length ? `<div style="overflow-x:auto"><table class="lines num"><thead><tr><th>Tech</th><th>Jobs</th><th>Takings</th><th>Profit</th><th>Commission</th></tr></thead>
          <tbody>${techRows.map(r => `<tr><td style="text-align:left">${esc(r.s.name)}</td><td>${r.jobs}</td><td>${money(r.rev)}</td><td>${money(r.profit)}</td>
            <td>${r.s.commissionPct ? `${money(r.commission)} <span class="muted">(${r.s.commissionPct}%)</span>` : '<span class="muted">not set</span>'}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted" style="margin:0">No collected jobs with a technician in this period.</p>'}
        ${unassigned ? `<p class="muted" style="margin:8px 0 0">${unassigned} collected job${unassigned === 1 ? ' had' : 's had'} no technician assigned.</p>` : ''}
        <p class="muted" style="margin:8px 0 0">Commission = profit (takings − part costs) × each person’s % in Settings.</p></div>
      <div class="card"><h2>Open jobs by status</h2>${hbars(STATUSES.filter(s => s.id !== 'collected').map(s => [s.label, open.filter(j => j.status === s.id).length]).filter(r => r[1]), v => v, 'No open jobs.')}</div>
      <div class="card"><h2>Top repairs booked</h2>${hbars(countBy(booked, j => j.faults || []).slice(0, 8))}</div>
      <div class="card"><h2>Devices booked</h2>${hbars(countBy(booked, j => deviceType(j.deviceType)?.label || j.deviceType).slice(0, 9))}</div>
      <div class="card"><h2>Where customers came from</h2>${hbars(countBy(booked, j => j.referral || 'Not asked').slice(0, 8))}</div>
      <div class="card"><h2>Costs by type</h2>${hbars(expensesByCat.map(([k, v]) => [k, round(v)]), money, 'No costs recorded in this period.')}</div>
    </div>`;
  $$('[data-r]', view).forEach(b => b.onclick = () => { range = b.dataset.r; renderReports(view); });
}
