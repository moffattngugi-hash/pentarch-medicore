// Pentarch MediCore - storage layer
// registry.db  : organisations, branches, users, sessions (one per installation)
// branches/*.db: one database per branch (facility), so each branch can be a different type
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const CAT = require('./catalogue');

const DATA_DIR = process.env.MEDICORE_DATA || path.join(__dirname, '..', 'data');
const BR_DIR = path.join(DATA_DIR, 'branches');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
for (const d of [DATA_DIR, BR_DIR, UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true });

const clean = p => p.map(x => x === undefined || x === '' ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x);
const now = () => new Date().toISOString();
const addDays = (iso, n) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dateOnly = d => new Date(d).toISOString().slice(0, 10);
const hashPin = pin => crypto.createHash('sha256').update('medicore:' + pin).digest('hex');

// ================= registry =================
const reg = new DatabaseSync(path.join(DATA_DIR, 'registry.db'));
reg.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS orgs (id INTEGER PRIMARY KEY, name TEXT, owner_name TEXT, phone TEXT, email TEXT, location TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY, org_id INTEGER, name TEXT, type TEXT, db_file TEXT, sample INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, org_id INTEGER, branch_id INTEGER, name TEXT, username TEXT UNIQUE, pin_hash TEXT, role TEXT, active INTEGER DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT);
`);
const R = {
  all: (sql, ...p) => reg.prepare(sql).all(...clean(p)),
  get: (sql, ...p) => reg.prepare(sql).get(...clean(p)),
  run: (sql, ...p) => reg.prepare(sql).run(...clean(p)),
};
// Pentarch super administrator (change the PIN in production)
if (!R.get("SELECT id FROM users WHERE role='superadmin'")) {
  R.run('INSERT INTO users(org_id,branch_id,name,username,pin_hash,role,created_at) VALUES(NULL,NULL,?,?,?,?,?)',
    'Pentarch Super Admin', 'pentarch', hashPin(process.env.MEDICORE_SUPER_PIN || '2026'), 'superadmin', now());
}

// ================= branch databases =================
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY, mrn TEXT UNIQUE, first_name TEXT, last_name TEXT, sex TEXT, dob TEXT,
  phone TEXT, national_id TEXT, sha_number TEXT, county TEXT, allergies TEXT, chronic TEXT,
  next_of_kin TEXT, sample INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY, patient_id INTEGER, type TEXT, status TEXT, queue_no INTEGER,
  complaint TEXT, triage_level TEXT, pain INTEGER, created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, temp REAL, sys INTEGER, dia INTEGER,
  pulse INTEGER, resp INTEGER, spo2 INTEGER, weight REAL, height REAL, glucose REAL, muac REAL,
  recorded_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, history TEXT, exam TEXT,
  diagnosis TEXT, dx_code TEXT, plan TEXT, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, dept TEXT, unit TEXT, kind TEXT, ref_low REAL, ref_high REAL,
  crit_low REAL, crit_high REAL, abnormal_text TEXT, price REAL, sample TEXT, outsourced_only INTEGER DEFAULT 0,
  tat TEXT, ref_low_f REAL, ref_high_f REAL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS lab_panels (id INTEGER PRIMARY KEY, name TEXT, codes TEXT);
CREATE TABLE IF NOT EXISTS lab_orders (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, test_id INTEGER, mode TEXT, partner TEXT,
  status TEXT, result_value REAL, result_text TEXT, flag TEXT, comment TEXT, resulted_by TEXT,
  validated_by TEXT, billed INTEGER DEFAULT 0, created_at TEXT, resulted_at TEXT);
CREATE TABLE IF NOT EXISTS imaging_studies (id INTEGER PRIMARY KEY, name TEXT, modality TEXT, price REAL);
CREATE TABLE IF NOT EXISTS imaging_orders (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, study_id INTEGER, mode TEXT, partner TEXT,
  status TEXT, report TEXT, billed INTEGER DEFAULT 0, created_at TEXT, reported_at TEXT);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, generic TEXT, form TEXT, strength TEXT, category TEXT, grp TEXT, shop_cat TEXT,
  unit TEXT, pack_size INTEGER DEFAULT 1, pack_name TEXT, price REAL, pack_price REAL, cost REAL,
  reorder_level INTEGER, rx_only INTEGER DEFAULT 0, controlled INTEGER DEFAULT 0, web INTEGER DEFAULT 1,
  sell_loose INTEGER DEFAULT 0, barcode TEXT, image TEXT, description TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY, item_id INTEGER, batch_no TEXT, expiry TEXT, qty REAL, cost REAL,
  supplier TEXT, received_at TEXT);
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, item_id INTEGER, batch_id INTEGER, qty REAL, type TEXT, ref TEXT,
  by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT);
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, item_id INTEGER, dose TEXT,
  frequency TEXT, days INTEGER, qty REAL, status TEXT, billed INTEGER DEFAULT 0, prescriber TEXT,
  created_at TEXT, dispensed_at TEXT);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, category TEXT, price REAL, needs TEXT);
CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, service_id INTEGER, consent INTEGER,
  notes TEXT, status TEXT, billed INTEGER DEFAULT 0, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, customer_name TEXT, payer TEXT,
  status TEXT, receipt_no TEXT, created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY, bill_id INTEGER, description TEXT, kind TEXT, ref_table TEXT, ref_id INTEGER,
  qty REAL, unit_price REAL, amount REAL, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, bill_id INTEGER, method TEXT, amount REAL, reference TEXT, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS wards (id INTEGER PRIMARY KEY, name TEXT, daily_rate REAL);
CREATE TABLE IF NOT EXISTS beds (id INTEGER PRIMARY KEY, ward_id INTEGER, label TEXT);
CREATE TABLE IF NOT EXISTS admissions (
  id INTEGER PRIMARY KEY, patient_id INTEGER, visit_id INTEGER, bed_id INTEGER, reason TEXT,
  status TEXT, admitted_at TEXT, discharged_at TEXT, discharge_summary TEXT, last_charged TEXT);
CREATE TABLE IF NOT EXISTS nursing_notes (id INTEGER PRIMARY KEY, admission_id INTEGER, note TEXT, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS partograph (
  id INTEGER PRIMARY KEY, admission_id INTEGER, at TEXT, dilation REAL, fhr INTEGER, contractions INTEGER,
  descent INTEGER, sys INTEGER, dia INTEGER, by_user TEXT);
CREATE TABLE IF NOT EXISTS pregnancies (
  id INTEGER PRIMARY KEY, patient_id INTEGER, lmp TEXT, edd TEXT, gravida INTEGER, parity INTEGER,
  status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS anc_visits (
  id INTEGER PRIMARY KEY, pregnancy_id INTEGER, visit_id INTEGER, gest_weeks INTEGER, fundal_height REAL,
  fhr INTEGER, presentation TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY, pregnancy_id INTEGER, patient_id INTEGER, admission_id INTEGER, delivered_at TEXT,
  mode TEXT, outcome TEXT, baby_sex TEXT, baby_weight REAL, apgar1 INTEGER, apgar5 INTEGER, notes TEXT);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY, patient_id INTEGER, visit_id INTEGER, direction TEXT, facility TEXT,
  reason TEXT, summary TEXT, urgency TEXT, status TEXT, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY, patient_id INTEGER, name TEXT, phone TEXT, service TEXT, date TEXT, time TEXT,
  source TEXT, status TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS web_orders (
  id INTEGER PRIMARY KEY, name TEXT, phone TEXT, items TEXT, total REAL, delivery TEXT,
  prescription_note TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, user TEXT, action TEXT, entity TEXT, entity_id INTEGER, created_at TEXT);
`;

