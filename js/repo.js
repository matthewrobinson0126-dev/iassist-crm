// Business rules: logins, roles, customers, jobs, audit trail.
import { db, remote } from './db.js';
import { uid, now } from './ui.js';

export const STATUSES = [
  { id: 'booked', label: 'Booked in' },
  { id: 'diagnosing', label: 'Diagnosing' },
  { id: 'approval', label: 'Waiting for approval' },
  { id: 'parts', label: 'Waiting for parts' },
  { id: 'repairing', label: 'Repairing' },
  { id: 'ready', label: 'Ready to collect' },
  { id: 'collected', label: 'Collected' },
];
export const statusLabel = id => STATUSES.find(s => s.id === id)?.label || id;

const DEFAULT_TERMS = `DRAFT: replace with your own terms in Settings.

1. Please back up your device before handing it in. We are not responsible for data loss.
2. We only use your passcode to test the device before and after the repair. It is deleted when you collect the device.
3. The damage noted on this job card was already on the device when you handed it in.
4. The quote can change after we have assessed the device. We will contact you for approval before doing any extra work.
5. Warranty covers the part we replaced and our workmanship. It does not cover new physical or liquid damage.`;

const DEFAULT_SETTINGS = {
  id: 'shop',
  shopName: 'iAssist',
  address: 'Shop 4, Silvercrest Shopping Centre, 11 Swemmer Rd, Silvamonte, Johannesburg, 2192',
  phone: '',
  email: '',
  warrantyMonths: '',
  idleLockMinutes: 10,
  terms: DEFAULT_TERMS,
  nextJobNo: 1,
};

// ───────────── Sign-in (PIN) ─────────────
let me = null;
const SESSION_KEY = 'crm.session';

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for plain-http testing on the shop Wi-Fi (crypto.subtle needs https).
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (const b of data) { h1 = Math.imul(h1 ^ b, 16777619) >>> 0; h2 = Math.imul(h2 ^ b, 0x5bd1e995) >>> 0; }
  return 'f' + h1.toString(16) + h2.toString(16);
}

const publicStaff = s => s && ({ id: s.id, name: s.name, role: s.role, active: s.active });

function saveSession() {
  try {
    if (me) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: me.id, at: Date.now() }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* private mode: stay signed in for this page only */ }
}

export const auth = {
  get user() { return me; },
  isOwner: () => me?.role === 'owner',
  cloud: !!remote,

  // What the lock screen should show on this device.
  async lockState() {
    if (remote) return remote.lockState();
    const staff = (await listStaff()).filter(s => s.active);
    return { setupNeeded: !staff.length, registered: true, staff };
  },
  // PIN sign-in. Demo: returns null on a wrong PIN. Cloud: throws with the reason.
  async unlock(staffId, pin) {
    if (remote) {
      me = publicStaff(await remote.pinLogin(staffId, pin));
    } else {
      const s = await db.get('staff', staffId);
      if (!s || !s.active) return null;
      if (await hashPin(pin, s.salt) !== s.pinHash) return null;
      me = publicStaff(s);
    }
    saveSession();
    return me;
  },
  async setupOwner({ name, email, password, pin }) {
    if (remote) {
      me = publicStaff(await remote.setupOwner({ name, email, password, pin }));
      saveSession();
      return me;
    }
    const s = await createStaff({ name, pin }, { firstOwner: true });
    return auth.unlock(s.id, pin);
  },
  async passwordLogin(email, password) {
    me = publicStaff(await remote.passwordLogin(email, password));
    saveSession();
    return me;
  },
  registerDevice: name => remote.registerDevice(name),
  deviceRegistered: () => (remote ? remote.isRegistered() : true),
  lock() { me = null; saveSession(); remote?.signOut().catch(() => {}); },
  touch() { if (me) saveSession(); },
  // After a reload, stay signed in only if the iPad was used recently.
  async restore() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
      const fresh = raw && Date.now() - JSON.parse(raw).at <= settings.idleLockMinutes * 60000;
      if (remote) {
        if (fresh) me = publicStaff(await remote.currentStaff());
        else await remote.signOut();
      } else if (fresh) {
        const s = await db.get('staff', JSON.parse(raw).id);
        if (s?.active) me = publicStaff(s);
      }
    } catch { /* stay locked */ }
    return me;
  },
};

