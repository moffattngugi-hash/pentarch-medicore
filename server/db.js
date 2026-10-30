// Pentarch MediCore - database schema and demo data
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.MEDICORE_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'medicore.db');

let db = open();

function open() {
  const d = new DatabaseSync(DB_FILE);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return d;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, username TEXT UNIQUE, pin TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY, mrn TEXT UNIQUE, first_name TEXT, last_name TEXT, sex TEXT, dob TEXT,
  phone TEXT, national_id TEXT, sha_number TEXT, county TEXT, allergies TEXT, chronic TEXT,
  next_of_kin TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY, patient_id INTEGER, type TEXT, status TEXT, queue_no INTEGER,
  complaint TEXT, created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, temp REAL, sys INTEGER, dia INTEGER,
  pulse INTEGER, resp INTEGER, spo2 INTEGER, weight REAL, height REAL, glucose REAL, muac REAL,
  recorded_by TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, history TEXT, exam TEXT,
  diagnosis TEXT, dx_code TEXT, plan TEXT, by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, unit TEXT, kind TEXT, ref_low REAL, ref_high REAL,
  crit_low REAL, crit_high REAL, abnormal_text TEXT, price REAL, sample TEXT, outsourced_only INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lab_orders (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, test_id INTEGER, mode TEXT, partner TEXT,
  status TEXT, result_value REAL, result_text TEXT, flag TEXT, comment TEXT, resulted_by TEXT,
  validated_by TEXT, billed INTEGER DEFAULT 0, created_at TEXT, resulted_at TEXT);
CREATE TABLE IF NOT EXISTS imaging_studies (id INTEGER PRIMARY KEY, name TEXT, price REAL);
CREATE TABLE IF NOT EXISTS imaging_orders (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, study_id INTEGER, mode TEXT, partner TEXT,
  status TEXT, report TEXT, billed INTEGER DEFAULT 0, created_at TEXT, reported_at TEXT);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT, category TEXT, unit TEXT, price REAL, cost REAL,
  reorder_level INTEGER, rx_only INTEGER DEFAULT 0, controlled INTEGER DEFAULT 0, web INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY, item_id INTEGER, batch_no TEXT, expiry TEXT, qty REAL, cost REAL,
  supplier TEXT, received_at TEXT);
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, item_id INTEGER, batch_id INTEGER, qty REAL, type TEXT, ref TEXT,
  by_user TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY, visit_id INTEGER, patient_id INTEGER, item_id INTEGER, dose TEXT,
  frequency TEXT, days INTEGER, qty REAL, status TEXT, billed INTEGER DEFAULT 0, prescriber TEXT,
  created_at TEXT, dispensed_at TEXT);
CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, code TEXT, name TEXT, category TEXT, price REAL);
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
CREATE TABLE IF NOT EXISTS pregnancies (
  id INTEGER PRIMARY KEY, patient_id INTEGER, lmp TEXT, edd TEXT, gravida INTEGER, parity INTEGER,
  status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS anc_visits (
  id INTEGER PRIMARY KEY, pregnancy_id INTEGER, visit_id INTEGER, gest_weeks INTEGER, fundal_height REAL,
  fhr INTEGER, presentation TEXT, notes TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY, pregnancy_id INTEGER, patient_id INTEGER, admission_id INTEGER, delivered_at TEXT,
  mode TEXT, outcome TEXT, baby_sex TEXT, baby_weight REAL, apgar1 INTEGER, apgar5 INTEGER, notes TEXT);
CREATE TABLE IF NOT EXISTS partograph (
  id INTEGER PRIMARY KEY, admission_id INTEGER, at TEXT, dilation REAL, fhr INTEGER, contractions INTEGER,
  descent INTEGER, sys INTEGER, dia INTEGER, by_user TEXT);
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

db.exec(SCHEMA);

// ---------- helpers ----------
const clean = p => p.map(x => x === undefined || x === '' ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x);
const all = (sql, ...p) => db.prepare(sql).all(...clean(p));
const get = (sql, ...p) => db.prepare(sql).get(...clean(p));
const run = (sql, ...p) => db.prepare(sql).run(...clean(p));
const now = () => new Date().toISOString();
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
}

