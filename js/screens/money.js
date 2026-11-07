// Money: today's takings by method, the payments list, shop expenses (owner) and the end-of-day cash-up.
import * as repo from '../repo.js?v=20261107142533';
import { $, $$, esc, money, fmtDate, fmtDateTime, toast, modal } from '../ui.js?v=20261107142533';

let day = null;

export async function renderMoney(view) {
  day ??= repo.todayKey();
  const owner = repo.auth.isOwner();
  const [s, cashups] = await Promise.all([repo.cashupSummary(day), repo.listCashups()]);
  const doneToday = cashups.find(c => c.day === day);
  const inTotal = s.list.filter(repo.isIn).reduce((t, p) => t + Number(p.amount), 0);
  const refunds = s.list.filter(p => p.kind === 'refund').reduce((t, p) => t + Number(p.amount), 0);

  view.innerHTML = `
    <div class="page-head"><h1>Money</h1>
      <input type="date" id="mo-day" value="${day}" max="${repo.todayKey()}" style="max-width:190px">
      <span class="spacer"></span>
      ${owner ? '<button class="btn" id="mo-expense">+ Shop expense</button>' : ''}
      <button class="btn primary" id="mo-cashup">${doneToday ? 'Cash-up done ✓' : 'Cash-up'}</button>
    </div>
    <div class="stat-row">
      <div class="stat"><span>Cash in the till</span><b class="num">${money(s.expectedCash)}</b><small>${money(s.cashIn)} in · ${money(s.cashOut)} out</small></div>
      <div class="stat"><span>Card</span><b class="num">${money(s.card)}</b></div>
      <div class="stat"><span>EFT</span><b class="num">${money(s.eft)}</b></div>
      <div class="stat"><span>Taken today</span><b class="num">${money(inTotal - refunds)}</b><small>${s.count} entr${s.count === 1 ? 'y' : 'ies'}</small></div>
    </div>
    ${doneToday ? `<p class="muted">Cashed up by ${esc(doneToday.staffName)} at ${fmtDateTime(doneToday.createdAt)}: counted ${money(doneToday.countedCash)},
      ${doneToday.difference === 0 ? 'exact' : doneToday.difference > 0 ? `${money(doneToday.difference)} over` : `${money(-doneToday.difference)} short`}.</p>` : ''}
    <div class="card" style="margin-top:14px"><h2>${day === repo.todayKey() ? 'Today' : fmtDate(day)}</h2>
      ${s.list.length ? `<div style="overflow-x:auto"><table class="lines num">
        <thead><tr><th>Time</th><th>Type</th><th>Job</th><th>Method</th><th>Amount</th><th>By</th></tr></thead>
        <tbody>${s.list.map(p => `<tr>
          <td>${new Date(p.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="text-align:left">${esc(repo.PAYMENT_KINDS[p.kind])}${p.category ? ` · ${esc(p.category)}` : ''}${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}</td>
          <td style="text-align:left">${p.jobId ? `<a href="#job-${p.jobId}">${esc(p.jobNo)}</a>` : '—'}</td>
          <td>${esc(p.method)}</td><td>${repo.isIn(p) ? '' : '−'}${money(p.amount)}</td><td>${esc(p.staffName || '')}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted" style="margin:0">No money in or out on this day yet. Deposits at book-in and payments at hand back appear here automatically.</p>'}
    </div>
    ${cashups.length ? `<div class="card" style="margin-top:14px"><h2>Recent cash-ups</h2>
      <div style="overflow-x:auto"><table class="lines num">
        <thead><tr><th>Day</th><th>Expected cash</th><th>Counted</th><th>Difference</th><th>Card</th><th>EFT</th><th>By</th></tr></thead>
        <tbody>${cashups.slice(0, 14).map(c => `<tr><td style="text-align:left">${fmtDate(c.day)}</td><td>${money(c.expectedCash)}</td><td>${money(c.countedCash)}</td>
          <td class="${c.difference < 0 ? 'neg' : ''}">${c.difference === 0 ? '—' : money(c.difference)}</td><td>${money(c.cardTotal)}</td><td>${money(c.eftTotal)}</td>
          <td>${esc(c.staffName)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;

  $('#mo-day', view).onchange = e => { day = e.target.value || repo.todayKey(); renderMoney(view); };
  $('#mo-cashup', view).onclick = () => cashupModal(s, () => renderMoney(view));
  $('#mo-expense', view)?.addEventListener('click', () => expenseModal(() => renderMoney(view)));
}

function cashupModal(s, after) {
  const m = modal(`
    <h2>Cash-up · ${fmtDate(s.day)}</h2>
    <dl class="kv num"><dt>Cash taken</dt><dd>${money(s.cashIn)}</dd><dt>Cash paid out</dt><dd>${money(s.cashOut)}</dd>
      <dt>Should be in the till</dt><dd><b>${money(s.expectedCash)}</b> <span class="muted">(not counting your float)</span></dd>
      <dt>Card</dt><dd>${money(s.card)}</dd><dt>EFT</dt><dd>${money(s.eft)}</dd></dl>
    <label class="field">Cash you counted (R) <span class="hint">leave the float out</span><input type="number" id="cu-count" inputmode="decimal" min="0" step="0.01"></label>
    <p class="num" id="cu-diff" style="margin:0;font-weight:700"></p>
    <label class="field">Note <span class="hint">optional, e.g. why it's short</span><input type="text" id="cu-note"></label>
    <p class="error-msg" id="cu-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cu-ok">Save cash-up</button></div>`);
  const count = m.el.querySelector('#cu-count'), diff = m.el.querySelector('#cu-diff');
  count.oninput = () => {
    if (count.value === '') { diff.textContent = ''; return; }
    const d = Math.round((Number(count.value) - s.expectedCash) * 100) / 100;
    diff.textContent = d === 0 ? 'Exact: well done.' : d > 0 ? `${money(d)} over` : `${money(-d)} short`;
    diff.style.color = d < 0 ? 'var(--danger)' : 'var(--ok)';
  };
  count.focus();
  m.el.querySelector('#cu-ok').onclick = async () => {
    try {
      await repo.saveCashup({ day: s.day, counted: count.value, note: m.el.querySelector('#cu-note').value });
      m.close(); toast('Cash-up saved'); after();
    } catch (ex) { const e = m.el.querySelector('#cu-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

function expenseModal(after) {
  const m = modal(`
    <h2>Shop expense</h2>
    <p class="muted" style="margin:0">Costs not tied to one job: rent, courier account, tools, marketing. Only you see these.</p>
    <div class="grid-2">
      <label class="field">Amount (R)<input type="number" id="ex-amt" inputmode="decimal" min="0" step="0.01"></label>
      <label class="field">Type<select id="ex-cat">${repo.EXPENSE_CATEGORIES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Paid with<select id="ex-method">${repo.MONEY_METHODS.map(c => `<option ${c === 'EFT' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Note<input type="text" id="ex-note" placeholder="e.g. November rent"></label>
    </div>
    <p class="error-msg" id="ex-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ex-ok">Save expense</button></div>`);
  m.el.querySelector('#ex-ok').onclick = async () => {
    try {
      await repo.addPayment({ kind: 'expense', amount: m.el.querySelector('#ex-amt').value, category: m.el.querySelector('#ex-cat').value,
        method: m.el.querySelector('#ex-method').value, note: m.el.querySelector('#ex-note').value });
      m.close(); toast('Expense saved'); after();
    } catch (ex) { const e = m.el.querySelector('#ex-err'); e.textContent = ex.message; e.hidden = false; }
  };
}
