// Jobs board (by status), job detail, hand back.
import * as repo from '../repo.js?v=20261107152030';
import { STATUSES, statusLabel } from '../repo.js?v=20261107152030';
import { $, $$, esc, money, fmtDate, fmtDateTime, ageText, toast, modal, confirmBox, signaturePad, compressImage } from '../ui.js?v=20261107152030';
import { deviceType, collectionLabel, PAY_METHODS, jobTypeLabel } from '../devices.js?v=20261107152030';
import { printJobCard, printCompletion, qrSvg } from '../print.js?v=20261107152030';
import { startWarrantyJob } from './bookin.js?v=20261107152030';
import { taskRow, bindTaskRows, taskModal } from './tasks.js?v=20261107152030';
import { openWhatsApp } from '../messages.js?v=20261107152030';
import { go } from '../app.js?v=20261107152030';
import { quotePill, recentOnlineAnswers, markAnswersSeen } from './quotes.js?v=20261107152030';

const sc = id => `var(--s-${id})`;
let boardState = { q: '', showCollected: false, filter: 'all' };

const today = () => new Date().toISOString().slice(0, 10);
const isLate = j => j.dueDate && j.dueDate < today() && !['ready', 'collected'].includes(j.status);
const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'mine', label: 'Mine', test: j => j.technicianId === repo.auth.user?.id },
  { id: 'urgent', label: 'Urgent', test: j => j.urgent },
  { id: 'late', label: 'Late', test: isLate },
  { id: 'unassigned', label: 'Not assigned', test: j => !j.technicianId },
  { id: 'warranty', label: 'Warranty', test: j => j.jobType === 'warranty' },
];

export async function renderJobs(view) {
  const jobs = await repo.listJobs();
  view.innerHTML = `
    <div class="page-head"><h1>Jobs</h1><span class="spacer"></span>
      <input type="search" id="job-search" placeholder="Search job no, name, phone, model, IMEI" style="max-width:420px" autocomplete="off">
      <label class="check"><input type="checkbox" id="show-collected"> Show collected</label>
    </div>
    <div id="quote-news"></div>
    <div class="chips" id="filters" style="margin-bottom:14px"></div>
    <div class="board" id="board"></div>`;
  // Quotes the customer answered online (accepted / declined) since this iPad last looked.
  recentOnlineAnswers().then(list => {
    const box = $('#quote-news', view);
    if (!list.length || !box) return;
    box.innerHTML = `<div class="card stack" style="margin-bottom:14px;border-color:var(--s-ready)">
      <div class="row"><h2 style="margin:0">Quote answers</h2><span class="spacer"></span><button class="btn small ghost" id="qn-dismiss">Got it</button></div>
      <div class="list">${list.map(q => `<a class="list-row" href="#${q.jobId ? 'job-' + q.jobId : 'quote-' + q.id}">
        <span class="grow"><b>${esc(q.customerName)}</b> ${q.status === 'accepted' ? 'accepted' : 'declined'} ${esc(q.quoteNo)}${q.model ? ` · ${esc(q.model)}` : ''}
          <div class="muted">${fmtDateTime(q.respondedAt)}${q.jobNo ? ` · job ${esc(q.jobNo)}${q.status === 'accepted' ? ' moved to Repairing' : ''}` : q.status === 'accepted' ? ' · book the device in when it arrives' : ''}${q.responseNote ? ` · “${esc(q.responseNote)}”` : ''}</div></span>
        <b class="num">${money(q.total)}</b>${quotePill(q)}</a>`).join('')}</div></div>`;
    $('#qn-dismiss', box).onclick = () => { markAnswersSeen(list.map(q => q.id)); box.innerHTML = ''; };
  }).catch(() => {});
  const search = $('#job-search', view), toggle = $('#show-collected', view);
  search.value = boardState.q; toggle.checked = boardState.showCollected;
  const draw = () => {
    const q = boardState.q.trim().toLowerCase(), qd = repo.digits(q);
    const filter = FILTERS.find(f => f.id === boardState.filter) || FILTERS[0];
    const open = jobs.filter(j => j.status !== 'collected');
    $('#filters', view).innerHTML = FILTERS.map(f => `<button class="chip ${f.id === filter.id ? 'on' : ''}" data-f="${f.id}">${esc(f.label)} <span class="num">${open.filter(f.test).length}</span></button>`).join('');
    $$('[data-f]', view).forEach(b => b.onclick = () => { boardState.filter = b.dataset.f; draw(); });
    const match = j => filter.test(j) && (!q || [j.jobNo, j.customerName, j.model, j.serial, j.technicianName].some(v => (v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && repo.digits(j.customerPhone).includes(qd)));
    const cols = STATUSES.filter(s => s.id !== 'collected' || boardState.showCollected);
    $('#board', view).innerHTML = cols.map(s => {
      let list = jobs.filter(j => j.status === s.id && match(j)).sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
      if (s.id === 'collected') list = list.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).slice(0, 40);
      return `<section class="col" aria-label="${esc(s.label)}">
        <div class="col-head"><span class="dot" style="background:${sc(s.id)}"></span>${esc(s.label)}<span class="count">${list.length}</span></div>
        ${list.map(card).join('') || '<div class="col-empty">No jobs</div>'}
      </section>`;
    }).join('');
    $$('.job-card', view).forEach(c => c.onclick = () => go('job-' + c.dataset.id));
  };
  search.oninput = () => { boardState.q = search.value; draw(); };
  toggle.onchange = () => { boardState.showCollected = toggle.checked; draw(); };
  draw();
  if (!jobs.length) {
    $('#board', view).insertAdjacentHTML('beforebegin', `<div class="card empty" style="margin-bottom:16px">
      <h2>No jobs yet</h2><p>Tap <b>+ Book in</b> to book in the first device.${repo.auth.isOwner() ? ' To practise first, load demo jobs in Settings.' : ''}</p></div>`);
  }
}