// ---------- presets ----------
const PRESETS = {
  spensa: {
    facility_name: 'SPENSA Pharmacy', tagline: 'Your trusted neighbourhood pharmacy and lab',
    type: 'pharmacy', lab: 'both', imaging: 'outsourced', procedures: true, consultation: true,
    maternity: false, admissions: false, theatre: false, billing_mode: 'auto', auto_checkout: true,
    phone: '0712 000 111', email: 'info@spensapharmacy.co.ke', location: 'Nairobi, Kenya',
    kmhfr: 'DEMO-00001', kra_pin: 'P000000000X', currency: 'KES',
    partners: ['Lancet Kenya', 'Pathologists Lancet - Westlands', 'Metropolis Star Lab', 'Plaza Imaging Centre'],
    color: '#0f766e'
  },
  topcare: {
    facility_name: 'TopCare Clinic', tagline: 'Caring for mothers, babies and families',
    type: 'clinic', lab: 'inhouse', imaging: 'outsourced', procedures: true, consultation: true,
    maternity: true, admissions: true, beds: 30, theatre: false, billing_mode: 'auto', auto_checkout: false,
    phone: '0722 000 222', email: 'care@topcareclinic.co.ke', location: 'Nairobi, Kenya',
    kmhfr: 'DEMO-00002', kra_pin: 'P000000001X', currency: 'KES',
    partners: ['Lancet Kenya', 'Plaza Imaging Centre', 'Kenyatta National Hospital'],
    color: '#7c3aed'
  },
  hospital: {
    facility_name: 'MediCore General Hospital', tagline: 'Complete care under one roof',
    type: 'hospital', lab: 'inhouse', imaging: 'inhouse', procedures: true, consultation: true,
    maternity: true, admissions: true, beds: 60, theatre: true, billing_mode: 'auto', auto_checkout: false,
    phone: '0733 000 333', email: 'info@medicoregeneral.co.ke', location: 'Nairobi, Kenya',
    kmhfr: 'DEMO-00003', kra_pin: 'P000000002X', currency: 'KES',
    partners: ['Lancet Kenya', 'Kenyatta National Hospital'],
    color: '#1d4ed8'
  }
};

// ---------- catalogue ----------
const DRUGS = [
  // code, name, category, unit, price, cost, reorder, rx, controlled
  ['PCM500', 'Paracetamol 500mg tablets', 'drug', 'tab', 5, 2, 500, 0, 0],
  ['IBU400', 'Ibuprofen 400mg tablets', 'drug', 'tab', 10, 4, 300, 0, 0],
  ['AMX500', 'Amoxicillin 500mg capsules', 'drug', 'cap', 15, 6, 300, 1, 0],
  ['AUG625', 'Amoxicillin/Clavulanate 625mg tablets', 'drug', 'tab', 60, 35, 100, 1, 0],
  ['AL2012', 'Artemether/Lumefantrine 20/120mg (24s)', 'drug', 'pack', 350, 180, 30, 1, 0],
  ['MET500', 'Metformin 500mg tablets', 'drug', 'tab', 8, 3, 300, 1, 0],
  ['AML5', 'Amlodipine 5mg tablets', 'drug', 'tab', 10, 4, 300, 1, 0],
  ['LOS50', 'Losartan 50mg tablets', 'drug', 'tab', 20, 9, 200, 1, 0],
  ['OMP20', 'Omeprazole 20mg capsules', 'drug', 'cap', 15, 5, 200, 0, 0],
  ['CIP500', 'Ciprofloxacin 500mg tablets', 'drug', 'tab', 20, 8, 200, 1, 0],
  ['MTZ400', 'Metronidazole 400mg tablets', 'drug', 'tab', 6, 2, 300, 1, 0],
  ['CTZ10', 'Cetirizine 10mg tablets', 'drug', 'tab', 10, 3, 200, 0, 0],
  ['ORS', 'ORS sachets (low osmolarity)', 'drug', 'sachet', 30, 12, 100, 0, 0],
  ['ZNC20', 'Zinc sulphate 20mg dispersible', 'drug', 'tab', 10, 4, 200, 0, 0],
  ['FEFOL', 'Ferrous sulphate + Folic acid tablets', 'drug', 'tab', 5, 2, 500, 0, 0],
  ['SALB', 'Salbutamol 100mcg inhaler', 'drug', 'inhaler', 450, 260, 20, 1, 0],
  ['DICLO50', 'Diclofenac 50mg tablets', 'drug', 'tab', 8, 3, 300, 0, 0],
  ['ALB400', 'Albendazole 400mg tablet', 'drug', 'tab', 50, 15, 100, 0, 0],
  ['FLU150', 'Fluconazole 150mg capsule', 'drug', 'cap', 80, 30, 50, 1, 0],
  ['PRED5', 'Prednisolone 5mg tablets', 'drug', 'tab', 5, 2, 200, 1, 0],
  ['HCCR', 'Hydrocortisone 1% cream 15g', 'drug', 'tube', 150, 70, 30, 0, 0],
  ['TRAM50', 'Tramadol 50mg capsules', 'drug', 'cap', 25, 10, 100, 1, 1],
  ['DZP5', 'Diazepam 5mg tablets', 'drug', 'tab', 10, 4, 100, 1, 1],
  ['OXY10', 'Oxytocin 10 IU injection', 'drug', 'amp', 120, 60, 30, 1, 0],
  ['CEFTR1', 'Ceftriaxone 1g injection', 'drug', 'vial', 250, 120, 50, 1, 0],
  ['NS500', 'Normal saline 0.9% 500ml', 'drug', 'bag', 150, 70, 50, 1, 0],
  ['VITC', 'Vitamin C 500mg chewable', 'drug', 'tab', 10, 4, 200, 0, 0],
  ['LIDO2', 'Lidocaine 2% injection 20ml', 'consumable', 'vial', 200, 90, 20, 1, 0],
  ['GLOVE', 'Examination gloves (pair)', 'consumable', 'pair', 20, 8, 200, 0, 0],
  ['SYR5', 'Syringe 5ml with needle', 'consumable', 'pc', 20, 7, 200, 0, 0],
  ['CANN20', 'IV cannula G20', 'consumable', 'pc', 60, 25, 50, 0, 0],
  ['SUT30', 'Absorbable suture 3/0', 'consumable', 'pc', 350, 180, 20, 0, 0],
  ['GAUZE', 'Sterile gauze swabs (pack)', 'consumable', 'pack', 80, 30, 50, 0, 0],
  ['CONDOM', 'Male condoms (3s)', 'drug', 'pack', 100, 40, 50, 0, 0],
  ['MRDT', 'Malaria RDT kit', 'reagent', 'test', 0, 80, 50, 0, 0],
  ['HCGST', 'Pregnancy test strip', 'reagent', 'test', 0, 30, 50, 0, 0],
];

