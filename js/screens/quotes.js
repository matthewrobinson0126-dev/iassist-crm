// Quotes: list + quote page. A quote is linked to a booked-in job, or stands alone (phone / walk-in / business)
// and becomes a job when the customer says yes. Customers accept or decline online through the emailed link.
import * as repo from '../repo.js?v=20261114144809';
import { $, $$, esc, money, fmtDate, fmtDateTime, toast, modal, confirmBox } from '../ui.js?v=20261114144809';
import { DEVICE_TYPES, deviceType } from '../devices.js?v=20261114144809';
import { printQuote, qrSvg } from '../print.js?v=20261114144809';
import { whatsAppQuote } from '../messages.js?v=20261114144809';
import { pickFromPriceList, editLineModal } from './jobs.js?v=20261114144809';
import { startQuoteJob } from './bookin.js?v=20261114144809';
import { go } from '../app.js?v=20261114144809';

const STATE_COLOUR = { draft: 'var(--s-booked)', sent: 'var(--s-approval)', accepted: 'var(--s-ready)', declined: 'var(--danger)', expired: 'var(--s-collected)' };
export const quotePill = q => { const s = repo.quoteState(q); return `<span class="pill" style="--sc:${STATE_COLOUR[s]}">${esc(repo.QUOTE_STATES[s])}</span>`; };

const FILTERS = [
  { id: 'open', label: 'Open', test: s => s === 'draft' || s === 'sent' },
  { id: 'accepted', label: 'Accepted', test: s => s === 'accepted' },
  { id: 'declined', label: 'Declined', test: s => s === 'declined' },
  { id: 'expired', label: 'Expired', test: s => s === 'expired' },
  { id: 'all', label: 'All', test: () => true },
];
let listState = { filter: 'open', q: '' };

export async function renderQuotes(view) {
  const quotes = await repo.listQuotes();
  view.innerHTML = `
    <div class="page-head"><h1>Quotes</h1><span class="spacer"></span>
      <input type="search" id="q-search" placeholder="Search quote no, name, phone, model" style="max-width:380px" autocomplete="off">
      <a class="btn primary" href="#quote-new">+ New quote</a></div>
    <p class="muted" style="margin:-6px 0 14px">For a device that's already booked in, open the job and tap <b>Send quote</b>. Use <b>+ New quote</b> for phone, walk-in and business enquiries.</p>
    <div class="chips" id="q-filters" style="margin-bottom:14px"></div>
    <div class="list" id="q-list"></div>`;
  const search = $('#q-search', view);
  search.value = listState.q;
  const draw = () => {
    const f = FILTERS.find(x => x.id === listState.filter) || FILTERS[0];
    $('#q-filters', view).innerHTML = FILTERS.map(x => `<button class="chip ${x.id === f.id ? 'on' : ''}" data-f="${x.id}">${esc(x.label)} <span class="num">${quotes.filter(q => x.test(repo.quoteState(q))).length}</span></button>`).join('');
    $$('[data-f]', view).forEach(b => b.onclick = () => { listState.filter = b.dataset.f; draw(); });
    const t = listState.q.trim().toLowerCase(), d = repo.digits(t);
    const list = quotes.filter(q => f.test(repo.quoteState(q)) && (!t
      || [q.quoteNo, q.customerName, q.model, q.jobNo].some(v => (v || '').toLowerCase().includes(t))
      || (d.length >= 3 && repo.digits(q.customerPhone).includes(d))));
    $('#q-list', view).innerHTML = list.map(q => `<button class="list-row" data-id="${q.id}">
        <span class="grow"><b class="mono">${esc(q.quoteNo || 'New')}</b> · ${esc(q.customerName)}${q.model ? ` · ${esc(q.model)}` : ''}
          <div class="muted">${fmtDate(q.createdAt)}${q.jobNo ? ` · job ${esc(q.jobNo)}` : ''}${q.respondedAt ? ` · answered ${fmtDate(q.respondedAt)}${q.responseVia === 'online' ? ' online' : ''}` : ''}</div></span>
        <b class="num">${money(q.total)}</b>${quotePill(q)}</button>`).join('')
      || `<div class="card empty">${quotes.length ? 'No quotes in this list.' : 'No quotes yet. Tap <b>+ New quote</b>, or <b>Send quote</b> on a job.'}</div>`;
    $$('[data-id]', view).forEach(r => r.onclick = () => go('quote-' + r.dataset.id));
  };
  search.oninput = () => { listState.q = search.value; draw(); };
  draw();
}

