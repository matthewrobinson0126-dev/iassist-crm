// App shell: sign-in gate, top bar, hash router, idle auto-lock.
import * as repo from './repo.js?v=20261107143707';
import { db } from './db.js?v=20261107143707';
import { $, esc, initials, toast } from './ui.js?v=20261107143707';
import { renderLock, renderSetPassword } from './screens/lock.js?v=20261107143707';
import { renderBookIn } from './screens/bookin.js?v=20261107143707';
import { renderJobs, renderJob } from './screens/jobs.js?v=20261107143707';
import { renderCustomers, renderCustomer } from './screens/customers.js?v=20261107143707';
import { renderSettings } from './screens/settings.js?v=20261107143707';
import { renderMoney } from './screens/money.js?v=20261107143707';
import { renderTasks } from './screens/tasks.js?v=20261107143707';
import { renderReports } from './screens/reports.js?v=20261107143707';
import { renderStock } from './screens/stock.js?v=20261107143707';
import { renderSell } from './screens/sell.js?v=20261107143707';

const routes = {
  bookin: renderBookIn,
  jobs: renderJobs,
  job: renderJob,
  customers: renderCustomers,
  customer: renderCustomer,
  settings: renderSettings,
  money: renderMoney,
  tasks: renderTasks,
  reports: renderReports,
  stock: renderStock,
  sell: renderSell,
};

export const go = hash => { if (location.hash === '#' + hash) route(); else location.hash = hash; };

function parseHash() {
  const h = location.hash.slice(1) || 'jobs';
  const i = h.indexOf('-');
  return i === -1 ? { name: h, id: null } : { name: h.slice(0, i), id: h.slice(i + 1) };
}

function shell() {
  const app = $('#app');
  const u = repo.auth.user;
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><img src="icons/icon.svg" alt=""><span>iAssist Book-In</span></div>
      <nav class="nav" aria-label="Main">
        <a href="#bookin" data-nav="bookin" class="book">+ Book in</a>
        <a href="#sell" data-nav="sell">Sell</a>
        <a href="#jobs" data-nav="jobs">Jobs</a>
        <a href="#customers" data-nav="customers">Customers</a>
        <a href="#tasks" data-nav="tasks">Tasks</a>
        <a href="#money" data-nav="money">Money</a>
        <a href="#stock" data-nav="stock">Stock</a>
        ${repo.auth.isOwner() ? '<a href="#reports" data-nav="reports">Reports</a><a href="#settings" data-nav="settings">Settings</a>' : ''}
      </nav>
      <span class="spacer"></span>
      <button class="user-chip" id="lock-btn" title="Switch user / lock">
        <span class="avatar">${esc(initials(u.name))}</span>
        <span>${esc(u.name)} <span class="role-tag">${u.role}</span></span>
        <span class="muted">Lock</span>
      </button>
    </header>
    ${db.mode === 'demo' ? '<div class="demo-banner">Demo mode: jobs are saved on this device only. Real staff data moves to the cloud database once Supabase is connected.</div>' : ''}
    <main id="view"></main>`;
  $('#lock-btn').onclick = () => { repo.auth.lock(); route(); };
}

let shellFor = null;
async function route() {
  const app = $('#app');
  if (!repo.auth.user) {
    shellFor = null;
    return renderLock(app, () => route());
  }
  if (shellFor !== repo.auth.user.id + repo.auth.user.role) { shell(); shellFor = repo.auth.user.id + repo.auth.user.role; }
  const { name, id } = parseHash();
  const screen = routes[name] || renderJobs;
  const navName = name === 'job' ? 'jobs' : name === 'customer' ? 'customers' : name;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navName && navName !== 'bookin'));
  const view = $('#view');
  try {
    await screen(view, id);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><p class="error-msg">${esc(err.message || 'Something went wrong.')}</p></div>`;
  }
  window.scrollTo(0, 0);
}

// Auto-lock the counter iPad after a few idle minutes.
let lastActive = Date.now();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
  lastActive = Date.now();
  repo.auth.touch();
}, { passive: true }));
setInterval(async () => {
  if (!repo.auth.user) return;
  const { idleLockMinutes } = await repo.getSettings();
  if (Date.now() - lastActive > idleLockMinutes * 60000) {
    repo.auth.lock();
    route();
    toast('Locked after inactivity');
  }
}, 30000);

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', e => { toast(e.reason?.message || 'Something went wrong', 'error'); });

(async () => {
  if (repo.auth.recoveryPending()) return renderSetPassword($('#app'), () => route());
  await repo.auth.restore();
  route();
})();
