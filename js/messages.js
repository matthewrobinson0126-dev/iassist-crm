// Ready-made WhatsApp messages. Staff can edit before sending.
import * as repo from './repo.js?v=20261107111329';
import { esc, firstName, money, modal, toast } from './ui.js?v=20261107111329';

const trackLine = j => (repo.auth.cloud && j.trackToken ? `\nTrack your repair: ${repo.trackUrl(j)}` : '');

export const TEMPLATES = [
  { id: 'booked', label: 'Booked in', text: (j, s) =>
    `Hi ${firstName(j.customerName)}, thanks for choosing ${s.shopName}. Your ${j.model} is booked in under job ${j.jobNo}. We'll let you know as soon as we've checked it.${trackLine(j)}` },
  { id: 'review', label: 'Ask for a Google review', text: (j, s) =>
    `Hi ${firstName(j.customerName)}, thanks for trusting ${s.shopName} with your ${j.model}. If you're happy with the repair, a quick Google review would really help us: ${s.googleReviewUrl || '[add your Google review link in Settings]'}` },
  { id: 'approval', label: 'Quote for approval', text: (j, s) =>
    `Hi ${firstName(j.customerName)}, we've checked your ${j.model} (job ${j.jobNo}). The repair comes to ${j.quote === null ? '[amount]' : money(j.quote)}. Please reply YES if you'd like us to go ahead.` },
  { id: 'parts', label: 'Waiting for parts', text: (j, s) =>
    `Hi ${firstName(j.customerName)}, a quick update on your ${j.model} (job ${j.jobNo}): we're waiting for the part to arrive and will let you know as soon as it's in.` },
  { id: 'ready', label: 'Ready to collect', text: (j, s) => {
    const due = j.quote === null ? null : Math.max(0, (j.quote || 0) - (j.deposit || 0));
    return `Hi ${firstName(j.customerName)}, good news: your ${j.model} (job ${j.jobNo}) is ready to collect at ${s.address}.${due ? ` Amount due: ${money(due)}.` : ''}${trackLine(j)}`;
  } },
  { id: 'blank', label: 'Own message', text: j => `Hi ${firstName(j.customerName)}, ` },
];

const defaultFor = status => ({ booked: 'booked', approval: 'approval', parts: 'parts', ready: 'ready', collected: 'review' }[status] || 'blank');

export async function openWhatsApp(job) {
  const s = await repo.getSettings();
  if (repo.auth.cloud) job = await repo.ensureTrackToken(job);
  const number = repo.waNumber(job.customerPhone);
  let current = defaultFor(job.status);
  const m = modal(`
    <h2>WhatsApp ${esc(job.customerName)}</h2>
    <div class="chips" id="wa-tpl">${TEMPLATES.map(t => `<button class="chip" data-t="${t.id}">${esc(t.label)}</button>`).join('')}</div>
    <label class="field">Message<textarea id="wa-text" rows="5"></textarea></label>
    <p class="muted">Sends to +${esc(number)}. WhatsApp opens with the message ready. You press send there.</p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button>
      <a class="btn primary" id="wa-go" target="_blank" rel="noopener">Open WhatsApp</a></div>`, { wide: true });
  const ta = m.el.querySelector('#wa-text');
  const link = m.el.querySelector('#wa-go');
  const setLink = () => { link.href = `https://wa.me/${number}?text=${encodeURIComponent(ta.value)}`; };
  const pick = id => {
    current = id;
    ta.value = TEMPLATES.find(t => t.id === id).text(job, s);
    m.el.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === id));
    setLink();
  };
  m.el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => pick(b.dataset.t));
  ta.oninput = setLink;
  link.onclick = async () => {
    const tpl = TEMPLATES.find(t => t.id === current);
    if (tpl.id === 'review') await repo.markReviewRequested(job, 'WhatsApp');
    await repo.addNote(job, `WhatsApp opened (${tpl.label}): "${ta.value}"`);
    toast('Opened WhatsApp, logged on the job');
    setTimeout(m.close, 300);
  };
  pick(current);
}
