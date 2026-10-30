// Pentarch MediCore - local server (offline-first)
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const D = require('./db');
const { all, get, run, tx, now, getConfig } = D;

const app = express();
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 4000;
const today = () => new Date().toISOString().slice(0, 10);
const cfg = () => getConfig() || {};
const userOf = req => req.get('x-user') || 'system';
const pad = (n, w = 6) => String(n).padStart(w, '0');

function audit(req, action, entity, id) {
  run('INSERT INTO audit(user,action,entity,entity_id,created_at) VALUES(?,?,?,?,?)', userOf(req), action, entity, id, now());
}
const wrap = fn => (req, res) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); }
  catch (e) { console.error(e); res.status(e.status || 400).json({ error: e.message }); }
};
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };

// ---------------- billing core ----------------
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
    billId, description, kind, refTable, refId, qty, unitPrice, qty * unitPrice, user, now());
  if (refTable && refId && ['lab_orders', 'imaging_orders', 'prescriptions', 'procedures'].includes(refTable)) {
    run(`UPDATE ${refTable} SET billed=1 WHERE id=?`, refId);
  }
}
// Automatic mode posts the charge immediately; manual mode leaves it for the cashier
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
  const bill = get("SELECT id FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1", visitId);
  const consBilled = bill && get("SELECT id FROM bill_lines WHERE bill_id=? AND kind='consultation'", bill.id);
  if (hasNote && !consBilled) {
    const s = consultationService();
    if (s) out.push({ description: s.name, kind: 'consultation', ref_table: 'services', ref_id: s.id, qty: 1, unit_price: s.price });
  }
  return out;
}
function consultationService() {
  return cfg().type === 'pharmacy' ? get("SELECT * FROM services WHERE code='PCONS'") || get("SELECT * FROM services WHERE code='CONS'") : get("SELECT * FROM services WHERE code='CONS'");
}
function closeBillIfSettled(billId) {
  const b = get('SELECT * FROM bills WHERE id=?', billId);
  const t = billTotals(billId);
  if (t.total > 0 && t.balance <= 0 && b.status === 'open') {
    run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'RCT' + pad(billId), now(), billId);
    if (b.visit_id) {
      const v = get('SELECT * FROM visits WHERE id=?', b.visit_id);
      if (v && v.status !== 'admitted' && (cfg().auto_checkout || v.status === 'billing')) {
        run("UPDATE visits SET status='closed', closed_at=? WHERE id=?", now(), b.visit_id);
      }
    }
    return true;
  }
  return false;
}

// ---------------- stock core ----------------
function stockOf(itemId) {
  return get('SELECT COALESCE(SUM(qty),0) q FROM batches WHERE item_id=? AND expiry>=?', itemId, today()).q;
}
// First-expiry-first-out deduction across unexpired batches
function deduct(itemId, qty, type, ref, user) {
  const item = get('SELECT * FROM items WHERE id=?', itemId);
  if (stockOf(itemId) < qty) fail(`Not enough stock for ${item.name} (have ${stockOf(itemId)}, need ${qty})`);
  let left = qty;
  for (const b of all('SELECT * FROM batches WHERE item_id=? AND qty>0 AND expiry>=? ORDER BY expiry, id', itemId, today())) {
    if (left <= 0) break;
    const take = Math.min(left, b.qty);
    run('UPDATE batches SET qty=qty-? WHERE id=?', take, b.id);
    run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', itemId, b.id, -take, type, ref, user, now());
    left -= take;
  }
}

// ---------------- labs ----------------
function flagFor(test, value, text) {
  if (test.kind === 'numeric') {
    const v = Number(value);
    if (Number.isNaN(v)) return null;
    if (test.crit_low != null && v < test.crit_low) return 'LL';
    if (test.crit_high != null && v > test.crit_high) return 'HH';
    if (test.ref_low != null && v < test.ref_low) return 'L';
    if (test.ref_high != null && v > test.ref_high) return 'H';
    return 'N';
  }
  if (test.abnormal_text && text && String(text).toLowerCase().startsWith(test.abnormal_text.toLowerCase())) return 'A';
  return 'N';
}

// ================= API =================
app.get('/api/health', (req, res) => res.json({ ok: true, time: now() }));

app.get('/api/config', wrap(() => ({ config: getConfig(), presets: D.PRESETS, lan: lanAddresses() })));
app.post('/api/setup', wrap(req => {
  const { preset, overrides } = req.body;
  const c = D.resetAndSeed(preset || 'spensa', overrides || {});
  return { config: c };
}));
app.put('/api/config', wrap(req => {
  const c = { ...cfg(), ...req.body };
  D.setConfig(c);
  audit(req, 'update', 'settings', 0);
  return { config: c };
}));

app.get('/api/users', wrap(() => all('SELECT id,name,username,role FROM users ORDER BY id')));
app.post('/api/login', wrap(req => {
  const u = get('SELECT id,name,username,role FROM users WHERE username=? AND pin=?', req.body.username, req.body.pin);
  if (!u) fail('Wrong username or PIN', 401);
  return u;
}));

