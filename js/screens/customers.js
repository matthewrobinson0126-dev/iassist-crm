// Customer list + customer page (details and every device they've brought in).
import * as repo from '../repo.js?v=20261107142533';
import { statusLabel } from '../repo.js?v=20261107142533';
import { $, $$, esc, fmtDate, toast } from '../ui.js?v=20261107142533';
import { go } from '../app.js?v=20261107142533';

let lastQ = '';

export async function renderCustomers(view) {
  view.innerHTML = `
    <div class="page-head"><h1>Customers</h1><span class="spacer"></span>
      <input type="search" id="c-search" placeholder="Search by name, phone or email" style="max-width:420px" autocomplete="off"></div>
    <div class="list" id="c-list"></div>`;
  const input = $('#c-search', view);
  input.value = lastQ;
  const draw = async () => {
    lastQ = input.value;
    const list = await repo.searchCustomers(lastQ);
    $('#c-list', view).innerHTML = list.length ? list.map(c => `
      <button class="list-row" data-id="${c.id}"><span class="avatar">${esc(c.name[0] || '?')}</span>
        <span class="grow"><b>${esc(c.name)}</b>${c.type === 'business' ? ` <span class="badge owner">${esc(c.companyName || 'Business')}</span>` : ''}<div class="muted">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</div></span>
        <span class="muted">${esc(c.area || '')}</span></button>`).join('')
      : `<div class="card empty">${lastQ ? 'No customers match that search.' : 'No customers yet. They’re added when you book in a device.'}</div>`;
    $$('.list-row', view).forEach(r => r.onclick = () => go('customer-' + r.dataset.id));
  };
  input.oninput = draw;
  draw();
}

export async function renderCustomer(view, id) {
  const c = await repo.getCustomer(id);
  if (!c) { view.innerHTML = '<div class="card empty"><h2>Customer not found</h2></div>'; return; }
  const jobs = await repo.jobsForCustomer(id);
  view.innerHTML = `
    <div class="page-head"><a href="#customers" class="btn small ghost">← Customers</a><h1>${esc(c.name)}</h1></div>
    <div class="job-layout">
      <form class="card stack" id="c-form"><h2 style="margin:0">Details</h2>
        <div class="grid-2">
          <label class="field">Full name<input type="text" id="cf-name" value="${esc(c.name)}" required></label>
          <label class="field">Cell number<input type="tel" id="cf-phone" value="${esc(c.phone)}" required></label>
          <label class="field">Email<input type="email" id="cf-email" value="${esc(c.email || '')}"></label>
          <label class="field">Area / suburb<input type="text" id="cf-area" value="${esc(c.area || '')}"></label>
          <label class="field">Customer type<select id="cf-type"><option value="individual">Individual</option><option value="business" ${c.type === 'business' ? 'selected' : ''}>Business</option></select></label>
        </div>
        <div class="grid-2" id="cf-biz" ${c.type === 'business' ? '' : 'hidden'}>
          <label class="field">Company name<input type="text" id="cf-company" value="${esc(c.companyName || '')}"></label>
          <label class="field">VAT number<input type="text" id="cf-vat" value="${esc(c.vatNumber || '')}"></label>
          <label class="field">Contact person<input type="text" id="cf-contact" value="${esc(c.contactPerson || '')}"></label>
          <label class="field">Billing address<input type="text" id="cf-address" value="${esc(c.address || '')}"></label>
        </div>
        <label class="field">Notes<textarea id="cf-notes" rows="3">${esc(c.notes || '')}</textarea></label>
        <p class="error-msg" id="cf-err" hidden></p>
        <div class="row"><span class="muted">Customer since ${fmtDate(c.createdAt)}</span><span class="spacer"></span>
          <button class="btn primary" type="submit">Save changes</button></div>
      </form>
      <div class="card stack"><h2 style="margin:0">Devices (${jobs.length})</h2>
        <div class="list">${jobs.map(j => `<button class="list-row" data-job="${j.id}">
          <span class="grow"><b class="mono">${esc(j.jobNo)}</b> · ${esc(j.model)}<div class="muted">${esc((j.faults || []).join(', '))} · ${fmtDate(j.createdAt)}</div></span>
          <span class="pill" style="--sc:var(--s-${j.status})">${esc(statusLabel(j.status))}</span></button>`).join('') || '<p class="muted">No jobs yet.</p>'}</div>
      </div>
    </div>`;
  $$('[data-job]', view).forEach(r => r.onclick = () => go('job-' + r.dataset.job));
  $('#cf-type', view).onchange = e => { $('#cf-biz', view).hidden = e.target.value !== 'business'; };
  $('#c-form', view).onsubmit = async e => {
    e.preventDefault();
    const v = s => $(s, view).value;
    try {
      await repo.saveCustomer({ ...c, name: v('#cf-name'), phone: v('#cf-phone'), email: v('#cf-email'), area: v('#cf-area'), notes: v('#cf-notes'),
        type: v('#cf-type'), companyName: v('#cf-company'), vatNumber: v('#cf-vat'), contactPerson: v('#cf-contact'), address: v('#cf-address') });
      toast('Customer saved');
      renderCustomer(view, id);
    } catch (ex) { const err = $('#cf-err', view); err.textContent = ex.message; err.hidden = false; }
  };
}
