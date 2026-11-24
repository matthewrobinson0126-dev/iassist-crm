// Book a device in, step by step. The draft survives switching screens until it is booked or cleared.
import * as repo from '../repo.js?v=20261124204956';
import { $, $$, esc, money, toast, signaturePad, compressImage, getPath, setPath, uid, confirmBox, modal } from '../ui.js?v=20261124204956';
import { DEVICE_TYPES, deviceType, DAMAGE, ACCESSORIES, COLLECTION, collectionLabel, REFERRALS, JOB_TYPES, jobTypeLabel, HISTORY, CONTACT_PREFS } from '../devices.js?v=20261124204956';
import { printJobCard, printLabel } from '../print.js?v=20261124204956';
import { openWhatsApp } from '../messages.js?v=20261124204956';
import { go } from '../app.js?v=20261124204956';

const STEPS = ['Customer', 'Device', 'Fault', 'Condition', 'Quote', 'Sign'];
let draft = null;
let pad = null;

const newDraft = () => ({
  step: 0, maxStep: 0, customer: null, newCustomer: { name: '', phone: '', whatsapp: '', email: '', area: '' }, search: '',
  waChoice: '', waNumber: '', deviceType: '', model: '', modelOther: false, colour: '', serial: '', powersOn: 'Yes',
  faults: [], faultNotes: '', history: [], contactPref: '', damage: [], conditionNotes: '', photos: [], accessories: [],
  passcode: '', quoteMode: 'assess', quote: '', quoteNote: '', deposit: '', dueDate: '', collection: 'store',
  internalNotes: '', accepted: false, startedBy: repo.auth.user?.name,
  depositMethod: 'Cash', referral: '', urgent: false, technicianId: '', technicianName: '', jobType: 'paid', warrantyOf: null, warrantyOfNo: '',
});

// True once anything has been entered, so an app update never wipes a booking that's under way.
export function bookingInProgress() {
  if (!draft) return false;
  const nc = draft.newCustomer || {};
  return !!(draft.customerMode || draft.step > 0 || draft.customer || nc.name || nc.phone || draft.deviceType || draft.faultNotes);
}

export async function renderBookIn(view) {
  if (!draft) draft = newDraft();
  draw(view);
}

// Warranty return: same customer + device as the original repair, linked to it, no charge.
export function startWarrantyJob(job, customer) {
  draft = { ...newDraft(), customer, deviceType: job.deviceType, model: job.model, colour: job.colour || '',
    serial: job.serial || '', jobType: 'warranty', warrantyOf: job.id, warrantyOfNo: job.jobNo,
    referral: 'Returning customer', faultNotes: `Warranty return for ${job.jobNo} (${(job.faults || []).join(', ')})`, step: 2, maxStep: 2 };
  go('bookin');
}

// New insurance job from the Insurance tab: book-in with the job type already set.
// Switching between the two keeps anything already typed (customer, device…).
export function startInsuranceJob() {
  if (draft && bookingInProgress()) { draft.jobType = 'insurance'; draft.quoteMode = 'assess'; }
  else draft = { ...newDraft(), jobType: 'insurance', quoteMode: 'assess' };
  go('bookin');
}

// "+ Book in": a normal walk-in repair. Turns an insurance booking back into a repair.
export function startRepairJob() {
  if (!draft) draft = newDraft();
  else if (draft.jobType === 'insurance') draft.jobType = 'paid';
  go('bookin');
}

// Booking in from a quote: customer, device and the quoted price carry over; the quote lines go onto the job.
export function startQuoteJob(q, customer) {
  draft = { ...newDraft(), customer, deviceType: q.deviceType || '', model: q.model || '', faultNotes: q.fault || '',
    quoteMode: 'fixed', quote: String(q.total), quoteNote: `Quote ${q.quoteNo}`, quoteId: q.id, quoteNo: q.quoteNo,
    referral: 'Quote', step: 1, maxStep: 1 };
  go('bookin');
}