// ---------- dashboard ----------
app.get('/api/dashboard', wrap(() => {
  const t = today();
  const c = cfg();
  const queue = all(`SELECT v.*, p.first_name||' '||p.last_name name, p.mrn, p.sex, p.dob FROM visits v JOIN patients p ON p.id=v.patient_id
    WHERE v.status NOT IN ('closed') AND v.type!='IPD' AND v.type!='ANC' AND v.status!='admitted' ORDER BY v.created_at`);
  const byStatus = {};
  for (const q of queue) byStatus[q.status] = (byStatus[q.status] || 0) + 1;
  const pay = all('SELECT method, SUM(amount) amt FROM payments WHERE substr(created_at,1,10)=? GROUP BY method', t);
  const revenueToday = pay.reduce((a, r) => a + r.amt, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = D.addDays(now(), -i);
    const r = get('SELECT COALESCE(SUM(amount),0) amt FROM payments WHERE substr(created_at,1,10)=?', d);
    days.push({ date: d, amount: r.amt });
  }
  const items = itemsWithStock();
  const low = items.filter(i => i.stock <= i.reorder_level && i.category !== 'reagent');
  const expiring = all(`SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry<=? ORDER BY b.expiry LIMIT 10`, D.addDays(now(), 90));
  const pendingLab = get("SELECT COUNT(*) c FROM lab_orders WHERE status IN ('ordered','collected')").c;
  const critical = all(`SELECT lo.*, t.name test, t.unit, p.first_name||' '||p.last_name name, p.id pid FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id
    JOIN patients p ON p.id=lo.patient_id WHERE lo.flag IN ('LL','HH','A','H','L') AND lo.resulted_at>=? ORDER BY lo.resulted_at DESC LIMIT 8`, D.addDays(now(), -3));
  const openBills = all("SELECT id FROM bills WHERE status='open'").map(b => billTotals(b.id));
  const topDx = all(`SELECT diagnosis, COUNT(*) n FROM notes WHERE created_at>=? AND diagnosis IS NOT NULL GROUP BY diagnosis ORDER BY n DESC LIMIT 6`, D.addDays(now(), -60));
  const beds = c.admissions ? {
    total: get('SELECT COUNT(*) c FROM beds').c,
    occupied: get("SELECT COUNT(*) c FROM admissions WHERE status='admitted'").c
  } : null;
  return {
    queue, byStatus, revenueToday, payToday: pay, days,
    newPatients: get('SELECT COUNT(*) c FROM patients WHERE substr(created_at,1,10)=?', t).c,
    visitsToday: get("SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?", t).c,
    totalPatients: get('SELECT COUNT(*) c FROM patients').c,
    lowStock: low.slice(0, 10), lowStockCount: low.length, expiring, pendingLab, critical,
    openBills: openBills.length, openBalance: openBills.reduce((a, b) => a + b.balance, 0),
    topDx, beds,
    appointmentsToday: all("SELECT * FROM appointments WHERE date=? AND status='booked' ORDER BY time", t),
    webOrders: get("SELECT COUNT(*) c FROM web_orders WHERE status='new'").c,
    webBookings: get("SELECT COUNT(*) c FROM appointments WHERE source='web' AND status='booked'").c,
    deliveriesMonth: c.maternity ? get('SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=?', t.slice(0, 7)).c : null,
    activePregnancies: c.maternity ? get("SELECT COUNT(*) c FROM pregnancies WHERE status='active'").c : null,
  };
}));

