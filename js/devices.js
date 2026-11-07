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
];
export const jobTypeLabel = id => JOB_TYPES.find(t => t.id === id)?.label || 'Paid repair';