function draw(view) {
  document.body.classList.toggle('kiosk', !!draft.customerMode);
  // Light up the button for the kind of book-in you're doing: + Book in, or + Insurance.
  const ins = draft.jobType === 'insurance';
  document.querySelector('[data-nav="bookin"]')?.classList.toggle('here', !ins);
  document.querySelector('#nav-ins-new')?.classList.toggle('here', ins);
  if (draft.customerMode) return drawCustomerMode(view);
  view.innerHTML = `
    <div class="wizard">
      ${draft.jobType === 'insurance'
        ? '<div class="mode-banner ins"><span>INSURANCE REPORT BOOK-IN</span><button type="button" class="btn small" id="switch-type">Switch to repair book-in</button></div>'
        : `<div class="mode-banner"><span>REPAIR BOOK-IN</span>${draft.jobType === 'paid' ? '<button type="button" class="btn small" id="switch-type">Switch to insurance report</button>' : ''}</div>`}
      <div class="page-head"><h1>${draft.jobType === 'insurance' ? 'Book in a device for an insurance report' : 'Book in a device'}</h1>${draft.quoteNo ? `<span class="tag">From quote ${esc(draft.quoteNo)}</span>` : ''}<span class="spacer"></span>
        ${draft.step === 0 ? '<button class="btn small primary" id="to-customer">Hand to customer</button>' : ''}
        <button class="btn small ghost" id="restart">Start over</button></div>
      <ol class="steps">${STEPS.map((s, i) => {
        const reach = i <= (draft.maxStep || 0) && i !== draft.step;
        return `<li class="${i === draft.step ? 'on' : i <= (draft.maxStep || 0) ? 'done' : ''}">${reach
          ? `<button type="button" data-goto="${i}" title="Go back to ${s}"><b>${i + 1}</b>${s}</button>`
          : `<span><b>${i + 1}</b>${s}</span>`}</li>`; }).join('')}</ol>
      <section class="step-body" id="step"></section>
      <p class="error-msg" id="step-err" hidden></p>
      <footer class="wizard-nav">${draft.step === STEPS.length - 1
        ? `<button class="btn primary big" id="next">Book in device</button><span class="spacer"></span><button class="btn big" id="back">Back</button>`
        : `<button class="btn big" id="back" ${draft.step === 0 ? 'disabled' : ''}>Back</button><span class="spacer"></span><button class="btn primary big" id="next">Next</button>`}
      </footer>
    </div>`;
  const body = $('#step', view);
  pad = null;
  STEP_VIEWS[draft.step](body, view);
  bind(body, view);
  $('#back', view).onclick = () => { draft.step--; draw(view); };
  // Tap any step you've already reached to jump straight to it and fix a mistake.
  $$('[data-goto]', view).forEach(b => b.onclick = async () => {
    const to = Number(b.dataset.goto);
    if (to > draft.step) { // going forward again: the current step must still be filled in properly
      const err = $('#step-err', view);
      const problem = await STEP_CHECKS[draft.step](view);
      if (problem) { err.textContent = problem; err.hidden = false; return; }
    }
    draft.step = to; draw(view);
  });
  $('#next', view).onclick = () => next(view);
  $('#to-customer', view)?.addEventListener('click', () => { draft.customerMode = true; draw(view); });
  $('#switch-type', view)?.addEventListener('click', () => {
    if (draft.jobType === 'insurance') draft.jobType = 'paid'; else { draft.jobType = 'insurance'; draft.quoteMode = 'assess'; }
    draw(view);
  });
  $('#restart', view).onclick = async () => {
    if (await confirmBox('Clear this booking and start again?', { ok: 'Start over', danger: true })) {
      draft.photos.forEach(p => URL.revokeObjectURL(p.url));
      const wasIns = draft.jobType === 'insurance';
      draft = newDraft(); if (wasIns) draft.jobType = 'insurance';
      draw(view);
    }
  };
}

async function next(view) {
  const err = $('#step-err', view);
  err.hidden = true;
  const problem = await STEP_CHECKS[draft.step](view);
  if (problem) { err.textContent = problem; err.hidden = false; return; }
  if (draft.step < STEPS.length - 1) { draft.step++; draft.maxStep = Math.max(draft.maxStep || 0, draft.step); draw(view); return; }
  // Final step: re-check every earlier step, in case something was changed after jumping back.
  for (let i = 0; i < STEPS.length - 1; i++) {
    const p = await STEP_CHECKS[i](view);
    if (p) { draft.step = i; draw(view); const e = $('#step-err', view); e.textContent = p; e.hidden = false; return; }
  }
  // Save the job.
  const btn = $('#next', view);
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const job = await repo.createJob({ ...draft, signature: draft.customerSignature || await pad.toBlob() });
    draft.photos.forEach(p => URL.revokeObjectURL(p.url));
    draft = null;
    done(view, job);
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Book in device';
  }
}

// Wire inputs (data-bind), chips (data-chip) and segmented buttons (data-seg) to the draft.
function bind(root, view) {
  $$('[data-bind]', root).forEach(el => {
    const path = el.dataset.bind;
    const v = getPath(draft, path);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () =>
      setPath(draft, path, el.type === 'checkbox' ? el.checked : el.value));
  });
  const paintChips = key => $$(`[data-chip="${key}"]`, root).forEach(c => {
    const on = draft[key].includes(c.dataset.value);
    c.classList.toggle('on', on); c.setAttribute('aria-pressed', on);
  });
  const keys = new Set($$('[data-chip]', root).map(c => c.dataset.chip));
  keys.forEach(paintChips);
  $$('[data-chip]', root).forEach(c => c.onclick = () => {
    const key = c.dataset.chip, val = c.dataset.value, arr = draft[key];
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1);
    else {
      const exclusive = $(`[data-chip="${key}"][data-exclusive]`, root)?.dataset.value;
      if (val === exclusive) arr.length = 0;
      else if (exclusive && arr.includes(exclusive)) arr.splice(arr.indexOf(exclusive), 1);
      arr.push(val);
    }
    paintChips(key);
  });
  $$('[data-seg]', root).forEach(b => {
    b.classList.toggle('on', draft[b.dataset.seg] === b.dataset.value);
    b.onclick = () => { draft[b.dataset.seg] = b.dataset.value; draw(view); };
  });
}