// ---------- patients ----------
app.get('/api/patients', wrap(req => {
  const q = `%${(req.query.q || '').trim()}%`;
  return all(`SELECT p.*, (SELECT MAX(created_at) FROM visits v WHERE v.patient_id=p.id) last_visit FROM patients p
    WHERE first_name||' '||last_name LIKE ? OR last_name||' '||first_name LIKE ? OR mrn LIKE ? OR phone LIKE ? OR national_id LIKE ? OR sha_number LIKE ?
    ORDER BY last_visit DESC NULLS LAST, p.id DESC LIMIT 100`, q, q, q, q, q, q);
}));
app.post('/api/patients', wrap(req => {
  const b = req.body;
  if (!b.first_name || !b.last_name) fail('First and last name are required');
  if (b.phone) {
    const dup = get('SELECT id, mrn FROM patients WHERE phone=? AND first_name=? AND last_name=?', b.phone, b.first_name, b.last_name);
    if (dup) fail(`Patient already registered as ${dup.mrn}`);
  }
  const id = run(`INSERT INTO patients(mrn,first_name,last_name,sex,dob,phone,national_id,sha_number,county,allergies,chronic,next_of_kin,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, D.nextMrn(), b.first_name.trim(), b.last_name.trim(), b.sex, b.dob, b.phone, b.national_id, b.sha_number,
    b.county, b.allergies, b.chronic, b.next_of_kin, now()).lastInsertRowid;
  audit(req, 'create', 'patient', id);
  return get('SELECT * FROM patients WHERE id=?', id);
}));
app.put('/api/patients/:id', wrap(req => {
  const b = req.body;
  run(`UPDATE patients SET first_name=?,last_name=?,sex=?,dob=?,phone=?,national_id=?,sha_number=?,county=?,allergies=?,chronic=?,next_of_kin=? WHERE id=?`,
    b.first_name, b.last_name, b.sex, b.dob, b.phone, b.national_id, b.sha_number, b.county, b.allergies, b.chronic, b.next_of_kin, req.params.id);
  audit(req, 'update', 'patient', req.params.id);
  return get('SELECT * FROM patients WHERE id=?', req.params.id);
}));
app.get('/api/patients/:id', wrap(req => {
  const id = req.params.id;
  const p = get('SELECT * FROM patients WHERE id=?', id);
  if (!p) fail('Patient not found', 404);
  audit(req, 'view', 'patient', id);
  const pregnancies = all('SELECT * FROM pregnancies WHERE patient_id=? ORDER BY id DESC', id);
  for (const pr of pregnancies) {
    pr.anc = all('SELECT * FROM anc_visits WHERE pregnancy_id=? ORDER BY gest_weeks', pr.id);
    pr.delivery = get('SELECT * FROM deliveries WHERE pregnancy_id=?', pr.id);
  }
  return {
    patient: p,
    visits: all(`SELECT v.*, (SELECT diagnosis FROM notes n WHERE n.visit_id=v.id ORDER BY id DESC LIMIT 1) diagnosis FROM visits v WHERE patient_id=? ORDER BY created_at DESC`, id),
    vitals: all('SELECT * FROM vitals WHERE patient_id=? ORDER BY created_at', id),
    notes: all('SELECT * FROM notes WHERE patient_id=? ORDER BY created_at DESC', id),
    labs: all(`SELECT lo.*, t.name, t.code, t.unit, t.kind, t.ref_low, t.ref_high FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.patient_id=? ORDER BY lo.created_at`, id),
    imaging: all(`SELECT io.*, s.name FROM imaging_orders io JOIN imaging_studies s ON s.id=io.study_id WHERE io.patient_id=? ORDER BY io.created_at DESC`, id),
    prescriptions: all(`SELECT pr.*, i.name FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.patient_id=? ORDER BY pr.created_at DESC`, id),
    procedures: all(`SELECT pc.*, s.name FROM procedures pc JOIN services s ON s.id=pc.service_id WHERE pc.patient_id=? ORDER BY pc.created_at DESC`, id),
    referrals: all('SELECT * FROM referrals WHERE patient_id=? ORDER BY created_at DESC', id),
    admissions: all(`SELECT a.*, b.label bed, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.patient_id=? ORDER BY a.admitted_at DESC`, id),
    pregnancies,
    bills: all('SELECT * FROM bills WHERE patient_id=? ORDER BY created_at DESC', id).map(b => ({ ...b, ...billTotals(b.id) })),
  };
}));

// ---------- visits / queue ----------
app.get('/api/visits', wrap(req => {
  const active = req.query.all ? '' : "AND v.status NOT IN ('closed')";
  return all(`SELECT v.*, p.first_name||' '||p.last_name name, p.mrn, p.sex, p.dob, p.allergies,
    (SELECT COUNT(*) FROM lab_orders lo WHERE lo.visit_id=v.id AND lo.status IN ('ordered','collected')) pending_labs,
    (SELECT COUNT(*) FROM prescriptions pr WHERE pr.visit_id=v.id AND pr.status='pending') pending_rx
    FROM visits v JOIN patients p ON p.id=v.patient_id WHERE v.type!='IPD' ${active} AND (v.status!='closed' OR substr(v.created_at,1,10)=?)
    ORDER BY v.created_at`, today());
}));
app.post('/api/visits', wrap(req => {
  const { patient_id, type, complaint } = req.body;
  const open = get("SELECT id FROM visits WHERE patient_id=? AND status NOT IN ('closed','admitted') AND type!='IPD'", patient_id);
  if (open) return get('SELECT * FROM visits WHERE id=?', open.id);
  const q = get('SELECT COUNT(*) c FROM visits WHERE substr(created_at,1,10)=?', today()).c + 1;
  const c = cfg();
  const start = c.type === 'pharmacy' && !c.consultation ? 'pharmacy' : 'waiting_triage';
  const id = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at) VALUES(?,?,?,?,?,?)', patient_id, type || 'OPD', start, q, complaint, now()).lastInsertRowid;
  billForVisit(id);
  audit(req, 'create', 'visit', id);
  return get('SELECT * FROM visits WHERE id=?', id);
}));
app.get('/api/visits/:id', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  if (!v) fail('Visit not found', 404);
  const bill = get('SELECT * FROM bills WHERE visit_id=? ORDER BY id DESC LIMIT 1', v.id);
  return {
    visit: v,
    patient: get('SELECT * FROM patients WHERE id=?', v.patient_id),
    vitals: all('SELECT * FROM vitals WHERE visit_id=? ORDER BY created_at DESC', v.id),
    notes: all('SELECT * FROM notes WHERE visit_id=? ORDER BY created_at DESC', v.id),
    labs: all(`SELECT lo.*, t.name, t.code, t.unit, t.kind, t.ref_low, t.ref_high, t.price FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.visit_id=? ORDER BY lo.id`, v.id),
    imaging: all(`SELECT io.*, s.name FROM imaging_orders io JOIN imaging_studies s ON s.id=io.study_id WHERE io.visit_id=?`, v.id),
    prescriptions: all(`SELECT pr.*, i.name, i.unit, i.price FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.visit_id=?`, v.id),
    procedures: all(`SELECT pc.*, s.name, s.price FROM procedures pc JOIN services s ON s.id=pc.service_id WHERE pc.visit_id=?`, v.id),
    referrals: all('SELECT * FROM referrals WHERE visit_id=?', v.id),
    admission: get(`SELECT a.*, b.label bed, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.visit_id=?`, v.id),
    bill: bill ? { ...bill, ...billTotals(bill.id), lines: all('SELECT * FROM bill_lines WHERE bill_id=? ORDER BY id', bill.id) } : null,
  };
}));
app.put('/api/visits/:id/status', wrap(req => {
  run('UPDATE visits SET status=?, closed_at=CASE WHEN ?=\'closed\' THEN ? ELSE closed_at END WHERE id=?', req.body.status, req.body.status, now(), req.params.id);
  audit(req, 'status:' + req.body.status, 'visit', req.params.id);
  return get('SELECT * FROM visits WHERE id=?', req.params.id);
}));
app.post('/api/visits/:id/vitals', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const b = req.body;
  run(`INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,glucose,muac,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    v.id, v.patient_id, b.temp, b.sys, b.dia, b.pulse, b.resp, b.spo2, b.weight, b.height, b.glucose, b.muac, userOf(req), now());
  if (v.status === 'waiting_triage') run("UPDATE visits SET status='waiting_doctor' WHERE id=?", v.id);
  return { ok: true };
}));
app.post('/api/visits/:id/note', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const b = req.body;
  const first = !get('SELECT id FROM notes WHERE visit_id=?', v.id);
  run(`INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    v.id, v.patient_id, b.history, b.exam, b.diagnosis, b.dx_code, b.plan, userOf(req), now());
  if (first && v.type !== 'IPD') {
    const s = consultationService();
    if (s && s.price > 0) charge(v.id, s.name, 'consultation', 'services', s.id, 1, s.price, userOf(req));
  }
  return { ok: true };
}));
app.post('/api/visits/:id/lab-orders', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { test_ids = [], mode = 'inhouse', partner } = req.body;
  tx(() => {
    for (const tid of test_ids) {
      const t = get('SELECT * FROM lab_tests WHERE id=?', tid);
      const m = t.outsourced_only || cfg().lab === 'outsourced' ? 'outsourced' : mode;
      const id = run('INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,partner,status,created_at) VALUES(?,?,?,?,?,?,?)',
        v.id, v.patient_id, tid, m, m === 'outsourced' ? (partner || (cfg().partners || [])[0]) : null, m === 'outsourced' ? 'sent_out' : 'ordered', now()).lastInsertRowid;
      if (m === 'inhouse' && t.price > 0) charge(v.id, t.name, 'lab', 'lab_orders', id, 1, t.price, userOf(req));
    }
    if (['waiting_doctor', 'waiting_triage'].includes(v.status) && test_ids.length) run("UPDATE visits SET status='in_lab' WHERE id=?", v.id);
  });
  return { ok: true };
}));
app.post('/api/visits/:id/imaging-orders', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { study_id, partner, notes } = req.body;
  const s = get('SELECT * FROM imaging_studies WHERE id=?', study_id);
  const mode = cfg().imaging === 'inhouse' ? 'inhouse' : 'outsourced';
  const id = run('INSERT INTO imaging_orders(visit_id,patient_id,study_id,mode,partner,status,report,created_at) VALUES(?,?,?,?,?,?,?,?)',
    v.id, v.patient_id, study_id, mode, mode === 'outsourced' ? (partner || (cfg().partners || []).slice(-1)[0]) : null,
    mode === 'outsourced' ? 'sent_out' : 'ordered', notes ? 'Clinical notes: ' + notes : null, now()).lastInsertRowid;
  if (mode === 'inhouse') charge(v.id, s.name, 'imaging', 'imaging_orders', id, 1, s.price, userOf(req));
  return { ok: true };
}));
app.post('/api/visits/:id/prescriptions', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  tx(() => {
    for (const r of req.body.items || []) {
      run('INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,prescriber,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        v.id, v.patient_id, r.item_id, r.dose, r.frequency, r.days, r.qty, 'pending', userOf(req), now());
    }
  });
  return { ok: true };
}));
app.post('/api/visits/:id/procedures', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { service_id, consent, notes, consumables = [] } = req.body;
  if (!consent) fail('Consent must be recorded before a procedure');
  const s = get('SELECT * FROM services WHERE id=?', service_id);
  tx(() => {
    const id = run('INSERT INTO procedures(visit_id,patient_id,service_id,consent,notes,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?)',
      v.id, v.patient_id, service_id, 1, notes, 'done', userOf(req), now()).lastInsertRowid;
    charge(v.id, s.name, 'procedure', 'procedures', id, 1, s.price, userOf(req));
    for (const c of consumables) {
      const it = get('SELECT * FROM items WHERE id=?', c.item_id);
      deduct(it.id, c.qty, 'procedure', 'PROC-' + id, userOf(req));
      charge(v.id, it.name, 'drug', 'items', it.id, c.qty, it.price, userOf(req), true);
    }
  });
  return { ok: true };
}));
app.post('/api/visits/:id/admit', wrap(req => {
  const v = get('SELECT * FROM visits WHERE id=?', req.params.id);
  const { bed_id, reason } = req.body;
  if (get("SELECT id FROM admissions WHERE bed_id=? AND status='admitted'", bed_id)) fail('That bed is occupied');
  const bed = get('SELECT b.*, w.daily_rate, w.name ward FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id=?', bed_id);
  let id;
  tx(() => {
    run("UPDATE visits SET status='admitted', type='IPD' WHERE id=?", v.id);
    id = run('INSERT INTO admissions(patient_id,visit_id,bed_id,reason,status,admitted_at,last_charged) VALUES(?,?,?,?,?,?,?)',
      v.patient_id, v.id, bed_id, reason, 'admitted', now(), today()).lastInsertRowid;
    addLine(billForVisit(v.id).id, `Bed day - ${bed.ward}`, 'bed', 'admissions', id, 1, bed.daily_rate, userOf(req));
  });
  audit(req, 'admit', 'admission', id);
  return { ok: true, admission_id: id };
}));

// ---------- referrals ----------
app.get('/api/referrals', wrap(() => all(`SELECT r.*, p.first_name||' '||p.last_name name, p.mrn FROM referrals r JOIN patients p ON p.id=r.patient_id ORDER BY r.created_at DESC`)));
app.post('/api/referrals', wrap(req => {
  const b = req.body;
  let summary = b.summary;
  if (b.visit_id && !summary) summary = autoSummary(b.visit_id);
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
app.get('/api/lab/tests', wrap(() => all('SELECT * FROM lab_tests ORDER BY name')));
app.put('/api/lab/tests/:id', wrap(req => {
  const b = req.body;
  run('UPDATE lab_tests SET price=?, ref_low=?, ref_high=?, outsourced_only=? WHERE id=?', b.price, b.ref_low, b.ref_high, b.outsourced_only ? 1 : 0, req.params.id);
  return get('SELECT * FROM lab_tests WHERE id=?', req.params.id);
}));
app.get('/api/lab/orders', wrap(req => {
  const st = req.query.status === 'done' ? "('resulted','validated')" : "('ordered','collected','sent_out','resulted')";
  return all(`SELECT lo.*, t.name, t.code, t.unit, t.kind, t.ref_low, t.ref_high, t.sample, p.first_name||' '||p.last_name pname, p.mrn, p.sex, p.dob
    FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id JOIN patients p ON p.id=lo.patient_id
    WHERE lo.status IN ${st} ${req.query.status === 'done' ? "AND lo.resulted_at>=?" : 'AND 1=1'} ORDER BY lo.created_at DESC LIMIT 200`,
    ...(req.query.status === 'done' ? [D.addDays(now(), -14)] : []));
}));
app.post('/api/lab/orders/:id/collect', wrap(req => {
  run("UPDATE lab_orders SET status='collected' WHERE id=? AND status='ordered'", req.params.id);
  return { ok: true };
}));
app.post('/api/lab/orders/:id/result', wrap(req => {
  const lo = get('SELECT * FROM lab_orders WHERE id=?', req.params.id);
  const t = get('SELECT * FROM lab_tests WHERE id=?', lo.test_id);
  const { value, text, comment } = req.body;
  const flag = flagFor(t, value, text);
  run(`UPDATE lab_orders SET result_value=?, result_text=?, flag=?, comment=?, status='resulted', resulted_by=?, resulted_at=? WHERE id=?`,
    t.kind === 'numeric' ? Number(value) : null, t.kind === 'numeric' ? null : text, flag, comment, userOf(req), now(), lo.id);
  // send patient back to clinician once all labs are in
  const pending = get("SELECT COUNT(*) c FROM lab_orders WHERE visit_id=? AND status IN ('ordered','collected')", lo.visit_id).c;
  const v = get('SELECT * FROM visits WHERE id=?', lo.visit_id);
  if (!pending && v && v.status === 'in_lab') run("UPDATE visits SET status='waiting_doctor' WHERE id=?", v.id);
  return { ok: true, flag };
}));
app.post('/api/lab/orders/:id/validate', wrap(req => {
  const lo = get('SELECT * FROM lab_orders WHERE id=?', req.params.id);
  if (lo.resulted_by === userOf(req) && lo.mode === 'inhouse') fail('A second person must validate this result');
  run("UPDATE lab_orders SET status='validated', validated_by=? WHERE id=?", userOf(req), req.params.id);
  return { ok: true };
}));

// ---------- imaging ----------
app.get('/api/imaging/studies', wrap(() => all('SELECT * FROM imaging_studies ORDER BY name')));
app.get('/api/imaging/orders', wrap(() => all(`SELECT io.*, s.name, p.first_name||' '||p.last_name pname, p.mrn FROM imaging_orders io
  JOIN imaging_studies s ON s.id=io.study_id JOIN patients p ON p.id=io.patient_id ORDER BY io.created_at DESC LIMIT 100`)));
app.post('/api/imaging/orders/:id/report', wrap(req => {
  run("UPDATE imaging_orders SET report=?, status='reported', reported_at=? WHERE id=?", req.body.report, now(), req.params.id);
  return { ok: true };
}));

// ---------- pharmacy and inventory ----------
function itemsWithStock() {
  return all(`SELECT i.*, (SELECT COALESCE(SUM(qty),0) FROM batches b WHERE b.item_id=i.id AND b.expiry>=?) stock,
    (SELECT MIN(expiry) FROM batches b WHERE b.item_id=i.id AND b.qty>0 AND b.expiry>=?) next_expiry,
    (SELECT COALESCE(SUM(qty),0) FROM batches b WHERE b.item_id=i.id AND b.expiry<? AND b.qty>0) expired_qty
    FROM items i ORDER BY i.name`, today(), today(), today());
}
app.get('/api/items', wrap(() => itemsWithStock()));
app.post('/api/items', wrap(req => {
  const b = req.body;
  const id = run('INSERT INTO items(code,name,category,unit,price,cost,reorder_level,rx_only,controlled,web) VALUES(?,?,?,?,?,?,?,?,?,?)',
    b.code, b.name, b.category || 'drug', b.unit || 'tab', Number(b.price) || 0, Number(b.cost) || 0, Number(b.reorder_level) || 0, !!b.rx_only, !!b.controlled, b.web !== false).lastInsertRowid;
  return get('SELECT * FROM items WHERE id=?', id);
}));
app.put('/api/items/:id', wrap(req => {
  const b = req.body;
  run('UPDATE items SET name=?, price=?, cost=?, reorder_level=?, rx_only=?, controlled=?, web=? WHERE id=?',
    b.name, b.price, b.cost, b.reorder_level, !!b.rx_only, !!b.controlled, !!b.web, req.params.id);
  return { ok: true };
}));
app.get('/api/items/:id', wrap(req => ({
  item: get('SELECT * FROM items WHERE id=?', req.params.id),
  batches: all('SELECT * FROM batches WHERE item_id=? ORDER BY expiry', req.params.id),
  moves: all('SELECT * FROM stock_moves WHERE item_id=? ORDER BY created_at DESC LIMIT 50', req.params.id),
})));
app.post('/api/stock/receive', wrap(req => {
  const b = req.body;
  if (!b.item_id || !b.qty || !b.expiry) fail('Item, quantity and expiry are required');
  const id = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
    b.item_id, b.batch_no || 'B' + Date.now().toString().slice(-6), b.expiry, Number(b.qty), Number(b.cost) || null, b.supplier, now()).lastInsertRowid;
  run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', b.item_id, id, Number(b.qty), 'receive', b.supplier, userOf(req), now());
  return { ok: true };
}));
app.post('/api/stock/adjust', wrap(req => {
  const { batch_id, new_qty, reason } = req.body;
  const b = get('SELECT * FROM batches WHERE id=?', batch_id);
  const diff = Number(new_qty) - b.qty;
  run('UPDATE batches SET qty=? WHERE id=?', Number(new_qty), batch_id);
  run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', b.item_id, batch_id, diff, 'adjust', reason || 'Stock take', userOf(req), now());
  return { ok: true };
}));
app.get('/api/pharmacy/queue', wrap(() => {
  const rows = all(`SELECT pr.*, i.name, i.unit, i.price, i.controlled, p.first_name||' '||p.last_name pname, p.mrn, p.allergies, v.queue_no
    FROM prescriptions pr JOIN items i ON i.id=pr.item_id JOIN patients p ON p.id=pr.patient_id JOIN visits v ON v.id=pr.visit_id
    WHERE pr.status='pending' ORDER BY pr.created_at`);
  const map = {};
  for (const r of rows) {
    r.stock = stockOf(r.item_id);
    (map[r.visit_id] ||= { visit_id: r.visit_id, pname: r.pname, mrn: r.mrn, allergies: r.allergies, queue_no: r.queue_no, items: [] }).items.push(r);
  }
  return Object.values(map);
}));
app.post('/api/pharmacy/dispense/:visitId', wrap(req => {
  const ids = req.body.prescription_ids || [];
  tx(() => {
    for (const pid of ids) {
      const pr = get('SELECT pr.*, i.name, i.price FROM prescriptions pr JOIN items i ON i.id=pr.item_id WHERE pr.id=?', pid);
      if (pr.status !== 'pending') continue;
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
app.get('/api/controlled-register', wrap(() => all(`SELECT m.*, i.name, b.batch_no FROM stock_moves m JOIN items i ON i.id=m.item_id LEFT JOIN batches b ON b.id=m.batch_id
  WHERE i.controlled=1 ORDER BY m.created_at DESC LIMIT 200`)));

// Point of sale (walk-in customers and quick sales)
app.post('/api/pos/sale', wrap(req => {
  const { customer, patient_id, lines = [], payments = [], payer } = req.body;
  if (!lines.length) fail('Cart is empty');
  let billId;
  tx(() => {
    billId = run('INSERT INTO bills(patient_id,customer_name,payer,status,created_at) VALUES(?,?,?,?,?)',
      patient_id, customer || 'Walk-in customer', payer || 'cash', 'open', now()).lastInsertRowid;
    for (const l of lines) {
      const it = get('SELECT * FROM items WHERE id=?', l.item_id);
      if (it.rx_only && !l.rx_ref) fail(`${it.name} is prescription-only: record the prescription first`);
      deduct(it.id, Number(l.qty), 'sale', 'POS-' + billId, userOf(req));
      addLine(billId, it.name + (l.rx_ref ? ` (Rx: ${l.rx_ref})` : ''), 'drug', 'items', it.id, Number(l.qty), it.price, userOf(req));
    }
    for (const p of payments) run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', billId, p.method, Number(p.amount), p.reference, userOf(req), now());
    const t = billTotals(billId);
    if (t.balance > 0.01) fail(`Payment is short by KES ${t.balance}`);
    run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'POS' + pad(billId), now(), billId);
  });
  return receipt(billId);
}));

// Website orders
app.get('/api/web-orders', wrap(() => all('SELECT * FROM web_orders ORDER BY created_at DESC').map(o => ({ ...o, items: JSON.parse(o.items) }))));
app.post('/api/web-orders/:id/status', wrap(req => {
  const o = get('SELECT * FROM web_orders WHERE id=?', req.params.id);
  const { status, payment } = req.body;
  if (status === 'fulfilled') {
    tx(() => {
      const items = JSON.parse(o.items);
      const billId = run('INSERT INTO bills(customer_name,payer,status,created_at) VALUES(?,?,?,?)', o.name + ' (web order)', 'cash', 'open', now()).lastInsertRowid;
      for (const l of items) {
        const it = get('SELECT * FROM items WHERE id=?', l.id);
        deduct(it.id, l.qty, 'web-order', 'WEB-' + o.id, userOf(req));
        addLine(billId, it.name, 'drug', 'items', it.id, l.qty, it.price, userOf(req));
      }
      const t = billTotals(billId);
      run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', billId, payment || 'mpesa', t.total, 'WEB-' + o.id, userOf(req), now());
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
    WHERE b.status=? ${st === 'paid' ? 'AND b.closed_at>=?' : ''} ORDER BY b.created_at DESC LIMIT 200`, st, ...(st === 'paid' ? [D.addDays(now(), -7)] : []));
  return rows.map(b => ({ ...b, ...billTotals(b.id), unbilled: unbilledFor(b.visit_id).length }));
}));
app.get('/api/bills/:id', wrap(req => receipt(req.params.id)));
function receipt(id) {
  const b = get(`SELECT b.*, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name, p.mrn, p.sha_number, p.phone FROM bills b LEFT JOIN patients p ON p.id=b.patient_id WHERE b.id=?`, id);
  if (!b) fail('Bill not found', 404);
  return {
    ...b, ...billTotals(b.id), lines: all('SELECT * FROM bill_lines WHERE bill_id=? ORDER BY id', b.id),
    payments: all('SELECT * FROM payments WHERE bill_id=? ORDER BY id', b.id),
    suggestions: unbilledFor(b.visit_id),
    visit: b.visit_id ? get('SELECT * FROM visits WHERE id=?', b.visit_id) : null,
    etims: { mode: 'demo', cu_serial: 'KRACU0100DEMO01', invoice_no: b.receipt_no ? b.receipt_no.replace(/\D/g, '') : null },
  };
}
app.post('/api/bills/:id/lines', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  if (b.status !== 'open') fail('Bill is closed');
  const l = req.body;
  if (l.ref_table === 'items' && l.ref_id) deduct(l.ref_id, Number(l.qty) || 1, 'bill', 'BILL-' + b.id, userOf(req));
  addLine(b.id, l.description, l.kind || 'other', l.ref_table, l.ref_id, Number(l.qty) || 1, Number(l.unit_price) || 0, userOf(req));
  return receipt(b.id);
}));
app.delete('/api/bills/:id/lines/:lineId', wrap(req => {
  const l = get('SELECT * FROM bill_lines WHERE id=? AND bill_id=?', req.params.lineId, req.params.id);
  if (!l) fail('Line not found');
  if ((req.get('x-role') || '') !== 'admin' && req.body?.pin !== '1234') fail('Supervisor PIN required to remove a charge', 403);
  run('DELETE FROM bill_lines WHERE id=?', l.id);
  if (['lab_orders', 'imaging_orders', 'prescriptions', 'procedures'].includes(l.ref_table)) run(`UPDATE ${l.ref_table} SET billed=0 WHERE id=?`, l.ref_id);
  audit(req, 'remove-line:' + l.description, 'bill', req.params.id);
  return receipt(req.params.id);
}));
app.post('/api/bills/:id/discount', wrap(req => {
  const { amount, reason, pin } = req.body;
  if (pin !== '1234') fail('Supervisor PIN required for discounts', 403);
  addLine(req.params.id, 'Discount / waiver' + (reason ? ` - ${reason}` : ''), 'discount', null, null, 1, -Math.abs(Number(amount)), userOf(req));
  return receipt(req.params.id);
}));
app.post('/api/bills/:id/payer', wrap(req => {
  run('UPDATE bills SET payer=? WHERE id=?', req.body.payer, req.params.id);
  return receipt(req.params.id);
}));
app.post('/api/bills/:id/pay', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  const { method, amount, reference } = req.body;
  if (!(Number(amount) > 0)) fail('Enter an amount');
  run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)', b.id, method, Number(amount), reference, userOf(req), now());
  closeBillIfSettled(b.id);
  return receipt(b.id);
}));
app.post('/api/bills/:id/checkout', wrap(req => {
  const b = get('SELECT * FROM bills WHERE id=?', req.params.id);
  const t = billTotals(b.id);
  if (t.balance > 0.01 && !req.body.credit) fail(`Balance of KES ${t.balance} is unpaid`);
  if (req.body.credit) run("UPDATE bills SET status='credit', receipt_no=?, closed_at=? WHERE id=?", 'INV' + pad(b.id), now(), b.id);
  else if (b.status === 'open') run("UPDATE bills SET status='paid', receipt_no=?, closed_at=? WHERE id=?", 'RCT' + pad(b.id), now(), b.id);
  if (b.visit_id) {
    const v = get('SELECT * FROM visits WHERE id=?', b.visit_id);
    if (v.status !== 'admitted') run("UPDATE visits SET status='closed', closed_at=? WHERE id=?", now(), v.id);
  }
  return receipt(b.id);
}));
app.get('/api/catalogue', wrap(() => ({
  services: all('SELECT * FROM services ORDER BY category, name'),
  tests: all('SELECT * FROM lab_tests ORDER BY name'),
  imaging: all('SELECT * FROM imaging_studies ORDER BY name'),
  items: itemsWithStock(),
})));
app.put('/api/services/:id', wrap(req => { run('UPDATE services SET price=? WHERE id=?', req.body.price, req.params.id); return { ok: true }; }));

