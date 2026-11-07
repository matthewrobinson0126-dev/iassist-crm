// Book a device in, step by step. The draft survives switching screens until it is booked or cleared.
import * as repo from '../repo.js?v=20261107121047';
import { $, $$, esc, money, toast, signaturePad, compressImage, getPath, setPath, uid, confirmBox } from '../ui.js?v=20261107121047';
import { DEVICE_TYPES, deviceType, DAMAGE, ACCESSORIES, COLLECTION, collectionLabel, REFERRALS, JOB_TYPES, jobTypeLabel } from '../devices.js?v=20261107121047';
import { printJobCard } from '../print.js?v=20261107121047';
import { openWhatsApp } from '../messages.js?v=20261107121047';
import { go } from '../app.js?v=20261107121047';

const STEPS = ['Customer', 'Device', 'Fault', 'Condition', 'Quote', 'Sign'];
let draft = null;
let pad = null;

const newDraft = () => ({
  step: 0, customer: null, newCustomer: { name: '', phone: '', email: '', area: '' }, search: '',
  deviceType: '', model: '', colour: '', serial: '', powersOn: 'Yes',
  faults: [], faultNotes: '', damage: [], conditionNotes: '', photos: [], accessories: [],
  passcode: '', quoteMode: 'assess', quote: '', quoteNote: '', deposit: '', dueDate: '', collection: 'store',
  internalNotes: '', accepted: false, startedBy: repo.auth.user?.name,
  depositMethod: 'Cash', referral: '', urgent: false, technicianId: '', technicianName: '', jobType: 'paid', warrantyOf: null, warrantyOfNo: '',
});

export async function renderBookIn(view) {
  if (!draft) draft = newDraft();
  draw(view);
}

// Warranty return: same customer + device as the original repair, linked to it, no charge.
export function startWarrantyJob(job, customer) {
  draft = { ...newDraft(), customer, deviceType: job.deviceType, model: job.model, colour: job.colour || '',
    serial: job.serial || '', jobType: 'warranty', warrantyOf: job.id, warrantyOfNo: job.jobNo,
    referral: 'Returning customer', faultNotes: `Warranty return for ${job.jobNo} (${(job.faults || []).join(', ')})`, step: 2 };
  go('bookin');
}

function draw(view) {
  view.innerHTML = `
    <div class="wizard">
      <div class="page-head"><h1>Book in a device</h1><span class="spacer"></span>
        <button class="btn small ghost" id="restart">Start over</button></div>
      <ol class="steps">${STEPS.map((s, i) =>
        `<li class="${i === draft.step ? 'on' : i < draft.step ? 'done' : ''}"><b>${i + 1}</b>${s}</li>`).join('')}</ol>
      <section class="step-body" id="step"></section>
      <p class="error-msg" id="step-err" hidden></p>
      <footer class="wizard-nav">
        <button class="btn big" id="back" ${draft.step === 0 ? 'disabled' : ''}>Back</button>
        <span class="spacer"></span>
        <button class="btn primary big" id="next">${draft.step === STEPS.length - 1 ? 'Book in device' : 'Next'}</button>
      </footer>
    </div>`;
  const body = $('#step', view);
  pad = null;
  STEP_VIEWS[draft.step](body, view);
  bind(body, view);
  $('#back', view).onclick = () => { draft.step--; draw(view); };
  $('#next', view).onclick = () => next(view);
  $('#restart', view).onclick = async () => {
    if (await confirmBox('Clear this booking and start again?', { ok: 'Start over', danger: true })) {
      draft.photos.forEach(p => URL.revokeObjectURL(p.url));
      draft = newDraft(); draw(view);
    }
  };
}