// ───────────── Hand to customer ─────────────
// The customer fills in their own details, passcode and signature on the iPad; the menu is hidden meanwhile.
// "Done" hands it back to staff, who carry on from the Device step. Nothing is saved until the job is booked in.
function drawCustomerMode(view) {
  const c = draft.customer;
  view.innerHTML = `
    <div class="kiosk-wrap">
      <div class="kiosk-head"><img src="icons/icon.svg" alt="">
        <div><h1 id="k-title" style="margin:0">Welcome</h1>
          <p class="muted" style="margin:2px 0 0">Please fill in your details, read our terms and sign below. Then hand the iPad back to us.</p></div></div>
      <div class="card stack"><h2 style="margin:0">Your details</h2>
        ${c ? `<p style="margin:0">Hi <b>${esc(c.name)}</b>, we already have your details (${esc(c.phone)}).</p>`
          : `<div class="grid-2">
          <label class="field">Full name<input type="text" data-bind="newCustomer.name" autocomplete="name" autocapitalize="words"></label>
          <label class="field">Cell number<input type="tel" data-bind="newCustomer.phone" inputmode="tel" autocomplete="tel" placeholder="082 123 4567"></label>
          <label class="field">Email <span class="hint">for repair updates and collection reminders</span><input type="email" id="k-email" data-bind="newCustomer.email" autocomplete="email" autocapitalize="off"></label>
          <label class="field">Suburb <span class="hint">optional</span><input type="text" data-bind="newCustomer.area" autocomplete="address-level2"></label>
        </div>
        <label class="check"><input type="checkbox" id="k-noemail" data-bind="newCustomer.noEmail"> I don’t use email: please contact me on WhatsApp</label>`}
      </div>
      <div class="card stack"><h2 style="margin:0">Your WhatsApp number</h2>
        <p class="muted" style="margin:0">Is your WhatsApp on the same number as your cell number?</p>
        <div class="seg" id="k-wa">${[['same', 'Same as my cell number'], ['other', 'A different number'], ['none', 'I don’t use WhatsApp']].map(([id, l]) => `<button type="button" data-wa="${id}">${l}</button>`).join('')}</div>
        <label class="field" id="k-wa-box" ${draft.waChoice === 'other' ? '' : 'hidden'}>WhatsApp number<input type="tel" id="k-wa-num" data-bind="waNumber" inputmode="tel" autocomplete="off" placeholder="e.g. 072 123 4567" style="max-width:320px"></label>
      </div>
      <div class="card stack"><h2 style="margin:0">How should we contact you?</h2>
        <p class="muted" style="margin:0">For your quote, updates and when your device is ready.</p>
        <div class="seg" id="k-cp">${CONTACT_PREFS.map(p => `<button type="button" data-cp="${p.id}">${esc(p.label)}</button>`).join('')}</div>
      </div>
      <div class="card stack"><h2 style="margin:0">What’s wrong with your device?</h2>
        <textarea data-bind="faultNotes" rows="3" placeholder="In your own words: what happened and when it started"></textarea>
        <div class="field">Has any of this happened to it? <span class="hint">tap all that apply</span>
          <div class="chips">${HISTORY.map(h => chip('history', h)).join('')}</div></div>
      </div>
      <div class="card stack"><h2 style="margin:0">Your device passcode</h2>
        <p style="margin:0">We need your passcode to test your device before and after the repair, and to check our work. We only use it for testing, keep it hidden, and delete it when you collect your device.</p>
        <label class="field">Passcode<input type="password" id="k-pass" data-bind="passcode" autocomplete="off" inputmode="text"></label>
        <label class="check"><input type="checkbox" data-bind="passcodeNoLock"> My device doesn’t have a passcode</label>
        <label class="check"><input type="checkbox" id="k-declined" data-bind="passcodeDeclined"> I’d rather not share my passcode</label>
        <p class="note-box" id="k-declined-note" ${draft.passcodeDeclined ? '' : 'hidden'}>We understand. If your device has private or confidential information, you have the right to keep it private (POPIA). Without your passcode we can’t fully test or quality-check your device, so we can only check what works without unlocking it, and we can’t be held responsible for faults we were unable to test.</p>
      </div>
      <div class="card stack"><h2 style="margin:0">How did you hear about us? <span class="muted" style="font-weight:400">optional</span></h2>
        <div class="seg" id="k-ref">${REFERRALS.map(r => `<button type="button" data-ref="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      </div>
      <div class="card stack"><h2 style="margin:0">Our terms</h2>
        <div class="terms" id="k-terms">Loading…</div>
        <label class="check"><input type="checkbox" data-bind="accepted"> I have read and accept the terms</label>
        <label class="check"><input type="checkbox" data-bind="acceptedImportant"> I specifically accept the clauses marked IMPORTANT: the assessment fee, lost data, repair risks, liquid damage and uncollected devices</label>
        <div class="sig-wrap">
          <canvas class="sig" id="k-sig" aria-label="Your signature"></canvas>
          <div class="row"><span class="sig-line">Sign above with your finger</span><span class="spacer"></span>
            <button class="btn small" type="button" id="k-sig-clear">Clear</button></div>
        </div>
      </div>
      <p class="error-msg" id="k-err" hidden></p>
      <div class="row kiosk-actions">
        <button class="btn ghost" type="button" id="k-cancel">Back to staff</button><span class="spacer"></span>
        <button class="btn primary big" type="button" id="k-done">Done: hand back to staff</button>
      </div>
    </div>`;
  bind(view, view);
  repo.getSettings().then(s => {
    const t = $('#k-terms', view); if (t) t.textContent = s.terms;
    const h = $('#k-title', view); if (h) h.textContent = `Welcome to ${s.shopName}`;
  });
  $('#k-declined', view).addEventListener('change', e => { $('#k-declined-note', view).hidden = !e.target.checked; });
  if (!draft.contactPref && draft.customer?.contactPref) draft.contactPref = draft.customer.contactPref;
  const paintCp = () => $$('[data-cp]', view).forEach(b => b.classList.toggle('on', draft.contactPref === b.dataset.cp));
  $$('[data-cp]', view).forEach(b => b.onclick = () => { draft.contactPref = b.dataset.cp; paintCp(); });
  paintCp();
  $('#k-noemail', view)?.addEventListener('change', e => {
    if (e.target.checked) { draft.contactPref = 'whatsapp'; paintCp(); }
  });
  // Returning customer: start from what we already know about their WhatsApp.
  if (c && draft.waFor !== c.id) {
    draft.waFor = c.id; draft.waChoice = ''; draft.waNumber = '';
    if (c.noWhatsapp) draft.waChoice = 'none';
    else if (c.whatsapp && repo.digits(c.whatsapp) !== repo.digits(c.phone)) { draft.waChoice = 'other'; draft.waNumber = c.whatsapp; }
    else if (c.whatsapp) draft.waChoice = 'same';
    if (draft.waChoice) { $('#k-wa-box', view).hidden = draft.waChoice !== 'other'; $('#k-wa-num', view).value = draft.waNumber || ''; }
  }
  const paintWa = () => $$('[data-wa]', view).forEach(b => b.classList.toggle('on', draft.waChoice === b.dataset.wa));
  $$('[data-wa]', view).forEach(b => b.onclick = () => {
    draft.waChoice = b.dataset.wa;
    $('#k-wa-box', view).hidden = b.dataset.wa !== 'other';
    if (b.dataset.wa === 'other') $('#k-wa-num', view).focus();
    if (b.dataset.wa === 'none' && draft.contactPref === 'whatsapp') { draft.contactPref = ''; paintCp(); }
    paintWa();
  });
  paintWa();
  const paintRef = () => $$('[data-ref]', view).forEach(b => b.classList.toggle('on', draft.referral === b.dataset.ref));
  $$('[data-ref]', view).forEach(b => b.onclick = () => { draft.referral = draft.referral === b.dataset.ref ? '' : b.dataset.ref; paintRef(); });
  paintRef();
  let kpad = null;
  requestAnimationFrame(() => {
    kpad = signaturePad($('#k-sig', view));
    $('#k-sig-clear', view).onclick = () => kpad.clear();
  });
  const err = msg => { const e = $('#k-err', view); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  $('#k-cancel', view).onclick = async () => { if (await staffPin()) { draft.customerMode = false; draw(view); } };
  $('#k-done', view).onclick = async () => {
    err('');
    const nc = draft.newCustomer;
    if (!draft.customer) {
      if (!nc.name.trim()) return err('Please enter your name.');
      if (repo.digits(nc.phone).length < 9) return err('Please enter your cell number.');
      if (!nc.noEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(nc.email || '').trim()))
        return err('Please enter your email address, or tick “I don’t use email”.');
    }
    if (!draft.waChoice) return err('Please tell us your WhatsApp number: same as your cell, a different number, or you don’t use WhatsApp.');
    if (draft.waChoice === 'other' && repo.digits(draft.waNumber).length < 9) return err('Please enter your WhatsApp number.');
    if (!draft.contactPref) return err('Please choose how we should contact you.');
    if (draft.contactPref === 'whatsapp' && draft.waChoice === 'none')
      return err('You said you don’t use WhatsApp. Please choose a phone call or email.');
    if (draft.contactPref === 'email' && (draft.customer ? !draft.customer.email : nc.noEmail))
      return err('You chose email, but we don’t have an email address for you. Please choose WhatsApp or a phone call.');
    if (!String(draft.passcode || '').trim() && !draft.passcodeNoLock && !draft.passcodeDeclined)
      return err('Please enter your device passcode, or tick one of the boxes below it.');
    if (!draft.accepted) return err('Please tick the box to accept the terms.');
    if (!draft.acceptedImportant) return err('Please also tick the box to accept the clauses marked IMPORTANT.');
    if (!kpad || kpad.isEmpty()) return err('Please sign in the box above.');
    if (!(await staffPin())) return;
    draft.customerSignature = await kpad.toBlob();
    // Same number: store the cell as the WhatsApp number, so staff can see it was confirmed.
    const waFor = phone => ({ whatsapp: draft.waChoice === 'same' ? String(phone).trim() : draft.waChoice === 'other' ? String(draft.waNumber).trim() : '',
      noWhatsapp: draft.waChoice === 'none' });
    if (!draft.customer) { nc.contactPref = draft.contactPref; if (nc.noEmail) nc.email = ''; Object.assign(nc, waFor(nc.phone)); }
    let note = 'Customer details saved. Carry on with the device.';
    if (!draft.customer) {
      const existing = await repo.findByPhone(nc.phone);
      if (existing) { draft.customer = existing; note = `Returning customer: ${existing.name}. Carry on with the device.`; }
    }
    // Returning customer: keep their WhatsApp answer on their record.
    if (draft.customer) {
      const wa = waFor(draft.customer.phone);
      if (wa.whatsapp !== (draft.customer.whatsapp || '') || wa.noWhatsapp !== !!draft.customer.noWhatsapp)
        draft.customer = await repo.saveCustomer({ ...draft.customer, ...wa });
    }
    draft.customerMode = false;
    draft.step = Math.max(draft.step, 1);
    draft.maxStep = Math.max(draft.maxStep || 0, draft.step);
    draw(view);
    window.scrollTo(0, 0);
    toast(note);
  };
}

// A staff PIN is needed to leave the customer screen, so customers can't open the jobs board or other customers.
function staffPin() {
  return new Promise(resolve => {
    const m = modal(`<h2>Staff PIN</h2>
      <p class="muted" style="margin:0">Hand the iPad back to staff. Any staff member’s PIN unlocks it.</p>
      <input type="password" id="sp-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" style="font-size:28px;letter-spacing:.5em;text-align:center">
      <p class="error-msg" id="sp-err" hidden></p>
      <div class="modal-actions"><button class="btn" id="sp-cancel">Cancel</button><button class="btn primary" id="sp-ok">Unlock</button></div>`);
    const input = m.el.querySelector('#sp-pin'), errEl = m.el.querySelector('#sp-err');
    const done = ok => { m.close(); resolve(ok); };
    const go = async () => {
      errEl.hidden = true;
      try {
        const who = await repo.verifyStaffPin(input.value);
        if (who) { toast(`Unlocked by ${who}`); return done(true); }
        errEl.textContent = 'Wrong PIN. Try again.';
      } catch (ex) { errEl.textContent = ex.message; }
      errEl.hidden = false; input.value = ''; input.focus();
    };
    m.el.querySelector('#sp-ok').onclick = go;
    m.el.querySelector('#sp-cancel').onclick = () => done(false);
    input.oninput = () => { if (input.value.length === 4) go(); };
    setTimeout(() => input.focus(), 50);
  });
}

const referralCard = () => `
  <div class="card stack"><h2 style="margin:0">How did they hear about us? <span class="muted" style="font-weight:400">optional</span></h2>
    <div class="seg">${REFERRALS.map(r => `<button type="button" data-seg="referral" data-value="${esc(r)}">${esc(r)}</button>`).join('')}</div>
  </div>`;

const chip = (key, value, exclusive = false) =>
  `<button type="button" class="chip" data-chip="${key}" data-value="${esc(value)}" ${exclusive ? 'data-exclusive="1"' : ''}>${esc(value)}</button>`;

// ───────────── Step views ─────────────
const STEP_VIEWS = [
  // 1. Customer
  (body, view) => {
    if (draft.customer) {
      const c = draft.customer;
      body.innerHTML = `
        <div class="card selected-customer">
          <div class="grow" style="flex:1"><h2 style="margin:0">${esc(c.name)}</h2>
            <div class="muted">${esc(c.phone)}${c.whatsapp ? ' · WhatsApp ' + esc(c.whatsapp) : ''}${c.email ? ' · ' + esc(c.email) : ''}${c.area ? ' · ' + esc(c.area) : ''}</div>
            <div class="muted" id="past"></div></div>
          <button class="btn" id="change-cust">Change customer</button>
        </div>${referralCard()}`;
      repo.jobsForCustomer(c.id).then(js => {
        const p = $('#past', body);
        if (p) p.textContent = js.length ? `${js.length} earlier job${js.length > 1 ? 's' : ''}, last: ${js[0].model} (${js[0].jobNo})` : 'No earlier jobs';
      });
      $('#change-cust', body).onclick = () => { draft.customer = null; draw(view); };
      return;
    }
    body.innerHTML = `
      <div class="card stack">
        <h2>Returning customer?</h2>
        <input type="search" id="cust-search" data-bind="search" placeholder="Search by phone number or name" autocomplete="off">
        <div class="result-list" id="cust-results"></div>
      </div>
      <div class="card stack">
        <h2>New customer</h2>
        <div class="grid-2">
          <label class="field">Full name<input type="text" id="nc-name" data-bind="newCustomer.name" autocomplete="off"></label>
          <label class="field">Cell number<input type="tel" id="nc-phone" data-bind="newCustomer.phone" inputmode="tel" placeholder="082 123 4567" autocomplete="off"></label>
          <label class="field">WhatsApp number <span class="hint">only if different from the cell</span><input type="tel" id="nc-wa" data-bind="newCustomer.whatsapp" inputmode="tel" placeholder="Leave empty if the same" autocomplete="off"></label>
          <label class="field">Email <span class="hint">optional</span><input type="email" id="nc-email" data-bind="newCustomer.email" autocomplete="off"></label>
          <label class="field">Area / suburb <span class="hint">optional</span><input type="text" id="nc-area" data-bind="newCustomer.area" autocomplete="off"></label>
          <label class="check"><input type="checkbox" id="nc-biz" data-bind="newCustomer.isBusiness"> This is a business customer</label>
        </div>
        ${draft.newCustomer.isBusiness ? `<div class="grid-2">
          <label class="field">Company name<input type="text" id="nc-company" data-bind="newCustomer.companyName" autocomplete="off"></label>
          <label class="field">VAT number <span class="hint">optional</span><input type="text" id="nc-vat" data-bind="newCustomer.vatNumber" autocomplete="off"></label>
          <label class="field">Billing address <span class="hint">optional</span><input type="text" id="nc-address" data-bind="newCustomer.address" autocomplete="off"></label>
        </div>` : ''}
      </div>${referralCard()}`;
    const results = $('#cust-results', body);
    const search = $('#cust-search', body);
    const run = async () => {
      const q = search.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      const list = await repo.searchCustomers(q);
      results.innerHTML = list.length ? list.slice(0, 8).map(c => `
        <button class="result" data-id="${c.id}"><span class="avatar">${esc(c.name[0] || '?')}</span>
          <span><b>${esc(c.name)}</b><div class="meta">${esc(c.phone)}${c.area ? ' · ' + esc(c.area) : ''}</div></span></button>`).join('')
        : '<p class="muted">No match. Add them as a new customer below.</p>';
      $$('.result', results).forEach(b => b.onclick = async () => {
        draft.customer = await repo.getCustomer(b.dataset.id); draw(view);
      });
    };
    search.addEventListener('input', run);
    queueMicrotask(run); // after bind() restores the last search text
    queueMicrotask(() => { const cb = $('#nc-biz', body); if (cb) cb.addEventListener('change', () => draw(view)); });
  },

  // 2. Device
  (body) => {
    const type = deviceType(draft.deviceType);
    // Pick the model from a list; "Other" opens a box to type one that isn't listed.
    const other = type && (draft.modelOther || (draft.model && !type.models.includes(draft.model)));
    body.innerHTML = `
      <div class="card stack"><h2>What device is it?</h2>
        <div class="type-grid">${DEVICE_TYPES.map(t =>
          `<button type="button" class="type-tile ${t.id === draft.deviceType ? 'on' : ''}" data-type="${t.id}">${esc(t.label)}</button>`).join('')}</div>
      </div>
      ${type ? `<div class="card stack"><h2>${esc(type.label)} details</h2>
        <div class="grid-2">
          <label class="field">Model<select id="d-model-sel">
            <option value="" ${!draft.model && !other ? 'selected' : ''} disabled>Choose the model…</option>
            ${type.models.map(m => `<option ${!other && draft.model === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
            <option value="__other" ${other ? 'selected' : ''}>Other (type it in)</option></select></label>
          <label class="field" id="d-model-other" ${other ? '' : 'hidden'}>Model name<span class="hint">not in the list</span><input type="text" id="d-model" placeholder="e.g. ${esc(type.models[0])}" autocomplete="off" value="${esc(other ? draft.model : '')}"></label>
          <label class="field">Colour <span class="hint">optional</span><input type="text" id="d-colour" data-bind="colour" autocomplete="off"></label>
          <label class="field">IMEI / serial number<span class="hint">Settings → General → About, or on the box</span><input type="text" id="d-serial" data-bind="serial" autocomplete="off" autocapitalize="characters"></label>
          <div class="field">Does it power on?
            <div class="seg">${['Yes', 'No', 'Sometimes'].map(v => `<button type="button" data-seg="powersOn" data-value="${v}">${v}</button>`).join('')}</div></div>
        </div>
      </div>` : ''}`;
    $$('[data-type]', body).forEach(b => b.onclick = () => {
      if (draft.deviceType !== b.dataset.type) { draft.deviceType = b.dataset.type; draft.model = ''; draft.modelOther = false; draft.faults = []; }
      draw($('#view'));
    });
    const sel = $('#d-model-sel', body), otherBox = $('#d-model-other', body), otherInput = $('#d-model', body);
    if (sel) {
      sel.onchange = () => {
        draft.modelOther = sel.value === '__other';
        otherBox.hidden = !draft.modelOther;
        draft.model = draft.modelOther ? otherInput.value : sel.value;
        if (draft.modelOther) otherInput.focus();
      };
      otherInput.oninput = () => { draft.model = otherInput.value; };
    }
  },

  // 3. Fault
  (body) => {
    const type = deviceType(draft.deviceType);
    body.innerHTML = `
      <div class="card stack"><h2>What’s wrong with the ${esc(draft.model)}?</h2>
        <div class="chips">${type.faults.map(f => chip('faults', f)).join('')}${chip('faults', 'Other')}</div>
        <div class="field">Device history <span class="hint">optional</span>
          <div class="chips">${HISTORY.map(h => chip('history', h)).join('')}</div></div>
        <label class="field">What the customer says<span class="hint">In their words: when it started, what happened (dropped, got wet…)</span>
          <textarea id="f-notes" data-bind="faultNotes"></textarea></label>
      </div>`;
  },

  // 4. Condition
  (body) => {
    const type = deviceType(draft.deviceType);
    body.innerHTML = `
      <div class="card stack"><h2>Condition when handed in</h2>
        <p class="muted" style="margin:0">Check the device with the customer and tick everything you see.</p>
        <div class="chips">${DAMAGE.map((d, i) => chip('damage', d, i === 0)).join('')}</div>
        <label class="field">Condition notes <span class="hint">optional</span><textarea id="c-notes" data-bind="conditionNotes" rows="2"></textarea></label>
        <div class="field">Photos <span class="hint">Front, back and any damage</span>
          <div class="photo-grid" id="photos"></div></div>
      </div>
      <div class="card stack"><h2>Left with the device</h2>
        <div class="chips">${ACCESSORIES.map((a, i) => chip('accessories', a, i === 0)).join('')}</div>
      </div>
      ${type.passcode ? `<div class="card stack"><h2>Passcode</h2>
        <p class="muted" style="margin:0">Needed to test the device before and after the repair. It is hidden on the job and deleted when the device is collected.</p>
        <label class="field">Passcode<input type="password" id="c-pass" data-bind="passcode" autocomplete="off" inputmode="text"></label>
        <label class="check"><input type="checkbox" data-bind="passcodeNoLock"> No passcode on this device</label>
        <label class="check"><input type="checkbox" data-bind="passcodeDeclined"> Customer won’t share it (we can’t fully test or quality-check the device)</label>
      </div>` : ''}`;
    drawPhotos($('#photos', body));
  },

  // 5. Quote
  (body) => {
    const warranty = draft.jobType === 'warranty';
    body.innerHTML = `
      <div class="card stack"><h2 style="margin:0">Job</h2>
        ${warranty
          ? `<p class="pill" style="--sc:var(--s-approval);justify-self:start">Warranty return for ${esc(draft.warrantyOfNo)}: no charge to the customer</p>`
          : `<div class="seg">${JOB_TYPES.filter(t => t.id !== 'warranty').map(t => `<button type="button" data-seg="jobType" data-value="${t.id}">${esc(t.label)}</button>`).join('')}</div>`}
        <div class="grid-2">
          <label class="field">Technician <span class="hint">who will fix it (optional)</span>
            <select id="q-tech"><option value="">Not assigned yet</option></select></label>
          <div class="field">Priority<label class="check"><input type="checkbox" id="q-urgent" data-bind="urgent"> Urgent: put it at the top of the board</label></div>
        </div>
      </div>
      ${warranty ? '' : `<div class="card stack"><h2>Quote</h2>
        <div class="seg"><button type="button" data-seg="quoteMode" data-value="fixed">Fixed price</button>
          <button type="button" data-seg="quoteMode" data-value="assess">Quote after assessment</button></div>
        ${draft.quoteMode === 'fixed' ? `<div class="grid-2">
          <label class="field">Price (R)<input type="number" id="q-amount" data-bind="quote" inputmode="decimal" min="0" step="1"></label>
          <label class="field">What the price covers <span class="hint">optional</span><input type="text" id="q-note" data-bind="quoteNote" placeholder="e.g. Screen replacement, incl. VAT"></label>
        </div>` : '<p class="muted" style="margin:0">We’ll contact the customer with a price before doing any work.</p>'}
        <p class="muted" style="margin:0">Add exact parts &amp; labour from your website prices on the job page after booking.</p>
        <div class="grid-2">
          <label class="field">Deposit paid (R) <span class="hint">optional</span><input type="number" id="q-dep" data-bind="deposit" inputmode="decimal" min="0"></label>
          <label class="field">Deposit paid by<select id="q-dep-method" data-bind="depositMethod">${repo.MONEY_METHODS.map(x => `<option>${x}</option>`).join('')}</select></label>
        </div>
      </div>`}
      <div class="card stack"><h2 style="margin:0">Timing</h2>
        <label class="field">Estimated ready date <span class="hint">optional</span><input type="date" id="q-due" data-bind="dueDate"></label>
      </div>
      <div class="card stack"><h2>Getting it back to the customer</h2>
        <div class="seg">${COLLECTION.map(c => `<button type="button" data-seg="collection" data-value="${c.id}">${esc(c.label)}</button>`).join('')}</div>
      </div>
      <div class="card stack"><h2>Notes for the technician <span class="muted" style="font-weight:400">staff only</span></h2>
        <textarea id="q-internal" data-bind="internalNotes" rows="2"></textarea></div>`;
    const sel = $('#q-tech', body);
    repo.listStaff().then(staff => {
      sel.insertAdjacentHTML('beforeend', staff.filter(s => s.active !== false)
        .map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''));
      sel.value = draft.technicianId || '';
    });
    sel.onchange = () => { draft.technicianId = sel.value; draft.technicianName = sel.selectedOptions[0]?.value ? sel.selectedOptions[0].textContent : ''; };
  },

  // 6. Sign
  (body) => {
    const c = draft.customer || draft.newCustomer;
    const list = a => a.length ? a.map(esc).join(', ') : '—';
    body.innerHTML = `
      <div class="card"><h2>Check with the customer</h2>
        <dl class="kv">
          <dt>Customer <button type="button" class="edit-link" data-goto="0">Edit</button></dt><dd>${esc(c.name)} · ${esc(c.phone)}</dd>
          <dt>Device <button type="button" class="edit-link" data-goto="1">Edit</button></dt><dd>${esc(draft.model)}${draft.colour ? ', ' + esc(draft.colour) : ''}${draft.serial ? ` · <span class="mono">${esc(draft.serial)}</span>` : ''}</dd>
          <dt>Fault <button type="button" class="edit-link" data-goto="2">Edit</button></dt><dd>${list(draft.faults)}${draft.faultNotes ? ` · ${esc(draft.faultNotes)}` : ''}</dd>
          <dt>Condition <button type="button" class="edit-link" data-goto="3">Edit</button></dt><dd>${list(draft.damage)} · ${draft.photos.length} photo${draft.photos.length === 1 ? '' : 's'}</dd>
          <dt>Left with it <button type="button" class="edit-link" data-goto="3">Edit</button></dt><dd>${list(draft.accessories)}</dd>
          <dt>Job <button type="button" class="edit-link" data-goto="4">Edit</button></dt><dd>${esc(jobTypeLabel(draft.jobType))}${draft.warrantyOfNo ? ` for ${esc(draft.warrantyOfNo)}` : ''}${draft.urgent ? ' · <b style="color:var(--danger)">URGENT</b>' : ''}${draft.technicianName ? ` · ${esc(draft.technicianName)}` : ''}</dd>
          <dt>Quote <button type="button" class="edit-link" data-goto="4">Edit</button></dt><dd>${draft.jobType === 'warranty' ? 'No charge (warranty)' : draft.quoteMode === 'fixed' ? money(draft.quote) : 'After assessment'}${draft.deposit ? ` · deposit ${money(draft.deposit)}` : ''}</dd>
          <dt>Return <button type="button" class="edit-link" data-goto="4">Edit</button></dt><dd>${esc(collectionLabel(draft.collection))}</dd>
        </dl></div>
      <div class="card stack"><h2>Terms</h2>
        <div class="terms" id="terms">Loading…</div>
        <label class="check"><input type="checkbox" id="accept" data-bind="accepted"> ${esc(c.name)} has read and accepts the terms</label>
        <label class="check"><input type="checkbox" id="accept-imp" data-bind="acceptedImportant"> ${esc(c.name)} specifically accepts the clauses marked IMPORTANT: the assessment fee, lost data, repair risks, liquid damage and uncollected devices</label>
        ${draft.customerSignature ? `<div class="row" style="align-items:center">
            <img class="sig-img" id="sig-done" alt="Customer signature">
            <div class="stack" style="gap:6px"><b>Signed by the customer on the iPad</b>
              <button class="btn small" type="button" id="sig-redo">Sign again</button></div></div>`
          : `<div class="sig-wrap">
          <canvas class="sig" id="sig" aria-label="Customer signature"></canvas>
          <div class="row"><span class="sig-line">Customer signs above with a finger</span><span class="spacer"></span>
            <button class="btn small" type="button" id="sig-clear">Clear signature</button></div>
        </div>`}
      </div>`;
    repo.getSettings().then(s => { const t = $('#terms', body); if (t) t.textContent = s.terms; });
    if (draft.customerSignature) {
      const url = URL.createObjectURL(draft.customerSignature);
      $('#sig-done', body).src = url;
      $('#sig-redo', body).onclick = () => { URL.revokeObjectURL(url); draft.customerSignature = null; draw($('#view')); };
      return;
    }
    requestAnimationFrame(() => {
      pad = signaturePad($('#sig', body));
      $('#sig-clear', body).onclick = () => pad.clear();
    });
  },
];

