// Public tracking page: reads the job status through the "track" server function (no login).
import { CONFIG } from './config.js?v=20261107143707';
import { esc, money, fmtDate, fmtDateTime } from './ui.js?v=20261107143707';

const app = document.getElementById('app');
const ORDER = ['Booked in', 'Being checked', 'Being repaired', 'Ready to collect', 'Collected'];
const STAGE = { booked: 0, diagnosing: 1, approval: 1, parts: 1, repairing: 2, ready: 3, collected: 4 };

async function load() {
  const token = new URLSearchParams(location.search).get('t');
  if (!token || !CONFIG.supabaseUrl) return show('<h1>Link not recognised</h1><p class="muted">Please scan the QR code on your job card again, or call the shop.</p>');
  try {
    const r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/track`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.supabaseKey },
      body: JSON.stringify({ token }),
    });
    const d = await r.json();
    if (!r.ok) return show(`<h1>Repair not found</h1><p class="muted">${esc(d.error || 'Please call the shop.')}</p>`);
    render(d);
  } catch {
    show('<h1>Can’t load right now</h1><p class="muted">Check your internet connection and refresh the page.</p>');
  }
}

function show(inner) { app.innerHTML = `<div class="brand"><img src="icons/icon.svg" alt=""><span>iAssist</span></div><div class="card">${inner}</div>`; }

function render(d) {
  document.title = `${d.jobNo} · ${d.statusLabel} · ${d.shop.name}`;
  const stage = STAGE[d.status] ?? 0;
  const due = d.warranty || d.quote === null || d.quote === undefined ? null : Math.max(0, (d.quote || 0) - (d.deposit || 0));
  const done = d.status === 'ready' || d.status === 'collected';
  app.innerHTML = `
    <div class="brand"><img src="icons/icon.svg" alt=""><span>${esc(d.shop.name)}</span></div>
    <div class="card">
      <div class="muted">Repair ${esc(d.jobNo)}</div>
      <h1>Hi ${esc(d.firstName)}, here’s your ${esc(d.model)}</h1>
      <span class="status ${done ? 'done' : ''}">${esc(d.statusLabel)}</span>
      <p class="muted" style="margin:10px 0 0">Updated ${fmtDateTime(d.statusAt)}</p>
    </div>
    <div class="card"><ol class="steps">${ORDER.map((label, i) => {
      const when = i === 0 ? d.bookedAt : i === stage ? d.statusAt : i === 4 ? d.collectedAt : null;
      return `<li class="${i <= stage ? '' : 'todo'}"><b>${esc(label)}</b>${i <= stage && when ? `<div class="when">${fmtDateTime(when)}</div>` : ''}</li>`;
    }).join('')}</ol></div>
    <div class="card"><dl>
      ${d.readyBy && !done ? `<dt>Expected ready</dt><dd>${fmtDate(d.readyBy)}</dd>` : ''}
      <dt>Cost</dt><dd>${d.warranty ? 'No charge (warranty)' : d.quote === null || d.quote === undefined ? 'We’ll confirm the price with you first' : money(d.quote)}</dd>
      ${due && d.status !== 'collected' ? `<dt>Still to pay</dt><dd><b>${money(due)}</b></dd>` : ''}
      ${d.warrantyUntil ? `<dt>Warranty until</dt><dd>${fmtDate(d.warrantyUntil)}</dd>` : ''}
    </dl></div>
    <div class="card"><b>${esc(d.shop.name)}</b><div class="muted">${esc(d.shop.address)}</div>
      ${d.shop.hours ? `<div class="muted">${esc(d.shop.hours)}</div>` : ''}
      ${d.shop.phone ? `<div style="margin-top:8px">Questions? Call <b>${esc(d.shop.phone)}</b></div>` : ''}</div>`;
}

load();
