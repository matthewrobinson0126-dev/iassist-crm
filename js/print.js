// Printable job card (AirPrint from the iPad's share/print dialog).
import * as repo from './repo.js?v=20261114144809';
import { $, esc, money, fmtDate, fmtDateTime } from './ui.js?v=20261114144809';
import { deviceType, collectionLabel } from './devices.js?v=20261114144809';

// QR code as inline SVG (qrcode-generator library). Empty string if the library didn't load.
export function qrSvg(text, cell = 3) {
  if (!text || typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

async function trackingBlock(job) {
  if (!repo.auth.cloud) return '';
  const j = await repo.ensureTrackToken(job);
  const url = repo.trackUrl(j);
  return `<div class="pc-qr">${qrSvg(url, 2)}<div><b>Track your repair</b><br>Scan the code to see the live status of ${esc(j.jobNo)}.</div></div>`;
}

const pcHead = (settings, job, title) => `
  <div class="pc-head">
    <div><h1>${esc(settings.shopName)}</h1><div>${esc(settings.address)}</div>
      <div>${esc([settings.phone, settings.email].filter(Boolean).join(' · '))}</div></div>
    <div><div class="pc-no">${esc(job.jobNo)}</div><div>${esc(title)}</div></div>
  </div>`;

// Hand-over document: what was done, what it cost, warranty, customer's collection signature.
export async function printCompletion(job) {
  setPageSize('');
  const settings = await repo.getSettings();
  const customer = await repo.getCustomer(job.customerId);
  const sigOut = await repo.fileUrl(job.signatureOut);
  const lines = job.lines || [];
  $('#print-area').innerHTML = `
    <div class="pc">
      ${pcHead(settings, job, 'Certificate of completion')}
      <div class="pc-grid">
        <div><h3>Customer</h3><dl><dt>Name</dt><dd>${esc(customer?.name || job.customerName)}</dd>
          ${customer?.type === 'business' ? `<dt>Company</dt><dd>${esc(customer.companyName || '')}${customer.vatNumber ? ` · VAT ${esc(customer.vatNumber)}` : ''}</dd>` : ''}
          <dt>Phone</dt><dd>${esc(customer?.phone || job.customerPhone)}</dd></dl></div>
        <div><h3>Device</h3><dl><dt>Model</dt><dd>${esc(job.model)}${job.colour ? `, ${esc(job.colour)}` : ''}</dd>
          <dt>IMEI / serial</dt><dd>${esc(job.serial || '—')}</dd>
          <dt>Booked in</dt><dd>${fmtDate(job.createdAt)}</dd>
          <dt>Completed</dt><dd>${fmtDate(job.collectedAt || job.statusAt)}</dd></dl></div>
      </div>
      <h3>Work done</h3>
      <div>${esc(job.workDone || (job.faults || []).join(', ') || '—')}</div>
      ${lines.length ? `<table class="pc-lines"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${lines.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="pc-grid">
        <div><h3>Payment</h3><dl>
          <dt>Total</dt><dd>${job.jobType === 'warranty' ? 'No charge (warranty)' : money(job.quote)}</dd>
          ${job.deposit ? `<dt>Deposit</dt><dd>${money(job.deposit)}</dd>` : ''}
          ${job.paidMethod ? `<dt>Paid</dt><dd>${esc(job.paidMethod)} ${job.paidAmount !== null && job.paidAmount !== undefined ? money(job.paidAmount) : ''}</dd>` : ''}
        </dl></div>
        <div><h3>Warranty</h3><div>${job.warrantyUntil ? `Covered until <b>${fmtDate(job.warrantyUntil)}</b> for the work listed above.` : 'See our terms.'}
          ${job.warrantyOfNo ? `<br>Warranty return for ${esc(job.warrantyOfNo)}.` : ''}</div></div>
      </div>
      <div class="pc-sig">
        <div>${sigOut ? `<img src="${sigOut}" alt="">` : '<div style="height:70px;border-bottom:1px solid #000;width:240px"></div>'}<div>Customer signature (device received)</div></div>
        <div><div style="height:70px;border-bottom:1px solid #000;width:200px"></div><div>Technician: ${esc(job.technicianName || '')}</div></div>
      </div>
    </div>`;
  await Promise.all([...document.querySelectorAll('#print-area img')].map(i => i.decode().catch(() => {})));
  window.print();
}

// Till slip for a counter sale.
export async function printReceipt(sale) {
  setPageSize('');
  const settings = await repo.getSettings();
  const lines = sale.lines || [];
  $('#print-area').innerHTML = `
    <div class="pc">
      ${pcHead(settings, { jobNo: sale.saleNo || sale.sale_no }, 'Receipt')}
      <div>${fmtDate(sale.createdAt || sale.created_at)} · ${esc(sale.customerName || sale.customer_name || 'Walk-in customer')}</div>
      <table class="pc-lines"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${lines.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
      ${Number(sale.discount) ? `<p style="text-align:right">Discount −${money(sale.discount)}</p>` : ''}
      <p style="text-align:right;font-size:14pt"><b>Total ${money(sale.total)}</b> · paid by ${esc(sale.method)}</p>
      <p>Served by ${esc(sale.staffName || sale.staff_name || '')}. Thank you for shopping with ${esc(settings.shopName)}.</p>
    </div>`;
  window.print();
}

export async function printJobCard(job) {
  setPageSize('');
  const settings = await repo.getSettings();
  const track = await trackingBlock(job);
  const customer = await repo.getCustomer(job.customerId);
  const sigIn = await repo.fileUrl(job.signatureIn);
  const sigOut = await repo.fileUrl(job.signatureOut);
  const list = a => (a && a.length ? a.map(esc).join(', ') : '—');
  $('#print-area').innerHTML = `
    <div class="pc">
      <div class="pc-head">
        <div><h1>${esc(settings.shopName)}</h1><div>${esc(settings.address)}</div>
          <div>${esc([settings.phone, settings.email].filter(Boolean).join(' · '))}</div></div>
        <div><div class="pc-no">${esc(job.jobNo)}</div><div>Booked in ${fmtDateTime(job.createdAt)}</div>
          <div>By ${esc(job.createdByName || '')}</div></div>
      </div>
      <div class="pc-grid">
        <div><h3>Customer</h3><dl>
          <dt>Name</dt><dd>${esc(customer?.name || job.customerName)}</dd>
          ${customer?.type === 'business' ? `<dt>Company</dt><dd>${esc(customer.companyName || '')}${customer.vatNumber ? ` · VAT ${esc(customer.vatNumber)}` : ''}</dd>` : ''}
          <dt>Phone</dt><dd>${esc(customer?.phone || job.customerPhone)}</dd>
          ${customer?.email ? `<dt>Email</dt><dd>${esc(customer.email)}</dd>` : ''}
        </dl></div>
        <div><h3>Device</h3><dl>
          <dt>Type</dt><dd>${esc(deviceType(job.deviceType)?.label || job.deviceType)}</dd>
          <dt>Model</dt><dd>${esc(job.model)}${job.colour ? `, ${esc(job.colour)}` : ''}</dd>
          <dt>IMEI / serial</dt><dd>${esc(job.serial || '—')}</dd>
          <dt>Powers on</dt><dd>${esc(job.powersOn || '—')}</dd>
        </dl></div>
        <div><h3>Fault</h3><div>${list(job.faults)}</div>${job.faultNotes ? `<div>${esc(job.faultNotes)}</div>` : ''}</div>
        <div><h3>Condition at book-in</h3><div>${list(job.damage)}</div>${job.conditionNotes ? `<div>${esc(job.conditionNotes)}</div>` : ''}
          <div><b>Accessories left:</b> ${list(job.accessories)}</div></div>
        <div><h3>Quote</h3><dl>
          <dt>Quote</dt><dd>${job.quote === null ? 'After assessment' : money(job.quote)}</dd>
          ${job.deposit ? `<dt>Deposit</dt><dd>${money(job.deposit)}</dd>` : ''}
          ${job.dueDate ? `<dt>Est. ready</dt><dd>${fmtDate(job.dueDate)}</dd>` : ''}
          <dt>Return</dt><dd>${esc(collectionLabel(job.collection))}</dd>
        </dl></div>
        ${job.status === 'collected' ? `<div><h3>Collected</h3><dl>
          <dt>Date</dt><dd>${fmtDateTime(job.collectedAt)}</dd>
          <dt>Paid</dt><dd>${esc(job.paidMethod || '—')} ${job.paidAmount !== null && job.paidAmount !== undefined ? money(job.paidAmount) : ''}</dd>
          ${job.warrantyUntil ? `<dt>Warranty to</dt><dd>${fmtDate(job.warrantyUntil)}</dd>` : ''}
        </dl></div>` : ''}
      </div>
      ${track}
      <div class="pc-terms">${esc(job.termsText || settings.terms)}</div>
      <div class="pc-sig">
        <div>${sigIn ? `<img src="${sigIn}" alt="">` : ''}<div>Customer signature (book-in)</div></div>
        ${sigOut ? `<div><img src="${sigOut}" alt=""><div>Customer signature (collection)</div></div>` : ''}
      </div>
    </div>`;
  await Promise.all([...document.querySelectorAll('#print-area img')].map(i => i.decode().catch(() => {})));
  window.print();
}

// Printable / PDF quote (AirPrint, or "Save as PDF" in the print dialog).
export async function printQuote(q) {
  setPageSize('');
  const settings = await repo.getSettings();
  const customer = q.customerId ? await repo.getCustomer(q.customerId) : null;
  const url = repo.auth.cloud ? repo.quoteUrl(q) : '';
  const lines = q.lines || [];
  const vat = settings.vatNumber;
  const excl = Math.round((Number(q.total) / 1.15) * 100) / 100;
  $('#print-area').innerHTML = `
    <div class="pc">
      <div class="pc-head">
        <div><h1>${esc(settings.shopName)}</h1><div>${esc(settings.address)}</div>
          <div>${esc([settings.phone, settings.email].filter(Boolean).join(' · '))}</div>${vat ? `<div>VAT no. ${esc(vat)}</div>` : ''}</div>
        <div><div class="pc-no">${esc(q.quoteNo || '')}</div><div>${vat ? 'Quotation' : 'Quote'}</div>
          <div>${fmtDate(q.sentAt || q.createdAt)}</div>${q.jobNo ? `<div>Job ${esc(q.jobNo)}</div>` : ''}</div>
      </div>
      <div class="pc-grid">
        <div><h3>Customer</h3><dl><dt>Name</dt><dd>${esc(customer?.name || q.customerName)}</dd>
          ${customer?.type === 'business' ? `<dt>Company</dt><dd>${esc(customer.companyName || '')}${customer.vatNumber ? ` · VAT ${esc(customer.vatNumber)}` : ''}</dd>` : ''}
          <dt>Phone</dt><dd>${esc(customer?.phone || q.customerPhone)}</dd>
          ${customer?.email ? `<dt>Email</dt><dd>${esc(customer.email)}</dd>` : ''}</dl></div>
        <div><h3>Device</h3><dl><dt>Model</dt><dd>${esc(q.model || '—')}</dd>${q.fault ? `<dt>Problem</dt><dd>${esc(q.fault)}</dd>` : ''}</dl></div>
      </div>
      <table class="pc-lines"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>${lines.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)}</td><td>${money(l.price)}</td><td>${money(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
      <div style="text-align:right;margin-top:8px">
        ${vat ? `<div>Subtotal (excl. VAT) ${money(excl)}</div><div>VAT 15% ${money(Math.round((q.total - excl) * 100) / 100)}</div>` : ''}
        <div style="font-size:14pt"><b>Total${vat ? ' (incl. VAT)' : ''} ${money(q.total)}</b></div></div>
      ${q.notes ? `<h3>Notes</h3><div style="white-space:pre-line">${esc(q.notes)}</div>` : ''}
      <p>${q.validUntil ? `This quote is valid until <b>${fmtDate(q.validUntil)}</b>.` : ''} Prepared by ${esc(q.createdByName || '')}.</p>
      ${url ? `<div class="pc-qr">${qrSvg(url, 2)}<div><b>Accept online</b><br>Scan the code to view and accept or decline quote ${esc(q.quoteNo)}.</div></div>` : ''}
    </div>`;
  window.print();
}

// ───────────── Sticker labels (thermal / label printers) ─────────────
// The iPad prints to AirPrint printers only (e.g. Brother QL-820NWB). Pick the label size in Settings.
export const LABEL_SIZES = [
  { id: '62x29', label: 'Brother 62 × 29 mm (DK-11209)', w: 62, h: 29 },
  { id: '62x40', label: 'Brother 62 mm roll, cut at 40 mm', w: 62, h: 40 },
  { id: '50x30', label: 'Thermal 50 × 30 mm', w: 50, h: 30 },
  { id: '40x30', label: 'Thermal 40 × 30 mm', w: 40, h: 30 },
  { id: '58x40', label: 'Thermal 58 × 40 mm', w: 58, h: 40 },
  { id: '100x50', label: 'Thermal 100 × 50 mm', w: 100, h: 50 },
];
export const labelSize = id => LABEL_SIZES.find(x => x.id === id) || LABEL_SIZES[0];

// One <style> holds the paper size: labels set it, A4 documents clear it (falls back to app.css).
function setPageSize(css) {
  let el = document.getElementById('page-size');
  if (!el) { el = document.createElement('style'); el.id = 'page-size'; document.head.appendChild(el); }
  el.textContent = css;
}

export const jobLink = job => new URL(`#job-${job.id}`, location.href.split('#')[0]).href;

export async function printLabel(job, { copies } = {}) {
  const settings = await repo.getSettings();
  const size = labelSize(settings.labelSize);
  const n = Math.max(1, Math.min(5, Number(copies ?? settings.labelCopies) || 1));
  const qrWanted = settings.labelQr !== false;
  const fault = (job.faults || []).join(', ') || job.faultNotes || '';
  const no = String(job.jobNo || '');
  const r1 = n => Math.round(n * 10) / 10;
  const pad = r1(Math.max(1.4, size.h * 0.05)), gap = 1.5;
  const inner = size.w - 2 * pad;
  // Wide labels (62 × 29, 100 × 50): details left, QR right. Squarer labels: job number across the top, details + QR below.
  const wide = size.w / size.h >= 1.9;
  let qr, textW, k, noFs;
  if (wide) {
    qr = qrWanted ? r1(Math.min(size.h - 2 * pad, size.w * 0.36)) : 0;
    textW = inner - (qr ? qr + gap : 0);
    k = Math.min(size.h / 29, textW / 34);
    noFs = r1(Math.min(7 * k, textW / (no.length * 0.62)));
  } else {
    noFs = r1(Math.min(size.h * 0.24, inner / (no.length * 0.62)));
    const rowH = size.h - 2 * pad - noFs - 0.8;
    qr = qrWanted ? r1(Math.min(rowH, inner * 0.45)) : 0;
    textW = inner - (qr ? qr + gap : 0);
    k = Math.min(rowH / 16, textW / 26, 1.4);
  }
  const lines = `
        <div class="lb-l" style="font-size:${r1(3.1 * k)}mm;font-weight:700">${esc(job.customerName || '')}</div>
        <div class="lb-l" style="font-size:${r1(2.7 * k)}mm">${esc(job.model || '')}</div>
        ${fault ? `<div class="lb-f" style="font-size:${r1(2.4 * k)}mm">${esc(fault)}</div>` : ''}
        <div class="lb-l" style="font-size:${r1(2.1 * k)}mm">${fmtDate(job.createdAt)}${job.urgent ? ' · URGENT' : ''}${job.jobType === 'warranty' ? ' · WARRANTY' : ''}</div>`;
  const qrBox = qr ? `<div class="lb-qr" style="width:${qr}mm;height:${qr}mm">${qrSvg(jobLink(job), 2)}</div>` : '';
  const noDiv = `<div class="lb-no" style="font-size:${noFs}mm">${esc(no)}</div>`;
  const one = `
    <div class="lb ${wide ? '' : 'lb-stack'}" style="width:${size.w}mm;height:${size.h}mm;padding:${pad}mm">
      ${wide ? `<div class="lb-row" style="gap:${gap}mm"><div class="lb-text">${noDiv}${lines}</div>${qrBox}</div>`
        : `${noDiv}<div class="lb-row" style="gap:${gap}mm"><div class="lb-text">${lines}</div>${qrBox}</div>`}
    </div>`;
  $('#print-area').innerHTML = Array.from({ length: n }, () => one).join('');
  setPageSize(`@media print { @page { size: ${size.w}mm ${size.h}mm; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; } }`);
  window.print();
}

// A sample label for checking the size in Settings.
export function printTestLabel() {
  return printLabel({ id: 'test', jobNo: 'IA-0123', customerName: 'Test Customer', model: 'iPhone 13 Pro',
    faults: ['Screen', 'Battery'], createdAt: new Date().toISOString() }, { copies: 1 });
}