async function next(view) {
  const err = $('#step-err', view);
  err.hidden = true;
  const problem = await STEP_CHECKS[draft.step](view);
  if (problem) { err.textContent = problem; err.hidden = false; return; }
  if (draft.step < STEPS.length - 1) { draft.step++; draw(view); return; }
  // Final step: save the job.
  const btn = $('#next', view);
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const job = await repo.createJob({ ...draft, signature: await pad.toBlob() });
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
            <div class="muted">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}${c.area ? ' · ' + esc(c.area) : ''}</div>
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
    body.innerHTML = `
      <div class="card stack"><h2>What device is it?</h2>
        <div class="type-grid">${DEVICE_TYPES.map(t =>
          `<button type="button" class="type-tile ${t.id === draft.deviceType ? 'on' : ''}" data-type="${t.id}">${esc(t.label)}</button>`).join('')}</div>
      </div>
      ${type ? `<div class="card stack"><h2>${esc(type.label)} details</h2>
        <div class="grid-2">
          <label class="field">Model<input type="text" id="d-model" data-bind="model" list="models" placeholder="Start typing, e.g. ${esc(type.models[0])}" autocomplete="off"></label>
          <label class="field">Colour <span class="hint">optional</span><input type="text" id="d-colour" data-bind="colour" autocomplete="off"></label>
          <label class="field">IMEI / serial number<span class="hint">Settings → General → About, or on the box</span><input type="text" id="d-serial" data-bind="serial" autocomplete="off" autocapitalize="characters"></label>
          <div class="field">Does it power on?
            <div class="seg">${['Yes', 'No', 'Sometimes'].map(v => `<button type="button" data-seg="powersOn" data-value="${v}">${v}</button>`).join('')}</div></div>
        </div>
        <datalist id="models">${type.models.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>
      </div>` : ''}`;
    $$('[data-type]', body).forEach(b => b.onclick = () => {
      if (draft.deviceType !== b.dataset.type) { draft.deviceType = b.dataset.type; draft.model = ''; draft.faults = []; }
      draw($('#view'));
    });
  },

  // 3. Fault
  (body) => {
    const type = deviceType(draft.deviceType);
    body.innerHTML = `
      <div class="card stack"><h2>What’s wrong with the ${esc(draft.model)}?</h2>
        <div class="chips">${type.faults.map(f => chip('faults', f)).join('')}${chip('faults', 'Other')}</div>
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
      ${type.passcode ? `<div class="card stack"><h2>Passcode <span class="muted" style="font-weight:400">optional</span></h2>
        <p class="muted" style="margin:0">Used only to test the device. It is hidden on the job and deleted when the device is collected.</p>
        <label class="field">Passcode<input type="password" id="c-pass" data-bind="passcode" autocomplete="off" inputmode="text"></label>
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
          <dt>Customer</dt><dd>${esc(c.name)} · ${esc(c.phone)}</dd>
          <dt>Device</dt><dd>${esc(draft.model)}${draft.colour ? ', ' + esc(draft.colour) : ''}${draft.serial ? ` · <span class="mono">${esc(draft.serial)}</span>` : ''}</dd>
          <dt>Fault</dt><dd>${list(draft.faults)}${draft.faultNotes ? ` · ${esc(draft.faultNotes)}` : ''}</dd>
          <dt>Condition</dt><dd>${list(draft.damage)} · ${draft.photos.length} photo${draft.photos.length === 1 ? '' : 's'}</dd>
          <dt>Left with it</dt><dd>${list(draft.accessories)}</dd>
          <dt>Job</dt><dd>${esc(jobTypeLabel(draft.jobType))}${draft.warrantyOfNo ? ` for ${esc(draft.warrantyOfNo)}` : ''}${draft.urgent ? ' · <b style="color:var(--danger)">URGENT</b>' : ''}${draft.technicianName ? ` · ${esc(draft.technicianName)}` : ''}</dd>
          <dt>Quote</dt><dd>${draft.jobType === 'warranty' ? 'No charge (warranty)' : draft.quoteMode === 'fixed' ? money(draft.quote) : 'After assessment'}${draft.deposit ? ` · deposit ${money(draft.deposit)}` : ''}</dd>
          <dt>Return</dt><dd>${esc(collectionLabel(draft.collection))}</dd>
        </dl></div>
      <div class="card stack"><h2>Terms</h2>
        <div class="terms" id="terms">Loading…</div>
        <label class="check"><input type="checkbox" id="accept" data-bind="accepted"> ${esc(c.name)} has read and accepts the terms</label>
        <div class="sig-wrap">
          <canvas class="sig" id="sig" aria-label="Customer signature"></canvas>
          <div class="row"><span class="sig-line">Customer signs above with a finger</span><span class="spacer"></span>
            <button class="btn small" type="button" id="sig-clear">Clear signature</button></div>
        </div>
      </div>`;
    repo.getSettings().then(s => { const t = $('#terms', body); if (t) t.textContent = s.terms; });
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
    : (!pad || pad.isEmpty()) ? 'The customer needs to sign.' : null,
];

// ───────────── Booked! ─────────────
function done(view, job) {
  view.innerHTML = `
    <div class="card done-card">
      <span class="muted">Booked in</span>
      <div class="job-no-big">${esc(job.jobNo)}</div>
      <div><b>${esc(job.customerName)}</b> · ${esc(job.model)}</div>
      <p class="muted" style="margin:0">Write this number on the device bag or print the job card.</p>
      <div class="row" style="justify-content:center">
        <button class="btn big" id="d-print">Print job card</button>
        <button class="btn big" id="d-wa">WhatsApp the customer</button>
        <button class="btn big" id="d-open">Open job</button>
        <button class="btn primary big" id="d-new">Book in another</button>
      </div>
    </div>`;
  $('#d-print', view).onclick = () => printJobCard(job);
  $('#d-wa', view).onclick = () => openWhatsApp(job);
  $('#d-open', view).onclick = () => go('job-' + job.id);
  $('#d-new', view).onclick = () => { draft = newDraft(); draw(view); };
  toast(`${job.jobNo} booked in`);
}
