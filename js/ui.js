// Small UI helpers shared by every screen.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// UUID v4 (the cloud database needs real UUIDs; crypto.randomUUID needs https, so fall back).
export const uid = () => globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
export const now = () => new Date().toISOString();

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
export const money = n => (n === null || n === undefined || n === '') ? '—' : zar.format(Number(n));

export const fmtDate = iso => iso
  ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = iso => iso
  ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function ageText(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

export function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = ''; }, 2800);
}

// In-page modal (alert/confirm dialogs don't suit an iPad app).
export function modal(html, { wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  return { el: wrap.firstElementChild, close };
}

export function confirmBox(message, { ok = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const m = modal(`<p class="confirm-text">${esc(message)}</p>
      <div class="modal-actions"><button class="btn" data-no>Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`);
    m.el.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
  });
}

// Finger signature on a canvas. Create it once the canvas is visible.
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false, dirty = false, last = null;
  const r = canvas.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * d);
  canvas.height = Math.round(r.height * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  const pos = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  canvas.addEventListener('pointerdown', e => {
    drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault();
    ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill(); dirty = true;
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; dirty = true;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return {
    isEmpty: () => !dirty,
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
    toBlob: () => new Promise(res => canvas.toBlob(res, 'image/png')),
  };
}

// Shrink camera photos before saving (iPad photos are 3–5 MB each).
export async function compressImage(file, max = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Read a nested value like "newCustomer.name".
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
