// Counter sales: sell accessories or a quick service without booking in a device. Stock comes off automatically.
import * as repo from '../repo.js?v=20261107152030';
import { $, $$, esc, money, fmtDateTime, toast, modal } from '../ui.js?v=20261107152030';
import { printReceipt } from '../print.js?v=20261107152030';

let cart = [], customer = null, customerName = '', discount = '', method = '';
const norm = s => String(s || '').toLowerCase();
const subtotal = () => cart.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

export async function renderSell(view) {
  const [items, sales] = await Promise.all([repo.listProducts(), repo.listSales()]);
  const total = Math.max(0, subtotal() - (Number(discount) || 0));
  view.innerHTML = `
    <div class="page-head"><h1>Counter sale</h1><span class="spacer"></span>
      ${cart.length ? '<button class="btn ghost small" id="sl-clear">Clear</button>' : ''}</div>
    <div class="job-layout">
      <div class="stack">
        <div class="card stack"><h2 style="margin:0">Add items</h2>
          <input type="search" id="sl-q" placeholder="Search stock: cable, case, screen protector…" autocomplete="off">
          <div class="result-list" id="sl-results"></div>
          <button class="btn small" id="sl-custom" style="justify-self:start">+ Item not in stock</button>
        </div>
        <div class="card"><h2>Recent sales</h2>
          ${sales.length ? `<div class="list">${sales.slice(0, 10).map(s => `<button class="list-row" data-sale="${s.id}">
            <span class="grow"><b class="mono">${esc(s.saleNo)}</b> · ${esc(s.customerName || 'Walk-in')}<div class="muted">${fmtDateTime(s.createdAt)} · ${esc(s.method)} · ${esc(s.staffName || '')}</div></span>
            <b class="num">${money(s.total)}</b></button>`).join('')}</div>` : '<p class="muted" style="margin:0">No counter sales yet.</p>'}
        </div>
      </div>
      <div class="card stack" style="position:sticky;top:90px">
        <h2 style="margin:0">Sale</h2>
        ${cart.length ? `<table class="lines num"><tbody>${cart.map((l, i) => `<tr>
          <td style="text-align:left">${esc(l.name)}${l.productId ? ` <span class="muted">(${l.stock} left)</span>` : ''}</td>
          <td><input type="number" min="1" step="1" value="${esc(l.qty)}" data-qty="${i}" style="width:70px;min-height:40px" aria-label="Quantity"></td>
          <td><input type="number" min="0" step="0.01" value="${esc(l.price)}" data-price="${i}" style="width:100px;min-height:40px" aria-label="Price"></td>
          <td><button class="btn small ghost" data-rm="${i}" aria-label="Remove">×</button></td></tr>`).join('')}</tbody></table>`
          : '<p class="muted" style="margin:0">Tap an item on the left to add it.</p>'}
        <label class="field">Customer <span class="hint">optional</span><input type="text" id="sl-cust" value="${esc(customer?.name || customerName)}" placeholder="Walk-in" list="sl-cust-list" autocomplete="off"></label>
        <datalist id="sl-cust-list"></datalist>
        <label class="field">Discount (R) <span class="hint">optional</span><input type="number" id="sl-disc" min="0" step="0.01" value="${esc(discount)}"></label>
        <div class="field">Paid with<div class="chips">${repo.MONEY_METHODS.map(m => `<button class="chip ${m === method ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div></div>
        <div class="row num" style="font-size:1.3rem;font-weight:800"><span>Total</span><span class="spacer"></span><span id="sl-total">${money(total)}</span></div>
        <p class="error-msg" id="sl-err" hidden></p>
        <button class="btn primary big" id="sl-done" ${cart.length ? '' : 'disabled'}>Complete sale</button>
      </div>
    </div>`;

  const again = () => renderSell(view);
  const search = $('#sl-q', view), results = $('#sl-results', view);
  const drawResults = () => {
    const words = norm(search.value).split(/\s+/).filter(Boolean);
    const hits = items.filter(p => p.qty > 0 && words.every(w => norm(`${p.name} ${p.device} ${p.category} ${p.sku} ${p.barcode}`).includes(w)));
    results.innerHTML = (words.length ? hits : hits.filter(p => p.category === 'Accessories').concat(hits.filter(p => p.category !== 'Accessories'))).slice(0, 12)
      .map(p => `<button class="result" data-add="${p.id}"><span style="flex:1"><b>${esc(p.name)}</b><div class="meta">${p.qty} in stock</div></span><b class="num">${money(p.sellPrice)}</b></button>`).join('')
      || `<p class="muted" style="margin:0">${items.length ? 'Nothing in stock matches.' : 'No stock items yet. Add them on the Stock page, or use “Item not in stock”.'}</p>`;
    $$('[data-add]', results).forEach(b => b.onclick = () => {
      const p = items.find(x => x.id === b.dataset.add);
      const existing = cart.find(l => l.productId === p.id);
      if (existing) existing.qty = Math.min(p.qty, Number(existing.qty) + 1);
      else cart.push({ productId: p.id, name: p.name, qty: 1, price: p.sellPrice, stock: p.qty });
      again();
    });
  };
  search.oninput = drawResults; drawResults();

  const recalc = () => { $('#sl-total', view).textContent = money(Math.max(0, subtotal() - (Number(discount) || 0))); };
  $$('[data-qty]', view).forEach(x => x.oninput = () => { cart[x.dataset.qty].qty = x.value; recalc(); });
  $$('[data-price]', view).forEach(x => x.oninput = () => { cart[x.dataset.price].price = x.value; recalc(); });
  $$('[data-rm]', view).forEach(x => x.onclick = () => { cart.splice(Number(x.dataset.rm), 1); again(); });
  $$('[data-m]', view).forEach(x => x.onclick = () => { method = x.dataset.m; $$('[data-m]', view).forEach(y => y.classList.toggle('on', y === x)); });
  $('#sl-disc', view).oninput = e => { discount = e.target.value; recalc(); };
  $('#sl-clear', view)?.addEventListener('click', () => { cart = []; customer = null; customerName = ''; discount = ''; method = ''; again(); });
  $('#sl-custom', view).onclick = () => customItem(again);

  const custInput = $('#sl-cust', view);
  let found = [];
  custInput.oninput = async () => {
    customerName = custInput.value; customer = null;
    if (custInput.value.trim().length < 2) return;
    found = await repo.searchCustomers(custInput.value);
    $('#sl-cust-list', view).innerHTML = found.slice(0, 8).map(c => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join('');
    customer = found.find(c => c.name === custInput.value) || null;
  };

  $$('[data-sale]', view).forEach(b => b.onclick = () => printReceipt(sales.find(s => s.id === b.dataset.sale)));

  $('#sl-done', view).onclick = async () => {
    const err = $('#sl-err', view); err.hidden = true;
    const btn = $('#sl-done', view); btn.disabled = true;
    try {
      const sale = await repo.recordSale({ lines: cart, method, customer, customerName, discount });
      cart = []; customer = null; customerName = ''; discount = ''; method = '';
      toast(`${sale.saleNo} done: ${money(sale.total)}`);
      const m = modal(`<h2>Sale ${esc(sale.saleNo)} complete</h2><p class="num" style="font-size:1.4rem;margin:0"><b>${money(sale.total)}</b> · ${esc(sale.method)}</p>
        <div class="modal-actions"><button class="btn" id="rc-print">Print receipt</button><button class="btn primary" data-close>New sale</button></div>`);
      m.el.querySelector('#rc-print').onclick = () => printReceipt(sale);
      again();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  };
}

function customItem(after) {
  const m = modal(`<h2>Item not in stock</h2>
    <label class="field">What is it<input type="text" id="ci-name" placeholder="e.g. Data transfer, Screen protector fitting"></label>
    <label class="field">Price (R)<input type="number" id="ci-price" min="0" step="0.01"></label>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ci-ok">Add</button></div>`);
  m.el.querySelector('#ci-ok').onclick = () => {
    const name = m.el.querySelector('#ci-name').value.trim(), price = Number(m.el.querySelector('#ci-price').value);
    if (!name || !(price >= 0)) return;
    cart.push({ productId: null, name, qty: 1, price }); m.close(); after();
  };
}
