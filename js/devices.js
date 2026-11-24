// Device types, model suggestions and common faults.
// Models are suggestions only — staff can always type any model.
const PHONE_FAULTS = ['Screen', 'Battery', 'Charging port', 'Back glass', 'Camera', 'Face ID / Touch ID',
  'Speaker / mic', 'Buttons', 'Water damage', 'No power', 'Software', 'Signal / SIM'];
const TABLET_FAULTS = ['Screen', 'Battery', 'Charging port', 'Camera', 'Face ID / Touch ID', 'Speaker / mic',
  'Buttons', 'Water damage', 'No power', 'Software', 'Bent frame'];
const WATCH_FAULTS = ['Screen', 'Glass only', 'Battery', 'Back glass', 'Digital Crown', 'Buttons', 'Charging',
  'Speaker / mic', 'Water damage', 'Band', 'Software'];
const MAC_FAULTS = ['Screen', 'Battery', 'Keyboard', 'Trackpad', 'Charging / USB-C', 'Liquid damage', 'No power',
  'Slow / software', 'Logic board', 'Fan / overheating', 'Storage'];
const DESKTOP_FAULTS = ['No power', 'Screen', 'Slow / software', 'Storage / upgrade', 'Fan / overheating',
  'Ports', 'Logic board', 'Wi-Fi / Bluetooth'];
const CONSOLE_FAULTS = ['HDMI port', 'No power', 'Overheating', 'Disc drive', 'Storage / HDD', 'Controller drift',
  'Blue light / no picture', 'Software', 'Fan noise'];
const SWITCH_FAULTS = ['Screen', 'Charging port', 'Joy-Con drift', 'Battery', 'No power', 'Game card reader',
  'Dock / HDMI', 'Buttons', 'Software'];

export const DEVICE_TYPES = [
  { id: 'iphone', label: 'iPhone', faults: PHONE_FAULTS, passcode: true, models: [
    'iPhone 18 Pro Max', 'iPhone 18 Pro', 'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone Air', 'iPhone 17',
    'iPhone 16e', 'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 mini',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 mini',
    'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11', 'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
    'iPhone SE (3rd gen)', 'iPhone SE (2nd gen)', 'iPhone 8 Plus', 'iPhone 8'] },
  { id: 'ipad', label: 'iPad', faults: TABLET_FAULTS, passcode: true, models: [
    'iPad Pro 13" (M4/M5)', 'iPad Pro 11" (M4/M5)', 'iPad Pro 12.9"', 'iPad Pro 11"',
    'iPad Air 13" (M2/M3)', 'iPad Air 11" (M2/M3)', 'iPad Air (5th gen)', 'iPad Air (4th gen)',
    'iPad (A16)', 'iPad (10th gen)', 'iPad (9th gen)', 'iPad (8th gen)',
    'iPad mini (A17 Pro)', 'iPad mini (6th gen)', 'iPad mini (5th gen)'] },
  { id: 'watch', label: 'Apple Watch', faults: WATCH_FAULTS, passcode: true, models: [
    'Apple Watch Ultra 3', 'Apple Watch Ultra 2', 'Apple Watch Ultra',
    'Apple Watch Series 11', 'Apple Watch Series 10', 'Apple Watch Series 9', 'Apple Watch Series 8',
    'Apple Watch Series 7', 'Apple Watch Series 6', 'Apple Watch Series 5', 'Apple Watch Series 4',
    'Apple Watch SE 3', 'Apple Watch SE 2', 'Apple Watch SE'] },
  { id: 'macbook', label: 'MacBook', faults: MAC_FAULTS, passcode: true, models: [
    'MacBook Air 13" (M4)', 'MacBook Air 15" (M4)', 'MacBook Air 13" (M3)', 'MacBook Air 15" (M3)',
    'MacBook Air 13" (M2)', 'MacBook Air 15" (M2)', 'MacBook Air (M1)',
    'MacBook Pro 14" (M4/M5)', 'MacBook Pro 16" (M4)', 'MacBook Pro 14" (M1–M3)', 'MacBook Pro 16" (M1–M3)',
    'MacBook Pro 13" (M1/M2)', 'MacBook Pro (Intel)', 'MacBook Air (Intel)'] },
  { id: 'imac', label: 'iMac', faults: DESKTOP_FAULTS, passcode: true, models: [
    'iMac 24" (M4)', 'iMac 24" (M3)', 'iMac 24" (M1)', 'iMac 27" (Intel)', 'iMac 21.5" (Intel)'] },
  { id: 'macmini', label: 'Mac mini', faults: DESKTOP_FAULTS, passcode: true, models: [
    'Mac mini (M4)', 'Mac mini (M2)', 'Mac mini (M1)', 'Mac mini (Intel)'] },
  { id: 'playstation', label: 'PlayStation', faults: CONSOLE_FAULTS, passcode: false, models: [
    'PS5 Pro', 'PS5 Slim', 'PS5', 'PS4 Pro', 'PS4 Slim', 'PS4', 'DualSense controller', 'DualShock 4 controller'] },
  { id: 'xbox', label: 'Xbox', faults: CONSOLE_FAULTS, passcode: false, models: [
    'Xbox Series X', 'Xbox Series S', 'Xbox One X', 'Xbox One S', 'Xbox One', 'Xbox controller'] },
  { id: 'nintendo', label: 'Nintendo Switch', faults: SWITCH_FAULTS, passcode: false, models: [
    'Switch 2', 'Switch OLED', 'Switch', 'Switch Lite', 'Joy-Con (pair)', 'Joy-Con (single)', 'Pro Controller'] },
];

