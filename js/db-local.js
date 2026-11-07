// Demo-mode storage: IndexedDB on this device only.
const DB_NAME = 'iassist-crm';
const VERSION = 3;
const TABLES = ['staff', 'customers', 'jobs', 'job_events', 'job_photos', 'job_secrets', 'files', 'settings',
  'payments', 'cashups', 'tasks', 'suppliers', 'products', 'product_costs', 'stock_moves', 'purchase_orders', 'sales'];

let opening = null;
function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const t of TABLES) if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run(table, mode, fn) {
  return open().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(table, mode);
    const req = fn(tx.objectStore(table));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const urlCache = new Map();

export const localDb = {
  mode: 'demo',
  async list(table, filter) {
    const rows = await run(table, 'readonly', s => s.getAll());
    if (!filter) return rows;
    return rows.filter(r => Object.entries(filter).every(([k, v]) => r[k] === v));
  },
  get: (table, id) => run(table, 'readonly', s => s.get(id)),
  put: async (table, obj) => { await run(table, 'readwrite', s => s.put(obj)); return obj; },
  remove: (table, id) => run(table, 'readwrite', s => s.delete(id)),

  async saveFile(blob, kind, id) {
    await localDb.put('files', { id, kind, blob, type: blob.type, at: new Date().toISOString() });
    return id;
  },
  async fileUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const f = await localDb.get('files', id);
    if (!f) return null;
    const url = URL.createObjectURL(f.blob);
    urlCache.set(id, url);
    return url;
  },
  removeFile: id => localDb.remove('files', id),
};