const LAB_TESTS = [
  // code, name, unit, kind, refLow, refHigh, critLow, critHigh, abnormalText, price, sample, outsourcedOnly
  ['MPS', 'Malaria parasites (blood slide)', '', 'text', null, null, null, null, 'Positive', 300, 'Blood', 0],
  ['MRDT', 'Malaria RDT', '', 'text', null, null, null, null, 'Positive', 250, 'Blood', 0],
  ['HB', 'Haemoglobin (Hb)', 'g/dL', 'numeric', 11.5, 16.5, 7, 20, null, 250, 'Blood', 0],
  ['RBS', 'Random blood sugar', 'mmol/L', 'numeric', 3.9, 7.8, 2.8, 20, null, 200, 'Blood', 0],
  ['FBC', 'Full blood count', '', 'text', null, null, null, null, null, 700, 'Blood', 0],
  ['URI', 'Urinalysis', '', 'text', null, null, null, null, null, 300, 'Urine', 0],
  ['HCG', 'Pregnancy test (urine hCG)', '', 'text', null, null, null, null, null, 200, 'Urine', 0],
  ['WIDAL', 'Widal test', '', 'text', null, null, null, null, 'Positive', 400, 'Blood', 0],
  ['HPY', 'H. pylori stool antigen', '', 'text', null, null, null, null, 'Positive', 800, 'Stool', 0],
  ['STOOL', 'Stool for ova and cysts', '', 'text', null, null, null, null, null, 300, 'Stool', 0],
  ['HIV', 'HIV test (rapid)', '', 'text', null, null, null, null, 'Reactive', 0, 'Blood', 0],
  ['VDRL', 'VDRL (syphilis)', '', 'text', null, null, null, null, 'Reactive', 300, 'Blood', 0],
  ['BGRP', 'Blood group and Rhesus', '', 'text', null, null, null, null, null, 300, 'Blood', 0],
  ['CREAT', 'Serum creatinine', 'µmol/L', 'numeric', 53, 115, null, 400, null, 600, 'Blood', 0],
  ['HBA1C', 'HbA1c', '%', 'numeric', 4.0, 5.6, null, 14, null, 1800, 'Blood', 1],
  ['LIPID', 'Lipid profile', '', 'text', null, null, null, null, null, 2500, 'Blood', 1],
  ['TSH', 'Thyroid stimulating hormone', 'mIU/L', 'numeric', 0.4, 4.0, null, null, null, 2000, 'Blood', 1],
];

const IMAGING = [
  ['Obstetric ultrasound', 2000], ['Pelvic ultrasound', 2500], ['Abdominal ultrasound', 3000],
  ['Chest X-ray', 1500], ['Limb X-ray', 1500], ['Echocardiogram', 6000],
];

const SERVICES = [
  ['CONS', 'Outpatient consultation', 'consultation', 500],
  ['PCONS', 'Pharmacist consultation', 'consultation', 0],
  ['ANC', 'Antenatal clinic visit', 'consultation', 300],
  ['PNC', 'Postnatal clinic visit', 'consultation', 300],
  ['CIRC', 'Male circumcision (minor surgery)', 'procedure', 3000],
  ['DRESS', 'Wound dressing', 'procedure', 300],
  ['SUTURE', 'Wound suturing', 'procedure', 1000],
  ['ID', 'Incision and drainage', 'procedure', 1500],
  ['INJ', 'Injection administration', 'procedure', 100],
  ['IVLINE', 'IV line insertion', 'procedure', 300],
  ['NVD', 'Normal vaginal delivery', 'procedure', 8000],
  ['CS', 'Caesarean section', 'procedure', 45000],
  ['NURSE', 'Nursing care (per day)', 'bed', 500],
];

// Kenyan first and last names for demo patients
const DEMO_PATIENTS = [
  ['Wanjiku', 'Kamau', 'F', '1988-03-14', 'Nairobi', 'Penicillin', 'Hypertension'],
  ['Otieno', 'Ochieng', 'M', '1975-07-02', 'Kisumu', '', 'Type 2 diabetes'],
  ['Achieng', 'Atieno', 'F', '1996-11-21', 'Nairobi', '', ''],
  ['Kiprono', 'Cheruiyot', 'M', '2001-01-09', 'Nakuru', '', ''],
  ['Mwende', 'Mutua', 'F', '1999-05-30', 'Machakos', 'Sulfa drugs', ''],
  ['Baraka', 'Njoroge', 'M', '2021-08-17', 'Kiambu', '', ''],
  ['Amina', 'Hassan', 'F', '1992-09-05', 'Mombasa', '', 'Asthma'],
  ['Kevin', 'Mwangi', 'M', '1985-12-12', 'Nairobi', '', ''],
  ['Faith', 'Wambui', 'F', '1994-02-26', 'Murang\'a', '', ''],
  ['Joseph', 'Kariuki', 'M', '1960-06-18', 'Nyeri', '', 'Hypertension, Type 2 diabetes'],
  ['Grace', 'Nyambura', 'F', '2019-04-03', 'Nairobi', '', ''],
  ['Brian', 'Omondi', 'M', '2012-10-22', 'Homa Bay', '', ''],
];