function drawPhotos(grid) {
  grid.innerHTML = draft.photos.map(p => `
    <div class="photo"><img src="${p.url}" alt="Condition photo"><button type="button" data-rm="${p.id}" aria-label="Remove photo">×</button></div>`).join('')
    + `<label class="add-photo"><input type="file" accept="image/*" multiple id="photo-input">+ Add photo</label>`;
  $$('[data-rm]', grid).forEach(b => b.onclick = () => {
    const i = draft.photos.findIndex(p => p.id === b.dataset.rm);
    URL.revokeObjectURL(draft.photos[i].url);
    draft.photos.splice(i, 1);
    drawPhotos(grid);
  });
  $('#photo-input', grid).onchange = async e => {
    for (const f of e.target.files) {
      try {
        const blob = await compressImage(f);
        draft.photos.push({ id: uid(), blob, url: URL.createObjectURL(blob) });
      } catch { toast('That photo could not be read', 'error'); }
    }
    drawPhotos(grid);
  };
}

// ───────────── Step checks ─────────────
const STEP_CHECKS = [
  async () => {
    if (draft.customer) return null;
    const c = draft.newCustomer;
    if (!c.name.trim()) return 'Enter the customer’s name, or pick a returning customer.';
    if (repo.digits(c.phone).length < 9) return 'Enter a valid cell number (at least 9 digits).';
    if (String(c.whatsapp || '').trim() && repo.digits(c.whatsapp).length < 9) return 'Check the WhatsApp number, or leave it empty if it’s the same as the cell.';
    const existing = await repo.findByPhone(c.phone);
    if (existing) {
      const use = await confirmBox(`${c.phone} already belongs to ${existing.name}. Use that customer?`, { ok: `Use ${existing.name}` });
      if (use) { draft.customer = existing; return null; }
      return 'That number is already on file. Pick the existing customer, or check the number.';
    }
    return null;
  },
  async () => !draft.deviceType ? 'Choose the device type.' : !draft.model.trim() ? 'Enter the model.' : null,
  async () => (!draft.faults.length && !draft.faultNotes.trim()) ? 'Tick at least one fault or describe the problem.' : null,
  async () => !draft.damage.length ? 'Tick the condition. Choose “No visible damage” if it’s clean.'
    : !draft.accessories.length ? 'Tick what was left with the device. Choose “Nothing” if nothing.' : null,
  async () => (draft.jobType !== 'warranty' && draft.quoteMode === 'fixed' && !(Number(draft.quote) > 0)) ? 'Enter the price, or choose “Quote after assessment”.' : null,
  async () => !draft.accepted ? 'The customer needs to accept the terms.'
    : !draft.acceptedImportant ? 'The customer also needs to tick the box accepting the clauses marked IMPORTANT.'
    : draft.customerSignature ? null
    : (!pad || pad.isEmpty()) ? 'The customer needs to sign.' : null,
];

// ───────────── Booked! ─────────────
function done(view, job) {
  view.innerHTML = `
    <div class="card done-card">
      <span class="muted">Booked in</span>
      <div class="job-no-big">${esc(job.jobNo)}</div>
      <div><b>${esc(job.customerName)}</b> · ${esc(job.model)}</div>
      <p class="muted" style="margin:0">Stick a label on the device (and bag), or print the job card.</p>
      <div class="row" style="justify-content:center">
        <button class="btn primary big" id="d-label">Print label</button>
        <button class="btn big" id="d-print">Print job card</button>
        <button class="btn big" id="d-wa">WhatsApp the customer</button>
        <button class="btn big" id="d-open">Open job</button>
        <button class="btn big" id="d-new">Book in another</button>
      </div>
    </div>`;
  $('#d-print', view).onclick = () => printJobCard(job);
  $('#d-label', view).onclick = () => printLabel(job);
  $('#d-wa', view).onclick = () => openWhatsApp(job);
  $('#d-open', view).onclick = () => go('job-' + job.id);
  $('#d-new', view).onclick = () => { draft = newDraft(); draw(view); };
  toast(`${job.jobNo} booked in`);
}
