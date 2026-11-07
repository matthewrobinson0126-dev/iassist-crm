// Owner-only settings: staff logins, shop details, terms, demo data, backup.
import * as repo from '../repo.js?v=20261107113203';
import { $, $$, esc, initials, toast, modal, confirmBox } from '../ui.js?v=20261107113203';
import { go } from '../app.js?v=20261107113203';

export async function renderSettings(view) {
  if (!repo.auth.isOwner()) { view.innerHTML = '<div class="card empty"><h2>Only the owner can open Settings</h2></div>'; return; }
  const [staff, s] = await Promise.all([repo.listStaff(), repo.getSettings()]);
  view.innerHTML = `
    <div class="page-head"><h1>Settings</h1></div>
    <div class="settings-grid">
      <div class="card stack"><div class="row"><h2 style="margin:0">Staff logins</h2><span class="spacer"></span>
        <button class="btn primary small" id="st-add">+ Add staff</button></div>
        <p class="muted" style="margin:0">Each person signs in with their own 4-digit PIN. Staff can book in, update and hand back jobs. Only owners can open Settings or delete jobs.</p>
        <div class="list">${staff.map(p => `<button class="list-row" data-staff="${p.id}">
          <span class="avatar">${esc(initials(p.name))}</span><span class="grow"><b>${esc(p.name)}</b>${p.id === repo.auth.user.id ? ' <span class="muted">(you)</span>' : ''}</span>
          ${p.commissionPct ? `<span class="muted">${p.commissionPct}%</span>` : ''}<span class="badge ${p.role === 'owner' ? 'owner' : ''}">${p.role}</span>${p.active ? '' : '<span class="badge off">Off</span>'}</button>`).join('')}</div>
      </div>
      <form class="card stack" id="shop-form"><h2 style="margin:0">Shop details</h2>
        <label class="field">Shop name<input type="text" id="sh-name" value="${esc(s.shopName)}"></label>
        <label class="field">Address<input type="text" id="sh-addr" value="${esc(s.address)}"></label>
        <div class="grid-2">
          <label class="field">Phone<input type="tel" id="sh-phone" value="${esc(s.phone)}"></label>
          <label class="field">Email<input type="email" id="sh-email" value="${esc(s.email)}"></label>
          <label class="field">Opening hours <span class="hint">shown on the tracking page + emails</span><input type="text" id="sh-hours" value="${esc(s.hours || '')}" placeholder="e.g. Mon–Fri 9:00–17:30, Sat 9:00–13:00"></label>
          <label class="field">Google review link <span class="hint">sent after collection</span><input type="url" id="sh-review" value="${esc(s.googleReviewUrl || '')}" placeholder="https://g.page/r/…/review"></label>
          <label class="field">Default warranty (months)<input type="number" id="sh-war" min="0" value="${esc(s.warrantyMonths)}"></label>
          <label class="field">Auto-lock after (minutes)<input type="number" id="sh-idle" min="1" max="120" value="${esc(s.idleLockMinutes)}"></label>
        </div>
        <label class="check"><input type="checkbox" id="sh-email-on" ${s.emailEnabled === false ? '' : 'checked'}> Email customers automatically (booked, quote, waiting for parts, ready, review request)</label>
        ${repo.auth.cloud ? `<div class="row"><input type="email" id="sh-test-to" placeholder="Send a test email to…" style="max-width:300px">
          <button class="btn" type="button" id="sh-test">Send test email</button></div>` : ''}
        <label class="field">Terms the customer signs<span class="hint">Shown at book-in and printed on the job card. Each job keeps the version that was signed.</span>
          <textarea id="sh-terms" rows="9">${esc(s.terms)}</textarea></label>
        <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Save shop details</button></div>
      </form>
      ${repo.auth.cloud ? `<div class="card stack"><h2 style="margin:0">This device</h2>
        ${repo.auth.deviceRegistered()
          ? '<p class="muted" style="margin:0">This is a registered shop iPad: staff sign in here with their PIN.</p>'
          : `<p class="muted" style="margin:0">Not a shop iPad: only the owner’s email sign-in works here. Register it to show the staff PIN screen.</p>
             <div class="row"><input type="text" id="dev-name" value="Counter iPad" style="max-width:260px"><button class="btn primary" id="dev-reg">Register as shop iPad</button></div>`}
      </div>` : ''}
      <div class="card stack"><h2 style="margin:0">Practice data</h2>
        <p class="muted" style="margin:0">Load 5 demo jobs to try the board, then remove them before going live. Demo customers are named “Demo – …”.</p>
        <div class="row"><button class="btn" id="demo-load">Load demo jobs</button><button class="btn" id="demo-clear">Remove demo data</button></div>
      </div>
      <div class="card stack"><h2 style="margin:0">Backup</h2>
        <p class="muted" style="margin:0">Downloads customers, jobs and history as a file (photos not included). In demo mode, everything is stored on this iPad only.</p>
        <div class="row"><button class="btn" id="backup">Download backup</button></div>
      </div>
    </div>`;

  $('#st-add', view).onclick = () => staffModal(null, view);
  $$('[data-staff]', view).forEach(r => r.onclick = () => staffModal(staff.find(p => p.id === r.dataset.staff), view));
  $('#shop-form', view).onsubmit = async e => {
    e.preventDefault();
    const v = q => $(q, view).value;
    await repo.saveSettings({ shopName: v('#sh-name'), address: v('#sh-addr'), phone: v('#sh-phone'), email: v('#sh-email'),
      warrantyMonths: v('#sh-war'), hours: v('#sh-hours'), googleReviewUrl: v('#sh-review').trim(),
      emailEnabled: $('#sh-email-on', view).checked, idleLockMinutes: Math.max(1, Number(v('#sh-idle')) || 10), terms: v('#sh-terms') });
    toast('Shop details saved');
  };
  $('#dev-reg', view)?.addEventListener('click', async () => {
    await repo.auth.registerDevice($('#dev-name', view).value);
    toast('Registered as a shop iPad');
    renderSettings(view);
  });
  $('#sh-test', view)?.addEventListener('click', async () => {
    const r = await repo.sendTestEmail($('#sh-test-to', view).value.trim());
    toast(r.sent ? `Test email sent to ${r.to}` : r.skipped ? `Not sent: ${r.skipped}` : `Failed: ${r.error}`, r.sent ? '' : 'error');
  });
  $('#demo-load', view).onclick = async () => { await repo.loadDemoData(); toast('Demo jobs loaded'); go('jobs'); };
  $('#demo-clear', view).onclick = async () => {
    if (!(await confirmBox('Remove all demo customers and demo jobs?', { ok: 'Remove demo data', danger: true }))) return;
    await repo.removeDemoData(); toast('Demo data removed');
  };
  $('#backup', view).onclick = async () => {
    const blob = new Blob([await repo.exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `iassist-crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
}

function staffModal(person, view) {
  const isNew = !person;
  const m = modal(`
    <h2>${isNew ? 'Add staff member' : `Edit ${esc(person.name)}`}</h2>
    <label class="field">Name<input type="text" id="sm-name" value="${esc(person?.name || '')}"></label>
    <div class="field">Role<div class="seg" id="sm-role">
      <button type="button" data-r="staff">Staff</button><button type="button" data-r="owner">Owner</button></div></div>
    <label class="field">${isNew ? '4-digit PIN' : 'New PIN'} ${isNew ? '' : '<span class="hint">leave empty to keep the current PIN</span>'}
      <input type="password" id="sm-pin" inputmode="numeric" maxlength="4"></label>
    <label class="field">Commission (% of job profit) <span class="hint">used in Reports; 0 = none</span>
      <input type="number" id="sm-comm" min="0" max="100" step="0.5" value="${esc(person?.commissionPct ?? 0)}"></label>
    ${!isNew ? `<label class="check"><input type="checkbox" id="sm-active" ${person.active ? 'checked' : ''}> Can sign in</label>` : ''}
    <p class="error-msg" id="sm-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sm-save">${isNew ? 'Add staff member' : 'Save'}</button></div>`);
  let role = person?.role || 'staff';
  const paint = () => m.el.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('on', b.dataset.r === role));
  m.el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { role = b.dataset.r; paint(); });
  paint();
  m.el.querySelector('#sm-save').onclick = async () => {
    const name = m.el.querySelector('#sm-name').value, pin = m.el.querySelector('#sm-pin').value;
    const commissionPct = Number(m.el.querySelector('#sm-comm').value) || 0;
    try {
      if (isNew) await repo.createStaff({ name, role, pin, commissionPct });
      else await repo.updateStaff(person.id, { name, role, pin, commissionPct, active: m.el.querySelector('#sm-active').checked });
      m.close();
      toast(isNew ? `${name} added` : 'Saved');
      // Your own role may have changed: rebuild the shell via the router.
      if (!isNew && person.id === repo.auth.user.id) go('settings'); else renderSettings(view);
    } catch (ex) { const err = m.el.querySelector('#sm-err'); err.textContent = ex.message; err.hidden = false; }
  };
}