// M-Pesa STK push (demo simulation; real Daraja keys plug in here later)
const stk = {};
app.post('/api/mpesa/stk', wrap(req => {
  const { phone, amount } = req.body;
  if (!/^(?:\+?254|0)?7\d{8}$|^(?:\+?254|0)?1\d{8}$/.test(String(phone).replace(/\s/g, ''))) fail('Enter a valid Safaricom number, e.g. 0712345678');
  const id = 'ws_CO_' + Date.now();
  stk[id] = { phone, amount, started: Date.now() };
  return { checkout_id: id, message: 'STK push sent (demo). Ask the customer to enter their M-Pesa PIN.' };
}));
app.get('/api/mpesa/stk/:id', wrap(req => {
  const s = stk[req.params.id];
  if (!s) fail('Unknown request', 404);
  if (Date.now() - s.started < 3500) return { status: 'pending' };
  s.receipt ||= 'S' + Math.random().toString(36).slice(2, 12).toUpperCase();
  return { status: 'success', receipt: s.receipt, amount: s.amount };
}));

// ---------- wards / inpatient ----------
app.get('/api/wards', wrap(() => {
  const wards = all('SELECT * FROM wards ORDER BY id');
  for (const w of wards) {
    w.beds = all(`SELECT b.*, a.id admission_id, a.patient_id, a.reason, a.admitted_at, a.visit_id, p.first_name||' '||p.last_name pname, p.mrn, p.sex, p.dob
      FROM beds b LEFT JOIN admissions a ON a.bed_id=b.id AND a.status='admitted' LEFT JOIN patients p ON p.id=a.patient_id WHERE b.ward_id=? ORDER BY b.label`, w.id);
  }
  return wards;
}));
app.get('/api/admissions/:id', wrap(req => {
  const a = get(`SELECT a.*, b.label bed, w.name ward, w.daily_rate FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.id=?`, req.params.id);
  return { ...a, notes: all('SELECT * FROM nursing_notes WHERE admission_id=? ORDER BY created_at DESC', a.id) };
}));
app.get('/api/admissions/:id/partograph', wrap(req => all('SELECT * FROM partograph WHERE admission_id=? ORDER BY at', req.params.id)));
app.post('/api/admissions/:id/partograph', wrap(req => {
  const b = req.body;
  run('INSERT INTO partograph(admission_id,at,dilation,fhr,contractions,descent,sys,dia,by_user) VALUES(?,?,?,?,?,?,?,?,?)',
    req.params.id, now(), b.dilation, b.fhr, b.contractions, b.descent, b.sys, b.dia, userOf(req));
  return { ok: true };
}));
app.post('/api/admissions/:id/note', wrap(req => {
  run('INSERT INTO nursing_notes(admission_id,note,by_user,created_at) VALUES(?,?,?,?)', req.params.id, req.body.note, userOf(req), now());
  return { ok: true };
}));
app.post('/api/admissions/:id/transfer', wrap(req => {
  if (get("SELECT id FROM admissions WHERE bed_id=? AND status='admitted'", req.body.bed_id)) fail('That bed is occupied');
  run('UPDATE admissions SET bed_id=? WHERE id=?', req.body.bed_id, req.params.id);
  return { ok: true };
}));
function postBedCharges(user) {
  let n = 0;
  for (const a of all(`SELECT a.*, w.daily_rate, w.name ward FROM admissions a JOIN beds b ON b.id=a.bed_id JOIN wards w ON w.id=b.ward_id WHERE a.status='admitted'`)) {
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
  postBedCharges(userOf(req));
  run("UPDATE admissions SET status='discharged', discharged_at=?, discharge_summary=? WHERE id=?", now(), req.body.summary, a.id);
  run("UPDATE visits SET status='billing' WHERE id=?", a.visit_id);
  return { ok: true, visit_id: a.visit_id };
}));