export const deviceType = id => DEVICE_TYPES.find(t => t.id === id);

// Model drop-down with an "Other (type it in)" choice. `id` names the text box that holds the final value
// (#id), the list is #id-sel and the typing box's label is #id-other.
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function modelOptions(typeId, model) {
  const models = deviceType(typeId)?.models || [];
  const other = !!model && !models.includes(model);
  return `<option value="" ${!model ? 'selected' : ''} disabled>${models.length ? 'Choose the model…' : 'Choose the device type first'}</option>
    ${models.map(m => `<option ${m === model ? 'selected' : ''}>${escA(m)}</option>`).join('')}
    <option value="__other" ${other ? 'selected' : ''}>Other (type it in)</option>`;
}
export function modelPickerHtml(id, typeId, model, { disabled = false } = {}) {
  const models = deviceType(typeId)?.models || [];
  const other = !!model && !models.includes(model);
  return `<label class="field">Model<select id="${id}-sel" ${disabled ? 'disabled' : ''}>${modelOptions(typeId, model)}</select></label>
    <label class="field" id="${id}-other" ${other ? '' : 'hidden'}>Model name<span class="hint">not in the list</span>
      <input type="text" id="${id}" value="${escA(model)}" autocomplete="off" ${disabled ? 'readonly' : ''}></label>`;
}
// Wire it up. Call setType(newTypeId) when the device type changes.
export function wireModelPicker(root, id) {
  const sel = root.querySelector(`#${id}-sel`), box = root.querySelector(`#${id}-other`), input = root.querySelector(`#${id}`);
  sel.onchange = () => {
    const other = sel.value === '__other';
    box.hidden = !other;
    input.value = other ? '' : sel.value;
    if (other) input.focus();
  };
  return { setType: typeId => { sel.innerHTML = modelOptions(typeId, ''); box.hidden = true; input.value = ''; } };
}

export const DAMAGE = ['No visible damage', 'Cracked screen', 'Cracked back', 'Scratches', 'Dents / bent frame',
  'Water damage signs', 'Missing screws', 'Signs of previous repair', 'Swollen battery', 'Screen marks / lines'];

export const ACCESSORIES = ['Nothing', 'Case / cover', 'SIM card', 'Memory card', 'Charger', 'Cable', 'Strap / band',
  'Controller', 'Stylus / Pencil', 'Box', 'Bag / sleeve'];

export const COLLECTION = [
  { id: 'store', label: 'Customer collects in store' },
  { id: 'gauteng', label: 'We collect + deliver (Gauteng, R300)' },
  { id: 'courier', label: 'Courier (out of province, cost varies)' },
];
export const collectionLabel = id => COLLECTION.find(c => c.id === id)?.label || id;

export const PAY_METHODS = ['Card', 'Cash', 'EFT', 'No charge'];

export const REFERRALS = ['Google search', 'Google Maps', 'Walk-in', 'Returning customer', 'Friend / family',
  'Facebook / Instagram', 'Business referral', 'Other'];