const open = {};
let db = null;           // the branch database the current request works on
let currentBranch = null;
function dbFile(branchId) { return path.join(BR_DIR, `branch-${branchId}.db`); }
function openBranch(branchId) {
  if (!open[branchId]) {
    const d = new DatabaseSync(dbFile(branchId));
    d.exec('PRAGMA journal_mode = WAL;');
    d.exec(SCHEMA);
    open[branchId] = d;
  }
  return open[branchId];
}
function use(branchId) { db = openBranch(branchId); currentBranch = Number(branchId); return db; }
const all = (sql, ...p) => db.prepare(sql).all(...clean(p));
const get = (sql, ...p) => db.prepare(sql).get(...clean(p));
const run = (sql, ...p) => db.prepare(sql).run(...clean(p));
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function getConfig() {
  const r = get("SELECT value FROM settings WHERE key='config'");
  return r ? JSON.parse(r.value) : null;
}
function setConfig(cfg) {
  run("INSERT INTO settings(key,value) VALUES('config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(cfg));
  R.run('UPDATE branches SET name=?, type=? WHERE id=?', cfg.facility_name, cfg.type, currentBranch);
}

// ---------- facility types and their sample setups ----------
const TYPES = {
  pharmacy: {
    label: 'Pharmacy', sample: 'SPENSA-style pharmacy',
    defaults: { type: 'pharmacy', lab: 'both', imaging: 'outsourced', procedures: true, consultation: true, maternity: false, admissions: false, theatre: false, billing_mode: 'auto', auto_checkout: true, color: '#0f766e', tagline: 'Your trusted neighbourhood pharmacy and lab', partners: ['Lancet Kenya', 'Pathologists Lancet - Westlands', 'Metropolis Star Lab', 'Plaza Imaging Centre'] },
  },
  clinic: {
    label: 'Clinic', sample: 'TopCare-style clinic',
    defaults: { type: 'clinic', lab: 'inhouse', imaging: 'outsourced', procedures: true, consultation: true, maternity: true, admissions: true, beds: 30, theatre: false, billing_mode: 'auto', auto_checkout: false, color: '#7c3aed', tagline: 'Caring for mothers, babies and families', partners: ['Lancet Kenya', 'Plaza Imaging Centre', 'Kenyatta National Hospital'] },
  },
  hospital: {
    label: 'Hospital', sample: 'General hospital',
    defaults: { type: 'hospital', lab: 'inhouse', imaging: 'inhouse', procedures: true, consultation: true, maternity: true, admissions: true, beds: 60, theatre: true, billing_mode: 'auto', auto_checkout: false, color: '#1d4ed8', tagline: 'Complete care under one roof', partners: ['Lancet Kenya', 'Kenyatta National Hospital'] },
  },
};

// Make sure wards and beds exist when admissions are switched on (used when a branch changes type)
function ensureStructure(cfg) {
  if (cfg.admissions && !get('SELECT id FROM wards LIMIT 1')) {
    const beds = Number(cfg.beds) || 20;
    const plan = cfg.maternity
      ? [['Maternity and postnatal', 2500, 0.35], ['General ward', 2000, 0.4], ['Paediatric ward', 1800, 0.15], ['Newborn unit', 2000, 0.1]]
      : [['General ward', 2000, 0.7], ['Paediatric ward', 1800, 0.3]];
    let left = beds;
    plan.forEach(([name, rate, share], i) => {
      const w = run('INSERT INTO wards(name,daily_rate) VALUES(?,?)', name, rate).lastInsertRowid;
      const n = i === plan.length - 1 ? left : Math.max(1, Math.round(beds * share));
      left -= n;
      const prefix = name.split(' ')[0].slice(0, 3).toUpperCase();
      for (let b = 1; b <= n; b++) run('INSERT INTO beds(ward_id,label) VALUES(?,?)', w, `${prefix}-${String(b).padStart(2, '0')}`);
    });
  } else if (cfg.admissions) {
    // grow or report bed count changes: add beds to the general ward if more were requested
    const have = get('SELECT COUNT(*) c FROM beds').c;
    const want = Number(cfg.beds) || have;
    if (want > have) {
      const w = get("SELECT * FROM wards WHERE name LIKE 'General%'") || get('SELECT * FROM wards LIMIT 1');
      const prefix = w.name.split(' ')[0].slice(0, 3).toUpperCase();
      const n0 = get('SELECT COUNT(*) c FROM beds WHERE ward_id=?', w.id).c;
      for (let b = 1; b <= want - have; b++) run('INSERT INTO beds(ward_id,label) VALUES(?,?)', w.id, `${prefix}-${String(n0 + b).padStart(2, '0')}`);
    }
  }
}

function seedCatalogue() {
  for (const it of CAT.ITEMS) {
    run(`INSERT INTO items(code,name,generic,form,strength,category,grp,shop_cat,unit,pack_size,pack_name,price,pack_price,cost,reorder_level,rx_only,controlled,web,sell_loose,description)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, it.code, it.name, it.generic, it.form, it.strength, it.category, it.group, it.shop,
      it.unit, it.pack_size, it.pack_name, it.price, it.pack_price, it.cost, it.reorder_level, it.rx_only, it.controlled, it.web, it.sell_loose, it.desc);
  }
  for (const t of CAT.LAB_TESTS) {
    run(`INSERT INTO lab_tests(code,name,dept,unit,kind,ref_low,ref_high,crit_low,crit_high,abnormal_text,price,sample,outsourced_only,tat,ref_low_f,ref_high_f)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11], t[12], t[13], t[14] ?? null, t[15] ?? null);
  }
  for (const [n, codes] of CAT.LAB_PANELS) run('INSERT INTO lab_panels(name,codes) VALUES(?,?)', n, codes.join(','));
  for (const [n, mod, p] of CAT.IMAGING) run('INSERT INTO imaging_studies(name,modality,price) VALUES(?,?,?)', n, mod, p);
  for (const s of CAT.SERVICES) run('INSERT INTO services(code,name,category,price,needs) VALUES(?,?,?,?,?)', s[0], s[1], s[2], s[3], s[4] || null);
  for (const s of ['Dawa Ltd', 'Surgipharm Ltd', 'Harleys Ltd', 'Laborex Kenya', 'Phillips Pharmaceuticals', 'KEMSA']) run('INSERT INTO suppliers(name) VALUES(?)', s);
}