// hour is East Africa Time (UTC+3); times today are never later than now
function daysAgo(n, hour = 9) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hour - 3, Math.floor(Math.random() * 59), 0, 0);
  if (d > new Date()) return new Date(Date.now() - (5 + Math.random() * 40) * 60e3).toISOString();
  return d.toISOString();
}
function dateOnly(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function resetAndSeed(presetKey = 'spensa', overrides = {}) {
  db.close();
  for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  db = open();
  db.exec(SCHEMA);
  const cfg = { ...PRESETS[presetKey] || PRESETS.spensa, ...overrides, preset: presetKey, created_at: now() };
  tx(() => seed(cfg));
  return cfg;
}

function seed(cfg) {
  setConfig(cfg);
  const users = [
    ['Facility Admin', 'admin', 'admin'], ['Mary Wairimu', 'reception', 'reception'],
    ['Nurse Jane Akinyi', 'nurse', 'nurse'], ['Dr. Peter Maina', 'doctor', 'clinician'],
    ['Lab Tech Samuel Kibet', 'lab', 'lab'], ['Pharm. Lucy Njeri', 'pharmacist', 'pharmacist'],
    ['Cashier Tom Odhiambo', 'cashier', 'cashier'],
  ];
  if (cfg.maternity) users.push(['Midwife Rose Chebet', 'midwife', 'nurse']);
  for (const [n, u, r] of users) run('INSERT INTO users(name,username,pin,role) VALUES(?,?,?,?)', n, u, '1234', r);

  for (const d of DRUGS) {
    const r = run('INSERT INTO items(code,name,category,unit,price,cost,reorder_level,rx_only,controlled,web) VALUES(?,?,?,?,?,?,?,?,?,?)',
      d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[2] === 'drug' && !d[8] && !['amp', 'vial', 'bag'].includes(d[3]) ? 1 : 0);
    const id = r.lastInsertRowid;
    // two batches: an older one expiring soon and a newer one
    const lowStock = ['SALB', 'AUG625', 'CEFTR1'].includes(d[0]);
    const q1 = lowStock ? Math.round(d[6] * 0.3) : Math.round(d[6] * 0.6);
    const q2 = lowStock ? 0 : Math.round(d[6] * 1.5);
    const soon = ['AMX500', 'ORS', 'VITC'].includes(d[0]) ? 40 : 200;
    run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
      id, 'B' + (1000 + id) + 'A', addDays(now(), soon), q1, d[5], 'Dawa Ltd', daysAgo(90));
    if (q2) run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
      id, 'B' + (1000 + id) + 'B', addDays(now(), 540), q2, d[5], 'Surgipharm Ltd', daysAgo(20));
  }
  for (const t of LAB_TESTS) run('INSERT INTO lab_tests(code,name,unit,kind,ref_low,ref_high,crit_low,crit_high,abnormal_text,price,sample,outsourced_only) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', ...t);
  for (const [n, p] of IMAGING) run('INSERT INTO imaging_studies(name,price) VALUES(?,?)', n, p);
  for (const s of SERVICES) {
    if (!cfg.maternity && ['ANC', 'PNC', 'NVD'].includes(s[0])) continue;
    if (!cfg.theatre && s[0] === 'CS') continue;
    run('INSERT INTO services(code,name,category,price) VALUES(?,?,?,?)', ...s);
  }
  if (cfg.admissions) {
    const beds = cfg.beds || 30;
    const plan = cfg.maternity
      ? [['Maternity and postnatal', 2500, 0.35], ['General ward', 2000, 0.4], ['Paediatric ward', 1800, 0.15], ['Newborn unit', 2000, 0.1]]
      : [['General ward', 2000, 0.7], ['Paediatric ward', 1800, 0.3]];
    let left = beds;
    plan.forEach(([name, rate, share], i) => {
      const w = run('INSERT INTO wards(name,daily_rate) VALUES(?,?)', name, rate).lastInsertRowid;
      const n = i === plan.length - 1 ? left : Math.round(beds * share);
      left -= n;
      const prefix = name.split(' ')[0].slice(0, 3).toUpperCase();
      for (let b = 1; b <= n; b++) run('INSERT INTO beds(ward_id,label) VALUES(?,?)', w, `${prefix}-${String(b).padStart(2, '0')}`);
    });
  }
  seedPatients(cfg);
}

function nextMrn() {
  const r = get('SELECT COUNT(*) c FROM patients');
  return 'MC' + String(100001 + r.c);
}