export const JOB_TYPES = [
  { id: 'paid', label: 'Paid repair' },
  { id: 'offsite', label: 'Off-site / call-out' },
  { id: 'warranty', label: 'Warranty return' },
  { id: 'insurance', label: 'Insurance report' },
];
export const jobTypeLabel = id => JOB_TYPES.find(t => t.id === id)?.label || 'Paid repair';

// What happened to the device before it came in (tapped by the customer at book-in).
export const HISTORY = ['Dropped', 'Liquid exposure', 'Died suddenly', 'Lightning / power surge', 'Load-shedding (power came back)',
  'Got very hot', 'Bent or sat on', 'Battery swollen / screen lifting', 'Non-original charger', 'Software update went wrong',
  'Repaired elsewhere before'];
// How the customer wants to be contacted.
export const CONTACT_PREFS = [{ id: 'whatsapp', label: 'WhatsApp' }, { id: 'call', label: 'Phone call' }, { id: 'email', label: 'Email' }];
export const contactPrefLabel = id => CONTACT_PREFS.find(p => p.id === id)?.label || '';

// Insurance / damage reports.
export const REPORT_CAUSES = ['Dropped', 'Liquid damage', 'Lightning / power surge', 'Accident (sat on, bent, crushed)',
  'Theft / attempted theft', 'Fire / heat', 'Unknown', 'Other'];
export const REPORT_FINDINGS = ['Cracked screen', 'Display not working', 'Touch not working', 'Cracked back glass', 'Bent frame / housing',
  'Liquid indicators triggered', 'Corrosion on the board', 'Board damage', 'Won’t power on', 'Won’t charge', 'Camera damaged',
  'Face ID / Touch ID not working', 'Speaker / microphone damaged', 'Battery swollen', 'Buttons damaged'];
export const REPORT_TESTED = ['Battery', 'Display assembly', 'Complete housing / frame', 'Charging port', 'Camera', 'Speaker / microphone',
  'Face ID / Touch ID module', 'Logic board'];

// Draft the report paragraphs from what the technician tapped. Staff can edit the wording before saving.
export function draftReport(job, r) {
  const dev = job.model || 'device';
  const cause = (r.cause || '').toLowerCase();
  const causeText = !cause || cause === 'unknown' ? 'reported damage' : cause === 'dropped' ? 'accidental impact damage caused by a drop'
    : cause.startsWith('liquid') ? 'liquid damage' : cause.startsWith('lightning') ? 'damage from a lightning strike or power surge'
    : cause.startsWith('accident') ? 'accidental damage (sat on, bent or crushed)' : cause.startsWith('theft') ? 'damage during a theft or attempted theft'
    : cause.startsWith('fire') ? 'fire or heat damage' : 'damage';
  const found = (r.findings || []).map(f => f.toLowerCase());
  const s1 = `The ${dev} was presented for assessment following ${causeText}.${r.statement ? ` The owner reports: "${r.statement}".` : ''}`
    + (found.length ? `\n\nUpon inspection, the following was observed: ${found.join(', ')}.` : '');
  const tested = r.testedParts || [];
  const s2 = [r.notes || '',
    tested.length ? `As part of the diagnostic process, the following components were replaced for testing and fault isolation:\n${tested.map(t => `* ${t}`).join('\n')}` : '',
    tested.length && r.result === 'ber' ? 'Despite replacing these components, the fault remained.' : ''].filter(Boolean).join('\n\n');
  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s3 = r.result === 'ber'
    ? `The device is classified as Beyond Economic Repair (BER).${r.berReason ? `\n\n${r.berReason}.` : ''} Considering the nature of the damage and the associated repair costs, repair is not considered economically viable.`
    : `The device can be repaired.${r.repairCost != null ? ` The estimated repair cost is ${money(r.repairCost)}.` : ''}`;
  const s5 = r.result === 'ber'
    ? `We recommend that the insurer considers the device a total loss and authorises replacement with an equivalent ${r.replacementItem || dev}.`
    : `We recommend that the insurer authorises the repair at the cost quoted in this report.`;
  return { s1: s1.replace(/\.\./g, '.'), s2, s3: s3.replace(/\.\./g, '.'), s5 };
}
