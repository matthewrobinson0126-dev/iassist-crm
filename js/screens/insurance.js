// Insurance tab: every damage report (DR-0001…) and every insurance job still waiting for one.
import * as repo from '../repo.js?v=20261124204956';
import { statusLabel } from '../repo.js?v=20261124204956';
import { $, $$, esc, money, fmtDate, toast } from '../ui.js?v=20261124204956';
import { startInsuranceJob } from './bookin.js?v=20261124204956';
import { go } from '../app.js?v=20261124204956';

let q = '', show = 'all';

export async function renderInsurance(view) {
  const jobs = (await repo.listJobs()).filter(j => j.reportNo || j.jobType === 'insurance');
  const todo = jobs.filter(j => !j.reportNo), done = jobs.filter(j => j.reportNo)
    .sort((a, b) => (b.report?.assessedAt || '').localeCompare(a.report?.assessedAt || ''));
  view.innerHTML = `
    <div class="page-head"><h1>Insurance</h1><span class="spacer"></span>
      <input type="search" id="ins-q" placeholder="Search DR no, job no, name, device, IMEI" style="max-width:380px" autocomplete="off">
      <button class="btn primary" id="ins-new">+ New insurance job</button></div>
    <p class="muted" style="margin:-6px 0 14px">Damage reports for insurance claims. Book the device in as an insurance job, check it, then open the job and tap <b>Damage report</b>.</p>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip" data-s="all">All <span class="num">${jobs.length}</span></button>
      <button class="chip" data-s="todo">Report still needed <span class="num">${todo.length}</span></button>
      <button class="chip" data-s="done">Reports done <span class="num">${done.length}</span></button>
      <button class="chip" data-s="ber">Beyond economical repair <span class="num">${done.filter(j => j.report?.result === 'ber').length}</span></button>
    </div>
    <div class="collect-list" id="ins-list"></div>`;
  const input = $('#ins-q', view); input.value = q;
  const draw = () => {
    q = input.value; const t = q.trim().toLowerCase();
    $$('[data-s]', view).forEach(b => b.classList.toggle('on', b.dataset.s === show));
    let list = show === 'todo' ? todo : show === 'done' ? done : show === 'ber' ? done.filter(j => j.report?.result === 'ber') : [...todo, ...done];
    list = list.filter(j => !t || [j.reportNo, j.jobNo, j.customerName, j.model, j.serial].some(v => (v || '').toLowerCase().includes(t)));
    $('#ins-list', view).innerHTML = list.map(j => {
      const r = j.report || {}, ber = r.result === 'ber';
      return `<div class="card collect-row" style="--sc:${j.reportNo ? (ber ? 'var(--danger)' : 'var(--s-ready)') : 'var(--s-approval)'}">
        <div class="grow">
          <div class="row" style="gap:8px">${j.reportNo ? `<b class="mono">${esc(j.reportNo)}</b>` : '<span class="tag hot">Report needed</span>'}
            <span class="muted mono">${esc(j.jobNo)}</span>
            ${j.reportNo ? `<span class="tag ${ber ? 'hot' : ''}">${ber ? 'Beyond economical repair' : 'Repairable'}</span>` : `<span class="muted">${esc(statusLabel(j.status))}</span>`}</div>
          <div style="font-size:1.05rem;margin-top:4px"><b>${esc(j.customerName)}</b> · ${esc(j.model)}${j.serial ? ` <span class="muted mono">${esc(j.serial)}</span>` : ''}</div>
          <div class="muted">${j.reportNo ? `${fmtDate(r.assessedAt)} · ${esc(r.cause || '')}${ber && r.replacementValue != null ? ` · replacement ${money(r.replacementValue)}` : !ber && r.repairCost != null ? ` · repair ${money(r.repairCost)}` : ''}` : `Booked in ${fmtDate(j.createdAt)}`}</div>
        </div>
        <div class="collect-actions">
          ${j.reportNo ? `<button class="btn" data-pdf="${j.id}">Print / PDF</button><button class="btn" data-mail="${j.id}">Email</button>` : ''}
          <button class="btn ${j.reportNo ? 'ghost small' : 'primary'}" data-open="${j.id}">${j.reportNo ? 'Open job' : 'Write report'}</button>
        </div></div>`;
    }).join('') || `<div class="card empty">${jobs.length ? 'Nothing in this list.' : 'No insurance reports yet. Tap <b>+ New insurance job</b> to book one in.'}</div>`;
    const byId = id => jobs.find(j => j.id === id);
    $$('[data-open]', view).forEach(b => b.onclick = () => go('job-' + b.dataset.open));
    $$('[data-mail]', view).forEach(b => b.onclick = async () => {
      const r = await repo.emailReport(byId(b.dataset.mail));
      toast(r.sent ? `Report emailed to ${r.to}` : `Not emailed: ${r.skipped || r.error}`, r.sent ? '' : 'error');
    });
    $$('[data-pdf]', view).forEach(b => b.onclick = async () => {
      const job = byId(b.dataset.pdf);
      if (!repo.auth.cloud) { go('job-' + job.id); return; }
      const win = window.open('', '_blank'); toast('Making the PDF…');
      try {
        const r = await repo.reportPdf(job);
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(r.pdf), ch => ch.charCodeAt(0))], { type: 'application/pdf' }));
        if (win) win.location.href = url; else location.href = url;
      } catch (ex) { win?.close(); toast(ex.message, 'error'); }
    });
  };
  $$('[data-s]', view).forEach(b => b.onclick = () => { show = b.dataset.s; draw(); });
  $('#ins-new', view).onclick = () => startInsuranceJob();
  input.oninput = draw;
  draw();
}
