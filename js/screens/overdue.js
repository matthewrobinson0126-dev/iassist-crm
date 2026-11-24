// Overdue: devices past the 90-day collection deadline (+7 days' grace after the final notice).
// Strip for parts or recycle as e-waste in one tap: the customer is emailed and the job is closed.
import * as repo from '../repo.js?v=20261124182150';
import { $, $$, esc, fmtDate, toast, confirmBox } from '../ui.js?v=20261124182150';
import { waitingRows } from './collect.js?v=20261124182150';
import { go } from '../app.js?v=20261124182150';

export const DUE_DAYS = 97;   // 90 days + 7 days after the final notice

export async function renderOverdue(view) {
  const [jobs, quotes] = await Promise.all([repo.listJobs(), repo.listQuotes()]);
  const rows = waitingRows(jobs, quotes).filter(r => r.days >= 90 && (!r.j.demo || !repo.auth.cloud));
  const due = rows.filter(r => r.days >= DUE_DAYS), notice = rows.filter(r => r.days < DUE_DAYS);
  const row = (r, actions) => `<div class="card collect-row" style="--sc:var(--s-parts)">
      <div class="grow">
        <div class="row" style="gap:8px"><b class="mono">${esc(r.j.jobNo)}</b><span class="pill" style="--sc:var(--s-parts)">${esc(r.why)}</span>
          <span class="tag hot">${r.days} days</span></div>
        <div style="font-size:1.05rem;margin-top:4px"><b>${esc(r.j.customerName)}</b> · ${esc(r.j.model)}</div>
        <div class="muted">${esc(r.j.customerPhone || '')} · waiting since ${fmtDate(r.since)}</div>
      </div>
      <div class="collect-actions">${actions}<button class="btn ghost small" data-open="${r.j.id}">Open job</button></div></div>`;
  view.innerHTML = `
    <div class="page-head"><h1>Overdue</h1><span class="muted">${due.length} past the deadline</span></div>
    <p class="muted" style="margin:-6px 0 14px">Devices not collected 90 days after they were ready, declined or found unrepairable. The customer has had reminders at 30, 60 and 90 days. After 7 more days you can strip or recycle the device: the customer is emailed and the job is closed. Erase the data first.</p>
    <div class="collect-list">${due.map(r => row(r, `
        <button class="btn primary" data-act="stripped" data-id="${r.j.id}">Stripped for parts</button>
        <button class="btn primary" data-act="recycled" data-id="${r.j.id}">E-waste</button>`)).join('')
      || '<div class="card empty">Nothing overdue. Devices show here 97 days after they were ready to collect.</div>'}</div>
    ${notice.length ? `<h2 style="margin:22px 0 10px">Final notice sent: waiting 7 days</h2>
      <div class="collect-list">${notice.map(r => row(r, `<span class="muted">Can be closed on day ${DUE_DAYS}</span>`)).join('')}</div>` : ''}`;
  $$('[data-open]', view).forEach(b => b.onclick = () => go('job-' + b.dataset.open));
  $$('[data-act]', view).forEach(b => b.onclick = async () => {
    const r = due.find(x => x.j.id === b.dataset.id);
    const what = b.dataset.act === 'stripped' ? 'stripped for parts' : 'recycled as e-waste';
    if (!(await confirmBox(`Mark ${r.j.jobNo} (${r.j.customerName}, ${r.j.model}) as ${what}? ${r.j.customerName.split(' ')[0]} will be emailed and the job closed. Make sure the data is erased first.`, { ok: b.dataset.act === 'stripped' ? 'Stripped for parts' : 'E-waste', danger: true }))) return;
    await repo.closeJob(r.j, { outcome: b.dataset.act, note: `${r.days} days after ${r.why === 'Quote declined' ? 'the quote was declined' : 'it was ready'}, no reply to reminders` });
    toast(`${r.j.jobNo} closed and customer emailed`);
    renderOverdue(view);
  });
}
