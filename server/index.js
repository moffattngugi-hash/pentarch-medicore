// Pentarch MediCore - local server (offline-first, multi-branch)
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const D = require('./db');
const { R, all, get, run, tx, now, getConfig } = D;

const app = express();
app.use(express.json({ limit: '8mb' }));
const PORT = process.env.PORT || 4000;
const today = () => new Date().toISOString().slice(0, 10);
const cfg = () => getConfig() || {};
const pad = (n, w = 6) => String(n).padStart(w, '0');
const userOf = req => req.user?.name || 'system';
const wrap = fn => (req, res) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); }
  catch (e) { if (!e.status) console.error(e); res.status(e.status || 400).json({ error: e.message }); }
};
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
function audit(req, action, entity, id) {
  run('INSERT INTO audit(user,action,entity,entity_id,created_at) VALUES(?,?,?,?,?)', userOf(req), action, entity, id, now());
}
const PHONE = /^(\+?254|0)?[17]\d{8}$/;

// ================= authentication and branch selection =================
const OPEN = ['/api/health', '/api/bootstrap', '/api/login', '/api/login-users'];
const NO_BRANCH = ['/api/onboard', '/api/me', '/api/me/pin', '/api/logout'];
app.use('/api', (req, res, next) => {
  const full = '/api' + req.path;
  if (OPEN.includes(full) || full.startsWith('/api/public')) return next();
  const token = req.get('x-token');
  const s = token && R.get('SELECT * FROM sessions WHERE token=?', token);
  const u = s && R.get('SELECT * FROM users WHERE id=? AND active=1', s.user_id);
  if (!u) {
    if (full === '/api/onboard' && !R.get('SELECT id FROM orgs LIMIT 1')) return next(); // very first facility
    return res.status(401).json({ error: 'Please sign in again' });
  }
  req.user = u;
  const wanted = Number(req.get('x-branch')) || null;
  let b = wanted ? R.get('SELECT * FROM branches WHERE id=?', wanted) : null;
  if (b && u.role !== 'superadmin' && (b.org_id !== u.org_id || (u.branch_id && u.branch_id !== b.id))) b = null;
  if (!b && u.role !== 'superadmin') b = R.get('SELECT * FROM branches WHERE ' + (u.branch_id ? 'id=?' : 'org_id=? ORDER BY id'), u.branch_id || u.org_id);
  if (b) { req.branch = b; D.use(b.id); }
  if (!b && !(full.startsWith('/api/org') || full.startsWith('/api/admin') || NO_BRANCH.includes(full))) return res.status(400).json({ error: 'Choose a facility first' });
  next();
});
const adminOnly = (req, res, next) => ['admin', 'superadmin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Only an administrator can do this' });
const superOnly = (req, res, next) => req.user.role === 'superadmin' ? next() : res.status(403).json({ error: 'Pentarch super admin only' });

function profile(u) {
  const branches = u.role === 'superadmin' ? R.all('SELECT * FROM branches ORDER BY org_id, id')
    : u.branch_id ? R.all('SELECT * FROM branches WHERE id=?', u.branch_id) : R.all('SELECT * FROM branches WHERE org_id=? ORDER BY id', u.org_id);
  return { user: { id: u.id, name: u.name, username: u.username, role: u.role, org_id: u.org_id, branch_id: u.branch_id },
    org: u.org_id ? R.get('SELECT * FROM orgs WHERE id=?', u.org_id) : null, branches };
}
function sessionFor(u) {
  const token = crypto.randomBytes(24).toString('hex');
  R.run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', token, u.id, now());
  return { token, ...profile(u) };
}
const slug = s => (s || 'facility').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')[0].slice(0, 12) || 'facility';
function uniqueUsername(base) { let u = base, i = 2; while (R.get('SELECT id FROM users WHERE username=?', u)) u = base + i++; return u; }

const VERSION = require('../package.json').version;
app.get('/api/health', (req, res) => res.json({ ok: true, time: now(), version: VERSION }));
app.get('/api/bootstrap', wrap(() => ({
  hasOrgs: !!R.get('SELECT id FROM orgs LIMIT 1'),
  types: Object.fromEntries(Object.entries(D.TYPES).map(([k, v]) => [k, { label: v.label, sample: v.sample, defaults: v.defaults }])),
  lan: lanAddresses(), version: VERSION,
})));
app.get('/api/login-users', wrap(() => {
  const orgs = R.all('SELECT * FROM orgs');
  if (orgs.length !== 1) return { org: null, users: [] };
  return { org: orgs[0], users: R.all("SELECT id,name,username,role FROM users WHERE org_id=? AND active=1 ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, id", orgs[0].id) };
}));
app.post('/api/login', wrap(req => {
  const u = R.get('SELECT * FROM users WHERE username=? AND active=1', String(req.body.username || '').trim().toLowerCase());
  if (!u || u.pin_hash !== D.hashPin(String(req.body.pin || ''))) fail('Wrong username or PIN', 401);
  return sessionFor(u);
}));
app.post('/api/logout', wrap(req => { R.run('DELETE FROM sessions WHERE token=?', req.get('x-token')); return { ok: true }; }));
app.get('/api/me', wrap(req => profile(req.user)));
app.post('/api/me/pin', wrap(req => {
  const { old_pin, new_pin } = req.body;
  if (req.user.pin_hash !== D.hashPin(String(old_pin))) fail('Current PIN is wrong');
  if (!/^\d{4,8}$/.test(String(new_pin))) fail('PIN must be 4 to 8 digits');
  R.run('UPDATE users SET pin_hash=? WHERE id=?', D.hashPin(String(new_pin)), req.user.id);
  return { ok: true };
}));

// ---------- onboarding: new organisation and its first branch ----------
const SAMPLE_STAFF = [
  ['Mary Wairimu', 'reception', 'reception'], ['Nurse Jane Akinyi', 'nurse', 'nurse'], ['Dr. Peter Maina', 'doctor', 'clinician'],
  ['Lab Tech Samuel Kibet', 'lab', 'lab'], ['Pharm. Lucy Njeri', 'pharmacist', 'pharmacist'], ['Cashier Tom Odhiambo', 'cashier', 'cashier'],
];
function createBranch(orgId, b, sample) {
  const t = D.TYPES[b.type] || D.TYPES.pharmacy;
  const c = { ...t.defaults, ...(b.options || {}), facility_name: b.name, phone: b.phone, email: b.email, location: b.location, currency: 'KES', created_at: now() };
  const id = R.run('INSERT INTO branches(org_id,name,type,db_file,sample,created_at) VALUES(?,?,?,?,?,?)', orgId, b.name, c.type, '', sample ? 1 : 0, now()).lastInsertRowid;
  D.createBranchDb(id, c, sample);
  return id;
}
app.post('/api/onboard', wrap(req => {
  const b = req.body;
  if (!b.facility_name?.trim() || !b.owner_name?.trim() || !b.phone) fail('Facility name, your name and phone are required');
  if (!PHONE.test(String(b.phone).replace(/\s/g, ''))) fail('Enter a valid Kenyan phone number, e.g. 0712 345 678');
  if (!/^\d{4,8}$/.test(String(b.admin_pin || ''))) fail('Choose a PIN of 4 to 8 digits');
  if (!D.TYPES[b.type]) fail('Choose the type of facility');
  const orgId = R.run('INSERT INTO orgs(name,owner_name,phone,email,location,created_at) VALUES(?,?,?,?,?,?)',
    b.org_name || b.facility_name, b.owner_name, b.phone, b.email, b.location, now()).lastInsertRowid;
  const branchId = createBranch(orgId, { name: b.facility_name.trim(), type: b.type, phone: b.phone, email: b.email, location: b.location, options: b.options }, !!b.sample);
  const base = slug(b.facility_name);
  const adminUser = uniqueUsername(String(b.admin_username || base).trim().toLowerCase().replace(/\s+/g, ''));
  const adminId = R.run('INSERT INTO users(org_id,branch_id,name,username,pin_hash,role,created_at) VALUES(?,NULL,?,?,?,?,?)',
    orgId, b.owner_name.trim(), adminUser, D.hashPin(String(b.admin_pin)), 'admin', now()).lastInsertRowid;
  if (b.sample) {
    const staff = [...SAMPLE_STAFF];
    if (b.type !== 'pharmacy' && (b.options?.maternity ?? D.TYPES[b.type].defaults.maternity)) staff.push(['Midwife Rose Chebet', 'midwife', 'nurse']);
    for (const [n, r, role] of staff) {
      if (b.type === 'pharmacy' && r === 'nurse') continue;
      R.run('INSERT INTO users(org_id,branch_id,name,username,pin_hash,role,created_at) VALUES(?,NULL,?,?,?,?,?)', orgId, n, uniqueUsername(`${base}.${r}`), D.hashPin('1234'), role, now());
    }
  }
  if (req.user?.role === 'superadmin') return { ok: true, org_id: orgId, branch_id: branchId, admin_username: adminUser };
  return { ...sessionFor(R.get('SELECT * FROM users WHERE id=?', adminId)), branch_id: branchId, admin_username: adminUser };
}));

