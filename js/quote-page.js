// Public quote page: the customer reads their quote and taps Accept or Decline (no login; the link's token is the key).
import { CONFIG } from './config.js?v=20261107152030';
import { esc, money, fmtDate, fmtDateTime } from './ui.js?v=20261107152030';

const app = document.getElementById('app');
const token = new URLSearchParams(location.search).get('q');

async function call(action, note) {
  const r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/quote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.supabaseKey },
    body: JSON.stringify({ token, action, note }),
  });
  const d = await r.json().catch(() => ({ error: 'Please call the shop.' }));
  return { ok: r.ok, d };
}

const brand = name => `<div class="brand"><img src="icons/icon.svg" alt=""><span>${esc(name || 'iAssist')}</span></div>`;
const show = inner => { app.innerHTML = `${brand()}<div class="card">${inner}</div>`; };

async function load() {
  if (!token || !CONFIG.supabaseUrl) return show('<h1>Link not recognised</h1><p class="muted">Please open the link from your email or message again, or call the shop.</p>');
  try {
    const { ok, d } = await call('view');
    if (!ok) return show(`<h1>Quote not found</h1><p class="muted">${esc(d.error || 'Please call the shop.')}</p>`);
    render(d);
  } catch {
    show('<h1>Can’t load right now</h1><p class="muted">Check your internet connection and refresh the page.</p>');
  }
}

// VAT-registered shops show the 15% VAT included in the price.
function totals(d) {
  if (!d.vatNumber) return `<tr class="grand"><td colspan="3">Total</td><td class="n">${money(d.total)}</td></tr>`;
  const excl = Math.round((d.total / 1.15) * 100) / 100;
  return `<tr><td colspan="3">Subtotal (excl. VAT)</td><td class="n">${money(excl)}</td></tr>
    <tr><td colspan="3">VAT 15%</td><td class="n">${money(Math.round((d.total - excl) * 100) / 100)}</td></tr>
    <tr class="grand"><td colspan="3">Total (incl. VAT)</td><td class="n">${money(d.total)}</td></tr>`;
}

function answerBox(d, msg) {
  if (d.status === 'accepted') return `<div class="ans">You accepted this quote${d.respondedAt ? ` on ${fmtDateTime(d.respondedAt)}` : ''}. Thank you, we’ll get started${d.jobNo ? '' : ' and be in touch to arrange the repair'}.</div>`;
  if (d.status === 'declined') return `<div class="ans">You declined this quote${d.respondedAt ? ` on ${fmtDateTime(d.respondedAt)}` : ''}. ${d.jobNo ? 'Your device is ready to collect as it is. ' : ''}Call us if you change your mind.</div>`;
  if (d.status === 'expired') return `<div class="ans">This quote expired on ${fmtDate(d.validUntil)}. Please call us${d.shop.phone ? ` on ${esc(d.shop.phone)}` : ''} for an updated price.</div>`;
  return `${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <div class="actions" id="actions">
      <button class="yes" id="accept">Accept quote: ${money(d.total)}</button>
      <button id="decline">Decline</button>
    </div>
    <div id="why" hidden style="margin-top:12px">
      <label for="note"><b>Anything you’d like to tell us?</b> <span class="muted">optional</span></label>
      <textarea id="note" rows="3" maxlength="500" placeholder="e.g. Too expensive, I’ll collect the device"></textarea>
      <div class="actions" style="margin-top:10px"><button id="decline-yes">Decline the quote</button></div>
    </div>`;
}

function render(d, msg) {
  document.title = `Quote ${d.quoteNo} · ${d.shop.name}`;
  app.innerHTML = `
    ${brand(d.shop.name)}
    <div class="card">
      <div class="muted">Quote ${esc(d.quoteNo)}${d.jobNo ? ` · repair ${esc(d.jobNo)}` : ''}</div>
      <h1>Hi ${esc(d.firstName || 'there')}, here’s your quote${d.model ? ` for your ${esc(d.model)}` : ''}</h1>
      ${d.fault ? `<p class="muted" style="margin:6px 0 0">${esc(d.fault)}</p>` : ''}
    </div>
    <div class="card">
      <table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead>
        <tbody>${d.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="n">${esc(l.qty)}</td><td class="n">${money(l.price)}</td><td class="n">${money(l.qty * l.price)}</td></tr>`).join('')}</tbody>
        <tfoot>${totals(d)}</tfoot></table>
      ${d.notes ? `<p style="margin:14px 0 0;white-space:pre-line">${esc(d.notes)}</p>` : ''}
      <p class="muted" style="margin:14px 0 0">${d.validUntil ? `Valid until ${fmtDate(d.validUntil)}.` : ''}${d.vatNumber ? ` VAT no. ${esc(d.vatNumber)}.` : ''}</p>
    </div>
    <div class="card">${answerBox(d, msg)}</div>
    <div class="card"><b>${esc(d.shop.name)}</b><div class="muted">${esc(d.shop.address)}</div>
      ${d.shop.hours ? `<div class="muted">${esc(d.shop.hours)}</div>` : ''}
      ${d.shop.phone ? `<div style="margin-top:8px">Questions? Call <b>${esc(d.shop.phone)}</b></div>` : ''}</div>`;

  const answer = async (action, note) => {
    document.querySelectorAll('#actions button, #decline-yes').forEach(b => { b.disabled = true; });
    try {
      const { d: r } = await call(action, note);
      if (r.quoteNo) render(r, r.error || '');
      else render(d, r.error || 'Something went wrong. Please call the shop.');
    } catch { render(d, 'No connection. Check your internet and try again.'); }
  };
  document.getElementById('accept')?.addEventListener('click', () => answer('accept'));
  document.getElementById('decline')?.addEventListener('click', () => {
    document.getElementById('why').hidden = false;
    document.getElementById('note').focus();
  });
  document.getElementById('decline-yes')?.addEventListener('click', () => answer('decline', document.getElementById('note').value));
}

load();
