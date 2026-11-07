// Cloud storage: Supabase (Postgres + private photo storage + staff logins).
// Same calls as db-local.js; field names are converted camelCase ↔ snake_case.
import { CONFIG } from './config.js?v=20261107121047';

// A password-reset email links here as ?reset=<token>. The token is only used when the person saves.
const RESET_TOKEN = new URLSearchParams(location.search).get('reset');

let client = null;
const sb = () => (client ??= window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'iassist-crm-auth' },
}));

const BUCKET = 'job-media';
const OVERRIDES = {
  job_events: { at: 'created_at' },
  job_photos: { at: 'created_at', fileId: 'path' },
  job_secrets: { id: 'job_id' },
  product_costs: { id: 'product_id' },
};
const DATE_COLS = new Set(['due_date', 'warranty_until']);
const toSnake = k => k.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const toCamel = k => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const col = (table, key) => OVERRIDES[table]?.[key] || toSnake(key);
const keyCol = table => (table === 'job_secrets' ? 'job_id' : table === 'product_costs' ? 'product_id' : 'id');

function toRow(table, obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const c = col(table, k);
    row[c] = v === '' && DATE_COLS.has(c) ? null : v;
  }
  return row;
}
function fromRow(table, row) {
  const rev = Object.fromEntries(Object.entries(OVERRIDES[table] || {}).map(([a, b]) => [b, a]));
  const obj = {};
  for (const [k, v] of Object.entries(row)) obj[rev[k] || toCamel(k)] = v;
  return obj;
}
const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Fetch every row, 1000 at a time (Supabase's page limit).
async function fetchAll(build) {
  let out = [], from = 0;
  for (;;) {
    const data = check(await build().range(from, from + 999));
    out = out.concat(data);
    if (data.length < 1000) return out;
    from += 1000;
  }
}

const urlCache = new Map();

export const supaDb = {
  mode: 'cloud',
  async list(table, filter) {
    if (table === 'settings') return (check(await sb().from('settings').select('*'))).map(r => ({ ...r.data, id: r.id }));
    const rows = await fetchAll(() => {
      let q = sb().from(table).select('*');
      for (const [k, v] of Object.entries(filter || {})) q = q.eq(col(table, k), v);
      return q;
    });
    return rows.map(r => fromRow(table, r));
  },
  async get(table, id) {
    if (table === 'settings') {
      const r = check(await sb().from('settings').select('*').eq('id', id).maybeSingle());
      return r ? { ...r.data, id: r.id } : undefined;
    }
    const r = check(await sb().from(table).select('*').eq(keyCol(table), id).maybeSingle());
    return r ? fromRow(table, r) : undefined;
  },
  async put(table, obj) {
    if (table === 'settings') {
      const { id, ...data } = obj;
      check(await sb().from('settings').upsert({ id, data }));
      return obj;
    }
    const r = check(await sb().from(table).upsert(toRow(table, obj)).select().single());
    return fromRow(table, r);
  },
  async remove(table, id) { check(await sb().from(table).delete().eq(keyCol(table), id)); },

  async saveFile(blob, kind, id) {
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${kind}/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`;
    check(await sb().storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false }));
    return path;
  },
  async fileUrl(path) {
    const hit = urlCache.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    urlCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60000 });
    return data.signedUrl;
  },
  async removeFile(path) { check(await sb().storage.from(BUCKET).remove([path])); },
};

// ───────────── Logins ─────────────
const DEVICE_KEY = 'iassist-crm-device';
const deviceToken = () => { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } };

async function callFn(name, body) {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data;
}

export const remote = {
  async lockState() {
    const r = await callFn('pin-login', { action: 'status', device_token: deviceToken() });
    return { setupNeeded: r.setup_needed, registered: r.registered, deviceName: r.device_name, staff: r.staff || [] };
  },
  async currentStaff() {
    const { data: { session } } = await sb().auth.getSession();
    if (!session) return null;
    const s = check(await sb().from('staff').select('id,name,role,active').eq('id', session.user.id).maybeSingle());
    return s?.active ? s : null;
  },
  async pinLogin(staffId, pin) {
    const r = await callFn('pin-login', { action: 'login', device_token: deviceToken(), staff_id: staffId, pin });
    const { error } = await sb().auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
    if (error) throw new Error(error.message);
    return remote.currentStaff();
  },
  async passwordLogin(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    const s = await remote.currentStaff();
    if (!s) { await sb().auth.signOut({ scope: 'local' }); throw new Error('This login is not on the staff list.'); }
    return s;
  },
  async setupOwner({ name, email, password, pin }) {
    const { data, error } = await sb().auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Supabase wants the email confirmed first. Turn off “Confirm email” in Supabase → Authentication → Sign In / Providers.');
    check(await sb().rpc('claim_owner', { display_name: name.trim() }));
    check(await sb().rpc('set_my_pin', { pin }));
    return remote.currentStaff();
  },
  async registerDevice(name) {
    const r = await callFn('pin-login', { action: 'register', name });
    localStorage.setItem(DEVICE_KEY, r.device_token);
  },
  isRegistered: () => !!deviceToken(),
  async signOut() { await sb().auth.signOut({ scope: 'local' }); },
  async listStaff() {
    return check(await sb().from('staff').select('id,name,role,active,commission_pct').order('name'))
      .map(s => ({ ...s, commissionPct: Number(s.commission_pct) || 0 }));
  },
  createStaff: p => callFn('staff-admin', { action: 'create', ...p, commission_pct: p.commissionPct }),
  updateStaff: (id, p) => callFn('staff-admin', { action: 'update', id, ...p, commission_pct: p.commissionPct }),
  notify: (jobId, kind, trackUrl, to) => callFn('notify', { job_id: jobId, kind, track_url: trackUrl, to }),
  track: token => callFn('track', { token }),
  rpc: async (fn, args) => check(await sb().rpc(fn, args)),

  // Forgot password: the server emails a one-time link from the shop mailbox.
  requestReset: email => callFn('notify', { kind: 'reset', email, redirect_to: location.origin + location.pathname }),
  recoveryPending: () => !!RESET_TOKEN,
  async setNewPassword(password) {
    if (RESET_TOKEN) {
      const { error: ve } = await sb().auth.verifyOtp({ token_hash: RESET_TOKEN, type: 'recovery' });
      if (ve) throw new Error(/expired|invalid/i.test(ve.message)
        ? 'This reset link has expired or a newer one was sent. Use “Forgot password?” to get a fresh link.' : ve.message);
      history.replaceState(null, '', location.pathname);
    }
    const { error } = await sb().auth.updateUser({ password });
    if (error) throw new Error(error.message);
    return remote.currentStaff();
  },
};