// ---------- organisation: branches, users, unified overview ----------
app.post('/api/org/branches', adminOnly, wrap(req => {
  const b = req.body;
  const orgId = req.user.role === 'superadmin' ? Number(b.org_id) : req.user.org_id;
  const org = R.get('SELECT * FROM orgs WHERE id=?', orgId);
  if (!org) fail('Organisation not found');
  if (!b.name?.trim()) fail('Branch name is required');
  if (!D.TYPES[b.type]) fail('Choose the type of facility');
  const id = createBranch(orgId, { name: b.name.trim(), type: b.type, phone: b.phone || org.phone, email: org.email, location: b.location || org.location, options: b.options }, !!b.sample);
  return { id, ...profile(req.user) };
}));
const orgOf = req => req.user.role === 'superadmin' ? (Number(req.query.org) || req.branch?.org_id) : req.user.org_id;
app.get('/api/org/users', adminOnly, wrap(req => R.all('SELECT id,name,username,role,branch_id,active FROM users WHERE org_id=? ORDER BY id', orgOf(req))));
app.post('/api/org/users', adminOnly, wrap(req => {
  const b = req.body;
  const username = String(b.username || '').toLowerCase().trim().replace(/\s+/g, '');
  if (!b.name || !username || !/^\d{4,8}$/.test(String(b.pin || ''))) fail('Name, username and a 4–8 digit PIN are required');
  if (R.get('SELECT id FROM users WHERE username=?', username)) fail('That username is taken');
  R.run('INSERT INTO users(org_id,branch_id,name,username,pin_hash,role,created_at) VALUES(?,?,?,?,?,?,?)', orgOf(req), b.branch_id || null, b.name, username, D.hashPin(String(b.pin)), b.role || 'reception', now());
  return { ok: true };
}));
app.put('/api/org/users/:id', adminOnly, wrap(req => {
  const b = req.body;
  const u = R.get('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u || (req.user.role !== 'superadmin' && u.org_id !== req.user.org_id)) fail('User not found', 404);
  if (u.id === req.user.id && b.active === 0) fail('You cannot deactivate yourself');
  R.run('UPDATE users SET name=?, role=?, branch_id=?, active=? WHERE id=?', b.name ?? u.name, b.role ?? u.role, b.branch_id === undefined ? u.branch_id : b.branch_id || null, b.active ?? u.active, u.id);
  if (b.pin) { if (!/^\d{4,8}$/.test(String(b.pin))) fail('PIN must be 4 to 8 digits'); R.run('UPDATE users SET pin_hash=? WHERE id=?', D.hashPin(String(b.pin)), u.id); }
  return { ok: true };
}));

function branchStats(b) {
  D.use(b.id);
  const c = getConfig() || {};
  const t = today();
  const rev = d => get('SELECT COALESCE(SUM(amount),0) a FROM payments WHERE substr(created_at,1,10)=?', d).a;
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = D.addDays(now(), -i); days.push({ date: d, amount: rev(d) }); }
  const items = itemsWithStock();
  return {
    id: b.id, org_id: b.org_id, name: b.name, type: c.type, color: c.color, sample: b.sample, location: c.location, created_at: b.created_at,
    revenueToday: rev(t), revenue7: days.reduce((a, x) => a + x.amount, 0),
    revenue30: get('SELECT COALESCE(SUM(amount),0) a FROM payments WHERE created_at>=?', D.addDays(now(), -29)).a,
    days, patients: get('SELECT COUNT(*) c FROM patients').c,
    visitsToday: get('SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?', t).c,
    inQueue: get("SELECT COUNT(*) c FROM visits WHERE status NOT IN ('closed','admitted') AND type!='IPD'").c,
    lowStock: items.filter(i => i.stock <= i.reorder_level && i.category !== 'reagent').length,
    stockValue: items.reduce((a, i) => a + i.stock * (i.cost || 0), 0),
    openBalance: all("SELECT id FROM bills WHERE status IN ('open','credit')").reduce((a, x) => a + billTotals(x.id).balance, 0),
    beds: c.admissions ? { total: get('SELECT COUNT(*) c FROM beds').c, occupied: get("SELECT COUNT(*) c FROM admissions WHERE status='admitted'").c } : null,
  };
}
app.get('/api/org/overview', wrap(req => {
  const orgId = orgOf(req);
  const list = req.user.branch_id ? R.all('SELECT * FROM branches WHERE id=?', req.user.branch_id) : R.all('SELECT * FROM branches WHERE org_id=? ORDER BY id', orgId);
  const stats = list.map(branchStats);
  if (req.branch) D.use(req.branch.id);
  return { org: R.get('SELECT * FROM orgs WHERE id=?', orgId), branches: stats };
}));
app.get('/api/admin/orgs', superOnly, wrap(req => {
  const orgs = R.all('SELECT * FROM orgs ORDER BY id DESC');
  for (const o of orgs) {
    o.branches = R.all('SELECT * FROM branches WHERE org_id=? ORDER BY id', o.id).map(branchStats);
    o.users = R.get('SELECT COUNT(*) c FROM users WHERE org_id=?', o.id).c;
    o.admin = R.get("SELECT username FROM users WHERE org_id=? AND role='admin' ORDER BY id LIMIT 1", o.id)?.username;
  }
  if (req.branch) D.use(req.branch.id);
  return orgs;
}));
app.delete('/api/admin/orgs/:id', superOnly, wrap(req => {
  const id = Number(req.params.id);
  R.run('DELETE FROM branches WHERE org_id=?', id);
  R.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id=?)', id);
  R.run('DELETE FROM users WHERE org_id=?', id);
  R.run('DELETE FROM orgs WHERE id=?', id);
  return { ok: true };
}));

// ================= billing core =================
function billForVisit(visitId) {
  let b = get("SELECT * FROM bills WHERE visit_id=? AND status='open' ORDER BY id DESC LIMIT 1", visitId);
  if (!b) {
    const v = get('SELECT * FROM visits WHERE id=?', visitId);
    const id = run('INSERT INTO bills(visit_id,patient_id,payer,status,created_at) VALUES(?,?,?,?,?)', visitId, v.patient_id, 'cash', 'open', now()).lastInsertRowid;
    b = get('SELECT * FROM bills WHERE id=?', id);
  }
  return b;
}
function addLine(billId, description, kind, refTable, refId, qty, unitPrice, user) {
  run('INSERT INTO bill_lines(bill_id,description,kind,ref_table,ref_id,qty,unit_price,amount,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    billId, description, kind, refTable, refId, qty, unitPrice, Math.round(qty * unitPrice * 100) / 100, user, now());
  if (refTable && refId && ['lab_orders', 'imaging_orders', 'prescriptions', 'procedures'].includes(refTable)) run(`UPDATE ${refTable} SET billed=1 WHERE id=?`, refId);
}
// automatic mode posts the charge immediately; manual mode leaves it for the cashier
function charge(visitId, description, kind, refTable, refId, qty, unitPrice, user, force = false) {
  if (cfg().billing_mode !== 'auto' && !force) return false;
  addLine(billForVisit(visitId).id, description, kind, refTable, refId, qty, unitPrice, user);
  return true;
}
function billTotals(billId) {
  const total = get('SELECT COALESCE(SUM(amount),0) t FROM bill_lines WHERE bill_id=?', billId).t;
  const paid = get('SELECT COALESCE(SUM(amount),0) t FROM payments WHERE bill_id=?', billId).t;
  return { total, paid, balance: Math.round((total - paid) * 100) / 100 };
}
const consultationService = () => get('SELECT * FROM services WHERE code=?', cfg().type === 'pharmacy' ? 'PCONS' : 'CONS');
function unbilledFor(visitId) {
  if (!visitId) return [];
  const out = [];
  for (const r of all(`SELECT lo.id, t.name, t.price FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.visit_id=? AND lo.billed=0 AND lo.mode='inhouse'`, visitId))
    out.push({ description: r.name, kind: 'lab', ref_table: 'lab_orders', ref_id: r.id, qty: 1, unit_price: r.price });
  for (const r of all(`SELECT io.id, s.name, s.price FROM imaging_orders io JOIN imaging_studies s ON s.id=io.study_id WHERE io.visit_id=? AND io.billed=0 AND io.mode='inhouse'`, visitId))
    out.push({ description: r.name, kind: 'imaging', ref_table: 'imaging_orders', ref_id: r.id, qty: 1, unit_price: r.price });
  for (const r of all(`SELECT p.id, i.name, i.price, p.qty FROM prescriptions p JOIN items i ON i.id=p.item_id WHERE p.visit_id=? AND p.billed=0 AND p.status='dispensed'`, visitId))
    out.push({ description: r.name, kind: 'drug', ref_table: 'prescriptions', ref_id: r.id, qty: r.qty, unit_price: r.price });
  for (const r of all(`SELECT p.id, s.name, s.price FROM procedures p JOIN services s ON s.id=p.service_id WHERE p.visit_id=? AND p.billed=0`, visitId))
    out.push({ description: r.name, kind: 'procedure', ref_table: 'procedures', ref_id: r.id, qty: 1, unit_price: r.price });
  const hasNote = get('SELECT id FROM notes WHERE visit_id=? LIMIT 1', visitId);
  const bill = get('SELECT id FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1', visitId);
  const consBilled = bill && get("SELECT id FROM bill_lines WHERE bill_id=? AND kind='consultation'", bill.id);
  const s = consultationService();
  if (hasNote && !consBilled && s && s.price > 0) out.push({ description: s.name, kind: 'consultation', ref_table: 'services', ref_id: s.id, qty: 1, unit_price: s.price });
  return out;
}
function closeBillIfSettled(billId) {
  const b = get('SELECT * FROM bills WHERE id=?', billId);
  const t = billTotals(billId);
  if (t.total > 0 && t.balance <= 0 && b.status === 'open') {
    run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'RCT' + pad(billId), now(), billId);
    if (b.visit_id) {
      const v = get('SELECT * FROM visits WHERE id=?', b.visit_id);
      if (v && v.status !== 'admitted' && (cfg().auto_checkout || v.status === 'billing')) run("UPDATE visits SET status='closed', closed_at=? WHERE id=?", now(), b.visit_id);
    }
    return true;
  }
  return false;
}

// ================= stock core: base units; a pack holds pack_size units =================
const stockOf = itemId => get('SELECT COALESCE(SUM(qty),0) q FROM batches WHERE item_id=? AND expiry>=?', itemId, today()).q;
const plural = (w, n) => n === 1 ? w : /(x|s|ch|sh)$/.test(w) ? w + 'es' : w + 's';
function fmtQty(it, q) {
  q = Math.round(q);
  if (!it.pack_size || it.pack_size <= 1) return `${q} ${plural(it.unit, q)}`;
  const p = Math.floor(q / it.pack_size), l = q % it.pack_size;
  return [p && `${p} ${plural(it.pack_name, p)}`, l && `${l} ${plural(it.unit, l)}`].filter(Boolean).join(' + ') || `0 ${plural(it.unit, 0)}`;
}
// first-expiry-first-out across unexpired batches
function deduct(itemId, qty, type, ref, user) {
  const item = get('SELECT * FROM items WHERE id=?', itemId);
  const have = stockOf(itemId);
  if (have < qty) fail(`Not enough stock for ${item.name}: have ${fmtQty(item, have)}, need ${fmtQty(item, qty)}`);
  let left = qty;
  for (const b of all('SELECT * FROM batches WHERE item_id=? AND qty>0 AND expiry>=? ORDER BY expiry, id', itemId, today())) {
    if (left <= 0) break;
    const take = Math.min(left, b.qty);
    run('UPDATE batches SET qty=qty-? WHERE id=?', take, b.id);
    run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', itemId, b.id, -take, type, ref, user, now());
    left -= take;
  }
}
function itemsWithStock() {
  return all(`SELECT i.*, (SELECT COALESCE(SUM(qty),0) FROM batches b WHERE b.item_id=i.id AND b.expiry>=?) stock,
    (SELECT MIN(expiry) FROM batches b WHERE b.item_id=i.id AND b.qty>0 AND b.expiry>=?) next_expiry,
    (SELECT COALESCE(SUM(qty),0) FROM batches b WHERE b.item_id=i.id AND b.expiry<? AND b.qty>0) expired_qty
    FROM items i WHERE i.active=1 ORDER BY i.name`, today(), today(), today());
}
const withText = i => ({ ...i, stock_text: fmtQty(i, i.stock) });

// ================= labs =================
function flagFor(test, value, text, sex) {
  if (test.kind === 'numeric') {
    const v = Number(value);
    if (Number.isNaN(v)) return null;
    const lo = sex === 'F' && test.ref_low_f != null ? test.ref_low_f : test.ref_low;
    const hi = sex === 'F' && test.ref_high_f != null ? test.ref_high_f : test.ref_high;
    if (test.crit_low != null && v < test.crit_low) return 'LL';
    if (test.crit_high != null && v > test.crit_high) return 'HH';
    if (lo != null && v < lo) return 'L';
    if (hi != null && v > hi) return 'H';
    return 'N';
  }
  if (test.abnormal_text && text && String(text).toLowerCase().startsWith(test.abnormal_text.toLowerCase())) return 'A';
  return 'N';
}
const SEXREF = `CASE WHEN p.sex='F' AND t.ref_low_f IS NOT NULL THEN t.ref_low_f ELSE t.ref_low END ref_low,
  CASE WHEN p.sex='F' AND t.ref_high_f IS NOT NULL THEN t.ref_high_f ELSE t.ref_high END ref_high`;

// ================= config =================
app.get('/api/config', wrap(req => ({ config: getConfig(), branch: req.branch, types: D.TYPES, lan: lanAddresses() })));
app.put('/api/config', adminOnly, wrap(req => {
  const { user, reload, ...body } = req.body;
  const old = cfg();
  const c = { ...old, ...body };
  if (!c.facility_name?.trim()) fail('Facility name is required');
  if (body.type && body.type !== old.type) {
    // switching type keeps all patients, stock and history; only switches modules on or off
    const t = D.TYPES[body.type];
    for (const k of ['admissions', 'maternity', 'theatre', 'lab', 'imaging']) if (body[k] === undefined) c[k] = t.defaults[k];
    if (c.admissions && !c.beds) c.beds = t.defaults.beds || 20;
  }
  D.setConfig(c);
  D.ensureStructure(c);
  audit(req, 'update', 'settings', 0);
  return { config: c };
}));
app.post('/api/branch/clear-sample', adminOnly, wrap(req => {
  if (req.body.confirm !== 'DELETE') fail('Type DELETE to confirm');
  D.clearSample({ zeroStock: req.body.zero_stock !== false });
  audit(req, 'clear-sample-data', 'branch', req.branch.id);
  return { ok: true };
}));

