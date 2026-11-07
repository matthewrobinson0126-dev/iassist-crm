// Tasks: shop to-do list (call-backs, parts to order). Shared rows + add form used on the job page too.
import * as repo from '../repo.js?v=20261107121047';
import { $, $$, esc, fmtDate, toast, modal, confirmBox } from '../ui.js?v=20261107121047';

const late = t => !t.done && t.dueDate && t.dueDate < repo.todayKey();
const isToday = t => t.dueDate === repo.todayKey();

export const taskRow = t => `
  <div class="list-row task ${t.done ? 'done' : ''} ${late(t) ? 'late' : ''}">
    <label class="check" style="min-height:0"><input type="checkbox" data-task-done="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done"></label>
    <span class="grow"><b>${esc(t.title)}</b>
      <div class="muted" style="font-size:.88rem">${[
        t.dueDate ? `${late(t) ? 'Overdue · ' : isToday(t) ? 'Today · ' : ''}${fmtDate(t.dueDate)}` : 'No due date',
        t.assignedName ? `for ${esc(t.assignedName)}` : '',
        t.jobNo ? `<a href="#job-${t.jobId}">${esc(t.jobNo)}</a>` : '',
        t.done ? `done by ${esc(t.doneByName || '')}` : ''].filter(Boolean).join(' · ')}</div>
      ${t.notes ? `<div class="muted" style="font-size:.88rem">${esc(t.notes)}</div>` : ''}</span>
    ${repo.auth.isOwner() ? `<button class="btn small ghost" data-task-del="${t.id}" aria-label="Delete task">×</button>` : ''}
  </div>`;

export function bindTaskRows(root, tasks, after) {
  $$('[data-task-done]', root).forEach(cb => cb.onchange = async () => {
    await repo.setTaskDone(tasks.find(t => t.id === cb.dataset.taskDone), cb.checked);
    toast(cb.checked ? 'Task done' : 'Task re-opened'); after();
  });
  $$('[data-task-del]', root).forEach(b => b.onclick = async () => {
    const t = tasks.find(x => x.id === b.dataset.taskDel);
    if (await confirmBox(`Delete the task “${t.title}”?`, { ok: 'Delete', danger: true })) { await repo.deleteTask(t); after(); }
  });
}

export async function taskModal({ job = null } = {}, after) {
  const staff = (await repo.listStaff()).filter(s => s.active !== false);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
  const m = modal(`
    <h2>New task${job ? ` · ${esc(job.jobNo)}` : ''}</h2>
    <label class="field">What needs doing<input type="text" id="tk-title" placeholder="${job ? `e.g. Call ${esc(job.customerName.split(' ')[0])} with the quote` : 'e.g. Order iPhone 13 screens'}"></label>
    <div class="grid-2">
      <label class="field">Due<input type="date" id="tk-due" value="${tomorrow}"></label>
      <label class="field">For<select id="tk-who"><option value="">Anyone</option>
        ${staff.map(s => `<option value="${s.id}" ${s.id === (job?.technicianId || '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    </div>
    <label class="field">Notes <span class="hint">optional</span><textarea id="tk-notes" rows="2"></textarea></label>
    <p class="error-msg" id="tk-err" hidden></p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="tk-ok">Add task</button></div>`);
  m.el.querySelector('#tk-title').focus();
  m.el.querySelector('#tk-ok').onclick = async () => {
    try {
      await repo.addTask({ job, title: m.el.querySelector('#tk-title').value, dueDate: m.el.querySelector('#tk-due').value,
        assignedTo: m.el.querySelector('#tk-who').value, notes: m.el.querySelector('#tk-notes').value });
      m.close(); toast('Task added'); after();
    } catch (ex) { const e = m.el.querySelector('#tk-err'); e.textContent = ex.message; e.hidden = false; }
  };
}

let tab = 'open';
export async function renderTasks(view) {
  const tasks = await repo.listTasks();
  const me = repo.auth.user.id;
  const groups = {
    open: tasks.filter(t => !t.done),
    mine: tasks.filter(t => !t.done && t.assignedTo === me),
    late: tasks.filter(late),
    done: tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 50),
  };
  const labels = { open: 'Open', mine: 'Mine', late: 'Overdue', done: 'Done' };
  view.innerHTML = `
    <div class="page-head"><h1>Tasks</h1><span class="spacer"></span><button class="btn primary" id="tk-new">+ Task</button></div>
    <div class="chips" style="margin-bottom:14px">${Object.keys(groups).map(k =>
      `<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${labels[k]} <span class="num">${groups[k].length}</span></button>`).join('')}</div>
    <div class="list" id="tk-list">${groups[tab].map(taskRow).join('') ||
      `<div class="card empty">${tab === 'done' ? 'Nothing ticked off yet.' : 'Nothing to do here. Add a task for call-backs, parts to order or reminders.'}</div>`}</div>`;
  const again = () => renderTasks(view);
  $$('[data-tab]', view).forEach(b => b.onclick = () => { tab = b.dataset.tab; again(); });
  $('#tk-new', view).onclick = () => taskModal({}, again);
  bindTaskRows(view, tasks, again);
}
