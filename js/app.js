// App shell: sign-in gate, top bar, hash router, idle auto-lock.
import * as repo from './repo.js?v=20261123223456';
import { db } from './db.js?v=20261123223456';
import { $, esc, initials, toast } from './ui.js?v=20261123223456';
import { renderLock, renderSetPassword } from './screens/lock.js?v=20261123223456';
import { renderBookIn } from './screens/bookin.js?v=20261123223456';
import { renderJobs, renderJob } from './screens/jobs.js?v=20261123223456';
import { renderCustomers, renderCustomer } from './screens/customers.js?v=20261123223456';
import { renderSettings } from './screens/settings.js?v=20261123223456';
import { renderMoney } from './screens/money.js?v=20261123223456';
import { renderTasks } from './screens/tasks.js?v=20261123223456';
import { renderReports } from './screens/reports.js?v=20261123223456';
import { renderStock } from './screens/stock.js?v=20261123223456';
import { renderSell } from './screens/sell.js?v=20261123223456';
import { renderQuotes, renderQuote } from './screens/quotes.js?v=20261123223456';
import { renderCollect } from './screens/collect.js?v=20261123223456';
import { renderOverdue } from './screens/overdue.js?v=20261123223456';

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
  quotes: renderQuotes,
  quote: renderQuote,
  collect: renderCollect,
  overdue: renderOverdue,
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
        <a href="#collect" data-nav="collect">Collection</a>
        <a href="#overdue" data-nav="overdue">Overdue</a>
        <a href="#quotes" data-nav="quotes">Quotes</a>
        <a href="#customers" data-nav="customers">Customers</a>
        <a href="#tasks" data-nav="tasks">Tasks</a>
        <a href="#money" data-nav="money">Money</a>
        <a href="#stock" data-nav="stock">Stock</a>
        ${repo.auth.isOwner() ? '<a href="#reports" data-nav="reports">Reports</a><a href="#settings" data-nav="settings">Settings</a>' : ''}
      </nav>
      <span class="spacer"></span>
      <button class="btn small ghost" id="refresh-btn" title="Reload the app if it freezes" aria-label="Refresh">↻ Refresh</button>
      <button class="user-chip" id="lock-btn" title="Switch user / lock">
        <span class="avatar">${esc(initials(u.name))}</span>
        <span>${esc(u.name)} <span class="role-tag">${u.role}</span></span>
        <span class="muted">Lock</span>
      </button>
    </header>
    ${db.mode === 'demo' ? '<div class="demo-banner">Demo mode: jobs are saved on this device only. Real staff data moves to the cloud database once Supabase is connected.</div>' : ''}
    <main id="view"></main>`;
  $('#lock-btn').onclick = () => { repo.auth.lock(); route(); };
  // Reload the whole app (a fresh copy, never a stale saved one). You stay signed in.
  $('#refresh-btn').onclick = () => {
    if (location.hash.startsWith('#bookin') && !confirm('Refresh now? Anything typed in this booking will be lost.')) return;
    repo.auth.touch();
    location.replace(location.pathname + '?r=' + Date.now() + location.hash);
  };
}

let shellFor = null;
async function route() {
  const app = $('#app');
  document.body.classList.remove('kiosk');   // "Hand to customer" mode only lives on the book-in screen
  if (!repo.auth.user) {
    shellFor = null;
    return renderLock(app, () => route());
  }
  if (shellFor !== repo.auth.user.id + repo.auth.user.role) { shell(); shellFor = repo.auth.user.id + repo.auth.user.role; }
  const { name, id } = parseHash();
  const screen = routes[name] || renderJobs;
  const navName = name === 'job' ? 'jobs' : name === 'customer' ? 'customers' : name === 'quote' ? 'quotes' : name;
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

// New version published? iPads can keep an old copy of the page for a while, so ask the server
// (bypassing the cache) which version is current and reload if it's newer. Checked on start-up and
// whenever the app comes back to the front, but never in the middle of a booking.
const MY_VERSION = new URL(import.meta.url).searchParams.get('v');
async function checkForUpdate() {
  if (!MY_VERSION || location.hash.startsWith('#bookin')) return false;
  try {
    const html = await (await fetch(location.pathname + '?check=' + Date.now(), { cache: 'no-store' })).text();
    const live = (html.match(/js\/app\.js\?v=([\w-]+)/) || [])[1];
    if (live && live !== MY_VERSION) {
      const key = 'crm.reloadedFor';
      if (sessionStorage.getItem(key) === live) return false;   // never loop
      sessionStorage.setItem(key, live);
      // A new address can't come from the old cache, so this always loads the new version.
      location.replace(location.pathname + '?u=' + encodeURIComponent(live) + location.hash);
      return true;
    }
  } catch { /* offline: carry on with this version */ }
  return false;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });

(async () => {
  if (await checkForUpdate()) return;
  if (repo.auth.recoveryPending()) return renderSetPassword($('#app'), () => route());
  await repo.auth.restore();
  route();
})();