// ---------- dashboard ----------
const PRIORITY = "CASE v.triage_level WHEN 'emergency' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END";
app.get('/api/dashboard', wrap(() => {
  const t = today();
  const c = cfg();
  const queue = all(`SELECT v.*, p.first_name||' '||p.last_name name, p.mrn, p.sex, p.dob FROM visits v JOIN patients p ON p.id=v.patient_id
    WHERE v.status NOT IN ('closed','admitted') AND v.type!='IPD' ORDER BY ${PRIORITY}, v.created_at`);
  const pay = all('SELECT method, SUM(amount) amt FROM payments WHERE substr(created_at,1,10)=? GROUP BY method', t);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = D.addDays(now(), -i); days.push({ date: d, amount: get('SELECT COALESCE(SUM(amount),0) a FROM payments WHERE substr(created_at,1,10)=?', d).a }); }
  const items = itemsWithStock();
  const low = items.filter(i => i.stock <= i.reorder_level && i.category !== 'reagent').map(withText);
  const openBills = all("SELECT id FROM bills WHERE status='open'").map(b => billTotals(b.id));
  return {
    queue, revenueToday: pay.reduce((a, r) => a + r.amt, 0), payToday: pay, days,
    visitsToday: get('SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?', t).c,
    totalPatients: get('SELECT COUNT(*) c FROM patients').c,
    lowStock: low.slice(0, 8), lowStockCount: low.length,
    expiring: all('SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry<=? ORDER BY b.expiry LIMIT 8', D.addDays(now(), 90)),
    critical: all(`SELECT lo.*, t.name test, t.unit, p.first_name||' '||p.last_name name, p.id pid FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id
      JOIN patients p ON p.id=lo.patient_id WHERE lo.flag IN ('LL','HH','A','H','L') AND lo.resulted_at>=? ORDER BY lo.resulted_at DESC LIMIT 8`, D.addDays(now(), -3)),
    pendingLab: get("SELECT COUNT(*) c FROM lab_orders WHERE status IN ('ordered','collected')").c,
    openBills: openBills.filter(b => b.total > 0).length, openBalance: openBills.reduce((a, b) => a + b.balance, 0),
    topDx: all('SELECT diagnosis, COUNT(*) n FROM notes WHERE created_at>=? AND diagnosis IS NOT NULL GROUP BY diagnosis ORDER BY n DESC LIMIT 6', D.addDays(now(), -60)),
    beds: c.admissions ? { total: get('SELECT COUNT(*) c FROM beds').c, occupied: get("SELECT COUNT(*) c FROM admissions WHERE status='admitted'").c } : null,
    appointmentsToday: all("SELECT * FROM appointments WHERE date=? AND status='booked' ORDER BY time", t),
    webOrders: get("SELECT COUNT(*) c FROM web_orders WHERE status IN ('new','awaiting_review','confirmed')").c,
    webBookings: get("SELECT COUNT(*) c FROM appointments WHERE source='web' AND status='booked'").c,
    deliveriesMonth: c.maternity ? get('SELECT COUNT(*) c FROM deliveries WHERE delivered_at>=?', D.addDays(now(), -30)).c : null,
    activePregnancies: c.maternity ? get("SELECT COUNT(*) c FROM pregnancies WHERE status='active'").c : null,
    sample: !!get('SELECT id FROM patients WHERE sample=1 LIMIT 1'),
  };
}));

// Drill-down behind each dashboard card
const who = "COALESCE(p.first_name||' '||p.last_name, b.customer_name, 'Walk-in customer')";
app.get('/api/dashboard/detail/:k', wrap(req => {
  const t = today(), k = req.params.k;
  if (k === 'revenue') {
    const day = d => get('SELECT COALESCE(SUM(amount),0) a FROM payments WHERE substr(created_at,1,10)=?', d).a;
    const week = []; for (let i = 1; i <= 7; i++) week.push(day(D.addDays(now(), -i)));
    return {
      payments: all(`SELECT pm.*, ${who} who, b.receipt_no FROM payments pm LEFT JOIN bills b ON b.id=pm.bill_id LEFT JOIN patients p ON p.id=b.patient_id
        WHERE substr(pm.created_at,1,10)=? ORDER BY pm.created_at DESC`, t),
      byMethod: all('SELECT method, COUNT(*) n, SUM(amount) amt FROM payments WHERE substr(created_at,1,10)=? GROUP BY method ORDER BY amt DESC', t),
      byKind: all("SELECT COALESCE(kind,'other') kind, SUM(amount) amt FROM bill_lines WHERE substr(created_at,1,10)=? GROUP BY kind ORDER BY amt DESC", t),
      yesterday: week[0], avg7: Math.round(week.reduce((a, b) => a + b, 0) / 7), today: day(t),
    };
  }
  if (k === 'queue') {
    const rows = all(`SELECT v.*, p.first_name||' '||p.last_name name, p.mrn, p.sex, p.dob FROM visits v JOIN patients p ON p.id=v.patient_id
      WHERE v.status NOT IN ('closed','admitted') AND v.type!='IPD' ORDER BY ${PRIORITY}, v.created_at`);
    return {
      rows, byStatus: all("SELECT status, COUNT(*) n FROM visits WHERE status NOT IN ('closed','admitted') AND type!='IPD' GROUP BY status"),
      seenToday: get("SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=? AND status='closed'", t).c,
      visitsToday: get('SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?', t).c,
      newToday: get('SELECT COUNT(*) c FROM patients WHERE substr(created_at,1,10)=?', t).c,
    };
  }
  if (k === 'lab') {
    return {
      rows: all(`SELECT lo.*, t.name test, t.dept, t.tat, p.first_name||' '||p.last_name name, p.id pid FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id
        JOIN patients p ON p.id=lo.patient_id WHERE lo.status IN ('ordered','collected','sent_out','resulted') ORDER BY lo.created_at`),
      byDept: all("SELECT t.dept, COUNT(*) n FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.status IN ('ordered','collected','sent_out','resulted') GROUP BY t.dept ORDER BY n DESC"),
      doneToday: get("SELECT COUNT(*) c FROM lab_orders WHERE substr(resulted_at,1,10)=?", t).c,
      abnormalToday: get("SELECT COUNT(*) c FROM lab_orders WHERE substr(resulted_at,1,10)=? AND flag IS NOT NULL AND flag!='N'", t).c,
    };
  }
  if (k === 'beds') {
    return {
      wards: all(`SELECT w.*, (SELECT COUNT(*) FROM beds WHERE ward_id=w.id) total,
        (SELECT COUNT(*) FROM admissions a JOIN beds bd ON bd.id=a.bed_id WHERE bd.ward_id=w.id AND a.status='admitted') occupied FROM wards w`),
      rows: all(`SELECT a.*, p.first_name||' '||p.last_name name, p.id pid, bd.label bed, w.name ward FROM admissions a JOIN patients p ON p.id=a.patient_id
        LEFT JOIN beds bd ON bd.id=a.bed_id LEFT JOIN wards w ON w.id=bd.ward_id WHERE a.status='admitted' ORDER BY a.admitted_at`),
      admittedToday: get('SELECT COUNT(*) c FROM admissions WHERE substr(admitted_at,1,10)=?', t).c,
      dischargedToday: get('SELECT COUNT(*) c FROM admissions WHERE substr(discharged_at,1,10)=?', t).c,
    };
  }
  if (k === 'bills') {
    const rows = all(`SELECT b.*, ${who} who FROM bills b LEFT JOIN patients p ON p.id=b.patient_id WHERE b.status IN ('open','credit') ORDER BY b.created_at`)
      .map(b => ({ ...b, ...billTotals(b.id) })).filter(b => b.balance > 0);
    return { rows, open: rows.filter(b => b.status === 'open'), credit: rows.filter(b => b.status === 'credit') };
  }
  fail('Unknown card');
}));