// Create a branch database. sample=true loads realistic demo patients, stock and history.
function createBranchDb(branchId, cfg, sample) {
  const f = dbFile(branchId);
  if (open[branchId]) { open[branchId].close(); delete open[branchId]; }
  for (const x of [f, f + '-wal', f + '-shm']) { try { fs.unlinkSync(x); } catch {} }
  use(branchId);
  tx(() => {
    setConfig(cfg);
    seedCatalogue();
    ensureStructure(cfg);
    if (sample) require('./sample').seedSample(module.exports, cfg);
  });
}

// Remove sample clinical and sales data but keep the catalogue, prices, wards and settings
function clearSample({ zeroStock = true } = {}) {
  tx(() => {
    for (const t of ['patients', 'visits', 'vitals', 'notes', 'lab_orders', 'imaging_orders', 'prescriptions', 'procedures', 'bills', 'bill_lines',
      'payments', 'admissions', 'nursing_notes', 'partograph', 'pregnancies', 'anc_visits', 'deliveries', 'referrals', 'appointments', 'web_orders', 'audit']) run(`DELETE FROM ${t}`);
    if (zeroStock) { run('DELETE FROM batches'); run('DELETE FROM stock_moves'); }
  });
  R.run('UPDATE branches SET sample=0 WHERE id=?', currentBranch);
}

function nextMrn() {
  const r = get("SELECT MAX(CAST(substr(mrn,3) AS INTEGER)) m FROM patients");
  return 'MC' + String((r.m || 100000) + 1);
}

module.exports = {
  get db() { return db; }, get currentBranch() { return currentBranch; },
  R, hashPin, use, openBranch, all, get, run, tx, now, addDays, dateOnly,
  getConfig, setConfig, TYPES, ensureStructure, createBranchDb, clearSample, nextMrn, UPLOAD_DIR,
};