function requireUser() { if (!me) throw new Error('Please sign in first.'); }
function requireOwner() { if (me?.role !== 'owner') throw new Error('Only the owner can do this.'); }
const validPin = pin => /^\d{4}$/.test(String(pin));

// ───────────── Staff ─────────────
export async function listStaff() {
  const all = remote ? await remote.listStaff() : await db.list('staff');
  return all.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1))
    .map(publicStaff);
}
export const hasStaff = async () => (await db.list('staff')).length > 0;

export async function createStaff({ name, role = 'staff', pin }, { firstOwner = false } = {}) {
  if (firstOwner) {
    if (await hasStaff()) throw new Error('The shop is already set up.');
    role = 'owner';
  } else requireOwner();
  if (!name?.trim()) throw new Error('Enter a name.');
  if (!validPin(pin)) throw new Error('The PIN must be 4 digits.');
  if (remote) return remote.createStaff({ name: name.trim(), role, pin });
  const salt = uid();
  const s = { id: uid(), name: name.trim(), role, active: true, salt, pinHash: await hashPin(pin, salt),
    createdAt: now(), createdBy: me?.id || null };
  await db.put('staff', s);
  return publicStaff(s);
}

export async function updateStaff(id, patch) {
  requireOwner();
  if (remote) {
    const updated = await remote.updateStaff(id, { ...patch, pin: patch.pin || undefined });
    if (me?.id === id) me = publicStaff(updated);
    return updated;
  }
  const s = await db.get('staff', id);
  if (!s) throw new Error('Staff member not found.');
  const next = { ...s };
  if (patch.name !== undefined) next.name = patch.name.trim() || s.name;
  if (patch.role !== undefined) next.role = patch.role;
  if (patch.active !== undefined) next.active = patch.active;
  if (patch.pin) {
    if (!validPin(patch.pin)) throw new Error('The PIN must be 4 digits.');
    next.salt = uid();
    next.pinHash = await hashPin(patch.pin, next.salt);
  }
  // Never leave the shop without an active owner.
  const owners = (await db.list('staff')).filter(x => x.role === 'owner' && x.active && x.id !== id);
  if (!owners.length && (next.role !== 'owner' || !next.active)) throw new Error('There must always be at least one active owner.');
  await db.put('staff', next);
  if (me?.id === id) me = publicStaff(next);
  return publicStaff(next);
}

// ───────────── Settings ─────────────
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.get('settings', 'shop')) };
}
export async function saveSettings(patch) {
  requireOwner();
  const s = await getSettings();
  return db.put('settings', { ...s, ...patch, id: 'shop' });
}

// ───────────── Customers ─────────────
export const digits = p => String(p || '').replace(/\D/g, '');
export function waNumber(p) {
  let d = digits(p);
  if (d.startsWith('0')) d = '27' + d.slice(1);
  return d;
}