// ---------- patients ----------
app.get('/api/patients', wrap(req => {
  const q = `%${(req.query.q || '').trim()}%`;
  return all(`SELECT p.*, (SELECT MAX(created_at) FROM visits v WHERE v.patient_id=p.id) last_visit FROM patients p
    WHERE first_name||' '||last_name LIKE ? OR last_name||' '||first_name LIKE ? OR mrn LIKE ? OR phone LIKE ? OR national_id LIKE ? OR sha_number LIKE ?
    ORDER BY last_visit DESC NULLS LAST, p.id DESC LIMIT 300`, q, q, q, q, q, q);
}));
function validatePatient(b) {
  if (!b.first_name?.trim() || !b.last_name?.trim()) fail('First and last name are required');
  if (!b.dob) fail('Date of birth is required (estimate it if unknown)');
  if (new Date(b.dob) > new Date()) fail('Date of birth cannot be in the future');
  if (b.phone && !PHONE.test(b.phone.replace(/\s/g, ''))) fail('Enter a valid Kenyan phone number, e.g. 0712 345 678');
}
app.post('/api/patients', wrap(req => {
  const b = req.body;
  validatePatient(b);
  if (b.phone) {
    const dup = get('SELECT mrn FROM patients WHERE phone=? AND lower(first_name)=lower(?) AND lower(last_name)=lower(?)', b.phone, b.first_name.trim(), b.last_name.trim());
    if (dup) fail(`This patient is already registered as ${dup.mrn}`);
  }
  if (b.national_id && get('SELECT id FROM patients WHERE national_id=?', b.national_id)) fail('A patient with this ID number is already registered. Search for them instead.');
  const id = run(`INSERT INTO patients(mrn,first_name,last_name,sex,dob,phone,national_id,sha_number,county,allergies,chronic,next_of_kin,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, D.nextMrn(), b.first_name.trim(), b.last_name.trim(), b.sex || 'F', b.dob, b.phone, b.national_id, b.sha_number,
    b.county, b.allergies, b.chronic, b.next_of_kin, now()).lastInsertRowid;
  audit(req, 'create', 'patient', id);
  return get('SELECT * FROM patients WHERE id=?', id);
}));
app.put('/api/patients/:id', wrap(req => {
  const b = req.body;
  validatePatient(b);
  run(`UPDATE patients SET first_name=?,last_name=?,sex=?,dob=?,phone=?,national_id=?,sha_number=?,county=?,allergies=?,chronic=?,next_of_kin=? WHERE id=?`,
    b.first_name.trim(), b.last_name.trim(), b.sex, b.dob, b.phone, b.national_id, b.sha_number, b.county, b.allergies, b.chronic, b.next_of_kin, req.params.id);
  audit(req, 'update', 'patient', req.params.id);
  return get('SELECT * FROM patients WHERE id=?', req.params.id);
}));
app.get('/api/patients/:id', wrap(req => {
  const id = req.params.id;
  const p = get('SELECT * FROM patients WHERE id=?', id);
  if (!p) fail('Patient not found', 404);
  audit(req, 'view', 'patient', id);
  const pregnancies = all('SELECT * FROM pregnancies WHERE patient_id=? ORDER BY id DESC', id);
  for (const pr of pregnancies) { pr.anc = all('SELECT * FROM anc_visits WHERE pregnancy_id=? ORDER BY gest_weeks', pr.id); pr.delivery = get('SELECT * FROM deliveries WHERE pregnancy_id=?', pr.id); }
  return {
    patient: p,
    visits: all(`SELECT v.*, (SELECT diagnosis FROM notes n WHERE n.visit_id=v.id ORDER BY id DESC LIMIT 1) diagnosis FROM visits v WHERE patient_id=? ORDER BY created_at DESC`, id),
    vitals: all('SELECT * FROM vitals WHERE patient_id=? ORDER BY created_at', id),
    notes: all('SELECT * FROM notes WHERE patient_id=? ORDER BY created_at DESC', id),
    labs: all(`SELECT lo.*, t.name, t.code, t.dept, t.unit, t.kind, ${SEXREF} FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id JOIN patients p ON p.id=lo.patient_id WHERE lo.patient_id=? ORDER BY lo.created_at`, id),
    imaging: all('SELECT io.*, s.name FROM imaging_orders io JOIN imaging_studies s ON s.id=io.study_id WHERE io.patient_id=? ORDER BY io.created_at DESC', id),
    prescriptions: all('SELECT pr.*, i.name, i.unit, i.form FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.patient_id=? ORDER BY pr.created_at DESC', id),
    procedures: all('SELECT pc.*, s.name FROM procedures pc JOIN services s ON s.id=pc.service_id WHERE pc.patient_id=? ORDER BY pc.created_at DESC', id),
    referrals: all('SELECT * FROM referrals WHERE patient_id=? ORDER BY created_at DESC', id),
    admissions: all('SELECT a.*, b.label bed, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.patient_id=? ORDER BY a.admitted_at DESC', id),
    pregnancies,
    bills: all('SELECT * FROM bills WHERE patient_id=? ORDER BY created_at DESC', id).map(b => ({ ...b, ...billTotals(b.id) })),
  };
}));

// ---------- visits / queue / triage ----------
app.get('/api/visits', wrap(() => all(`SELECT v.*, p.first_name||' '||p.last_name name, p.mrn, p.sex, p.dob, p.allergies,
    (SELECT COUNT(*) FROM lab_orders lo WHERE lo.visit_id=v.id AND lo.status IN ('ordered','collected')) pending_labs,
    (SELECT COUNT(*) FROM prescriptions pr WHERE pr.visit_id=v.id AND pr.status='pending') pending_rx
    FROM visits v JOIN patients p ON p.id=v.patient_id WHERE v.type!='IPD' AND v.status!='admitted' AND (v.status!='closed' OR substr(v.created_at,1,10)=?)
    ORDER BY ${PRIORITY}, v.created_at`, today())));
app.post('/api/visits', wrap(req => {
  const { patient_id, type, complaint } = req.body;
  if (!patient_id) fail('Choose a patient');
  const open = get("SELECT id FROM visits WHERE patient_id=? AND status NOT IN ('closed','admitted') AND type!='IPD'", patient_id);
  if (open && type !== 'IPD') return get('SELECT * FROM visits WHERE id=?', open.id);
  const q = get('SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?', today()).c + 1;
  const start = type === 'IPD' ? 'waiting_doctor' : cfg().consultation === false ? 'pharmacy' : 'waiting_triage';
  const id = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,triage_level,created_at) VALUES(?,?,?,?,?,?,?)', patient_id, type || 'OPD', start, q, complaint, 'queue', now()).lastInsertRowid;
  billForVisit(id);
  audit(req, 'create', 'visit', id);
  return get('SELECT * FROM visits WHERE id=?', id);
}));
app.get('/api/visits/:id', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  if (!v) fail('Visit not found', 404);
  const bill = get('SELECT * FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1', v.id);
  return {
    visit: v, patient: get('SELECT * FROM patients WHERE id=?', v.patient_id),
    vitals: all('SELECT * FROM vitals WHERE visit_id=? ORDER BY created_at DESC', v.id),
    notes: all('SELECT * FROM notes WHERE visit_id=? ORDER BY created_at DESC', v.id),
    labs: all(`SELECT lo.*, t.name, t.code, t.dept, t.unit, t.kind, t.price, ${SEXREF} FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id JOIN patients p ON p.id=lo.patient_id WHERE lo.visit_id=? ORDER BY lo.id`, v.id),
    imaging: all('SELECT io.*, s.name FROM imaging_orders io JOIN imaging_studies s ON s.id=io.study_id WHERE io.visit_id=?', v.id),
    prescriptions: all('SELECT pr.*, i.name, i.unit, i.price, i.form, i.pack_size, i.pack_name FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.visit_id=?', v.id),
    procedures: all('SELECT pc.*, s.name, s.price FROM procedures pc JOIN services s ON s.id=pc.service_id WHERE pc.visit_id=?', v.id),
    referrals: all('SELECT * FROM referrals WHERE visit_id=?', v.id),
    admission: get('SELECT a.*, b.label bed, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.visit_id=?', v.id),
    bill: bill ? { ...bill, ...billTotals(bill.id), lines: all('SELECT * FROM bill_lines WHERE bill_id=? ORDER BY id', bill.id) } : null,
  };
}));
app.put('/api/visits/:id/status', wrap(req => {
  const st = req.body.status;
  if (!['waiting_triage', 'waiting_doctor', 'in_lab', 'pharmacy', 'billing', 'closed'].includes(st)) fail('Unknown status');
  if (st === 'closed') {
    const b = get('SELECT * FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1', req.params.id);
    if (b && billTotals(b.id).balance > 0.01) fail('This visit has an unpaid balance. Check out at the cashier first.');
  }
  run("UPDATE visits SET status=?, closed_at=CASE WHEN ?='closed' THEN ? ELSE closed_at END WHERE id=?", st, st, now(), req.params.id);
  audit(req, 'status:' + st, 'visit', req.params.id);
  return get('SELECT * FROM visits WHERE id=?', req.params.id);
}));
app.post('/api/visits/:id/vitals', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const b = req.body;
  const nums = ['temp', 'sys', 'dia', 'pulse', 'resp', 'spo2', 'weight', 'height', 'glucose', 'muac'];
  const has = k => b[k] !== undefined && b[k] !== '' && b[k] !== null;
  if (!nums.some(has) && !b.triage_level) fail('Enter at least one vital sign');
  const lim = { temp: [30, 44, 'Temperature'], sys: [50, 260, 'Systolic BP'], dia: [30, 160, 'Diastolic BP'], pulse: [20, 250, 'Pulse'], resp: [5, 90, 'Respiratory rate'], spo2: [50, 100, 'SpO2'],
    weight: [0.5, 300, 'Weight'], height: [30, 230, 'Height'], glucose: [0.5, 40, 'Glucose'], muac: [5, 40, 'MUAC'] };
  for (const k of nums) if (has(k) && (Number(b[k]) < lim[k][0] || Number(b[k]) > lim[k][1])) fail(`${lim[k][2]} of ${b[k]} looks wrong. Please check it.`);
  if (has('sys') && has('dia') && Number(b.dia) >= Number(b.sys)) fail('Diastolic BP must be lower than systolic');
  if (nums.some(has)) run(`INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,glucose,muac,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    v.id, v.patient_id, ...nums.map(k => has(k) ? Number(b[k]) : null), userOf(req), now());
  run('UPDATE visits SET triage_level=COALESCE(?,triage_level), pain=COALESCE(?,pain), complaint=COALESCE(?,complaint) WHERE id=?', b.triage_level, has('pain') ? Number(b.pain) : null, b.complaint, v.id);
  if (v.status === 'waiting_triage') run("UPDATE visits SET status='waiting_doctor' WHERE id=?", v.id);
  return { ok: true };
}));
app.post('/api/visits/:id/note', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const b = req.body;
  if (!b.diagnosis && !b.history && !b.plan) fail('Write at least a history, diagnosis or plan');
  const first = !get('SELECT id FROM notes WHERE visit_id=?', v.id);
  run('INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)', v.id, v.patient_id, b.history, b.exam, b.diagnosis, b.dx_code, b.plan, userOf(req), now());
  if (first && v.type !== 'IPD') { const s = consultationService(); if (s && s.price > 0) charge(v.id, s.name, 'consultation', 'services', s.id, 1, s.price, userOf(req)); }
  if (v.status === 'waiting_triage') run("UPDATE visits SET status='waiting_doctor' WHERE id=?", v.id);
  return { ok: true };
}));
app.post('/api/visits/:id/lab-orders', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { test_ids = [], mode = 'inhouse', partner } = req.body;
  if (!test_ids.length) fail('Pick at least one test');
  let anyInhouse = false;
  tx(() => {
    for (const tid of test_ids) {
      const t = get('SELECT * FROM lab_tests WHERE id=?', tid);
      const m = t.outsourced_only || cfg().lab === 'outsourced' ? 'outsourced' : mode;
      if (m === 'inhouse') anyInhouse = true;
      const id = run('INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,partner,status,created_at) VALUES(?,?,?,?,?,?,?)',
        v.id, v.patient_id, tid, m, m === 'outsourced' ? (partner || (cfg().partners || [])[0]) : null, m === 'outsourced' ? 'sent_out' : 'ordered', now()).lastInsertRowid;
      if (m === 'inhouse' && t.price > 0) charge(v.id, t.name, 'lab', 'lab_orders', id, 1, t.price, userOf(req));
    }
    if (anyInhouse && ['waiting_doctor', 'waiting_triage'].includes(v.status)) run("UPDATE visits SET status='in_lab' WHERE id=?", v.id);
  });
  return { ok: true };
}));
app.post('/api/visits/:id/imaging-orders', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { study_id, partner, notes } = req.body;
  if (!study_id) fail('Choose a study');
  const s = get('SELECT * FROM imaging_studies WHERE id=?', study_id);
  const mode = cfg().imaging === 'inhouse' ? 'inhouse' : 'outsourced';
  const id = run('INSERT INTO imaging_orders(visit_id,patient_id,study_id,mode,partner,status,report,created_at) VALUES(?,?,?,?,?,?,?,?)',
    v.id, v.patient_id, study_id, mode, mode === 'outsourced' ? (partner || (cfg().partners || []).slice(-1)[0]) : null, mode === 'outsourced' ? 'sent_out' : 'ordered',
    notes ? 'Clinical notes: ' + notes : null, now()).lastInsertRowid;
  if (mode === 'inhouse') charge(v.id, s.name, 'imaging', 'imaging_orders', id, 1, s.price, userOf(req));
  return { ok: true };
}));
app.post('/api/visits/:id/prescriptions', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const items = (req.body.items || []).filter(r => r.item_id);
  if (!items.length) fail('Add at least one medicine');
  for (const r of items) if (!(Number(r.qty) > 0)) fail('Every medicine needs a quantity');
  tx(() => { for (const r of items) run('INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,prescriber,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', v.id, v.patient_id, r.item_id, r.dose, r.frequency, r.days, Number(r.qty), 'pending', userOf(req), now()); });
  if (v.status !== 'admitted' && !req.body.keep_status) run("UPDATE visits SET status='pharmacy' WHERE id=?", v.id);
  return { ok: true };
}));
app.delete('/api/prescriptions/:id', wrap(req => {
  const p = get('SELECT * FROM prescriptions WHERE id=?', req.params.id);
  if (!p || p.status !== 'pending') fail('Only a pending prescription can be cancelled');
  run('DELETE FROM prescriptions WHERE id=?', p.id);
  return { ok: true };
}));
app.post('/api/visits/:id/procedures', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { service_id, consent, notes, consumables = [] } = req.body;
  if (!service_id) fail('Choose the procedure');
  if (!consent) fail('Consent must be recorded before a procedure');
  const s = get('SELECT * FROM services WHERE id=?', service_id);
  tx(() => {
    const id = run('INSERT INTO procedures(visit_id,patient_id,service_id,consent,notes,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?)', v.id, v.patient_id, service_id, 1, notes, 'done', userOf(req), now()).lastInsertRowid;
    charge(v.id, s.name, 'procedure', 'procedures', id, 1, s.price, userOf(req));
    for (const c of consumables) {
      const it = get('SELECT * FROM items WHERE id=?', c.item_id);
      if (!it || !(Number(c.qty) > 0)) continue;
      deduct(it.id, Number(c.qty), 'procedure', 'PROC-' + id, userOf(req));
      charge(v.id, it.name, 'drug', 'items', it.id, Number(c.qty), it.price, userOf(req), true);
    }
  });
  return { ok: true };
}));
app.post('/api/visits/:id/admit', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { bed_id, reason } = req.body;
  if (!bed_id) fail('Choose a bed');
  if (get("SELECT id FROM admissions WHERE bed_id=? AND status='admitted'", bed_id)) fail('That bed is occupied');
  if (get("SELECT id FROM admissions WHERE patient_id=? AND status='admitted'", v.patient_id)) fail('This patient is already admitted');
  const bed = get('SELECT b.*, w.daily_rate, w.name ward FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=?', bed_id);
  let id;
  tx(() => {
    run("UPDATE visits SET status='admitted', type='IPD' WHERE id=?", v.id);
    id = run('INSERT INTO admissions(patient_id,visit_id,bed_id,reason,status,admitted_at,last_charged) VALUES(?,?,?,?,?,?,?)', v.patient_id, v.id, bed_id, reason, 'admitted', now(), today()).lastInsertRowid;
    const bill = billForVisit(v.id).id;
    addLine(bill, `Bed day - ${bed.ward}`, 'bed', 'admissions', id, 1, bed.daily_rate, userOf(req));
    const fee = get("SELECT * FROM services WHERE code='ADMFEE'");
    if (fee) addLine(bill, fee.name, 'bed', 'services', fee.id, 1, fee.price, userOf(req));
  });
  audit(req, 'admit', 'admission', id);
  return { ok: true, admission_id: id };
}));