// ───────────── One quote ─────────────
export async function renderQuote(view, id) {
  const isNew = id === 'new';
  let q = isNew ? { lines: [], deviceType: '', model: '', fault: '', notes: '', status: 'draft' } : await repo.getQuote(id);
  if (!q) { view.innerHTML = '<div class="card empty"><h2>Quote not found</h2><p><a href="#quotes">Back to quotes</a></p></div>'; return; }
  const cust = q.customerId ? await repo.getCustomer(q.customerId) : null;
  const state = isNew ? 'draft' : repo.quoteState(q);
  const editable = state !== 'accepted';
  const fromJob = !!q.jobId;
  const lines = (q.lines || []).map(l => ({ ...l }));
  let customerId = q.customerId || null;
  const settings = await repo.getSettings();

  view.innerHTML = `
    <div class="page-head">
      <a href="#quotes" class="btn small ghost">← Quotes</a>
      <h1 class="mono">${esc(isNew ? 'New quote' : q.quoteNo)}</h1>${isNew ? '' : quotePill(q)}
      ${q.jobNo ? `<a class="tag" href="#job-${q.jobId}">Job ${esc(q.jobNo)}</a>` : ''}
      <span class="spacer"></span>
      ${isNew ? '' : '<button class="btn" id="qt-print">Print / PDF</button><button class="btn" id="qt-wa">WhatsApp</button>'}
      ${editable ? `<button class="btn primary" id="qt-send">${state === 'sent' ? 'Send again' : 'Send quote'}</button>` : ''}
    </div>
    <div class="job-layout">
      <div class="stack">
        <div class="card stack"><h2 style="margin:0">Customer</h2>
          ${!fromJob && editable ? `<input type="search" id="qc-search" placeholder="Returning customer? Search by phone or name" autocomplete="off">
            <div class="result-list" id="qc-results"></div>` : ''}
          <div class="grid-2">
            <label class="field">Full name<input type="text" id="qc-name" value="${esc(cust?.name || '')}" ${fromJob || !editable ? 'readonly' : ''} autocomplete="off"></label>
            <label class="field">Cell number<input type="tel" id="qc-phone" value="${esc(cust?.phone || '')}" ${fromJob || !editable ? 'readonly' : ''} inputmode="tel" autocomplete="off"></label>
            <label class="field">Email <span class="hint">needed to email the quote</span><input type="email" id="qc-email" value="${esc(cust?.email || '')}" ${editable ? '' : 'readonly'} autocomplete="off"></label>
          </div>
          ${customerId && !fromJob && editable ? '<div class="row"><span class="muted" id="qc-picked">Existing customer</span><button class="btn small ghost" id="qc-clear">New customer instead</button></div>' : ''}
        </div>
        <div class="card stack"><h2 style="margin:0">Device</h2>
          <div class="grid-2">
            <label class="field">Device type<select id="qd-type" ${fromJob || !editable ? 'disabled' : ''}><option value="">Choose…</option>
              ${DEVICE_TYPES.map(t => `<option value="${t.id}" ${t.id === q.deviceType ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
            <label class="field">Model<input type="text" id="qd-model" value="${esc(q.model || '')}" list="qd-models" ${fromJob || !editable ? 'readonly' : ''} autocomplete="off" placeholder="e.g. iPhone 13"></label>
          </div>
          <datalist id="qd-models"></datalist>
          <label class="field">Problem <span class="hint">shown on the quote</span><input type="text" id="qd-fault" value="${esc(q.fault || '')}" ${editable ? '' : 'readonly'} placeholder="e.g. Cracked screen, battery drains fast"></label>
        </div>
        <div class="card stack"><div class="row"><h2 style="margin:0">Parts &amp; labour</h2><span class="spacer"></span>
          ${editable && !fromJob ? '<button class="btn small" id="ql-price">+ From price list</button><button class="btn small" id="ql-custom">+ Custom line</button>' : ''}
          ${editable && fromJob ? `<a class="btn small" href="#job-${q.jobId}">Change on the job</a>` : ''}</div>
          <div id="ql-table"></div>
          ${fromJob ? '<p class="muted" style="margin:0">These lines come from the job’s parts &amp; labour. Change them on the job, then tap <b>Send quote</b> there again.</p>' : ''}
        </div>
        <div class="card stack"><h2 style="margin:0">Notes for the customer <span class="muted" style="font-weight:400">optional</span></h2>
          <textarea id="qn-notes" rows="3" ${editable ? '' : 'readonly'} placeholder="e.g. Includes 6 months warranty. Original-quality screen.">${esc(q.notes || '')}</textarea>
          <div class="grid-2">
            <label class="field">Valid until<input type="date" id="qn-valid" value="${esc(q.validUntil || '')}" ${editable ? '' : 'readonly'}>
              <span class="hint">Empty = ${esc(settings.quoteValidDays || 7)} days from today</span></label>
          </div>
          <p class="error-msg" id="qt-err" hidden></p>
          ${editable ? `<div class="row"><span class="spacer"></span><button class="btn" id="qt-save">${isNew ? 'Save as draft' : 'Save changes'}</button></div>` : ''}
        </div>
      </div>
      <div class="stack">${isNew ? `<div class="card stack"><h2 style="margin:0">How it works</h2>
          <ol class="muted" style="margin:0;padding-left:20px;display:grid;gap:6px">
            <li>Add the customer, device and prices.</li>
            <li>Tap <b>Send quote</b>. It’s emailed with a link, and you can WhatsApp the same link.</li>
            <li>The customer taps <b>Accept</b> or <b>Decline</b> on the link. It shows up here and on the Jobs board.</li>
            <li>When they bring the device in, tap <b>Book in device</b>: the details and price carry over.</li>
          </ol></div>` : answerCard(q, state)}
      </div>
    </div>`;

  // Lines table
  const drawLines = () => {
    $('#ql-table', view).innerHTML = lines.length ? `<div style="overflow-x:auto"><table class="lines num">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th></th></tr></thead>
      <tbody>${lines.map((l, i) => `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.qty * l.price)}</td>
        <td>${editable && !fromJob ? `<button class="btn small ghost" data-rm="${i}" aria-label="Remove ${esc(l.name)}">×</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total${settings.vatNumber ? ' (incl. VAT)' : ''}</td><td>${money(repo.linesTotal(lines))}</td><td></td></tr></tfoot></table></div>`
      : '<p class="muted" style="margin:0">No lines yet. Add parts and labour from your website price list or as custom lines.</p>';
    $$('[data-rm]', view).forEach(b => b.onclick = () => { lines.splice(Number(b.dataset.rm), 1); drawLines(); });
  };
  drawLines();
  const addLine = l => { lines.push(l); drawLines(); };
  $('#ql-price', view)?.addEventListener('click', () => pickFromPriceList($('#qd-model', view).value, addLine, 'Add to quote'));
  $('#ql-custom', view)?.addEventListener('click', () => editLineModal({ name: '', qty: 1, price: '' }, addLine, 'Add to quote'));

  // Model suggestions follow the device type
  const typeSel = $('#qd-type', view);
  const fillModels = () => { $('#qd-models', view).innerHTML = (deviceType(typeSel.value)?.models || []).map(m => `<option value="${esc(m)}"></option>`).join(''); };
  typeSel.onchange = fillModels; fillModels();

  // Returning customer search
  const search = $('#qc-search', view);
  if (search) {
    const results = $('#qc-results', view);
    search.oninput = async () => {
      const t = search.value.trim();
      if (t.length < 2) { results.innerHTML = ''; return; }
      const list = await repo.searchCustomers(t);
      results.innerHTML = list.slice(0, 6).map(c => `<button class="result" data-c="${c.id}"><span class="avatar">${esc(c.name[0] || '?')}</span>
        <span><b>${esc(c.name)}</b><div class="meta">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</div></span></button>`).join('')
        || '<p class="muted" style="margin:0">No match. Type their details below.</p>';
      $$('[data-c]', results).forEach(b => b.onclick = async () => {
        const c = await repo.getCustomer(b.dataset.c);
        customerId = c.id;
        $('#qc-name', view).value = c.name; $('#qc-phone', view).value = c.phone; $('#qc-email', view).value = c.email || '';
        results.innerHTML = ''; search.value = '';
        toast(`${c.name} selected`);
      });
    };
  }
  $('#qc-clear', view)?.addEventListener('click', () => {
    customerId = null;
    ['#qc-name', '#qc-phone', '#qc-email'].forEach(s => { $(s, view).value = ''; });
    $('#qc-clear', view).parentElement.remove();
  });

  const showErr = msg => { const e = $('#qt-err', view); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'center' }); };
  // Save what's on screen. Returns the saved quote.
  const save = async () => {
    showErr('');
    if (!editable) return q;
    const v = s => $(s, view).value;
    const name = v('#qc-name').trim(), phone = v('#qc-phone').trim();
    if (!customerId && !name) throw new Error('Enter the customer’s name, or search for a returning customer.');
    if (repo.digits(phone).length < 9) throw new Error('Enter the customer’s cell number (at least 9 digits).');
    if (!lines.length) throw new Error('Add at least one line (parts or labour).');
    q = await repo.saveQuote({ ...q, customerId, customer: { name: name || cust?.name, phone, email: v('#qc-email').trim() },
      deviceType: typeSel.value || q.deviceType || '', model: v('#qd-model'), fault: v('#qd-fault').trim(), lines,
      notes: v('#qn-notes').trim(), validUntil: v('#qn-valid') });
    customerId = q.customerId;
    return q;
  };
  const guarded = fn => async () => { try { await fn(); } catch (ex) { showErr(ex.message); } };

  $('#qt-save', view)?.addEventListener('click', guarded(async () => {
    await save(); toast(`${q.quoteNo} saved`);
    go('quote-' + q.id);
  }));
  $('#qt-send', view)?.addEventListener('click', guarded(async () => {
    const btn = $('#qt-send', view);
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await save();
      const r = await repo.sendQuote(q);
      q = r.quote;
      const e = r.email || {};
      if (e.sent) toast(`${q.quoteNo} emailed to ${e.to}`);
      else toast(`${q.quoteNo} marked as sent. Not emailed: ${e.skipped || e.error || 'no email'}. Use WhatsApp to send the link.`, e.error ? 'error' : '');
      go('quote-' + q.id);
      if (!e.sent) setTimeout(() => whatsAppQuote(q), 400);
    } finally { btn.disabled = false; }
  }));
  $('#qt-print', view)?.addEventListener('click', guarded(async () => { await save(); printQuote(q); }));
  $('#qt-wa', view)?.addEventListener('click', guarded(async () => {
    await save();
    if (q.status === 'draft' && !(await confirmBox('This quote hasn’t been sent yet, so the accept link won’t work. Send it first?', { ok: 'Send quote' }))) return;
    if (q.status === 'draft' || repo.quoteState(q) === 'expired') { const r = await repo.sendQuote(q); q = r.quote; }
    go('quote-' + q.id);
    whatsAppQuote(q);
  }));

  // Answer card actions
  $('#qa-yes', view)?.addEventListener('click', () => answerModal(q, true, () => renderQuote(view, q.id)));
  $('#qa-no', view)?.addEventListener('click', () => answerModal(q, false, () => renderQuote(view, q.id)));
  $('#qa-book', view)?.addEventListener('click', async () => startQuoteJob(q, await repo.getCustomer(q.customerId)));
  $('#qa-copy', view)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(repo.quoteUrl(q)); toast('Quote link copied'); } catch { toast('Select the link and copy it'); }
  });
  $('#qa-delete', view)?.addEventListener('click', async () => {
    if (!(await confirmBox(`Delete ${q.quoteNo} for good?`, { ok: 'Delete quote', danger: true }))) return;
    await repo.deleteQuote(q); toast(`${q.quoteNo} deleted`); go('quotes');
  });
}

function answerCard(q, state) {
  const url = repo.auth.cloud ? repo.quoteUrl(q) : '';
  const answered = state === 'accepted' || state === 'declined';
  const explain = {
    draft: 'Not sent yet. Tap <b>Send quote</b> to email it, or WhatsApp the link.',
    sent: `Sent ${fmtDateTime(q.sentAt)}. Waiting for the customer to accept or decline${q.validUntil ? ` (valid until ${fmtDate(q.validUntil)})` : ''}.`,
    expired: `Expired on ${fmtDate(q.validUntil)} without an answer. Tap <b>Send quote</b> to send it again with a new date.`,
    accepted: `Accepted ${fmtDateTime(q.respondedAt)}${q.responseVia === 'online' ? ' by the customer online' : ' (recorded by staff)'}.`,
    declined: `Declined ${fmtDateTime(q.respondedAt)}${q.responseVia === 'online' ? ' by the customer online' : ' (recorded by staff)'}.`,
  }[state];
  return `
    <div class="card stack"><h2 style="margin:0">Customer’s answer</h2>
      <p style="margin:0">${explain}</p>
      ${q.responseNote ? `<p style="margin:0">“${esc(q.responseNote)}”</p>` : ''}
      ${state === 'accepted' && !q.jobId ? '<button class="btn primary big" id="qa-book">Book in device</button><p class="muted" style="margin:0">When the customer brings the device in. The customer, device and price carry over.</p>' : ''}
      ${q.jobId ? `<a class="btn" href="#job-${q.jobId}">Open job ${esc(q.jobNo || '')}</a>` : ''}
      ${!answered ? `<p class="muted" style="margin:0">Customer phoned or came in? Record their answer:</p>
        <div class="row"><button class="btn" id="qa-yes">They said yes</button><button class="btn" id="qa-no">They said no</button></div>` : ''}
      ${state === 'declined' ? '<div class="row"><button class="btn small" id="qa-yes">They changed their mind: yes</button></div>' : ''}
    </div>
    ${url && q.status !== 'draft' ? `<div class="card stack"><h2 style="margin:0">Quote link</h2>
      <p class="muted" style="margin:0">The customer opens this to accept or decline. It’s in the email and on the printed quote.</p>
      <div class="row" style="align-items:center"><div class="qr">${qrSvg(url, 3)}</div>
        <div class="stack" style="gap:8px;flex:1;min-width:0"><code class="track-link">${esc(url)}</code>
          <button class="btn small" id="qa-copy">Copy link</button></div></div></div>` : ''}
    <div class="card"><dl class="kv"><dt>Created</dt><dd>${fmtDateTime(q.createdAt)} by ${esc(q.createdByName || '')}</dd>
      <dt>Total</dt><dd class="num"><b>${money(q.total)}</b></dd></dl></div>
    ${repo.auth.isOwner() ? '<button class="btn danger" id="qa-delete">Delete quote (owner only)</button>' : ''}`;
}

function answerModal(q, yes, after) {
  const m = modal(`<h2>${yes ? 'Customer accepted' : 'Customer declined'} ${esc(q.quoteNo)}</h2>
    <p class="muted" style="margin:0">${yes ? (q.jobId ? 'The job moves to Repairing and its price becomes ' + money(q.total) + '.' : 'Then book the device in when it arrives.') : 'The job stays where it is so you can call them or hand the device back.'}</p>
    <label class="field">Note <span class="hint">optional</span><input type="text" id="qa-note" placeholder="${yes ? 'e.g. Approved by phone' : 'e.g. Too expensive'}"></label>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="qa-ok">${yes ? 'Mark accepted' : 'Mark declined'}</button></div>`);
  m.el.querySelector('#qa-ok').onclick = async () => {
    await repo.answerQuote(q, yes, m.el.querySelector('#qa-note').value);
    m.close(); toast(`${q.quoteNo} ${yes ? 'accepted' : 'declined'}`); after();
  };
}

// Quotes the customer answered online in the last few days, for the Jobs board.
export async function recentOnlineAnswers() {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('crm.quoteSeen') || '[]'); } catch { /* none */ }
  return (await repo.listQuotes()).filter(q => q.responseVia === 'online' && q.respondedAt && q.respondedAt >= since && !seen.includes(q.id));
}
export function markAnswersSeen(ids) {
  try {
    const seen = JSON.parse(localStorage.getItem('crm.quoteSeen') || '[]');
    localStorage.setItem('crm.quoteSeen', JSON.stringify([...new Set([...seen, ...ids])].slice(-200)));
  } catch { /* private mode */ }
}
