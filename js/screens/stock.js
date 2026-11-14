// Stock: parts and accessories on the shelf, low-stock alerts, supplier orders, suppliers and stocktake.
// Staff see what's in stock and the sell price; costs, orders, suppliers and stocktake are owner-only.
import * as repo from '../repo.js?v=20261114144809';
import { $, $$, esc, money, fmtDate, fmtDateTime, toast, modal, confirmBox } from '../ui.js?v=20261114144809';

let tab = 'parts', q = '', lowOnly = false;
const norm = s => String(s || '').toLowerCase();

export async function renderStock(view) {
  const owner = repo.auth.isOwner();
  if (!owner && tab !== 'parts') tab = 'parts';
  const tabs = [['parts', 'Parts'], ...(owner ? [['orders', 'Supplier orders'], ['suppliers', 'Suppliers'], ['count', 'Stocktake']] : [])];
  view.innerHTML = `
    <div class="page-head"><h1>Stock</h1><span class="spacer"></span><div id="st-actions" class="row"></div></div>
    <div class="chips" style="margin-bottom:14px">${tabs.map(([id, l]) => `<button class="chip ${id === tab ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('')}</div>
    <div id="st-body"></div>`;
  $$('[data-tab]', view).forEach(b => b.onclick = () => { tab = b.dataset.tab; renderStock(view); });
  const body = $('#st-body', view), actions = $('#st-actions', view), again = () => renderStock(view);
  if (tab === 'parts') return parts(body, actions, owner, again);
  if (tab === 'orders') return orders(body, actions, again);
  if (tab === 'suppliers') return suppliers(body, actions, again);
  if (tab === 'count') return stocktake(body, actions, again);
}

// ───────────── Parts ─────────────
async function parts(body, actions, owner, again) {
  const items = await repo.listProducts({ all: owner });
  const low = items.filter(repo.isLow);
  if (owner) {
    actions.innerHTML = '<button class="btn primary" id="st-new">+ Add item</button>';
    $('#st-new', actions).onclick = () => productModal(null, again);
  }
  body.innerHTML = `
    ${low.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b style="color:var(--warn)">${low.length} item${low.length === 1 ? ' is' : 's are'} at or below the minimum:</b>
      ${low.slice(0, 8).map(p => esc(`${p.name} (${p.qty})`)).join(', ')}${low.length > 8 ? '…' : ''}
      ${owner ? ' <a href="#" id="st-reorder">Start a supplier order</a>' : ''}</div>` : ''}
    <div class="row" style="margin-bottom:12px"><input type="search" id="st-q" placeholder="Search name, device, SKU, barcode" style="max-width:380px" autocomplete="off">
      <label class="check"><input type="checkbox" id="st-low"> Low stock only</label></div>
    <div id="st-list"></div>`;
  const input = $('#st-q', body), lowCb = $('#st-low', body);
  input.value = q; lowCb.checked = lowOnly;
  const draw = () => {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    const list = items.filter(p => (!lowOnly || repo.isLow(p)) &&
      words.every(w => norm(`${p.name} ${p.device} ${p.category} ${p.sku} ${p.barcode}`).includes(w)));
    $('#st-list', body).innerHTML = list.length ? `<div style="overflow-x:auto"><table class="lines num">
      <thead><tr><th>Item</th><th>In stock</th><th>Min</th><th>Sell price</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr class="${p.active === false ? 'muted' : ''}">
        <td style="text-align:left"><b>${esc(p.name)}</b><div class="muted">${esc([p.device, p.category, p.sku].filter(Boolean).join(' · '))}${p.active === false ? ' · not in use' : ''}</div></td>
        <td>${repo.isLow(p) ? `<span class="tag hot">${p.qty}</span>` : p.qty}</td><td>${p.minQty || 0}</td><td>${money(p.sellPrice)}</td>
        <td><button class="btn small" data-hist="${p.id}">History</button>${owner ? ` <button class="btn small" data-edit="${p.id}">Edit</button>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>` : `<div class="card empty">${items.length ? 'Nothing matches.' : owner
      ? 'No stock items yet. Tap + Add item for parts and accessories you keep on the shelf, then receive a supplier order to fill them up.'
      : 'No stock items yet. The owner adds them.'}</div>`;
    $$('[data-edit]', body).forEach(b => b.onclick = () => productModal(items.find(p => p.id === b.dataset.edit), again));
    $$('[data-hist]', body).forEach(b => b.onclick = () => historyModal(items.find(p => p.id === b.dataset.hist)));
  };
  input.oninput = () => { q = input.value; draw(); };
  lowCb.onchange = () => { lowOnly = lowCb.checked; draw(); };
  $('#st-reorder', body)?.addEventListener('click', e => { e.preventDefault(); orderModal({ lines: low.map(p => ({ productId: p.id, name: p.name, qty: Math.max(1, (p.minQty || 0) * 2 - p.qty), cost: '' })) }, () => { tab = 'orders'; again(); }); });
  draw();
}

async function productModal(p, after) {
  const [suppliers, cost] = await Promise.all([repo.listSuppliers(), p ? repo.productCost(p.id) : Promise.resolve('')]);
  const m = modal(`
    <h2>${p ? 'Edit item' : 'New stock item'}</h2>
    <label class="field">Name<input type="text" id="pr-name" value="${esc(p?.name || '')}" placeholder="e.g. iPhone 13 screen (OLED)"></label>
    <div class="grid-2">
      <label class="field">Fits device <span class="hint">optional</span><input type="text" id="pr-device" value="${esc(p?.device || '')}" placeholder="iPhone 13"></label>
      <label class="field">Category<select id="pr-cat">${repo.PRODUCT_CATEGORIES.map(c => `<option ${c === p?.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Sell price (R)<input type="number" id="pr-sell" min="0" step="0.01" value="${esc(p?.sellPrice ?? '')}"></label>
      <label class="field">Cost price (R) <span class="hint">owner only</span><input type="number" id="pr-cost" min="0" step="0.01" value="${esc(cost ?? '')}"></label>
      <label class="field">Alert when at or below<input type="number" id="pr-min" min="0" step="1" value="${esc(p?.minQty ?? 1)}"></label>
      <label class="field">Supplier<select id="pr-sup"><option value="">—</option>${suppliers.map(s => `<option value="${s.id}" ${s.id === p?.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field">SKU / part no. <span class="hint">optional</span><input type="text" id="pr-sku" value="${esc(p?.sku || '')}"></label>
      <label class="field">Barcode <span class="hint">optional</span><input type="text" id="pr-bar" value="${esc(p?.barcode || '')}"></label>
    </div>
    ${p ? `<div class="grid-2"><label class="field">In stock now<input type="number" id="pr-qty" min="0" step="1" value="${p.qty}"></label>
      <label class="check"><input type="checkbox" id="pr-active" ${p.active !== false ? 'checked' : ''}> In use</label></div>`
      : '<p class="muted" style="margin:0">Starts at 0. Receive a supplier order to add stock, or edit the quantity after saving.</p>'}
    <p class="error-msg" id="pr-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pr-ok">Save</button></div>`, { wide: true });
  const v = id => m.el.querySelector(id)?.value;
  m.el.querySelector('#pr-ok').onclick = async () => {
    try {
      const saved = await repo.saveProduct({ ...(p || {}), name: v('#pr-name'), device: v('#pr-device'), category: v('#pr-cat'),
        sellPrice: v('#pr-sell'), minQty: v('#pr-min'), supplierId: v('#pr-sup') || null, sku: v('#pr-sku'), barcode: v('#pr-bar'),
        active: p ? m.el.querySelector('#pr-active').checked : true }, v('#pr-cost'));
      if (p && Number(v('#pr-qty')) !== p.qty) await repo.adjustStock(saved, v('#pr-qty'));
      m.close(); toast('Saved'); after();
    } catch (ex) { const e = m.el.querySelector('#pr-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

async function historyModal(p) {
  const moves = await repo.stockHistory(p.id);
  const label = { received: 'Received', used: 'Used on job', returned: 'Put back', sold: 'Sold', adjust: 'Adjusted', stocktake: 'Stocktake' };
  modal(`<h2>${esc(p.name)}</h2><p class="muted" style="margin:0">${p.qty} in stock now</p>
    ${moves.length ? `<div style="overflow-x:auto;max-height:55vh"><table class="lines num"><tbody>${moves.map(mv => `<tr>
      <td style="text-align:left">${fmtDateTime(mv.createdAt)}</td><td style="text-align:left">${esc(label[mv.reason] || mv.reason)}</td>
      <td style="text-align:left">${mv.jobId ? `<a href="#job-${mv.jobId}" data-close>${esc(mv.ref)}</a>` : esc(mv.ref || '')}</td>
      <td>${mv.qtyChange > 0 ? '+' : ''}${mv.qtyChange}</td><td>${esc(mv.staffName || '')}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">No movements yet.</p>'}
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`, { wide: true });
}

// ───────────── Supplier orders ─────────────
const STATUS = { draft: 'Draft', ordered: 'Ordered', received: 'Received', cancelled: 'Cancelled' };
async function orders(body, actions, again) {
  const list = await repo.listOrders();
  actions.innerHTML = '<button class="btn primary" id="po-new">+ New order</button>';
  $('#po-new', actions).onclick = () => orderModal({}, again);
  body.innerHTML = list.length ? `<div class="list">${list.map(o => `
    <div class="list-row" style="cursor:default"><span class="grow"><b class="mono">${esc(o.poNo || 'New')}</b> · ${esc(o.supplierName || 'No supplier')}
      <div class="muted">${o.lines.length} item${o.lines.length === 1 ? '' : 's'} · ${money(o.total)} · ${fmtDate(o.createdAt)}${o.receivedAt ? ` · received ${fmtDate(o.receivedAt)}` : ''}</div></span>
      <span class="badge ${o.status === 'received' ? 'owner' : ''}">${STATUS[o.status]}</span>
      ${['draft', 'ordered'].includes(o.status) ? `<button class="btn small" data-po-edit="${o.id}">Edit</button>` : ''}
      ${o.status === 'draft' ? `<button class="btn small" data-po-sent="${o.id}">Mark ordered</button>` : ''}
      ${['draft', 'ordered'].includes(o.status) ? `<button class="btn small primary" data-po-recv="${o.id}">Receive</button>` : ''}
    </div>`).join('')}</div>` : '<div class="card empty">No supplier orders yet. Create one to restock parts; receiving it adds the stock and records the cost.</div>';
  const find = id => list.find(o => o.id === id);
  $$('[data-po-edit]', body).forEach(b => b.onclick = () => orderModal(find(b.dataset.poEdit), again));
  $$('[data-po-sent]', body).forEach(b => b.onclick = async () => { await repo.setOrderStatus(find(b.dataset.poSent), 'ordered'); toast('Marked as ordered'); again(); });
  $$('[data-po-recv]', body).forEach(b => b.onclick = () => receiveModal(find(b.dataset.poRecv), again));
}

async function orderModal(o, after) {
  const [suppliers, products] = await Promise.all([repo.listSuppliers(), repo.listProducts()]);
  const lines = (o.lines || []).map(l => ({ productId: l.productId || l.product_id, name: l.name, qty: l.qty, cost: l.cost }));
  for (const l of lines) if (l.cost === '' || l.cost === undefined) l.cost = (await repo.productCost(l.productId)) || '';
  const m = modal(`
    <h2>${o.id ? `Edit ${esc(o.poNo || 'order')}` : 'New supplier order'}</h2>
    <label class="field">Supplier<select id="po-sup"><option value="">—</option>${suppliers.map(s => `<option value="${s.id}" ${s.id === o.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <div id="po-lines"></div>
    <div class="row"><select id="po-add" style="flex:1;min-width:200px"><option value="">+ Add an item…</option>${products.map(p => `<option value="${p.id}">${esc(p.name)} (${p.qty} in stock)</option>`).join('')}</select></div>
    <label class="field">Notes <span class="hint">optional</span><input type="text" id="po-notes" value="${esc(o.notes || '')}"></label>
    <p class="num" id="po-total" style="margin:0;font-weight:700"></p>
    <p class="error-msg" id="po-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="po-ok">Save order</button></div>`, { wide: true });
  const box = m.el.querySelector('#po-lines');
  const draw = () => {
    box.innerHTML = lines.length ? `<table class="lines num"><thead><tr><th>Item</th><th>Qty</th><th>Cost each</th><th></th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td style="text-align:left">${esc(l.name)}</td>
        <td><input type="number" min="1" step="1" value="${esc(l.qty)}" data-qty="${i}" style="width:84px;min-height:40px"></td>
        <td><input type="number" min="0" step="0.01" value="${esc(l.cost)}" data-cost="${i}" style="width:110px;min-height:40px"></td>
        <td><button class="btn small ghost" data-rm="${i}">×</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No items yet.</p>';
    box.querySelectorAll('[data-qty]').forEach(x => x.oninput = () => { lines[x.dataset.qty].qty = x.value; total(); });
    box.querySelectorAll('[data-cost]').forEach(x => x.oninput = () => { lines[x.dataset.cost].cost = x.value; total(); });
    box.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { lines.splice(Number(x.dataset.rm), 1); draw(); });
    total();
  };
  const total = () => { m.el.querySelector('#po-total').textContent = `Total ${money(lines.reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0))}`; };
  m.el.querySelector('#po-add').onchange = async e => {
    const p = products.find(x => x.id === e.target.value); e.target.value = '';
    if (p && !lines.some(l => l.productId === p.id)) lines.push({ productId: p.id, name: p.name, qty: 1, cost: (await repo.productCost(p.id)) || '' });
    draw();
  };
  m.el.querySelector('#po-ok').onclick = async () => {
    try {
      await repo.saveOrder({ ...o, supplierId: m.el.querySelector('#po-sup').value || null, notes: m.el.querySelector('#po-notes').value, lines });
      m.close(); toast('Order saved'); after();
    } catch (ex) { const e = m.el.querySelector('#po-err'); e.textContent = ex.message; e.hidden = false; }
  };
  draw();
}

function receiveModal(o, after) {
  const m = modal(`
    <h2>Receive ${esc(o.poNo || 'order')}</h2>
    <p style="margin:0">Adds ${o.lines.map(l => `${l.qty} × ${esc(l.name)}`).join(', ')} to stock, saves the cost prices, and records ${money(o.total)} as a parts expense.</p>
    <label class="field">Paid with<select id="rc-method">${repo.MONEY_METHODS.map(x => `<option ${x === 'EFT' ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <p class="error-msg" id="rc-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="rc-ok">Receive into stock</button></div>`);
  m.el.querySelector('#rc-ok').onclick = async () => {
    try { await repo.receiveOrder(o, m.el.querySelector('#rc-method').value); m.close(); toast('Stock received'); after(); }
    catch (ex) { const e = m.el.querySelector('#rc-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

// ───────────── Suppliers ─────────────
async function suppliers(body, actions, again) {
  const list = await repo.listSuppliers();
  actions.innerHTML = '<button class="btn primary" id="sp-new">+ Add supplier</button>';
  $('#sp-new', actions).onclick = () => supplierModal(null, again);
  body.innerHTML = list.length ? `<div class="list">${list.map(s => `<button class="list-row" data-sp="${s.id}">
      <span class="grow"><b>${esc(s.name)}</b><div class="muted">${esc([s.contact, s.phone, s.email].filter(Boolean).join(' · '))}</div></span></button>`).join('')}</div>`
    : '<div class="card empty">No suppliers yet.</div>';
  $$('[data-sp]', body).forEach(b => b.onclick = () => supplierModal(list.find(s => s.id === b.dataset.sp), again));
}

function supplierModal(s, after) {
  const m = modal(`
    <h2>${s ? 'Edit supplier' : 'New supplier'}</h2>
    <label class="field">Name<input type="text" id="sp-name" value="${esc(s?.name || '')}"></label>
    <div class="grid-2">
      <label class="field">Contact person<input type="text" id="sp-contact" value="${esc(s?.contact || '')}"></label>
      <label class="field">Phone<input type="tel" id="sp-phone" value="${esc(s?.phone || '')}"></label>
      <label class="field">Email<input type="email" id="sp-email" value="${esc(s?.email || '')}"></label>
    </div>
    <label class="field">Notes<textarea id="sp-notes" rows="2">${esc(s?.notes || '')}</textarea></label>
    <p class="error-msg" id="sp-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sp-ok">Save</button></div>`);
  const v = id => m.el.querySelector(id).value;
  m.el.querySelector('#sp-ok').onclick = async () => {
    try {
      await repo.saveSupplier({ ...(s || {}), name: v('#sp-name'), contact: v('#sp-contact'), phone: v('#sp-phone'), email: v('#sp-email'), notes: v('#sp-notes') });
      m.close(); toast('Supplier saved'); after();
    } catch (ex) { const e = m.el.querySelector('#sp-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

// ───────────── Stocktake ─────────────
async function stocktake(body, actions, again) {
  const items = await repo.listProducts();
  actions.innerHTML = items.length ? '<button class="btn primary" id="sc-save">Save stocktake</button>' : '';
  body.innerHTML = items.length ? `<p class="muted">Count what's on the shelf and type the number. Leave a box empty to keep the current figure.</p>
    <div style="overflow-x:auto"><table class="lines num"><thead><tr><th>Item</th><th>System says</th><th>Counted</th><th>Difference</th></tr></thead>
    <tbody>${items.map(p => `<tr><td style="text-align:left">${esc(p.name)}<div class="muted">${esc(p.device || '')}</div></td><td>${p.qty}</td>
      <td><input type="number" min="0" step="1" data-count="${p.id}" style="width:96px;min-height:40px" inputmode="numeric"></td><td data-diff="${p.id}"></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="card empty">Add stock items first.</div>';
  $$('[data-count]', body).forEach(inp => inp.oninput = () => {
    const p = items.find(x => x.id === inp.dataset.count), cell = $(`[data-diff="${p.id}"]`, body);
    const d = inp.value === '' ? null : Number(inp.value) - p.qty;
    cell.textContent = d === null || d === 0 ? (d === 0 ? '✓' : '') : (d > 0 ? `+${d}` : String(d));
    cell.className = d < 0 ? 'neg' : '';
  });
  $('#sc-save', actions)?.addEventListener('click', async () => {
    const counts = $$('[data-count]', body).filter(i => i.value !== '').map(i => ({ productId: i.dataset.count, counted: Math.max(0, Math.round(Number(i.value))) }));
    if (!counts.length) return toast('Type at least one count first', 'error');
    if (!(await confirmBox(`Save ${counts.length} count${counts.length === 1 ? '' : 's'}? Stock levels will be set to what you counted.`, { ok: 'Save stocktake' }))) return;
    const n = await repo.saveStocktake(counts);
    toast(`Stocktake saved: ${n} item${n === 1 ? '' : 's'} changed`); again();
  });
}