// ---------- referrals ----------
app.get('/api/referrals', wrap(() => all("SELECT r.*, p.first_name||' '||p.last_name name, p.mrn FROM referrals r JOIN patients p ON p.id=r.patient_id ORDER BY r.created_at DESC")));
app.post('/api/referrals', wrap(req => {
  const b = req.body;
  if (!b.patient_id || !b.facility || !b.reason) fail('Patient, facility and reason are required');
  const summary = b.summary || (b.visit_id ? autoSummary(b.visit_id) : '');
  const id = run('INSERT INTO referrals(patient_id,visit_id,direction,facility,reason,summary,urgency,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    b.patient_id, b.visit_id, b.direction || 'out', b.facility, b.reason, summary, b.urgency || 'routine', b.direction === 'in' ? 'received' : 'sent', userOf(req), now()).lastInsertRowid;
  if (b.visit_id && b.direction !== 'in' && b.close_visit) run("UPDATE visits SET status='billing' WHERE id=?", b.visit_id);
  return get('SELECT * FROM referrals WHERE id=?', id);
}));
function autoSummary(visitId) {
  const vt = get('SELECT * FROM vitals WHERE visit_id=? ORDER BY id DESC LIMIT 1', visitId);
  const n = get('SELECT * FROM notes WHERE visit_id=? ORDER BY id DESC LIMIT 1', visitId);
  const labs = all(`SELECT t.name, lo.result_value, lo.result_text, t.unit FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.visit_id=? AND lo.status IN ('resulted','validated')`, visitId);
  const rx = all('SELECT i.name, pr.dose, pr.frequency FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.visit_id=?', visitId);
  const parts = [];
  if (n) parts.push(`History: ${n.history || '-'}. Exam: ${n.exam || '-'}. Working diagnosis: ${n.diagnosis || '-'}.`);
  if (vt) parts.push(`Vitals: T ${vt.temp ?? '-'}°C, BP ${vt.sys ?? '-'}/${vt.dia ?? '-'}, P ${vt.pulse ?? '-'}, RR ${vt.resp ?? '-'}, SpO2 ${vt.spo2 ?? '-'}%.`);
  if (labs.length) parts.push('Labs: ' + labs.map(l => `${l.name} ${l.result_value ?? l.result_text ?? ''} ${l.unit || ''}`.trim()).join('; ') + '.');
  if (rx.length) parts.push('Treatment given: ' + rx.map(r => `${r.name} ${r.dose || ''} ${r.frequency || ''}`.trim()).join('; ') + '.');
  return parts.join('\n');
}

// ---------- lab ----------
app.get('/api/lab/tests', wrap(() => all('SELECT * FROM lab_tests WHERE active=1 ORDER BY dept, name')));
app.get('/api/lab/panels', wrap(() => all('SELECT * FROM lab_panels ORDER BY id').map(p => ({ ...p, codes: p.codes.split(',') }))));
app.post('/api/lab/tests', adminOnly, wrap(req => {
  const b = req.body;
  if (!b.name || !b.dept) fail('Name and department are required');
  run('INSERT INTO lab_tests(code,name,dept,unit,kind,ref_low,ref_high,price,sample,outsourced_only,tat) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    b.code || 'T' + Date.now().toString().slice(-5), b.name, b.dept, b.unit, b.kind || 'text', b.ref_low, b.ref_high, Number(b.price) || 0, b.sample, b.outsourced_only ? 1 : 0, b.tat);
  return { ok: true };
}));
app.put('/api/lab/tests/:id', adminOnly, wrap(req => {
  const b = req.body;
  run('UPDATE lab_tests SET price=?, ref_low=?, ref_high=?, outsourced_only=?, tat=? WHERE id=?', Number(b.price) || 0, b.ref_low, b.ref_high, b.outsourced_only ? 1 : 0, b.tat, req.params.id);
  return get('SELECT * FROM lab_tests WHERE id=?', req.params.id);
}));
app.get('/api/lab/orders', wrap(req => {
  const done = req.query.status === 'done';
  return all(`SELECT lo.*, t.name, t.code, t.dept, t.unit, t.kind, t.sample, t.tat, ${SEXREF}, p.first_name||' '||p.last_name pname, p.mrn, p.sex, p.dob
    FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id JOIN patients p ON p.id=lo.patient_id
    WHERE lo.status IN ${done ? "('resulted','validated') AND lo.resulted_at>=?" : "('ordered','collected','sent_out','resulted') AND 1=?"} ORDER BY lo.created_at DESC LIMIT 300`, done ? D.addDays(now(), -14) : 1);
}));
app.post('/api/lab/orders/:id/collect', wrap(req => { run("UPDATE lab_orders SET status='collected' WHERE id=? AND status='ordered'", req.params.id); return { ok: true }; }));
app.post('/api/lab/orders/:id/result', wrap(req => {
  const lo = get('SELECT * FROM lab_orders WHERE id=?', req.params.id);
  const t = get('SELECT * FROM lab_tests WHERE id=?', lo.test_id);
  const p = get('SELECT sex FROM patients WHERE id=?', lo.patient_id);
  const { value, text, comment } = req.body;
  if (t.kind === 'numeric' ? (value === '' || value === undefined || Number.isNaN(Number(value))) : !text) fail('Enter the result');
  const flag = flagFor(t, value, text, p.sex);
  run(`UPDATE lab_orders SET result_value=?, result_text=?, flag=?, comment=?, status='resulted', resulted_by=?, resulted_at=? WHERE id=?`,
    t.kind === 'numeric' ? Number(value) : null, t.kind === 'numeric' ? null : text, flag, comment, userOf(req), now(), lo.id);
  const pending = get("SELECT COUNT(*) c FROM lab_orders WHERE visit_id=? AND status IN ('ordered','collected')", lo.visit_id).c;
  const v = get('SELECT * FROM visits WHERE id=?', lo.visit_id);
  if (!pending && v && v.status === 'in_lab') run("UPDATE visits SET status='waiting_doctor' WHERE id=?", v.id);
  return { ok: true, flag };
}));
app.post('/api/lab/orders/:id/validate', wrap(req => {
  const lo = get('SELECT * FROM lab_orders WHERE id=?', req.params.id);
  if (lo.resulted_by === userOf(req) && lo.mode === 'inhouse' && req.user.role !== 'admin') fail('A second person must validate this result');
  run("UPDATE lab_orders SET status='validated', validated_by=? WHERE id=?", userOf(req), req.params.id);
  return { ok: true };
}));

// ---------- imaging ----------
app.get('/api/imaging/studies', wrap(() => all('SELECT * FROM imaging_studies ORDER BY modality, name')));
app.get('/api/imaging/orders', wrap(() => all(`SELECT io.*, s.name, s.modality, p.first_name||' '||p.last_name pname, p.mrn FROM imaging_orders io
  JOIN imaging_studies s ON s.id=io.study_id JOIN patients p ON p.id=io.patient_id ORDER BY io.created_at DESC LIMIT 200`)));
app.post('/api/imaging/orders/:id/report', wrap(req => {
  if (!req.body.report) fail('Write the report');
  run("UPDATE imaging_orders SET report=?, status='reported', reported_at=? WHERE id=?", req.body.report, now(), req.params.id);
  return { ok: true };
}));

// ---------- pharmacy and inventory ----------
app.get('/api/items', wrap(() => itemsWithStock().map(withText)));
app.post('/api/items', wrap(req => {
  const b = req.body;
  if (!b.name?.trim()) fail('Item name is required');
  const pack = Math.max(1, Number(b.pack_size) || 1);
  const packPrice = Number(b.pack_price) || 0;
  if (!(packPrice > 0)) fail('Enter the selling price per pack');
  const unitPrice = Number(b.price) || (pack > 1 ? Math.ceil(packPrice / pack * 1.2) : packPrice);
  const id = run(`INSERT INTO items(code,name,generic,form,strength,category,grp,shop_cat,unit,pack_size,pack_name,price,pack_price,cost,reorder_level,rx_only,controlled,web,sell_loose,barcode,description)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, b.code || 'I' + Date.now().toString().slice(-6), b.name.trim(), b.generic, b.form || 'tablet', b.strength, b.category || 'drug',
    b.grp || 'Other', b.shop_cat || 'Prescription medicines', b.unit || 'tab', pack, b.pack_name || (pack > 1 ? 'box' : b.unit || 'pc'), unitPrice, packPrice,
    (Number(b.pack_cost) || packPrice * 0.68) / pack, Number(b.reorder_packs || 2) * pack, !!b.rx_only, !!b.controlled, b.web !== false, b.sell_loose ?? pack > 1, b.barcode, b.description).lastInsertRowid;
  return get('SELECT * FROM items WHERE id=?', id);
}));
app.put('/api/items/:id', wrap(req => {
  const b = req.body;
  const it = get('SELECT * FROM items WHERE id=?', req.params.id);
  run('UPDATE items SET name=?, price=?, pack_price=?, cost=?, reorder_level=?, rx_only=?, controlled=?, web=?, sell_loose=?, shop_cat=?, description=?, barcode=? WHERE id=?',
    b.name ?? it.name, Number(b.price ?? it.price), Number(b.pack_price ?? it.pack_price), Number(b.cost ?? it.cost), Number(b.reorder_level ?? it.reorder_level),
    !!(b.rx_only ?? it.rx_only), !!(b.controlled ?? it.controlled), !!(b.web ?? it.web), !!(b.sell_loose ?? it.sell_loose), b.shop_cat ?? it.shop_cat, b.description ?? it.description, b.barcode ?? it.barcode, it.id);
  return { ok: true };
}));
app.post('/api/items/:id/image', wrap(req => {
  const m = String(req.body.dataUrl || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) fail('Upload a PNG, JPG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3e6) fail('Image is too large (max 3 MB)');
  const name = `b${req.branch.id}-i${req.params.id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(D.UPLOAD_DIR, name), buf);
  run('UPDATE items SET image=? WHERE id=?', '/uploads/' + name, req.params.id);
  return { image: '/uploads/' + name };
}));
app.delete('/api/items/:id/image', wrap(req => { run('UPDATE items SET image=NULL WHERE id=?', req.params.id); return { ok: true }; }));
app.get('/api/items/:id', wrap(req => {
  const item = get('SELECT * FROM items WHERE id=?', req.params.id);
  if (!item) fail('Item not found', 404);
  const s = stockOf(item.id);
  return { item: { ...item, stock: s, stock_text: fmtQty(item, s) },
    batches: all('SELECT * FROM batches WHERE item_id=? ORDER BY expiry', item.id).map(b => ({ ...b, qty_text: fmtQty(item, b.qty) })),
    moves: all('SELECT * FROM stock_moves WHERE item_id=? ORDER BY created_at DESC LIMIT 60', item.id) };
}));
app.get('/api/suppliers', wrap(() => all('SELECT * FROM suppliers ORDER BY name')));
app.post('/api/stock/receive', wrap(req => {
  const b = req.body;
  const it = get('SELECT * FROM items WHERE id=?', b.item_id);
  if (!it) fail('Choose the item');
  const qty = (Number(b.packs) || 0) * it.pack_size + (Number(b.loose) || 0);
  if (!(qty > 0)) fail('Enter how many packs or units you received');
  if (!b.expiry) fail('Expiry date is required');
  if (b.expiry <= today()) fail('That batch has already expired');
  if (b.supplier && !get('SELECT id FROM suppliers WHERE name=?', b.supplier)) run('INSERT INTO suppliers(name) VALUES(?)', b.supplier);
  const unitCost = Number(b.pack_cost) ? Number(b.pack_cost) / it.pack_size : it.cost;
  const id = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
    it.id, b.batch_no || 'B' + Date.now().toString().slice(-6), b.expiry, qty, unitCost, b.supplier, now()).lastInsertRowid;
  run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, id, qty, 'receive', [b.supplier, b.invoice && 'inv ' + b.invoice].filter(Boolean).join(' '), userOf(req), now());
  if (Number(b.pack_cost)) run('UPDATE items SET cost=? WHERE id=?', unitCost, it.id);
  return { ok: true, received: fmtQty(it, qty) };
}));
app.post('/api/stock/adjust', wrap(req => {
  const { batch_id, new_qty, reason } = req.body;
  const b = get('SELECT * FROM batches WHERE id=?', batch_id);
  if (!b) fail('Batch not found');
  if (new_qty === '' || Number(new_qty) < 0 || Number.isNaN(Number(new_qty))) fail('Enter the counted quantity');
  const diff = Number(new_qty) - b.qty;
  run('UPDATE batches SET qty=? WHERE id=?', Number(new_qty), batch_id);
  run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', b.item_id, batch_id, diff, 'adjust', reason || 'Stock take', userOf(req), now());
  return { ok: true };
}));
app.get('/api/pharmacy/queue', wrap(() => {
  const rows = all(`SELECT pr.*, i.name, i.unit, i.price, i.controlled, i.form, i.pack_size, i.pack_name, i.image, i.strength, i.code, p.first_name||' '||p.last_name pname, p.mrn, p.allergies, v.queue_no, v.status vstatus
    FROM prescriptions pr JOIN items i ON i.id=pr.item_id JOIN patients p ON p.id=pr.patient_id JOIN visits v ON v.id=pr.visit_id WHERE pr.status='pending' ORDER BY pr.created_at`);
  const map = {};
  for (const r of rows) {
    r.stock = stockOf(r.item_id); r.stock_text = fmtQty(r, r.stock); r.qty_text = fmtQty(r, r.qty);
    (map[r.visit_id] ||= { visit_id: r.visit_id, pname: r.pname, mrn: r.mrn, allergies: r.allergies, queue_no: r.queue_no, inpatient: r.vstatus === 'admitted', items: [] }).items.push(r);
  }
  return Object.values(map);
}));
app.post('/api/pharmacy/dispense/:visitId', wrap(req => {
  const ids = req.body.prescription_ids || [];
  if (!ids.length) fail('Tick at least one item to dispense');
  tx(() => {
    for (const pid of ids) {
      const pr = get('SELECT pr.*, i.name, i.price FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.id=?', pid);
      if (!pr || pr.status !== 'pending') continue;
      deduct(pr.item_id, pr.qty, 'dispense', 'RX-' + pr.id, userOf(req));
      run("UPDATE prescriptions SET status='dispensed', dispensed_at=? WHERE id=?", now(), pr.id);
      charge(pr.visit_id, pr.name, 'drug', 'prescriptions', pr.id, pr.qty, pr.price, userOf(req));
    }
    const v = get('SELECT * FROM visits WHERE id=?', req.params.visitId);
    const left = get("SELECT COUNT(*) c FROM prescriptions WHERE visit_id=? AND status='pending'", v.id).c;
    if (!left && v.status !== 'admitted') run("UPDATE visits SET status='billing' WHERE id=?", v.id);
  });
  return { ok: true };
}));
app.get('/api/controlled-register', wrap(() => all(`SELECT m.*, i.name, i.unit, b.batch_no FROM stock_moves m JOIN items i ON i.id=m.item_id LEFT JOIN batches b ON b.id=m.batch_id
  WHERE i.controlled=1 ORDER BY m.created_at DESC LIMIT 300`)));

// Sell loose units or whole packs on one bill line
function saleLine(billId, l, req, refPrefix) {
  const it = get('SELECT * FROM items WHERE id=?', l.item_id);
  if (!it) fail('Item not found');
  const qty = Number(l.qty);
  if (!(qty > 0)) fail(`Enter a quantity for ${it.name}`);
  const byPack = l.mode === 'pack' && it.pack_size > 1;
  if (!byPack && it.pack_size > 1 && !it.sell_loose) fail(`${it.name} is sold in whole ${plural(it.pack_name, 2)} only`);
  if (it.rx_only && !l.rx_ref) fail(`${it.name} is prescription-only: record the prescription first`);
  deduct(it.id, byPack ? qty * it.pack_size : qty, 'sale', refPrefix + billId, userOf(req));
  addLine(billId, it.name + (byPack ? ` (${it.pack_name} of ${it.pack_size})` : '') + (l.rx_ref ? ` · Rx: ${l.rx_ref}` : ''), 'drug', 'items', it.id, qty, byPack ? it.pack_price : it.price, userOf(req));
}
app.post('/api/pos/sale', wrap(req => {
  const { customer, patient_id, lines = [], payments = [], payer } = req.body;
  if (!lines.length) fail('Cart is empty');
  let billId;
  tx(() => {
    billId = run('INSERT INTO bills(patient_id,customer_name,payer,status,created_at) VALUES(?,?,?,?,?)', patient_id, customer || 'Walk-in customer', payer || 'cash', 'open', now()).lastInsertRowid;
    for (const l of lines) saleLine(billId, l, req, 'POS-');
    const total = billTotals(billId).total;
    for (const p of payments) run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', billId, p.method, p.method === 'cash' ? Math.min(Number(p.amount), total) : Number(p.amount), p.reference, userOf(req), now());
    const t = billTotals(billId);
    if (t.balance > 0.01) fail(`Payment is short by KES ${t.balance}`);
    run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'POS' + pad(billId), now(), billId);
  });
  return receipt(billId);
}));