function chargeSeed(billId, desc, kind, refTable, refId, qty, price, at) {
  run('INSERT INTO bill_lines(bill_id,description,kind,ref_table,ref_id,qty,unit_price,amount,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    billId, desc, kind, refTable, refId, qty, price, qty * price, 'system', at);
}

function seedPatients(cfg) {
  const ids = [];
  DEMO_PATIENTS.forEach((p, i) => {
    const r = run(`INSERT INTO patients(mrn,first_name,last_name,sex,dob,phone,national_id,sha_number,county,allergies,chronic,next_of_kin,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, nextMrn(), p[0], p[1], p[2], p[3], ['0712', '0722', '0733', '0745', '0791', '0702', '0110', '0723', '0718', '0727', '0700', '0115'][i] + String(482913 + i * 73157).slice(-6),
      new Date(p[3]).getFullYear() < 2008 ? String(20000000 + i * 734) : '', 'SHA' + String(5000000 + i * 31), p[4], p[5], p[6],
      'Spouse / parent - 0700 000 00' + i, daysAgo(120 - i * 3));
    ids.push(r.lastInsertRowid);
  });
  const test = code => get('SELECT * FROM lab_tests WHERE code=?', code);
  const item = code => get('SELECT * FROM items WHERE code=?', code);
  const svc = code => get('SELECT * FROM services WHERE code=?', code);
  const cons = cfg.type === 'pharmacy' ? svc('PCONS') : svc('CONS');

  // historical visits to build trends
  const closedVisit = (pid, at, complaint, vit, dx, code, labs = [], rx = []) => {
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)',
      pid, 'OPD', 'closed', 0, complaint, at, at).lastInsertRowid;
    const bill = run('INSERT INTO bills(visit_id,patient_id,payer,status,receipt_no,created_at,closed_at) VALUES(?,?,?,?,?,?,?)',
      v, pid, 'cash', 'paid', 'RCT' + String(v).padStart(6, '0'), at, at).lastInsertRowid;
    if (vit) run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,glucose,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      v, pid, vit.temp, vit.sys, vit.dia, vit.pulse, vit.resp || 18, vit.spo2 || 98, vit.weight, vit.height, vit.glucose ?? null, 'Nurse Jane Akinyi', at);
    if (dx) {
      run('INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        v, pid, complaint, 'Stable, alert.', dx, code, 'Treatment as prescribed. Review in 2 weeks.', 'Dr. Peter Maina', at);
      chargeSeed(bill, cons.name, 'consultation', 'services', cons.id, 1, cons.price, at);
    }
    for (const [c, val] of labs) {
      const t = test(c);
      const flag = t.kind === 'numeric' ? (val < t.ref_low ? 'L' : val > t.ref_high ? 'H' : 'N') : (t.abnormal_text && String(val).startsWith(t.abnormal_text) ? 'A' : 'N');
      const lo = run(`INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,status,result_value,result_text,flag,resulted_by,validated_by,billed,created_at,resulted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`, v, pid, t.id, t.outsourced_only ? 'outsourced' : 'inhouse', 'validated',
        t.kind === 'numeric' ? val : null, t.kind === 'numeric' ? null : val, flag, 'Lab Tech Samuel Kibet', 'Lab Tech Samuel Kibet', at, at).lastInsertRowid;
      if (!t.outsourced_only) chargeSeed(bill, t.name, 'lab', 'lab_orders', lo, 1, t.price, at);
    }
    for (const [c, qty, dose, freq, days] of rx) {
      const it = item(c);
      const pr = run(`INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,billed,prescriber,created_at,dispensed_at)
        VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`, v, pid, it.id, dose, freq, days, qty, 'dispensed', 'Dr. Peter Maina', at, at).lastInsertRowid;
      chargeSeed(bill, it.name, 'drug', 'prescriptions', pr, qty, it.price, at);
    }
    const tot = get('SELECT COALESCE(SUM(amount),0) t FROM bill_lines WHERE bill_id=?', bill).t;
    if (tot > 0) run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)',
      bill, Math.random() > 0.35 ? 'mpesa' : 'cash', tot, 'S' + Math.random().toString(36).slice(2, 11).toUpperCase(), 'Cashier Tom Odhiambo', at);
    return v;
  };

  // Wanjiku - hypertension trend improving
  const bp = [[150, 98], [146, 94], [141, 92], [136, 88], [132, 86], [128, 84]];
  bp.forEach(([s, d], i) => closedVisit(ids[0], daysAgo(150 - i * 28), 'Hypertension review',
    { temp: 36.6, sys: s, dia: d, pulse: 82 - i, weight: 78 - i * 0.6, height: 162 }, 'Essential hypertension', 'I10', [],
    [['AML5', 30, '5mg', 'OD', 30]]));
  // Otieno - diabetes glucose trend
  const gl = [[13.2, 9.1], [11.8, 8.6], [10.4, 8.0], [9.1, 7.4], [8.2, 7.1]];
  gl.forEach(([g, a], i) => closedVisit(ids[1], daysAgo(140 - i * 30), 'Diabetes review',
    { temp: 36.8, sys: 134, dia: 86, pulse: 78, weight: 92 - i, height: 175, glucose: g }, 'Type 2 diabetes mellitus', 'E11.9',
    i % 2 === 0 ? [['RBS', g], ['HBA1C', a]] : [['RBS', g]], [['MET500', 60, '500mg', 'BD', 30]]));
  // Joseph - both
  [[158, 96, 12.4], [150, 92, 10.9], [144, 90, 9.6]].forEach(([s, d, g], i) => closedVisit(ids[9], daysAgo(100 - i * 35), 'Chronic care review',
    { temp: 36.7, sys: s, dia: d, pulse: 88, weight: 84, height: 170, glucose: g }, 'Essential hypertension', 'I10', [['RBS', g], ['CREAT', 98 + i * 6]],
    [['LOS50', 30, '50mg', 'OD', 30], ['MET500', 60, '500mg', 'BD', 30]]));
  // Acute visits for other patients
  closedVisit(ids[2], daysAgo(12), 'Fever and headache for 3 days', { temp: 38.6, sys: 112, dia: 72, pulse: 104, weight: 58, height: 165 },
    'Malaria', 'B54', [['MRDT', 'Positive'], ['HB', 10.9]], [['AL2012', 1, '4 tabs', 'BD', 3], ['PCM500', 18, '1g', 'TDS', 3]]);
  closedVisit(ids[3], daysAgo(8), 'Cough and sore throat', { temp: 37.9, sys: 118, dia: 76, pulse: 92, weight: 66, height: 178 },
    'Upper respiratory tract infection', 'J06.9', [], [['AMX500', 15, '500mg', 'TDS', 5], ['CTZ10', 5, '10mg', 'OD', 5]]);
  closedVisit(ids[5], daysAgo(6), 'Diarrhoea for 2 days', { temp: 37.4, sys: null, dia: null, pulse: 118, weight: 13.5, height: 92 },
    'Diarrhoea', 'A09', [['STOOL', 'No ova or cysts seen']], [['ORS', 6, '1 sachet', 'After each loose stool', 3], ['ZNC20', 10, '20mg', 'OD', 10]]);
  closedVisit(ids[7], daysAgo(4), 'Burning urination', { temp: 37.2, sys: 124, dia: 80, pulse: 84, weight: 80, height: 180 },
    'Urinary tract infection', 'N39.0', [['URI', 'Leucocytes ++, Nitrites +']], [['CIP500', 10, '500mg', 'BD', 5]]);
  closedVisit(ids[10], daysAgo(15), 'Fever and cough', { temp: 38.9, sys: null, dia: null, pulse: 128, resp: 34, spo2: 95, weight: 15, height: 100 },
    'Pneumonia', 'J18.9', [['MPS', 'Negative'], ['HB', 11.8]], [['AMX500', 15, '250mg', 'TDS', 5]]);
  closedVisit(ids[11], daysAgo(20), 'Abdominal pain', { temp: 36.9, sys: 110, dia: 70, pulse: 80, weight: 40, height: 150 },
    'Intestinal worms', 'B83.9', [['STOOL', 'Ascaris ova seen']], [['ALB400', 1, '400mg', 'Stat', 1]]);
  closedVisit(ids[6], daysAgo(25), 'Wheezing at night', { temp: 36.8, sys: 116, dia: 74, pulse: 96, resp: 24, spo2: 94, weight: 61, height: 164 },
    'Asthma', 'J45.9', [], [['SALB', 1, '2 puffs', 'PRN', 30]]);
  closedVisit(ids[8], daysAgo(10), 'Epigastric pain', { temp: 36.7, sys: 118, dia: 74, pulse: 82, weight: 71.5, height: 167 },
    'Gastritis', 'K29.7', [['HPY', 'Negative']], [['OMP20', 14, '20mg', 'OD', 14]]);

  // Walk-in OTC sales over last 7 days for revenue chart
  const otc = ['PCM500', 'CTZ10', 'ORS', 'VITC', 'IBU400', 'CONDOM', 'HCCR', 'OMP20'];
  for (let d = 6; d >= 0; d--) {
    const n = 5 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n; k++) {
      const at = daysAgo(d, 8 + k);
      const b = run('INSERT INTO bills(patient_id,customer_name,payer,status,receipt_no,created_at,closed_at) VALUES(NULL,?,?,?,?,?,?)',
        'Walk-in customer', 'cash', 'paid', 'POS' + String(d * 100 + k).padStart(6, '0'), at, at).lastInsertRowid;
      let tot = 0;
      for (let j = 0; j < 1 + (k % 3); j++) {
        const it = item(otc[(k + j + d) % otc.length]);
        const qty = it.unit === 'tab' || it.unit === 'cap' ? 10 + (k % 3) * 10 : 1;
        chargeSeed(b, it.name, 'drug', 'items', it.id, qty, it.price, at);
        tot += qty * it.price;
      }
      run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)',
        b, k % 2 ? 'mpesa' : 'cash', tot, k % 2 ? 'S' + Math.random().toString(36).slice(2, 11).toUpperCase() : '', 'Cashier Tom Odhiambo', at);
    }
  }

  // Today's live queue
  const liveVisit = (pid, status, complaint, q) => {
    const at = new Date(Date.now() - (150 - q * 25) * 60e3).toISOString();
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at) VALUES(?,?,?,?,?,?)', pid, 'OPD', status, q, complaint, at).lastInsertRowid;
    run('INSERT INTO bills(visit_id,patient_id,payer,status,created_at) VALUES(?,?,?,?,?)', v, pid, 'cash', 'open', at);
    return v;
  };
  liveVisit(ids[4], 'waiting_triage', 'Headache and body aches', 1);
  const v2 = liveVisit(ids[3], 'waiting_doctor', 'Follow-up: cough not resolving', 2);
  run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    v2, ids[3], 37.6, 120, 78, 90, 20, 97, 65.5, 178, 'Nurse Jane Akinyi', daysAgo(0, 9));
  const v3 = liveVisit(ids[7], 'in_lab', 'Fever, chills', 3);
  run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    v3, ids[7], 38.4, 122, 80, 102, 20, 98, 80, 180, 'Nurse Jane Akinyi', daysAgo(0, 10));
  const b3 = get('SELECT id FROM bills WHERE visit_id=?', v3).id;
  for (const c of ['MPS', 'HB']) {
    const t = test(c);
    const lo = run('INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,status,billed,created_at) VALUES(?,?,?,?,?,1,?)', v3, ids[7], t.id, 'inhouse', 'ordered', daysAgo(0, 10)).lastInsertRowid;
    chargeSeed(b3, t.name, 'lab', 'lab_orders', lo, 1, t.price, daysAgo(0, 10));
  }
  chargeSeed(b3, cons.name, 'consultation', 'services', cons.id, 1, cons.price, daysAgo(0, 10));
  run("INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    v3, ids[7], 'Fever and chills x2 days', 'Febrile, no neck stiffness', 'Malaria', 'B54', 'Await blood slide', 'Dr. Peter Maina', daysAgo(0, 10));

  // Outsourced result waiting for review (pharmacy-with-lab story)
  const v4 = liveVisit(ids[1], 'waiting_doctor', 'Returned with outside lab results', 4);
  const tA = test('HBA1C');
  run(`INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,partner,status,result_value,flag,comment,resulted_by,billed,created_at,resulted_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`, v4, ids[1], tA.id, 'outsourced', (cfg.partners || ['Lancet Kenya'])[0], 'resulted', 6.9, 'H',
    'Result entered from external lab report', 'Lab Tech Samuel Kibet', daysAgo(2), daysAgo(0, 9));

  // Procedure today (circumcision) for pharmacies/clinics with procedures
  if (cfg.procedures) {
    const v5 = liveVisit(ids[11], 'billing', 'Male circumcision', 5);
    const s = svc('CIRC');
    const pr = run('INSERT INTO procedures(visit_id,patient_id,service_id,consent,notes,status,billed,by_user,created_at) VALUES(?,?,?,?,?,?,1,?,?)',
      v5, ids[11], s.id, 1, 'Consent signed by parent. Local anaesthesia. Procedure uneventful. Review in 7 days.', 'done', 'Dr. Peter Maina', daysAgo(0, 8)).lastInsertRowid;
    const b5 = get('SELECT id FROM bills WHERE visit_id=?', v5).id;
    chargeSeed(b5, s.name, 'procedure', 'procedures', pr, 1, s.price, daysAgo(0, 8));
    chargeSeed(b5, item('LIDO2').name, 'drug', 'items', item('LIDO2').id, 1, item('LIDO2').price, daysAgo(0, 8));
    chargeSeed(b5, item('SUT30').name, 'drug', 'items', item('SUT30').id, 1, item('SUT30').price, daysAgo(0, 8));
  }

  // Maternity
  if (cfg.maternity) {
    const lmp = addDays(now(), -7 * 28);
    const preg = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)',
      ids[8], lmp, addDays(lmp, 280), 2, 1, 'active', daysAgo(150)).lastInsertRowid;
    [[12, null, null], [20, 20, 148], [24, 24, 144], [26, 26, 142]].forEach(([w, fh, fhr]) => {
      const at = new Date(new Date(lmp).getTime() + w * 7 * 864e5 + 7 * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)', ids[8], 'ANC', 'closed', 0, 'ANC visit', at, at).lastInsertRowid;
      run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)',
        preg, v, w, fh, fhr, w > 24 ? 'Cephalic' : '', 'Progressing well', at);
      run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        v, ids[8], 36.7, 110 + w / 4, 70, 84, 62 + w * 0.35, 167, 'Midwife Rose Chebet', at);
    });
    // patient in labour admitted
    const lmp2 = addDays(now(), -7 * 39);
    const preg2 = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)',
      ids[2], lmp2, addDays(lmp2, 280), 1, 0, 'active', daysAgo(200)).lastInsertRowid;
    [[14, null, null], [22, 22, 150], [28, 28, 146], [34, 33, 140], [38, 37, 138]].forEach(([w, fh, fhr]) => {
      const at = new Date(new Date(lmp2).getTime() + w * 7 * 864e5 + 7 * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)', ids[2], 'ANC', 'closed', 0, 'ANC visit', at, at).lastInsertRowid;
      run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)',
        preg2, v, w, fh, fhr, w > 30 ? 'Cephalic' : '', 'Normal', at);
    });
  }
  if (cfg.admissions) {
    const admit = (pid, reason, wardName, hoursAgo) => {
      const at = new Date(Date.now() - hoursAgo * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at) VALUES(?,?,?,?,?,?)', pid, 'IPD', 'admitted', 0, reason, at).lastInsertRowid;
      const bill = run('INSERT INTO bills(visit_id,patient_id,payer,status,created_at) VALUES(?,?,?,?,?)', v, pid, 'sha', 'open', at).lastInsertRowid;
      const bed = get(`SELECT b.id, w.daily_rate, w.name FROM beds b JOIN wards w ON w.id=b.ward_id WHERE w.name LIKE ? AND b.id NOT IN
        (SELECT bed_id FROM admissions WHERE status='admitted') ORDER BY b.id LIMIT 1`, wardName + '%');
      const a = run('INSERT INTO admissions(patient_id,visit_id,bed_id,reason,status,admitted_at,last_charged) VALUES(?,?,?,?,?,?,?)',
        pid, v, bed.id, reason, 'admitted', at, dateOnly(at)).lastInsertRowid;
      chargeSeed(bill, `Bed day - ${bed.name}`, 'bed', 'admissions', a, 1, bed.daily_rate, at);
      run('INSERT INTO nursing_notes(admission_id,note,by_user,created_at) VALUES(?,?,?,?)', a, 'Admitted, stable. Vitals taken, IV line in situ.', 'Nurse Jane Akinyi', at);
      return { v, a, bill };
    };
    const lab = cfg.maternity ? admit(ids[2], 'Labour - 39 weeks, G1P0', 'Maternity', 6) : null;
    const pn = admit(ids[10], 'Severe pneumonia - IV antibiotics', cfg.maternity ? 'Paediatric' : 'Paediatric', 30);
    run('INSERT INTO vitals(visit_id,patient_id,temp,pulse,resp,spo2,weight,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      pn.v, ids[10], 38.2, 120, 30, 94, 15, 'Nurse Jane Akinyi', daysAgo(0, 6));
    const cef = item('CEFTR1');
    const prx = run(`INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,billed,prescriber,created_at,dispensed_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`,
      pn.v, ids[10], cef.id, '750mg IV', 'OD', 5, 5, 'dispensed', 'Dr. Peter Maina', daysAgo(1), daysAgo(1)).lastInsertRowid;
    chargeSeed(pn.bill, cef.name, 'drug', 'prescriptions', prx, 5, cef.price, daysAgo(1));
    if (lab) {
      // active labour from 4 cm, roughly 1 cm per hour, plotted on the partograph
      [[4, 140, 3], [5, 138, 3], [6, 142, 4], [7, 136, 4]].forEach(([cm, fhr, ctx], i) => run(
        'INSERT INTO partograph(admission_id,at,dilation,fhr,contractions,descent,sys,dia,by_user) VALUES(?,?,?,?,?,?,?,?,?)',
        lab.a, new Date(Date.now() - (5 - i) * 3600e3).toISOString(), cm, fhr, ctx, 4 - i, 118, 76, 'Midwife Rose Chebet'));
    }
    if (lab) run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      lab.v, ids[2], 36.9, 118, 76, 88, 18, 99, 'Midwife Rose Chebet', daysAgo(0, 7));
    admit(ids[9], 'Uncontrolled hypertension - observation', 'General', 50);
  }

  // Referral history
  run('INSERT INTO referrals(patient_id,visit_id,direction,facility,reason,summary,urgency,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ids[9], null, 'out', 'Kenyatta National Hospital', 'Specialist review - diabetic nephropathy screening',
    'Known HTN + T2DM. BP 144/90, RBS 9.6, creatinine rising. On losartan and metformin.', 'routine', 'sent', 'Dr. Peter Maina', daysAgo(30));

  // Appointments, including web bookings
  run('INSERT INTO appointments(patient_id,name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ids[0], 'Wanjiku Kamau', '0712345678', 'Hypertension review', addDays(now(), 0), '11:00', 'desk', 'booked', '', daysAgo(14));
  run('INSERT INTO appointments(patient_id,name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    null, 'Daniel Kiptoo', '0798765432', cfg.maternity ? 'Antenatal clinic visit' : 'Blood sugar test', addDays(now(), 1), '09:30', 'web', 'booked', 'Booked via website', daysAgo(1));
  run('INSERT INTO web_orders(name,phone,items,total,delivery,prescription_note,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
    'Esther Muthoni', '0711222333', JSON.stringify([{ id: item('VITC').id, name: item('VITC').name, qty: 30, price: item('VITC').price }, { id: item('ORS').id, name: item('ORS').name, qty: 5, price: item('ORS').price }]),
    30 * item('VITC').price + 5 * item('ORS').price, 'pickup', '', 'new', daysAgo(0, 7));
}

function ensureSeeded() {
  if (!getConfig()) return false;
  return true;
}

module.exports = {
  get db() { return db; }, all, get, run, tx, now, getConfig, setConfig, resetAndSeed, ensureSeeded,
  PRESETS, nextMrn, addDays, dateOnly
};
