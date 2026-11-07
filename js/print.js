// Printable job card (AirPrint from the iPad's share/print dialog).
import * as repo from './repo.js?v=20261107143707';
import { $, esc, money, fmtDate, fmtDateTime } from './ui.js?v=20261107143707';
import { deviceType, collectionLabel } from './devices.js?v=20261107143707';

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