// Website orders
app.get('/api/web-orders', wrap(() => all('SELECT * FROM web_orders ORDER BY created_at DESC LIMIT 100').map(o => ({ ...o, items: JSON.parse(o.items) }))));
app.post('/api/web-orders/:id/status', wrap(req => {
  const o = get('SELECT * FROM web_orders WHERE id=?', req.params.id);
  const { status, payment, reference } = req.body;
  if (status === 'fulfilled') {
    tx(() => {
      const billId = run('INSERT INTO bills(customer_name,payer,status,created_at) VALUES(?,?,?,?)', o.name + ' (web order)', 'cash', 'open', now()).lastInsertRowid;
      for (const l of JSON.parse(o.items)) saleLine(billId, { item_id: l.id, qty: l.qty, mode: l.mode || 'unit', rx_ref: l.rx_only ? 'web order, Rx reviewed' : null }, req, 'WEB-');
      const t = billTotals(billId);
      run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', billId, payment || 'mpesa', t.total, reference || 'WEB-' + o.id, userOf(req), now());
      run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'WEB' + pad(billId), now(), billId);
    });
  }
  run('UPDATE web_orders SET status=? WHERE id=?', status, o.id);
  return { ok: true };
}));

// ---------- billing ----------
app.get('/api/bills', wrap(req => {
  const st = req.query.status || 'open';
  const rows = all(`SELECT b.*, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name, p.mrn, v.status visit_status, v.type visit_type, v.queue_no
    FROM bills b LEFT JOIN patients p ON p.id=b.patient_id LEFT JOIN visits v ON v.id=b.visit_id
    WHERE b.status=? ${st === 'paid' ? 'AND b.closed_at>=?' : 'AND 1=?'} ORDER BY b.created_at DESC LIMIT 300`, st, st === 'paid' ? D.addDays(now(), -7) : 1);
  return rows.map(b => ({ ...b, ...billTotals(b.id), unbilled: unbilledFor(b.visit_id).length })).filter(b => st !== 'open' || b.total > 0 || b.unbilled > 0);
}));
app.get('/api/bills/:id', wrap(req => receipt(req.params.id)));
function receipt(id) {
  const b = get(`SELECT b.*, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name, p.mrn, p.sha_number, p.phone FROM bills b LEFT JOIN patients p ON p.id=b.patient_id WHERE b.id=?`, id);
  if (!b) fail('Bill not found', 404);
  return { ...b, ...billTotals(b.id), lines: all('SELECT * FROM bill_lines WHERE bill_id=? ORDER BY id', b.id),
    payments: all('SELECT * FROM payments WHERE bill_id=? ORDER BY id', b.id), suggestions: unbilledFor(b.visit_id),
    visit: b.visit_id ? get('SELECT * FROM visits WHERE id=?', b.visit_id) : null,
    etims: { mode: 'demo', cu_serial: 'KRACU0100DEMO01', invoice_no: b.receipt_no ? b.receipt_no.replace(/\D/g, '') : null } };
}
app.post('/api/bills/:id/lines', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  if (b.status !== 'open') fail('Bill is closed');
  const l = req.body;
  if (l.ref_table === 'items' && l.ref_id) tx(() => saleLine(b.id, { item_id: l.ref_id, qty: l.qty || 1, mode: l.mode, rx_ref: l.rx_ref || (b.visit_id ? 'visit ' + b.visit_id : null) }, req, 'BILL-'));
  else addLine(b.id, l.description, l.kind || 'other', l.ref_table, l.ref_id, Number(l.qty) || 1, Number(l.unit_price) || 0, userOf(req));
  return receipt(b.id);
}));
app.delete('/api/bills/:id/lines/:lineId', wrap(req => {
  const l = get('SELECT * FROM bill_lines WHERE id=? AND bill_id=?', req.params.lineId, req.params.id);
  if (!l) fail('Line not found');
  if (req.user.role !== 'admin' && req.body?.pin !== '1234') fail('Supervisor PIN required to remove a charge', 403);
  tx(() => {
    run('DELETE FROM bill_lines WHERE id=?', l.id);
    if (['lab_orders', 'imaging_orders', 'prescriptions', 'procedures'].includes(l.ref_table)) run(`UPDATE ${l.ref_table} SET billed=0 WHERE id=?`, l.ref_id);
  });
  audit(req, 'remove-line:' + l.description, 'bill', req.params.id);
  return receipt(req.params.id);
}));
app.post('/api/bills/:id/discount', wrap(req => {
  const { amount, reason, pin } = req.body;
  if (req.user.role !== 'admin' && pin !== '1234') fail('Supervisor PIN required for discounts', 403);
  if (!(Number(amount) > 0)) fail('Enter the discount amount');
  if (Number(amount) > billTotals(req.params.id).balance) fail('Discount is more than the balance');
  addLine(req.params.id, 'Discount / waiver' + (reason ? ` - ${reason}` : ''), 'discount', null, null, 1, -Math.abs(Number(amount)), userOf(req));
  closeBillIfSettled(req.params.id);
  return receipt(req.params.id);
}));
app.post('/api/bills/:id/payer', wrap(req => { run('UPDATE bills SET payer=? WHERE id=?', req.body.payer, req.params.id); return receipt(req.params.id); }));
app.post('/api/bills/:id/pay', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  const { method, amount, reference } = req.body;
  if (!(Number(amount) > 0)) fail('Enter an amount');
  const bal = billTotals(b.id).balance;
  if (bal <= 0) fail('Nothing to pay on this bill');
  if (method !== 'cash' && Number(amount) > bal + 0.01) fail(`Amount is more than the balance of KES ${bal}`);
  const take = Math.min(Number(amount), bal); // cash change is handed back
  run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', b.id, method, take, reference, userOf(req), now());
  closeBillIfSettled(b.id);
  return receipt(b.id);
}));
app.post('/api/bills/:id/checkout', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  const t = billTotals(b.id);
  if (t.balance > 0.01 && !req.body.credit) fail(`Balance of KES ${t.balance} is unpaid`);
  if (req.body.credit) run("UPDATE bills SET status='credit', receipt_no=?, closed_at=? WHERE id=?", 'INV' + pad(b.id), now(), b.id);
  else if (b.status === 'open') run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'RCT' + pad(b.id), now(), b.id);
  if (b.visit_id) { const v = get('SELECT * FROM visits WHERE id=?', b.visit_id); if (v.status !== 'admitted') run("UPDATE visits SET status='closed', closed_at=? WHERE id=?", now(), v.id); }
  return receipt(b.id);
}));
app.post('/api/bills/:id/settle-credit', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  const { method, amount, reference } = req.body;
  if (!(Number(amount) > 0)) fail('Enter an amount');
  run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', b.id, method, Math.min(Number(amount), billTotals(b.id).balance), reference, userOf(req), now());
  if (billTotals(b.id).balance <= 0.01) run("UPDATE bills SET status='paid' WHERE id=?", b.id);
  return receipt(b.id);
}));
const servicesFor = c => all('SELECT * FROM services ORDER BY category, name').filter(s => !s.needs || c[s.needs] || (s.needs === 'hospital' && c.type === 'hospital'));
app.get('/api/catalogue', wrap(() => ({
  services: servicesFor(cfg()), tests: all('SELECT * FROM lab_tests WHERE active=1 ORDER BY dept, name'),
  panels: all('SELECT * FROM lab_panels').map(p => ({ ...p, codes: p.codes.split(',') })),
  imaging: all('SELECT * FROM imaging_studies ORDER BY modality, name'), items: itemsWithStock().map(withText),
})));
app.put('/api/services/:id', adminOnly, wrap(req => { run('UPDATE services SET price=? WHERE id=?', Number(req.body.price) || 0, req.params.id); return { ok: true }; }));
app.post('/api/services', adminOnly, wrap(req => {
  if (!req.body.name) fail('Service name is required');
  run('INSERT INTO services(code,name,category,price) VALUES(?,?,?,?)', 'S' + Date.now().toString().slice(-6), req.body.name, req.body.category || 'procedure', Number(req.body.price) || 0);
  return { ok: true };
}));

