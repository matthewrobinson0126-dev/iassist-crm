// "Search job" (yellow top button): one box that finds any job, open or finished, and customers.
import * as repo from '../repo.js?v=20261124205401';
import { esc, fmtDate, modal } from '../ui.js?v=20261124205401';

export async function openSearch(go) {
  const m = modal(`
    <div class="row"><h2 style="margin:0">Search job</h2><span class="spacer"></span><button class="btn small ghost" data-close>Close</button></div>
    <input type="search" id="qs-q" placeholder="Job no, name, phone, model, IMEI or report no" autocomplete="off" style="font-size:1.15rem">
    <div class="list" id="qs-res" style="max-height:60vh;overflow-y:auto"><p class="muted" style="margin:0">Start typing…</p></div>`, { wide: true });
  const input = m.el.querySelector('#qs-q'), res = m.el.querySelector('#qs-res');
  const jobs = (await repo.listJobs()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  let n = 0;
  const run = async () => {
    const my = ++n;
    const q = input.value.trim().toLowerCase(), qd = repo.digits(q);
    if (q.length < 2) { res.innerHTML = '<p class="muted" style="margin:0">Start typing…</p>'; return; }
    const hits = jobs.filter(j => [j.jobNo, j.customerName, j.model, j.serial, j.reportNo].some(v => (v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && repo.digits(j.customerPhone).includes(qd))).slice(0, 30);
    const custs = (await repo.searchCustomers(q)).slice(0, 8);
    if (my !== n) return;   // a newer search has started
    res.innerHTML = (hits.length ? `<h3 style="margin:4px 0">Jobs (${hits.length}${hits.length === 30 ? '+' : ''})</h3>` + hits.map(j => `
      <button class="list-row" data-go="job-${j.id}">
        <span class="grow"><b class="mono">${esc(j.jobNo)}</b> · <b>${esc(j.customerName)}</b> · ${esc(j.model)}
          <div class="muted">${esc(j.customerPhone || '')} · booked ${fmtDate(j.createdAt)}${j.outcome ? ' · ' + esc(repo.outcomeLabel(j.outcome)) : ''}</div></span>
        <span class="pill" style="--sc:var(--s-${j.status})">${esc(repo.statusLabel(j.status))}</span></button>`).join('') : '')
      + (custs.length ? `<h3 style="margin:10px 0 4px">Customers</h3>` + custs.map(c => `
      <button class="list-row" data-go="customer-${c.id}">
        <span class="grow"><b>${esc(c.name)}</b><div class="muted">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</div></span></button>`).join('') : '')
      || '<p class="muted" style="margin:0">Nothing found.</p>';
    res.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { m.close(); go(b.dataset.go); });
  };
  input.oninput = run;
  input.onkeydown = e => { if (e.key === 'Enter') res.querySelector('[data-go]')?.click(); if (e.key === 'Escape') m.close(); };
  setTimeout(() => input.focus(), 50);
}