export async function searchCustomers(q = '') {
  const all = await db.list('customers');
  const text = q.trim().toLowerCase();
  const num = digits(q);
  return all
    .filter(c => !text || c.name.toLowerCase().includes(text) || (c.email || '').toLowerCase().includes(text)
      || (num.length >= 3 && digits(c.phone).includes(num)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);
}
export const getCustomer = id => db.get('customers', id);
export async function findByPhone(phone) {
  const d = digits(phone).replace(/^27/, '0');
  if (d.length < 9) return null;
  return (await db.list('customers')).find(c => digits(c.phone).replace(/^27/, '0') === d) || null;
}

export async function saveCustomer(c) {
  requireUser();
  if (!c.name?.trim()) throw new Error('Enter the customer’s name.');
  if (digits(c.phone).length < 9) throw new Error('Enter a valid phone number.');
  const t = now();
  const rec = { area: '', email: '', notes: '', ...c, name: c.name.trim(), phone: c.phone.trim(),
    id: c.id || uid(), createdAt: c.createdAt || t, createdBy: c.createdBy || me.id, updatedAt: t };
  await db.put('customers', rec);
  // Keep the name/phone shown on job cards in step.
  for (const j of await db.list('jobs', { customerId: rec.id })) {
    if (j.customerName !== rec.name || j.customerPhone !== rec.phone)
      await db.put('jobs', { ...j, customerName: rec.name, customerPhone: rec.phone });
  }
  return rec;
}

// ───────────── Files (photos, signatures) ─────────────
const saveFile = (blob, kind) => db.saveFile(blob, kind, uid());
export const fileUrl = id => (id ? db.fileUrl(id) : Promise.resolve(null));

// ───────────── Jobs ─────────────
async function nextJobNo() {
  const s = await getSettings();
  const n = Number(s.nextJobNo) || 1;
  await db.put('settings', { ...s, nextJobNo: n + 1 });
  return 'IA-' + String(n).padStart(4, '0');
}

async function logEvent(job, type, text) {
  await db.put('job_events', { id: uid(), jobId: job.id, type, text, staffId: me?.id || null,
    staffName: me?.name || 'System', at: now() });
}

export async function listJobs() {
  return (await db.list('jobs')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const getJob = id => db.get('jobs', id);
export async function jobsForCustomer(customerId) {
  return (await db.list('jobs', { customerId })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function listEvents(jobId) {
  return (await db.list('job_events', { jobId })).sort((a, b) => b.at.localeCompare(a.at));
}
export async function listPhotos(jobId) {
  return (await db.list('job_photos', { jobId })).sort((a, b) => a.at.localeCompare(b.at));
}

const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

export async function createJob(d, { demo = false } = {}) {
  requireUser();
  const customer = d.customer || await saveCustomer({ ...d.newCustomer, referral: d.referral || '', demo });
  const t = now();
  const settings = await getSettings();
  let job = {
    // The cloud database hands out the job number itself (no two iPads can clash).
    id: uid(), jobNo: remote ? undefined : await nextJobNo(),
    customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
    deviceType: d.deviceType, model: d.model.trim(), colour: d.colour || '', serial: d.serial || '',
    powersOn: d.powersOn, faults: [...d.faults], faultNotes: d.faultNotes || '',
    damage: [...d.damage], conditionNotes: d.conditionNotes || '', accessories: [...d.accessories],
    passcodeGiven: !!d.passcode,
    quote: d.jobType === 'warranty' ? 0 : d.quoteMode === 'fixed' ? num(d.quote) : null, quoteNote: d.quoteNote || '',
    deposit: num(d.deposit), dueDate: d.dueDate || '', collection: d.collection,
    internalNotes: d.internalNotes || '', termsText: settings.terms,
    // Phase 2
    jobType: d.jobType || 'paid', warrantyOf: d.warrantyOf || null, warrantyOfNo: d.warrantyOfNo || '',
    urgent: !!d.urgent, technicianId: d.technicianId || null, technicianName: d.technicianName || '',
    referral: d.referral || '', lines: [], workDone: '', trackToken: uid().replace(/-/g, '') + uid().replace(/-/g, ''),
    signatureIn: d.signature ? await saveFile(d.signature, 'signature') : null,
    status: 'booked', statusAt: t, createdAt: t, updatedAt: t, createdBy: me.id, createdByName: me.name, demo,
  };
  job = await db.put('jobs', job);
  if (d.passcode) await db.put('job_secrets', { id: job.id, passcode: d.passcode });
  for (const p of d.photos || []) await addPhoto(job, p.blob, p.caption || 'Condition at book-in', { log: false });
  await logEvent(job, 'booked', `Booked in by ${me.name}${job.jobType === 'warranty' ? ` (warranty return for ${job.warrantyOfNo})` : ''}`);
  if (job.technicianName) await logEvent(job, 'assign', `Assigned to ${job.technicianName}`);
  if (!demo) notify(job, 'booked');
  return job;
}

// ───────────── Phase 2: workflow, parts & labour, tracking, emails ─────────────
export const trackUrl = job => (job.trackToken ? new URL(`track.html?t=${job.trackToken}`, location.href).href : '');

// Customer emails go out from the server; failures never block the counter.
export async function notify(job, kind) {
  if (!remote) return { skipped: 'Demo mode' };
  try { return await remote.notify(job.id, kind, trackUrl(job)); }
  catch (ex) { console.warn('email', ex); return { error: ex.message }; }
}

export async function assignTech(job, staffId) {
  requireUser();
  const staff = staffId ? (await listStaff()).find(s => s.id === staffId) : null;
  const next = await saveJob(job, { technicianId: staff?.id || null, technicianName: staff?.name || '' });
  await logEvent(job, 'assign', staff ? `Assigned to ${staff.name}` : 'Unassigned');
  return next;
}

export async function setUrgent(job, urgent) {
  requireUser();
  const next = await saveJob(job, { urgent: !!urgent });
  await logEvent(job, 'urgent', urgent ? 'Marked urgent' : 'No longer urgent');
  return next;
}

export const linesTotal = lines => Math.round((lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.price) || 0), 0) * 100) / 100;

// Parts & labour: the quote follows the lines total (a warranty job stays at R0 to the customer).
export async function setLines(job, lines, change) {
  requireUser();
  const total = linesTotal(lines);
  const patch = { lines };
  if (job.jobType !== 'warranty' && lines.length) patch.quote = total;
  const next = await saveJob(job, patch);
  await logEvent(job, 'lines', `${change}${patch.quote !== undefined && patch.quote !== job.quote ? ` · quote now R${total}` : ''}`);
  return next;
}

export async function setWorkDone(job, text) {
  requireUser();
  const next = await saveJob(job, { workDone: text.trim() });
  await logEvent(job, 'edit', 'Updated work done');
  return next;
}

// Older jobs get a tracking link the first time someone asks for it.
export async function ensureTrackToken(job) {
  if (job.trackToken) return job;
  return saveJob(job, { trackToken: uid().replace(/-/g, '') + uid().replace(/-/g, '') });
}

export async function markReviewRequested(job, via) {
  await logEvent(job, 'review', `Review request sent by ${via}`);
  return saveJob(job, { reviewSentAt: now() });
}

let pricesP = null;
export function priceList() {
  pricesP ??= fetch('data/prices.json').then(r => r.json()).then(d => d.items || []).catch(() => []);
  return pricesP;
}

async function saveJob(job, patch) {
  const next = { ...job, ...patch, updatedAt: now() };
  await db.put('jobs', next);
  return next;
}

export async function setStatus(job, status) {
  requireUser();
  if (status === job.status) return job;
  if (status === 'collected') throw new Error('Use Hand back to mark a device collected.');
  const next = await saveJob(job, { status, statusAt: now() });
  await logEvent(job, 'status', `${statusLabel(job.status)} → ${statusLabel(status)}`);
  if (['approval', 'parts', 'ready'].includes(status) && !job.demo) {
    if (!(status === 'approval' && job.jobType === 'warranty')) notify(next, status);
  }
  return next;
}

export async function updateQuote(job, { quote, quoteNote }) {
  requireUser();
  const q = num(quote);
  const next = await saveJob(job, { quote: q, quoteNote: quoteNote ?? job.quoteNote });
  const fmt = v => v === null ? 'assessment' : `R${v}`;
  await logEvent(job, 'quote', `Quote changed: ${fmt(job.quote)} → ${fmt(q)}${quoteNote ? ` (${quoteNote})` : ''}`);
  return next;
}

export async function updateJobFields(job, patch, what) {
  requireUser();
  const next = await saveJob(job, patch);
  await logEvent(job, 'edit', `Edited ${what}`);
  return next;
}

export async function addNote(job, text) {
  requireUser();
  if (!text.trim()) return;
  await logEvent(job, 'note', text.trim());
  await saveJob(job, {});
}

export async function addPhoto(job, blob, caption = '', { log = true } = {}) {
  requireUser();
  const fileId = await saveFile(blob, 'photo');
  await db.put('job_photos', { id: uid(), jobId: job.id, fileId, caption, at: now(), staffName: me.name });
  if (log) await logEvent(job, 'photo', `Added a photo${caption ? `: ${caption}` : ''}`);
}

export async function getPasscode(job) {
  requireUser();
  const s = await db.get('job_secrets', job.id);
  if (s) await logEvent(job, 'passcode', `Passcode viewed`);
  return s?.passcode || null;
}

export async function handBack(job, { method, amount, warrantyMonths, signature }) {
  requireUser();
  const t = now();
  let warrantyUntil = '';
  const months = Number(warrantyMonths);
  if (months > 0) {
    const d = new Date(); d.setMonth(d.getMonth() + months);
    warrantyUntil = d.toISOString().slice(0, 10);
  }
  const next = await saveJob(job, {
    status: 'collected', statusAt: t, paidMethod: method, paidAmount: num(amount), warrantyUntil,
    signatureOut: signature ? await saveFile(signature, 'signature') : null,
    collectedAt: t, collectedBy: me.id, collectedByName: me.name,
  });
  await db.remove('job_secrets', job.id); // POPIA: passcode gone once collected
  if (!job.demo) notify(next, 'review');
  await logEvent(job, 'collected', `Handed back by ${me.name}${method ? ` · paid ${method}${num(amount) !== null ? ` R${num(amount)}` : ''}` : ''}${warrantyUntil ? ` · warranty to ${warrantyUntil}` : ''}. Passcode deleted.`);
  return next;
}

export async function deleteJob(job) {
  requireOwner();
  for (const p of await listPhotos(job.id)) { await db.removeFile(p.fileId); await db.remove('job_photos', p.id); }
  for (const e of await listEvents(job.id)) await db.remove('job_events', e.id);
  for (const f of [job.signatureIn, job.signatureOut]) if (f) await db.removeFile(f);
  await db.remove('job_secrets', job.id);
  await db.remove('jobs', job.id);
}

// ───────────── Demo data + backup ─────────────
export async function loadDemoData() {
  requireOwner();
  const people = [
    { name: 'Demo – Thandi Mokoena', phone: '082 000 0001', area: 'Bedfordview' },
    { name: 'Demo – Pieter van Wyk', phone: '083 000 0002', area: 'Edenvale' },
    { name: 'Demo – Aisha Patel', phone: '084 000 0003', area: 'Linksfield' },
  ];
  const customers = [];
  for (const p of people) customers.push(await saveCustomer({ ...p, demo: true }));
  const base = { colour: '', serial: '', powersOn: 'yes', faultNotes: '', conditionNotes: '', accessories: ['Nothing'],
    passcode: '', photos: [], quoteNote: '', deposit: '', dueDate: '', collection: 'store', internalNotes: '' };
  const jobs = [
    { c: 0, deviceType: 'iphone', model: 'iPhone 13', faults: ['Screen'], damage: ['Cracked screen'], quoteMode: 'fixed', quote: 2499, status: 'booked' },
    { c: 1, deviceType: 'macbook', model: 'MacBook Air (M1)', faults: ['Keyboard'], damage: ['Scratches'], quoteMode: 'assess', status: 'diagnosing' },
    { c: 2, deviceType: 'playstation', model: 'PS5', faults: ['HDMI port'], damage: ['No visible damage'], quoteMode: 'fixed', quote: 1299, status: 'parts' },
    { c: 0, deviceType: 'watch', model: 'Apple Watch Series 7', faults: ['Battery'], damage: ['Scratches'], quoteMode: 'fixed', quote: 1199, status: 'ready' },
    { c: 1, deviceType: 'ipad', model: 'iPad (9th gen)', faults: ['Charging port'], damage: ['Dents / bent frame'], quoteMode: 'fixed', quote: 999, status: 'approval' },
  ];
  for (const j of jobs) {
    const job = await createJob({ ...base, ...j, customer: customers[j.c] }, { demo: true });
    if (j.status !== 'booked') await setStatus(job, j.status);
  }
}

export async function removeDemoData() {
  requireOwner();
  for (const j of (await db.list('jobs')).filter(j => j.demo)) await deleteJob(j);
  for (const c of (await db.list('customers')).filter(c => c.demo)) await db.remove('customers', c.id);
}

export async function exportBackup() {
  const out = { exportedAt: now(), app: 'iAssist Book-In CRM' };
  for (const t of ['staff', 'customers', 'jobs', 'job_events', 'job_photos', 'settings'])
    out[t] = (await db.list(t)).map(r => { const { pinHash, salt, ...rest } = r; return rest; });
  return JSON.stringify(out, null, 2);
}