// M-Pesa STK push (demo simulation; Safaricom Daraja keys plug in here later)
const stk = {};
app.post('/api/mpesa/stk', wrap(req => {
  const { phone, amount } = req.body;
  if (!PHONE.test(String(phone).replace(/\s/g, ''))) fail('Enter a valid Safaricom number, e.g. 0712345678');
  if (!(Number(amount) > 0)) fail('Enter an amount');
  const id = 'ws_CO_' + Date.now();
  stk[id] = { phone, amount, started: Date.now() };
  return { checkout_id: id, message: 'STK push sent (demo). Ask the customer to enter their M-Pesa PIN.' };
}));
app.get('/api/mpesa/stk/:id', wrap(req => {
  const s = stk[req.params.id];
  if (!s) fail('Unknown request', 404);
  if (Date.now() - s.started < 3500) return { status: 'pending' };
  s.receipt ||= 'S' + crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 9);
  return { status: 'success', receipt: s.receipt, amount: s.amount };
}));

// ---------- wards / inpatient ----------
app.get('/api/wards', wrap(() => {
  const wards = all('SELECT * FROM wards ORDER BY id');
  for (const w of wards) w.beds = all(`SELECT b.*, a.id admission_id, a.patient_id, a.reason, a.admitted_at, a.visit_id, p.first_name||' '||p.last_name pname, p.mrn, p.sex, p.dob
      FROM beds b LEFT JOIN admissions a ON a.bed_id=b.id AND a.status='admitted' LEFT JOIN patients p ON p.id=a.patient_id WHERE b.ward_id=? ORDER BY b.label`, w.id);
  return wards;
}));
app.post('/api/wards', adminOnly, wrap(req => {
  const { name, daily_rate, beds } = req.body;
  if (!name || !(Number(beds) > 0)) fail('Ward name and number of beds are required');
  const w = run('INSERT INTO wards(name,daily_rate) VALUES(?,?)', name, Number(daily_rate) || 0).lastInsertRowid;
  const prefix = name.split(' ')[0].slice(0, 3).toUpperCase();
  for (let b = 1; b <= Number(beds); b++) run('INSERT INTO beds(ward_id,label) VALUES(?,?)', w, `${prefix}-${String(b).padStart(2, '0')}`);
  return { ok: true };
}));
app.put('/api/wards/:id', adminOnly, wrap(req => { run('UPDATE wards SET name=?, daily_rate=? WHERE id=?', req.body.name, Number(req.body.daily_rate) || 0, req.params.id); return { ok: true }; }));
app.get('/api/admissions/:id', wrap(req => {
  const a = get('SELECT a.*, b.label bed, w.name ward, w.daily_rate FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.id=?', req.params.id);
  if (!a) fail('Admission not found', 404);
  const bill = get('SELECT id FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1', a.visit_id);
  return { ...a, notes: all('SELECT * FROM nursing_notes WHERE admission_id=? ORDER BY created_at DESC', a.id), bill: bill ? { id: bill.id, ...billTotals(bill.id) } : null,
    vitals: all('SELECT * FROM vitals WHERE visit_id=? ORDER BY created_at DESC LIMIT 6', a.visit_id) };
}));
app.get('/api/admissions/:id/partograph', wrap(req => all('SELECT * FROM partograph WHERE admission_id=? ORDER BY at', req.params.id)));
app.post('/api/admissions/:id/partograph', wrap(req => {
  const b = req.body;
  if (b.dilation === '' || !(Number(b.dilation) >= 0 && Number(b.dilation) <= 10)) fail('Dilation must be between 0 and 10 cm');
  run('INSERT INTO partograph(admission_id,at,dilation,fhr,contractions,descent,sys,dia,by_user) VALUES(?,?,?,?,?,?,?,?,?)', req.params.id, now(), Number(b.dilation), b.fhr, b.contractions, b.descent, b.sys, b.dia, userOf(req));
  return { ok: true };
}));
app.post('/api/admissions/:id/note', wrap(req => {
  if (!req.body.note) fail('Write the note');
  run('INSERT INTO nursing_notes(admission_id,note,by_user,created_at) VALUES(?,?,?,?)', req.params.id, req.body.note, userOf(req), now());
  return { ok: true };
}));
app.post('/api/admissions/:id/transfer', wrap(req => {
  if (!req.body.bed_id) fail('Choose a bed');
  if (get("SELECT id FROM admissions WHERE bed_id=? AND status='admitted'", req.body.bed_id)) fail('That bed is occupied');
  run('UPDATE admissions SET bed_id=? WHERE id=?', req.body.bed_id, req.params.id);
  run('INSERT INTO nursing_notes(admission_id,note,by_user,created_at) VALUES(?,?,?,?)', req.params.id, 'Transferred to bed ' + get('SELECT label FROM beds WHERE id=?', req.body.bed_id).label, userOf(req), now());
  return { ok: true };
}));
function postBedCharges(user) {
  let n = 0;
  for (const a of all("SELECT a.*, w.daily_rate, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.status='admitted'")) {
    let last = a.last_charged || D.dateOnly(a.admitted_at);
    while (last < today()) {
      last = D.addDays(last + 'T12:00:00Z', 1);
      addLine(billForVisit(a.visit_id).id, `Bed day - ${a.ward} (${last})`, 'bed', 'admissions', a.id, 1, a.daily_rate, user);
      n++;
    }
    run('UPDATE admissions SET last_charged=? WHERE id=?', last, a.id);
  }
  return n;
}
app.post('/api/wards/charge', wrap(req => ({ posted: postBedCharges(userOf(req)) })));
app.post('/api/admissions/:id/discharge', wrap(req => {
  const a = get('SELECT * FROM admissions WHERE id=?', req.params.id);
  if (!req.body.summary) fail('Write the discharge summary');
  postBedCharges(userOf(req));
  run("UPDATE admissions SET status='discharged', discharged_at=?, discharge_summary=? WHERE id=?", now(), req.body.summary, a.id);
  run("UPDATE visits SET status='billing' WHERE id=?", a.visit_id);
  return { ok: true, visit_id: a.visit_id };
}));