function card(j) {
  const late = isLate(j);
  return `<button class="job-card ${j.urgent ? 'urgent' : ''}" data-id="${j.id}" style="--sc:${sc(j.status)}">
    <div class="top"><span class="jn">${esc(j.jobNo)}</span><span>${j.status === 'collected' ? fmtDate(j.collectedAt) : ageText(j.createdAt)}</span></div>
    ${j.urgent || j.jobType === 'warranty' ? `<div class="tag-list">${j.urgent ? '<span class="tag hot">Urgent</span>' : ''}${j.jobType === 'warranty' ? '<span class="tag">Warranty</span>' : ''}</div>` : ''}
    <div class="name">${esc(j.customerName)}</div>
    <div class="dev">${esc(j.model)}</div>
    <div class="muted" style="font-size:.85rem">${esc((j.faults || []).join(', ') || j.faultNotes || '')}</div>
    <div class="muted" style="font-size:.82rem">${j.technicianName ? `Tech: ${esc(j.technicianName)}` : 'Not assigned'}</div>
    ${late ? `<div class="flag">Past ready date (${fmtDate(j.dueDate)})</div>` : ''}
  </button>`;
}

// ───────────── Job detail ─────────────
export async function renderJob(view, id) {
  let job = await repo.getJob(id);
  if (!job) { view.innerHTML = '<div class="card empty"><h2>Job not found</h2><p><a href="#jobs">Back to jobs</a></p></div>'; return; }
  const [customer, photos, events, payments, tasks, quotes] = await Promise.all([repo.getCustomer(job.customerId), repo.listPhotos(id),
    repo.listEvents(id), repo.jobPayments(id), repo.listTasks({ jobId: id }), repo.quotesForJob(id)]);
  const m$ = repo.jobMoney(job, payments);
  const photoUrls = await Promise.all(photos.map(p => repo.fileUrl(p.fileId)));
  const sigIn = await repo.fileUrl(job.signatureIn), sigOut = await repo.fileUrl(job.signatureOut);
  const collected = job.status === 'collected';
  const list = a => a && a.length ? `<div class="tag-list">${a.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : '—';

  view.innerHTML = `
    <div class="page-head">
      <a href="#jobs" class="btn small ghost">← Jobs</a>
      <h1 class="mono">${esc(job.jobNo)}</h1>
      <span class="pill" style="--sc:${sc(job.status)}">${esc(statusLabel(job.status))}</span>
      ${job.urgent ? '<span class="tag hot">Urgent</span>' : ''}
      ${job.jobType && job.jobType !== 'paid' ? `<span class="tag">${esc(jobTypeLabel(job.jobType))}${job.warrantyOf ? ` for <a href="#job-${job.warrantyOf}">${esc(job.warrantyOfNo || 'original job')}</a>` : ''}</span>` : ''}
      <span class="muted">in for ${ageText(job.createdAt)}</span>
      <span class="spacer"></span>
      <button class="btn" id="j-wa">WhatsApp</button>
      <button class="btn" id="j-print">Print job card</button>
      ${['ready', 'collected'].includes(job.status) ? '<button class="btn" id="j-cert">Certificate of completion</button>' : ''}
      ${collected ? '<button class="btn" id="j-warranty">Warranty return</button>' : ''}
      ${!collected ? `<button class="btn ${job.status === 'ready' ? 'primary' : ''}" id="j-hand">Hand back</button>` : ''}
    </div>
    ${!collected ? `<div class="card" style="margin-bottom:18px"><div class="row">
      <label class="field" style="min-width:220px;flex:1">Technician<select id="j-tech"><option value="">Not assigned</option></select></label>
      <label class="check"><input type="checkbox" id="j-urgent" ${job.urgent ? 'checked' : ''}> Urgent</label>
    </div></div>` : ''}
    ${!collected ? `<div class="card stack" style="margin-bottom:18px"><h2 style="margin:0">Move to</h2>
      <div class="status-row">${STATUSES.filter(s => s.id !== 'collected').map(s =>
        `<button class="status-btn ${s.id === job.status ? 'on' : ''}" data-s="${s.id}" style="--sc:${sc(s.id)}"><span class="dot"></span>${esc(s.label)}</button>`).join('')}</div></div>` : ''}
    <div class="job-layout">
      <div class="stack">
        <div class="card"><div class="row"><h2 style="margin:0">Customer</h2><span class="spacer"></span>
          <a class="btn small" href="#customer-${job.customerId}">Open customer</a></div>
          <dl class="kv" style="margin-top:12px">
            <dt>Name</dt><dd>${esc(customer?.name || job.customerName)}</dd>
            <dt>Cell</dt><dd class="num">${esc(customer?.phone || job.customerPhone)}</dd>
            ${customer?.email ? `<dt>Email</dt><dd>${esc(customer.email)}</dd>` : ''}
            ${customer?.area ? `<dt>Area</dt><dd>${esc(customer.area)}</dd>` : ''}
          </dl></div>
        <div class="card"><div class="row"><h2 style="margin:0">Device</h2><span class="spacer"></span>
          ${!collected ? '<button class="btn small" id="j-edit-dev">Edit</button>' : ''}</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Type</dt><dd>${esc(deviceType(job.deviceType)?.label || job.deviceType)}</dd>
            <dt>Model</dt><dd>${esc(job.model)}${job.colour ? `, ${esc(job.colour)}` : ''}</dd>
            <dt>IMEI / serial</dt><dd class="mono">${esc(job.serial || '—')}</dd>
            <dt>Powers on</dt><dd>${esc(job.powersOn || '—')}</dd>
            <dt>Fault</dt><dd>${list(job.faults)}${job.faultNotes ? `<div style="margin-top:6px">${esc(job.faultNotes)}</div>` : ''}</dd>
            <dt>Condition</dt><dd>${list(job.damage)}${job.conditionNotes ? `<div style="margin-top:6px">${esc(job.conditionNotes)}</div>` : ''}</dd>
            <dt>Left with it</dt><dd>${list(job.accessories)}</dd>
            <dt>Passcode</dt><dd>${job.passcodeGiven ? (collected ? 'Deleted at collection' : '<button class="btn small" id="j-pass">Show passcode</button>') : 'Not given'}</dd>
            ${job.internalNotes ? `<dt>Tech notes</dt><dd>${esc(job.internalNotes)}</dd>` : ''}
          </dl></div>
        <div class="card stack"><div class="row"><h2 style="margin:0">Parts &amp; labour</h2><span class="spacer"></span>
          ${!collected ? '<button class="btn small" id="j-add-stock">+ From stock</button><button class="btn small" id="j-add-price">+ From price list</button><button class="btn small" id="j-add-custom">+ Custom line</button>' : ''}
          ${!collected && job.jobType !== 'warranty' && (job.lines || []).length ? '<button class="btn small primary" id="j-send-quote">Send quote</button>' : ''}</div>
          ${(job.lines || []).length ? `<div style="overflow-x:auto"><table class="lines num">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
            <tbody>${job.lines.map((l, i) => `<tr><td>${esc(l.name)}${l.productId ? ' <span class="tag">stock</span>' : ''}</td><td>${esc(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.qty * l.price)}</td>
              <td>${!collected ? `<button class="btn small ghost" data-rm-line="${i}" aria-label="Remove ${esc(l.name)}">×</button>` : ''}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="3">Total${job.jobType === 'warranty' ? ' (warranty: customer pays R0)' : ''}</td><td>${money(repo.linesTotal(job.lines))}</td><td></td></tr></tfoot>
          </table></div>` : '<p class="muted" style="margin:0">No parts or labour added yet. Lines set the quote automatically.</p>'}
        </div>
        <div class="card stack"><h2 style="margin:0">Work done</h2>
          <textarea id="j-workdone" rows="3" placeholder="What was repaired or replaced. Printed on the certificate of completion." ${collected ? 'readonly' : ''}>${esc(job.workDone || '')}</textarea>
          ${!collected ? '<div class="row"><span class="spacer"></span><button class="btn" id="j-workdone-save">Save work done</button></div>' : ''}
        </div>
        <div class="card"><div class="row"><h2 style="margin:0">Photos</h2><span class="spacer"></span>
          <span class="muted">${photos.length}</span></div>
          <div class="photo-grid" style="margin-top:12px">
            ${photos.map((p, i) => `<a class="photo" href="${photoUrls[i]}" target="_blank" rel="noopener"><img src="${photoUrls[i]}" alt="${esc(p.caption || 'Job photo')}">
              <span class="cap">${esc(p.caption || '')} · ${esc(p.staffName || '')}</span></a>`).join('')}
            <label class="add-photo"><input type="file" accept="image/*" multiple id="j-photo">+ Add photo</label>
          </div></div>
        <div class="card"><h2>Signatures</h2><div class="row" style="align-items:flex-start">
          ${sigIn ? `<div><img class="sig-img" src="${sigIn}" alt="Book-in signature"><div class="muted">Book-in, ${fmtDateTime(job.createdAt)}</div></div>` : '<span class="muted">No book-in signature</span>'}
          ${sigOut ? `<div><img class="sig-img" src="${sigOut}" alt="Collection signature"><div class="muted">Collection, ${fmtDateTime(job.collectedAt)}</div></div>` : ''}
        </div></div>
      </div>
      <div class="stack">
        <div class="card"><div class="row"><h2 style="margin:0">Money</h2><span class="spacer"></span>
          ${!collected ? '<button class="btn small" id="j-quote">Change quote</button>' : ''}</div>
          <dl class="kv num" style="margin-top:12px">
            <dt>Quote</dt><dd>${job.jobType === 'warranty' ? 'No charge (warranty)' : job.quote === null ? 'After assessment' : money(job.quote)}${job.quoteNote ? ` <span class="muted">· ${esc(job.quoteNote)}</span>` : ''}</dd>
            <dt>Paid so far</dt><dd>${money(m$.paid)}</dd>
            ${!collected ? `<dt>Still to pay</dt><dd><b>${job.quote === null && job.jobType !== 'warranty' ? '—' : money(m$.due)}</b></dd>` : ''}
            ${repo.auth.isOwner() && m$.costs ? `<dt>Costs <span class="badge owner">owner</span></dt><dd>${money(m$.costs)} · profit ${money(m$.paid - m$.costs)}</dd>` : ''}
            ${collected ? `<dt>Warranty to</dt><dd>${job.warrantyUntil ? fmtDate(job.warrantyUntil) : '—'}</dd>
              <dt>Handed back</dt><dd>${fmtDateTime(job.collectedAt)} by ${esc(job.collectedByName || '')}</dd>` : ''}
            <dt>Ready by</dt><dd>${job.dueDate ? fmtDate(job.dueDate) : '—'}</dd>
            <dt>Return</dt><dd>${esc(collectionLabel(job.collection))}</dd>
          </dl>
          ${payments.length ? `<div style="overflow-x:auto;margin-top:12px"><table class="lines num"><tbody>
            ${payments.map(p => `<tr><td>${fmtDateTime(p.createdAt)}</td><td>${esc(repo.PAYMENT_KINDS[p.kind])}${p.kind === 'expense' ? ` · ${esc(p.category || 'Parts')}` : ` · ${esc(p.method)}`}</td>
              <td>${repo.isIn(p) ? '' : '−'}${money(p.amount)}</td>
              <td>${repo.auth.isOwner() ? `<button class="btn small ghost" data-rm-pay="${p.id}" aria-label="Remove entry">×</button>` : ''}</td></tr>`).join('')}
          </tbody></table></div>` : ''}
          ${quotes.length ? `<div class="list" style="margin-top:12px">${quotes.map(q => `<a class="list-row" href="#quote-${q.id}">
            <span class="grow"><b class="mono">${esc(q.quoteNo)}</b> · quote<div class="muted">${fmtDate(q.sentAt || q.createdAt)}</div></span>
            <b class="num">${money(q.total)}</b>${quotePill(q)}</a>`).join('')}</div>` : ''}
          <div class="row" style="margin-top:12px">
            <button class="btn small" data-pay="payment">+ Payment</button>
            <button class="btn small" data-pay="deposit">+ Deposit</button>
            <button class="btn small" data-pay="refund">Refund</button>
            <button class="btn small" data-pay="expense">+ Part cost</button>
          </div></div>
        <div class="card stack"><div class="row"><h2 style="margin:0">Tasks</h2><span class="spacer"></span>
          <button class="btn small" id="j-task-add">+ Task</button></div>
          ${tasks.length ? `<div class="list">${tasks.map(taskRow).join('')}</div>` : '<p class="muted" style="margin:0">No tasks. Add one to remember a call-back or a part to order.</p>'}
        </div>
        <div class="card stack"><h2 style="margin:0">Customer tracking</h2>
          ${repo.auth.cloud ? `<p class="muted" style="margin:0">The customer scans the QR on their job card to see the live status.</p>
            <div class="row" style="align-items:center"><div class="qr" id="j-qr"></div>
              <div class="stack" style="gap:8px;flex:1;min-width:0"><code class="track-link" id="j-track-url"></code>
                <button class="btn small" id="j-track-copy">Copy link</button></div></div>`
            : '<p class="muted" style="margin:0">Tracking links work once the cloud database is connected.</p>'}
          ${job.referral ? `<p class="muted" style="margin:0">Heard about us: ${esc(job.referral)}</p>` : ''}
        </div>
        <div class="card stack"><h2 style="margin:0">Add a note</h2>
          <textarea id="j-note" rows="3" placeholder="What you found, what you did, what the customer said…"></textarea>
          <div class="row"><span class="spacer"></span><button class="btn primary" id="j-note-add">Add note</button></div></div>
        <div class="card"><h2>History</h2>
          <ol class="timeline">${events.map(e => `<li class="${e.type === 'note' ? 'note' : ''}">
            <div>${esc(e.text)}</div><div class="when">${fmtDateTime(e.at)} · ${esc(e.staffName)}</div></li>`).join('')}</ol></div>
        ${repo.auth.isOwner() ? '<button class="btn danger" id="j-delete">Delete job (owner only)</button>' : ''}
      </div>
    </div>`;

  const reload = () => renderJob(view, id);

  // Phase 2: technician, urgent, parts & labour, work done, tracking, warranty, certificate
  const techSel = $('#j-tech', view);
  if (techSel) {
    repo.listStaff().then(staff => {
      techSel.insertAdjacentHTML('beforeend', staff.filter(s => s.active !== false || s.id === job.technicianId)
        .map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''));
      techSel.value = job.technicianId || '';
    });
    techSel.onchange = async () => { job = await repo.assignTech(job, techSel.value); toast(job.technicianName ? `Assigned to ${job.technicianName}` : 'Unassigned'); reload(); };
  }
  $('#j-urgent', view)?.addEventListener('change', async e => { job = await repo.setUrgent(job, e.target.checked); reload(); });
  $$('[data-rm-line]', view).forEach(b => b.onclick = async () => {
    job = await repo.removeLine(job, Number(b.dataset.rmLine)); reload();
  });
  $('#j-add-stock', view)?.addEventListener('click', () => stockModal(job, reload));
  // Phase 5: the parts & labour become a quote (Q-0001) the customer accepts online.
  $('#j-send-quote', view)?.addEventListener('click', async () => {
    try { const q = await repo.quoteFromJob(job); go('quote-' + q.id); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  $('#j-add-price', view)?.addEventListener('click', () => priceModal(job, reload));
  // Phase 3: money + tasks
  $$('[data-pay]', view).forEach(b => b.onclick = () => paymentModal(job, b.dataset.pay, m$, reload));
  $$('[data-rm-pay]', view).forEach(b => b.onclick = async () => {
    const p = payments.find(x => x.id === b.dataset.rmPay);
    if (await confirmBox(`Remove this ${repo.PAYMENT_KINDS[p.kind].toLowerCase()} of ${money(p.amount)}?`, { ok: 'Remove', danger: true })) {
      await repo.deletePayment(p, job); toast('Entry removed'); reload();
    }
  });
  $('#j-task-add', view).onclick = () => taskModal({ job }, reload);
  bindTaskRows(view, tasks, reload);
  $('#j-add-custom', view)?.addEventListener('click', () => lineModal(job, { name: '', qty: 1, price: '' }, reload));
  $('#j-workdone-save', view)?.addEventListener('click', async () => {
    job = await repo.setWorkDone(job, $('#j-workdone', view).value); toast('Work done saved');
  });
  $('#j-cert', view)?.addEventListener('click', () => printCompletion(job));
  $('#j-warranty', view)?.addEventListener('click', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const inWarranty = job.warrantyUntil && job.warrantyUntil >= today;
    if (!inWarranty && !(await confirmBox(job.warrantyUntil
      ? `Warranty ended on ${fmtDate(job.warrantyUntil)}. Book it in as a warranty return anyway?`
      : 'No warranty date was set on this job. Book it in as a warranty return anyway?', { ok: 'Yes, warranty return' }))) return;
    startWarrantyJob(job, customer);
  });
  if (repo.auth.cloud && $('#j-qr', view)) {
    repo.ensureTrackToken(job).then(j => {
      job = j;
      const url = repo.trackUrl(j);
      $('#j-track-url', view).textContent = url;
      $('#j-qr', view).innerHTML = qrSvg(url, 3);
      $('#j-track-copy', view).onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast('Tracking link copied'); }
        catch { toast('Select the link and copy it'); }
      };
    });
  }
  $$('[data-s]', view).forEach(b => b.onclick = async () => {
    job = await repo.setStatus(job, b.dataset.s);
    toast(`${job.jobNo}: ${statusLabel(job.status)}`);
    reload();
  });
  $('#j-wa', view).onclick = () => openWhatsApp(job);
  $('#j-print', view).onclick = () => printJobCard(job);
  $('#j-hand', view)?.addEventListener('click', () => handBack(job, reload));
  $('#j-pass', view)?.addEventListener('click', async () => {
    const code = await repo.getPasscode(job);
    const m = modal(`<h2>Passcode for ${esc(job.jobNo)}</h2>
      <div class="passcode-box">${esc(code || 'Not stored')}</div>
      <p class="muted" style="margin:0">Viewing is logged in the job history.</p>
      <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
    m.el.querySelector('[data-close]').addEventListener('click', reload);
  });
  $('#j-note-add', view).onclick = async () => {
    const t = $('#j-note', view).value;
    if (!t.trim()) return;
    await repo.addNote(job, t);
    toast('Note added');
    reload();
  };
  $('#j-photo', view).onchange = async e => {
    for (const f of e.target.files) await repo.addPhoto(job, await compressImage(f), 'During repair');
    toast('Photo added');
    reload();
  };
  $('#j-quote', view)?.addEventListener('click', () => {
    const m = modal(`<h2>Change quote</h2>
      <label class="field">New price (R) <span class="hint">leave empty for “after assessment”</span>
        <input type="number" id="m-q" inputmode="decimal" min="0" value="${job.quote ?? ''}"></label>
      <label class="field">Reason / what it covers<input type="text" id="m-qn" value="${esc(job.quoteNote || '')}"></label>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="m-save">Save quote</button></div>`);
    m.el.querySelector('#m-save').onclick = async () => {
      await repo.updateQuote(job, { quote: m.el.querySelector('#m-q').value, quoteNote: m.el.querySelector('#m-qn').value });
      m.close(); toast('Quote updated'); reload();
    };
  });
  $('#j-edit-dev', view)?.addEventListener('click', () => {
    const m = modal(`<h2>Edit device</h2>
      <label class="field">Model<input type="text" id="m-model" value="${esc(job.model)}"></label>
      <label class="field">Colour<input type="text" id="m-colour" value="${esc(job.colour || '')}"></label>
      <label class="field">IMEI / serial<input type="text" id="m-serial" value="${esc(job.serial || '')}"></label>
      <label class="field">Ready by<input type="date" id="m-due" value="${esc(job.dueDate || '')}"></label>
      <label class="field">Tech notes<textarea id="m-int" rows="2">${esc(job.internalNotes || '')}</textarea></label>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="m-save">Save</button></div>`);
    m.el.querySelector('#m-save').onclick = async () => {
      const v = s => m.el.querySelector(s).value;
      await repo.updateJobFields(job, { model: v('#m-model') || job.model, colour: v('#m-colour'), serial: v('#m-serial'),
        dueDate: v('#m-due'), internalNotes: v('#m-int') }, 'device details');
      m.close(); toast('Saved'); reload();
    };
  });
  $('#j-delete', view)?.addEventListener('click', async () => {
    if (!(await confirmBox(`Delete ${job.jobNo} for good? Photos, signatures and history are removed too.`, { ok: 'Delete job', danger: true }))) return;
    await repo.deleteJob(job);
    toast(`${job.jobNo} deleted`);
    go('jobs');
  });
}

// ───────────── Parts & labour ─────────────
// Website prices are matched to the job's model first (e.g. "iPhone 13 Pro" finds the iPhone 13 Pro repair list).
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Website price list search. Used by jobs and quotes; onLine({name, qty, price}) saves the chosen line.
export async function pickFromPriceList(model, onLine, okLabel = 'Add to job') {
  const items = await repo.priceList();
  const modelN = norm(model);
  // Best device match: the longest website device name the model starts with ("iPhone 13 Pro Max" ≠ "iPhone 13").
  const devices = [...new Set(items.map(it => norm(it.device)))];
  const best = devices.filter(d => modelN === d || modelN.startsWith(d + ' ')).sort((a, b) => b.length - a.length)[0];
  const m = modal(`
    <h2>Add from price list</h2>
    <input type="search" id="pl-q" placeholder="Search e.g. ${esc(model || 'iPhone 13')} screen" autocomplete="off">
    <div class="result-list" id="pl-list" style="max-height:52vh;overflow:auto"></div>
    <p class="muted" style="margin:0">Prices from your website (iassist.net.za). Items priced R0 there aren't listed.</p>
    <div class="modal-actions"><button class="btn" data-close>Close</button></div>`, { wide: true });
  const q = m.el.querySelector('#pl-q'), list = m.el.querySelector('#pl-list');
  const draw = () => {
    const words = norm(q.value).split(' ').filter(Boolean);
    let hits = items.filter(it => words.every(w => norm(`${it.device} ${it.item}`).includes(w)));
    if (!words.length) hits = best ? items.filter(it => norm(it.device) === best) : [];
    list.innerHTML = hits.slice(0, 60).map(it => `<button class="result" data-i="${items.indexOf(it)}">
        <span style="flex:1"><b>${esc(it.item)}</b><div class="meta">${esc(it.device)}</div></span><b class="num">${money(it.price)}</b></button>`).join('')
      || `<p class="muted">${words.length ? 'Nothing matches. Try fewer words, or add a custom line.' : model ? `No website prices for “${esc(model)}”. Search above, or add a custom line.` : 'Type to search the price list.'}</p>`;
    list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const it = items[Number(b.dataset.i)];
      m.close();
      editLineModal({ name: `${it.device}: ${it.item}`, qty: 1, price: it.price }, onLine, okLabel);
    });
  };
  q.oninput = draw;
  draw();
  q.focus();
}

export function editLineModal(line, onLine, okLabel = 'Add to job') {
  const m = modal(`
    <h2>${line.name ? 'Add line' : 'Add custom line'}</h2>
    <label class="field">Item<input type="text" id="ln-name" value="${esc(line.name)}" placeholder="e.g. Labour, Screen protector"></label>
    <div class="grid-2">
      <label class="field">Qty<input type="number" id="ln-qty" min="1" step="1" value="${esc(line.qty)}"></label>
      <label class="field">Price each (R)<input type="number" id="ln-price" min="0" step="0.01" inputmode="decimal" value="${esc(line.price)}"></label>
    </div>
    <p class="error-msg" id="ln-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ln-ok">${esc(okLabel)}</button></div>`);
  m.el.querySelector('#ln-ok').onclick = async () => {
    const name = m.el.querySelector('#ln-name').value.trim();
    const qty = Math.max(1, Math.round(Number(m.el.querySelector('#ln-qty').value) || 1));
    const price = Number(m.el.querySelector('#ln-price').value);
    const err = m.el.querySelector('#ln-err');
    if (!name) { err.textContent = 'Enter what the line is for.'; err.hidden = false; return; }
    if (!(price >= 0) || m.el.querySelector('#ln-price').value === '') { err.textContent = 'Enter a price (0 is fine for free items).'; err.hidden = false; return; }
    await onLine({ name, qty, price });
    m.close();
  };
}

const addJobLine = (job, after) => async l => {
  await repo.setLines(job, [...(job.lines || []), l], `Added ${l.qty} × ${l.name} @ R${l.price}`);
  toast('Line added'); after();
};
const priceModal = (job, after) => pickFromPriceList(job.model, addJobLine(job, after));
const lineModal = (job, line, after) => editLineModal(line, addJobLine(job, after));

// ───────────── Parts from stock ─────────────
async function stockModal(job, after) {
  const items = (await repo.listProducts()).filter(p => p.qty > 0);
  const m = modal(`
    <h2>Use a part from stock</h2>
    <input type="search" id="sk-q" placeholder="Search e.g. ${esc(job.model)} screen" autocomplete="off">
    <div class="result-list" id="sk-list" style="max-height:50vh;overflow:auto"></div>
    <div class="modal-actions"><button class="btn" data-close>Close</button></div>`, { wide: true });
  const q = m.el.querySelector('#sk-q'), list = m.el.querySelector('#sk-list');
  const model = norm(job.model);
  const draw = () => {
    const words = norm(q.value).split(' ').filter(Boolean);
    let hits = items.filter(p => words.every(w => norm(`${p.name} ${p.device || ''} ${p.category || ''} ${p.sku || ''}`).includes(w)));
    if (!words.length) hits.sort((a, b) => (norm(b.device || b.name).includes(model) ? 1 : 0) - (norm(a.device || a.name).includes(model) ? 1 : 0));
    list.innerHTML = hits.slice(0, 60).map(p => `<button class="result" data-p="${p.id}">
        <span style="flex:1"><b>${esc(p.name)}</b><div class="meta">${esc([p.device, p.category, `${p.qty} in stock`].filter(Boolean).join(' · '))}</div></span>
        <b class="num">${money(p.sellPrice)}</b></button>`).join('')
      || `<p class="muted">${items.length ? 'Nothing matches.' : 'Nothing in stock yet. Add parts on the Stock page.'}</p>`;
    list.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
      const p = items.find(x => x.id === b.dataset.p);
      try { await repo.useStock(job, p, 1); m.close(); toast(`${p.name} taken from stock`); after(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
  };
  q.oninput = draw; draw(); q.focus();
}

// ───────────── Money on a job ─────────────
function paymentModal(job, kind, m$, after) {
  const isCost = kind === 'expense';
  const suggested = kind === 'payment' ? (m$.due || '') : '';
  const m = modal(`
    <h2>${isCost ? 'Record a part cost' : `Add ${repo.PAYMENT_KINDS[kind].toLowerCase()}`} · ${esc(job.jobNo)}</h2>
    ${isCost ? '<p class="muted" style="margin:0">What the part or service cost the shop. Only the owner sees costs and profit.</p>' : ''}
    <div class="grid-2">
      <label class="field">Amount (R)<input type="number" id="pm-amt" inputmode="decimal" min="0" step="0.01" value="${esc(suggested)}"></label>
      ${isCost
        ? `<label class="field">Type<select id="pm-cat">${repo.EXPENSE_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>`
        : `<label class="field">Method<select id="pm-method">${repo.MONEY_METHODS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>`}
    </div>
    ${isCost ? `<label class="field">Paid with<select id="pm-method">${repo.MONEY_METHODS.map(c => `<option ${c === 'EFT' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
    <label class="field">Note <span class="hint">optional</span><input type="text" id="pm-note" placeholder="${isCost ? 'e.g. Screen from supplier' : kind === 'refund' ? 'Why the refund?' : ''}"></label>
    <p class="error-msg" id="pm-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pm-ok">Save</button></div>`);
  m.el.querySelector('#pm-ok').onclick = async () => {
    try {
      await repo.addPayment({ job, kind, amount: m.el.querySelector('#pm-amt').value, method: m.el.querySelector('#pm-method').value,
        category: m.el.querySelector('#pm-cat')?.value || '', note: m.el.querySelector('#pm-note').value });
      m.close(); toast('Saved'); after();
    } catch (ex) { const e = m.el.querySelector('#pm-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

// ───────────── Hand back ─────────────
async function handBack(job, after) {
  const s = await repo.getSettings();
  const m$ = repo.jobMoney(job, await repo.jobPayments(job.id));
  const balance = job.quote === null && job.jobType !== 'warranty' ? '' : m$.due;
  let method = '';
  const m = modal(`
    <h2>Hand back ${esc(job.jobNo)}</h2>
    ${job.status !== 'ready' ? `<p class="error-msg" style="margin:0">This job is still “${esc(statusLabel(job.status))}”. Only hand it back if the customer is collecting anyway.</p>` : ''}
    <dl class="kv num"><dt>Quote</dt><dd>${job.quote === null ? 'Not set' : money(job.quote)}</dd>
      <dt>Paid so far</dt><dd>${money(m$.paid)}</dd><dt>Still to pay</dt><dd><b>${balance === '' ? '—' : money(balance)}</b></dd></dl>
    <div class="field">Payment<div class="chips" id="pay">${PAY_METHODS.map(p => `<button class="chip" data-p="${p}">${p}</button>`).join('')}</div></div>
    <div class="grid-2">
      <label class="field">Amount paid now (R)<input type="number" id="h-amt" inputmode="decimal" min="0" value="${balance}"></label>
      <label class="field">Warranty (months)<input type="number" id="h-war" inputmode="numeric" min="0" value="${esc(s.warrantyMonths)}"></label>
    </div>
    <div class="sig-wrap"><canvas class="sig" id="h-sig" aria-label="Collection signature"></canvas>
      <div class="row"><span class="sig-line">${esc(job.customerName)} signs to confirm they got the device back</span><span class="spacer"></span>
        <button class="btn small" id="h-clear">Clear</button></div></div>
    <p class="muted" style="margin:0">The passcode is deleted when you confirm.</p>
    <p class="error-msg" id="h-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary big" id="h-ok">Confirm hand back</button></div>`, { wide: true });
  const pad = signaturePad(m.el.querySelector('#h-sig'));
  m.el.querySelector('#h-clear').onclick = () => pad.clear();
  m.el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    method = b.dataset.p;
    m.el.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b));
    if (method === 'No charge') m.el.querySelector('#h-amt').value = 0;
  });
  m.el.querySelector('#h-ok').onclick = async () => {
    const err = m.el.querySelector('#h-err');
    if (!method) { err.textContent = 'Choose how they paid (or “No charge”).'; err.hidden = false; return; }
    if (pad.isEmpty()) { err.textContent = 'The customer needs to sign for the device.'; err.hidden = false; return; }
    await repo.handBack(job, { method, amount: m.el.querySelector('#h-amt').value,
      warrantyMonths: m.el.querySelector('#h-war').value, signature: await pad.toBlob() });
    m.close();
    toast(`${job.jobNo} handed back`);
    after();
  };
}