// ---------- maternity ----------
app.get('/api/maternity', wrap(() => {
  const rows = all(`SELECT pr.*, p.first_name||' '||p.last_name pname, p.mrn, p.dob, p.phone,
    (SELECT COUNT(*) FROM anc_visits a WHERE a.pregnancy_id=pr.id) anc_count,
    (SELECT MAX(created_at) FROM anc_visits a WHERE a.pregnancy_id=pr.id) last_anc,
    (SELECT id FROM admissions ad WHERE ad.patient_id=pr.patient_id AND ad.status='admitted') admission_id
    FROM pregnancies pr JOIN patients p ON p.id=pr.patient_id WHERE pr.status='active' ORDER BY pr.edd`);
  const deliveries = all(`SELECT d.*, p.first_name||' '||p.last_name pname, p.mrn FROM deliveries d JOIN patients p ON p.id=d.patient_id ORDER BY d.delivered_at DESC LIMIT 50`);
  return { pregnancies: rows, deliveries };
}));
app.post('/api/pregnancies', wrap(req => {
  const { patient_id, lmp, gravida, parity } = req.body;
  if (!lmp) fail('LMP is required');
  const id = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)',
    patient_id, lmp, D.addDays(lmp + 'T12:00:00Z', 280), gravida, parity, 'active', now()).lastInsertRowid;
  return get('SELECT * FROM pregnancies WHERE id=?', id);
}));
app.post('/api/pregnancies/:id/anc', wrap(req => {
  const pr = get('SELECT * FROM pregnancies WHERE id=?', req.params.id);
  const b = req.body;
  const weeks = Math.floor((Date.now() - new Date(pr.lmp).getTime()) / (7 * 864e5));
  tx(() => {
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)',
      pr.patient_id, 'ANC', 'billing', 0, 'ANC visit', now(), null).lastInsertRowid;
    run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)',
      pr.id, v, weeks, b.fundal_height, b.fhr, b.presentation, b.notes, now());
    if (b.sys || b.weight) run('INSERT INTO vitals(visit_id,patient_id,sys,dia,weight,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)', v, pr.patient_id, b.sys, b.dia, b.weight, userOf(req), now());
    const s = get("SELECT * FROM services WHERE code='ANC'");
    if (s) charge(v, s.name, 'consultation', 'services', s.id, 1, s.price, userOf(req), true);
  });
  return { ok: true };
}));
app.post('/api/pregnancies/:id/delivery', wrap(req => {
  const pr = get('SELECT * FROM pregnancies WHERE id=?', req.params.id);
  const b = req.body;
  const adm = get("SELECT * FROM admissions WHERE patient_id=? AND status='admitted'", pr.patient_id);
  tx(() => {
    run(`INSERT INTO deliveries(pregnancy_id,patient_id,admission_id,delivered_at,mode,outcome,baby_sex,baby_weight,apgar1,apgar5,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      pr.id, pr.patient_id, adm?.id, now(), b.mode, b.outcome, b.baby_sex, b.baby_weight, b.apgar1, b.apgar5, b.notes);
    run("UPDATE pregnancies SET status='delivered' WHERE id=?", pr.id);
    const code = b.mode === 'Caesarean section' ? 'CS' : 'NVD';
    const s = get('SELECT * FROM services WHERE code=?', code);
    if (s && adm) charge(adm.visit_id, s.name, 'procedure', 'services', s.id, 1, s.price, userOf(req), true);
  });
  return { ok: true };
}));

// ---------- appointments ----------
app.get('/api/appointments', wrap(() => all(`SELECT * FROM appointments WHERE date>=? ORDER BY date, time`, D.addDays(now(), -1))));
app.post('/api/appointments', wrap(req => {
  const b = req.body;
  const id = run('INSERT INTO appointments(patient_id,name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    b.patient_id, b.name, b.phone, b.service, b.date, b.time, b.source || 'desk', 'booked', b.notes, now()).lastInsertRowid;
  return get('SELECT * FROM appointments WHERE id=?', id);
}));
app.post('/api/appointments/:id/status', wrap(req => {
  run('UPDATE appointments SET status=? WHERE id=?', req.body.status, req.params.id);
  return { ok: true };
}));

// ---------- reports ----------
app.get('/api/reports/summary', wrap(req => {
  const from = req.query.from || D.addDays(now(), -30), to = req.query.to || today();
  const range = [from, to + 'T23:59:59'];
  return {
    from, to,
    byMethod: all('SELECT method, SUM(amount) amount, COUNT(*) n FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC', ...range),
    byKind: all(`SELECT kind, SUM(amount) amount FROM bill_lines WHERE created_at BETWEEN ? AND ? GROUP BY kind ORDER BY amount DESC`, ...range),
    byDay: all(`SELECT substr(created_at,1,10) day, SUM(amount) amount FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY day ORDER BY day`, ...range),
    topItems: all(`SELECT description, SUM(qty) qty, SUM(amount) amount FROM bill_lines WHERE kind='drug' AND created_at BETWEEN ? AND ? GROUP BY description ORDER BY amount DESC LIMIT 10`, ...range),
    byUser: all('SELECT by_user, SUM(amount) amount, COUNT(*) n FROM payments WHERE created_at BETWEEN ? AND ? GROUP BY by_user', ...range),
    visits: get('SELECT COUNT(*) c FROM visits WHERE created_at BETWEEN ? AND ?', ...range).c,
    newPatients: get('SELECT COUNT(*) c FROM patients WHERE created_at BETWEEN ? AND ?', ...range).c,
    labs: all(`SELECT t.name, COUNT(*) n, SUM(CASE WHEN lo.mode='outsourced' THEN 1 ELSE 0 END) outsourced,
      ROUND(AVG(CASE WHEN lo.resulted_at IS NOT NULL AND lo.mode='inhouse' THEN (julianday(lo.resulted_at)-julianday(lo.created_at))*24*60 END)) tat_min
      FROM lab_orders lo JOIN lab_tests t ON t.id=lo.test_id WHERE lo.created_at BETWEEN ? AND ? GROUP BY t.name ORDER BY n DESC`, ...range),
    debtors: all(`SELECT b.id, b.receipt_no, COALESCE(p.first_name||' '||p.last_name, b.customer_name) name, b.payer, b.created_at FROM bills b LEFT JOIN patients p ON p.id=b.patient_id WHERE b.status='credit'`)
      .map(b => ({ ...b, ...billTotals(b.id) })),
  };
}));
// MOH 705A (under 5) / 705B (5 and over) - new outpatient diagnoses by month
app.get('/api/reports/moh705', wrap(req => {
  const month = req.query.month || today().slice(0, 7);
  const rows = all(`SELECT n.diagnosis, p.dob, n.created_at FROM notes n JOIN patients p ON p.id=n.patient_id JOIN visits v ON v.id=n.visit_id
    WHERE substr(n.created_at,1,7)=? AND v.type IN ('OPD')`, month);
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
  const anc = all(`SELECT a.*, (SELECT MIN(id) FROM anc_visits x WHERE x.pregnancy_id=a.pregnancy_id) first_id FROM anc_visits a WHERE substr(a.created_at,1,7)=?`, month);
  return {
    month,
    anc_first: anc.filter(a => a.id === a.first_id).length,
    anc_revisit: anc.filter(a => a.id !== a.first_id).length,
    deliveries: get('SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=?', month).c,
    live_births: get("SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=? AND outcome='Live birth'", month).c,
    low_birth_weight: get('SELECT COUNT(*) c FROM deliveries WHERE substr(delivered_at,1,7)=? AND baby_weight<2.5', month).c,
    referrals_out: get("SELECT COUNT(*) c FROM referrals WHERE direction='out' AND substr(created_at,1,7)=?", month).c,
    referrals_in: get("SELECT COUNT(*) c FROM referrals WHERE direction='in' AND substr(created_at,1,7)=?", month).c,
    admissions: get('SELECT COUNT(*) c FROM admissions WHERE substr(admitted_at,1,7)=?', month).c,
    discharges: get('SELECT COUNT(*) c FROM admissions WHERE substr(discharged_at,1,7)=?', month).c,
  };
}));
app.get('/api/reports/stock', wrap(() => {
  const items = itemsWithStock().map(i => ({ ...i, value: i.stock * (i.cost || 0), retail: i.stock * i.price }));
  return {
    items,
    totalValue: items.reduce((a, i) => a + i.value, 0),
    totalRetail: items.reduce((a, i) => a + i.retail, 0),
    expired: all(`SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry<?`, today()),
    nearExpiry: all(`SELECT b.*, i.name FROM batches b JOIN items i ON i.id=b.item_id WHERE b.qty>0 AND b.expiry BETWEEN ? AND ? ORDER BY b.expiry`, today(), D.addDays(now(), 90)),
  };
}));
app.get('/api/audit', wrap(() => all('SELECT * FROM audit ORDER BY id DESC LIMIT 200')));

// ---------- public website API ----------
app.get('/api/public/site', wrap(() => {
  const c = cfg();
  return {
    facility: { name: c.facility_name, tagline: c.tagline, phone: c.phone, email: c.email, location: c.location, type: c.type, color: c.color,
      lab: c.lab, imaging: c.imaging, maternity: c.maternity, admissions: c.admissions, procedures: c.procedures, beds: c.beds, shop: c.web_shop !== false },
    services: all("SELECT name, category, price FROM services WHERE price>0 ORDER BY CASE category WHEN 'consultation' THEN 0 WHEN 'procedure' THEN 1 ELSE 2 END, name"),
    tests: c.lab === 'none' ? [] : all('SELECT name, price, sample FROM lab_tests WHERE price>0 ORDER BY name'),
    products: itemsWithStock().filter(i => i.web && !i.controlled && i.category === 'drug').map(i => ({ id: i.id, name: i.name, price: i.price, unit: i.unit, rx_only: !!i.rx_only, in_stock: i.stock > 0 })),
  };
}));
app.post('/api/public/booking', wrap(req => {
  const b = req.body;
  if (!b.name || !b.phone || !b.date) fail('Name, phone and date are required');
  run('INSERT INTO appointments(name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    b.name, b.phone, b.service, b.date, b.time, 'web', 'booked', b.notes, now());
  return { ok: true, message: `Thank you ${b.name.split(' ')[0]}, your booking for ${b.date} is received. We will confirm by SMS.` };
}));
app.post('/api/public/order', wrap(req => {
  const b = req.body;
  if (!b.name || !b.phone || !(b.items || []).length) fail('Name, phone and at least one item are required');
  const items = b.items.map(l => { const it = get('SELECT * FROM items WHERE id=?', l.id); return { id: it.id, name: it.name, qty: Number(l.qty), price: it.price, rx_only: !!it.rx_only }; });
  const total = items.reduce((a, l) => a + l.qty * l.price, 0);
  const hasRx = items.some(l => l.rx_only);
  if (hasRx && !b.prescription_note) fail('Prescription-only items need prescription details for the pharmacist to review');
  const id = run('INSERT INTO web_orders(name,phone,items,total,delivery,prescription_note,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
    b.name, b.phone, JSON.stringify(items), total, b.delivery || 'pickup', b.prescription_note, hasRx ? 'awaiting_review' : 'new', now()).lastInsertRowid;
  return { ok: true, order_no: 'WEB-' + id, total, message: hasRx ? 'Order received. A pharmacist will review your prescription and call you.' : 'Order received. We will send an M-Pesa prompt to confirm.' };
}));

// ---------- static web app and site ----------
const DIST = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(DIST));
app.get('/site', (req, res) => res.sendFile(path.join(DIST, 'site.html')));
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
  console.log(`\n  Pentarch MediCore is running`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  Other devices:  ${a}`);
  console.log(`  Facility site:  http://localhost:${PORT}/site\n`);
});