// ---------- maternity ----------
app.get('/api/maternity', wrap(() => ({
  pregnancies: all(`SELECT pr.*, p.first_name||' '||p.last_name pname, p.mrn, p.dob, p.phone,
    (SELECT COUNT(*) FROM anc_visits a WHERE a.pregnancy_id=pr.id) anc_count, (SELECT MAX(created_at) FROM anc_visits a WHERE a.pregnancy_id=pr.id) last_anc,
    (SELECT id FROM admissions ad WHERE ad.patient_id=pr.patient_id AND ad.status='admitted') admission_id
    FROM pregnancies pr JOIN patients p ON p.id=pr.patient_id WHERE pr.status='active' ORDER BY pr.edd`),
  deliveries: all("SELECT d.*, p.first_name||' '||p.last_name pname, p.mrn FROM deliveries d JOIN patients p ON p.id=d.patient_id ORDER BY d.delivered_at DESC LIMIT 50"),
})));
app.post('/api/pregnancies', wrap(req => {
  const { patient_id, lmp, gravida, parity } = req.body;
  if (!lmp) fail('LMP is required');
  if (new Date(lmp) > new Date() || (Date.now() - new Date(lmp)) / 864e5 > 300) fail('LMP must be within the last 43 weeks');
  if (Number(parity) >= Number(gravida)) fail('Parity must be less than gravida for a current pregnancy');
  if (get("SELECT id FROM pregnancies WHERE patient_id=? AND status='active'", patient_id)) fail('This patient already has an active pregnancy');
  const id = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)', patient_id, lmp, D.addDays(lmp + 'T12:00:00Z', 280), gravida, parity, 'active', now()).lastInsertRowid;
  return get('SELECT * FROM pregnancies WHERE id=?', id);
}));
app.post('/api/pregnancies/:id/anc', wrap(req => {
  const pr = get('SELECT * FROM pregnancies WHERE id=?', req.params.id);
  const b = req.body;
  const weeks = Math.floor((Date.now() - new Date(pr.lmp).getTime()) / (7 * 864e5));
  tx(() => {
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,triage_level,created_at) VALUES(?,?,?,?,?,?,?)', pr.patient_id, 'ANC', 'billing', 0, 'ANC visit', 'queue', now()).lastInsertRowid;
    run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)', pr.id, v, weeks, b.fundal_height, b.fhr, b.presentation, b.notes, now());
    if (b.sys || b.weight) run('INSERT INTO vitals(visit_id,patient_id,sys,dia,weight,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)', v, pr.patient_id, b.sys, b.dia, b.weight, userOf(req), now());
    const s = get("SELECT * FROM services WHERE code='ANC'");
    if (s) addLine(billForVisit(v).id, s.name, 'consultation', 'services', s.id, 1, s.price, userOf(req));
  });
  return { ok: true };
}));
app.post('/api/pregnancies/:id/delivery', wrap(req => {
  const pr = get('SELECT * FROM pregnancies WHERE id=?', req.params.id);
  const b = req.body;
  if (!(Number(b.baby_weight) > 0.3 && Number(b.baby_weight) < 7)) fail('Enter the birth weight in kg, e.g. 3.1');
  const adm = get("SELECT * FROM admissions WHERE patient_id=? AND status='admitted'", pr.patient_id);
  tx(() => {
    run('INSERT INTO deliveries(pregnancy_id,patient_id,admission_id,delivered_at,mode,outcome,baby_sex,baby_weight,apgar1,apgar5,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      pr.id, pr.patient_id, adm?.id, now(), b.mode, b.outcome, b.baby_sex, b.baby_weight, b.apgar1, b.apgar5, b.notes);
    run("UPDATE pregnancies SET status='delivered' WHERE id=?", pr.id);
    const s = get('SELECT * FROM services WHERE code=?', b.mode === 'Caesarean section' ? 'CS' : 'NVD');
    if (s && adm) addLine(billForVisit(adm.visit_id).id, s.name, 'procedure', 'services', s.id, 1, s.price, userOf(req));
  });
  return { ok: true, billed: !!adm };
}));

// ---------- appointments ----------
app.get('/api/appointments', wrap(() => all('SELECT * FROM appointments WHERE date>=? ORDER BY date, time', D.addDays(now(), -1))));
app.post('/api/appointments', wrap(req => {
  const b = req.body;
  if (!b.name || !b.date) fail('Patient and date are required');
  if (b.date < today()) fail('Choose today or a future date');
  const id = run('INSERT INTO appointments(patient_id,name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    b.patient_id, b.name, b.phone, b.service, b.date, b.time, b.source || 'desk', 'booked', b.notes, now()).lastInsertRowid;
  return get('SELECT * FROM appointments WHERE id=?', id);
}));
app.post('/api/appointments/:id/status', wrap(req => { run('UPDATE appointments SET status=?, patient_id=COALESCE(?,patient_id) WHERE id=?', req.body.status, req.body.patient_id, req.params.id); return { ok: true }; }));

// ---------- reports ----------
app.get('/api/reports/summary', wrap(req => {
  const from = req.query.from || D.addDays(now(), -30), to = req.query.to || today();
  const range = [from, to + 'T23:59:59'];
  return {
    from, to,
    byMethod: all('SELECT method, SUM(amount) amount, COUNT(*) n FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC', ...range),
    byKind: all('SELECT kind, SUM(amount) amount FROM bill_lines WHERE created_at BETWEEN ? AND ? GROUP BY kind ORDER BY amount DESC', ...range),
    byDay: all('SELECT substr(created_at,1,10) day, SUM(amount) amount FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY day ORDER BY day', ...range),
    topItems: all("SELECT description, SUM(qty) qty, SUM(amount) amount FROM bill_lines WHERE kind='drug' AND created_at BETWEEN ? AND ? GROUP BY description ORDER BY amount DESC LIMIT 15", ...range),
    byUser: all('SELECT by_user, SUM(amount) amount, COUNT(*) n FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY by_user', ...range),
    visits: get('SELECT COUNT(*) c FROM visits WHERE created_at BETWEEN ? AND ?', ...range).c,
    newPatients: get('SELECT COUNT(*) c FROM patients WHERE created_at BETWEEN ? AND ?', ...range).c,
    labs: all(`SELECT t.name, t.dept, COUNT(*) n, SUM(CASE WHEN lo.mode='outsourced' THEN 1 ELSE 0 END) outsourced,
      ROUND(AVG(CASE WHEN lo.resulted_at IS NOT NULL AND lo.mode='inhouse' THEN (julianday(lo.resulted_at)-julianday(lo.created_at))*24*60 END)) tat_min
      FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.created_at BETWEEN ? AND ? GROUP BY t.name ORDER BY n DESC`, ...range),
    debtors: all("SELECT b.id, b.receipt_no, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name, b.payer, b.created_at FROM bills b LEFT JOIN patients p ON p.id=b.patient_id WHERE b.status='credit'")
      .map(b => ({ ...b, ...billTotals(b.id) })),
  };
}));
app.get('/api/reports/moh705', wrap(req => {
  const month = req.query.month || today().slice(0, 7);
  const rows = all("SELECT n.diagnosis, p.dob, n.created_at FROM notes n JOIN patients p ON p.id=n.patient_id JOIN visits v ON v.id=n.visit_id WHERE substr(n.created_at,1,7)=? AND v.type='OPD'", month);
  const t = {};
  for (const r of rows) {
    const ageY = (new Date(r.created_at) - new Date(r.dob)) / (365.25 * 864e5);
    const k = r.diagnosis || 'Other';
    t[k] ||= { diagnosis: k, under5: 0, over5: 0 };
    ageY < 5 ? t[k].under5++ : t[k].over5++;
  }
  return { month, rows: Object.values(t).sort((a, b) => (b.under5 + b.over5) - (a.under5 + a.over5)) };
}));
app.get('/api/reports/moh711', wrap(req => {
  const month = req.query.month || today().slice(0, 7);
  const anc = all('SELECT a.*, (SELECT MIN(id) FROM anc_visits x WHERE x.pregnancy_id=a.pregnancy_id) first_id FROM anc_visits a WHERE substr(a.created_at,1,7)=?', month);
  const c1 = (sql, ...p) => get(sql, ...p).c;
  return {
    month, anc_first: anc.filter(a => a.id === a.first_id).length, anc_revisit: anc.filter(a => a.id !== a.first_id).length,
    deliveries: c1('SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=?', month),
    live_births: c1("SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=? AND outcome='Live birth'", month),
    low_birth_weight: c1('SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=? AND baby_weight<2.5', month),
    referrals_out: c1("SELECT COUNT(*) c FROM referrals WHERE direction='out' AND substr(created_at,1,7)=?", month),
    referrals_in: c1("SELECT COUNT(*) c FROM referrals WHERE direction='in' AND substr(created_at,1,7)=?", month),
    admissions: c1('SELECT COUNT(*) c FROM admissions WHERE substr(admitted_at,1,7)=?', month),
    discharges: c1('SELECT COUNT(*) c FROM admissions WHERE substr(discharged_at,1,7)=?', month),
    fp: c1("SELECT COUNT(*) c FROM procedures pc JOIN services s ON s.id=pc.service_id WHERE s.code IN ('FPINJ','IMPINS','IUCDINS') AND substr(pc.created_at,1,7)=?", month),
  };
}));
app.get('/api/reports/stock', wrap(() => {
  const items = itemsWithStock().map(i => ({ ...withText(i), value: i.stock * (i.cost || 0), retail: i.stock * i.price }));
  return {
    items, totalValue: items.reduce((a, i) => a + i.value, 0), totalRetail: items.reduce((a, i) => a + i.retail, 0),
    expired: all('SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry<?', today()),
    nearExpiry: all('SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry BETWEEN ? AND ? ORDER BY b.expiry', today(), D.addDays(now(), 90)),
  };
}));
app.get('/api/audit', wrap(() => all('SELECT * FROM audit ORDER BY id DESC LIMIT 300')));

// ---------- public website API (per branch: ?b=<branch id>) ----------
function publicBranch(req) {
  const b = req.query.b ? R.get('SELECT * FROM branches WHERE id=?', Number(req.query.b)) : R.get('SELECT * FROM branches ORDER BY id LIMIT 1');
  if (!b) fail('No facility has been set up yet', 404);
  D.use(b.id);
  return b;
}
const CAT_ORDER = ['consultation', 'procedure', 'bed', 'other'];
app.get('/api/public/site', wrap(req => {
  const b = publicBranch(req);
  const c = cfg();
  return {
    branch_id: b.id, others: R.all('SELECT id,name,type FROM branches WHERE org_id=? AND id!=?', b.org_id, b.id),
    facility: { name: c.facility_name, tagline: c.tagline, phone: c.phone, email: c.email, location: c.location, type: c.type, color: c.color,
      lab: c.lab, imaging: c.imaging, maternity: c.maternity, admissions: c.admissions, procedures: c.procedures, beds: c.beds, shop: c.web_shop !== false },
    services: servicesFor(c).filter(s => s.price > 0).sort((a, x) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(x.category)).map(s => ({ name: s.name, category: s.category, price: s.price })),
    tests: c.lab === 'none' ? [] : all('SELECT name, dept, price, sample, tat FROM lab_tests WHERE price>0 AND active=1 ORDER BY dept, name'),
    imaging: c.imaging === 'none' ? [] : all('SELECT name, modality, price FROM imaging_studies ORDER BY modality, name'),
    products: itemsWithStock().filter(i => i.web && !i.controlled).map(i => ({
      id: i.id, name: i.name, form: i.form, strength: i.strength, unit: i.unit, pack_size: i.pack_size, pack_name: i.pack_name, price: i.pack_price,
      shop_cat: i.shop_cat, rx_only: !!i.rx_only, in_stock: i.stock >= i.pack_size, image: i.image, description: i.description, code: i.code })),
  };
}));
app.post('/api/public/booking', wrap(req => {
  publicBranch(req);
  const b = req.body;
  if (!b.name || !b.phone || !b.date) fail('Name, phone and date are required');
  if (!PHONE.test(String(b.phone).replace(/\s/g, ''))) fail('Enter a valid phone number, e.g. 0712 345 678');
  if (b.date < today()) fail('Choose today or a future date');
  run('INSERT INTO appointments(name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)', b.name, b.phone, b.service, b.date, b.time, 'web', 'booked', b.notes, now());
  return { ok: true, message: `Thank you ${b.name.split(' ')[0]}, your booking for ${b.date} at ${b.time || 'the next free time'} is received. We will confirm by SMS.` };
}));
app.post('/api/public/order', wrap(req => {
  publicBranch(req);
  const b = req.body;
  if (!b.name || !b.phone || !(b.items || []).length) fail('Name, phone and at least one item are required');
  if (!PHONE.test(String(b.phone).replace(/\s/g, ''))) fail('Enter a valid M-Pesa number, e.g. 0712 345 678');
  const items = b.items.map(l => {
    const it = get('SELECT * FROM items WHERE id=? AND web=1', l.id);
    if (!it) fail('An item is no longer available');
    return { id: it.id, name: it.name, qty: Number(l.qty), mode: it.pack_size > 1 ? 'pack' : 'unit', price: it.pack_price, rx_only: !!it.rx_only, unit: it.pack_size > 1 ? it.pack_name : it.unit };
  });
  const total = items.reduce((a, l) => a + l.qty * l.price, 0);
  const hasRx = items.some(l => l.rx_only);
  if (hasRx && !b.prescription_note) fail('Prescription-only items need the prescription details so our pharmacist can review them');
  const id = run('INSERT INTO web_orders(name,phone,items,total,delivery,prescription_note,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
    b.name, b.phone, JSON.stringify(items), total, b.delivery || 'pickup', b.prescription_note, hasRx ? 'awaiting_review' : 'new', now()).lastInsertRowid;
  return { ok: true, order_no: 'WEB-' + id, total, message: hasRx ? 'Order received. A pharmacist will review your prescription and call you before dispensing.' : 'Order received. You will get an M-Pesa prompt once the pharmacy confirms.' };
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

// ---------- static files ----------
const DIST = path.join(__dirname, '..', 'web', 'dist');
app.use('/uploads', express.static(D.UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(DIST));
app.get(['/site', '/site/*'], (req, res) => res.sendFile(path.join(DIST, 'site.html')));
app.get(/^\/(?!api).*/, (req, res) => {
  const f = path.join(DIST, 'index.html');
  if (fs.existsSync(f)) res.sendFile(f); else res.status(503).send('Web app not built yet. Run: npm run build');
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Pentarch MediCore is running');
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  Other devices:  ${a}`);
  console.log(`  Facility site:  http://localhost:${PORT}/site`);
  console.log('  Pentarch super admin: username "pentarch", PIN 2026 (change MEDICORE_SUPER_PIN)\n');
});
