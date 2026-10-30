// Pentarch MediCore - realistic sample data for demos and training.
// Clear it from Settings -> Data before a facility goes live.

const FIRST_F = ['Wanjiku', 'Achieng', 'Mwende', 'Amina', 'Faith', 'Grace', 'Njeri', 'Akinyi', 'Wairimu', 'Chebet', 'Nafula', 'Zawadi', 'Halima', 'Mercy', 'Esther', 'Joy', 'Nyokabi', 'Moraa', 'Atieno', 'Kerubo', 'Saida', 'Jebet'];
const FIRST_M = ['Otieno', 'Kiprono', 'Baraka', 'Kevin', 'Joseph', 'Brian', 'Mwangi', 'Kamau', 'Omondi', 'Kibet', 'Mutua', 'Hassan', 'Wekesa', 'Onyango', 'Kiptoo', 'Juma', 'Maina', 'Ochieng', 'Gitau', 'Barasa', 'Ali', 'Nyaga'];
const LAST = ['Kamau', 'Ochieng', 'Atieno', 'Cheruiyot', 'Mutua', 'Njoroge', 'Hassan', 'Mwangi', 'Wambui', 'Kariuki', 'Nyambura', 'Omondi', 'Otieno', 'Wanjala', 'Kiplagat', 'Odhiambo', 'Muriuki', 'Chepkoech', 'Ndungu', 'Abdi', 'Mbugua', 'Kilonzo', 'Owino', 'Ruto'];
const COUNTIES = ['Nairobi', 'Nairobi', 'Nairobi', 'Kiambu', 'Machakos', 'Kajiado', 'Nakuru', 'Mombasa', 'Kisumu', 'Nyeri', 'Murang\'a', 'Embu', 'Kakamega', 'Homa Bay'];

let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

// hour is East Africa Time; times today are never in the future
function daysAgo(n, hour = 9) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hour - 3, Math.floor(rnd() * 59), 0, 0);
  if (d > new Date()) return new Date(Date.now() - (5 + rnd() * 40) * 60e3).toISOString();
  return d.toISOString();
}

// Age-appropriate acute presentations: [complaint, diagnosis, code, labs [[code, value]], rx [[code, qty, dose, freq, days]]]
const ACUTE_CHILD = [
  ['Fever and vomiting for 2 days', 'Malaria', 'B54', [['MRDT', 'Positive'], ['HB', 10.4]], [['AL2012P', 1, '1 tab', 'BD', 3], ['PCMSYR', 1, '5ml', 'TDS', 3]]],
  ['Cough and fast breathing', 'Pneumonia', 'J18.9', [['MPS', 'Negative'], ['FBC', 'WBC 15.2, Neut 78%, Hb 11.6, PLT 310']], [['AMXDT', 15, '250mg', 'TDS', 5], ['PCMSYR', 1, '5ml', 'TDS', 3]]],
  ['Watery diarrhoea for 3 days', 'Diarrhoea', 'A09', [['STOOL', 'No ova or cysts seen']], [['ORS', 6, '1 sachet', 'After each loose stool', 3], ['ZNC20', 10, '20mg', 'OD', 10]]],
  ['Runny nose and cough', 'Upper respiratory tract infection', 'J06.9', [], [['CTZSYR', 1, '2.5ml', 'OD', 5], ['PCMSYR', 1, '5ml', 'TDS', 3]]],
  ['Ear pain and discharge', 'Otitis media', 'H66.9', [], [['AMXSYR', 1, '5ml', 'TDS', 5]]],
  ['Itchy skin rash', 'Skin infection / dermatitis', 'L30.9', [], [['CLOTCR', 1, 'Apply', 'BD', 14]]],
  ['Abdominal pain, poor appetite', 'Intestinal worms', 'B83.9', [['STOOL', 'Ascaris ova seen']], [['ALBSYR', 1, '10ml', 'Stat', 1]]],
];
const ACUTE_ADULT = [
  ['Fever, headache and joint pains', 'Malaria', 'B54', [['MPS', 'Positive (+)'], ['HB', 12.1]], [['AL2012', 1, '4 tabs', 'BD', 3], ['PCM500', 18, '1g', 'TDS', 3]]],
  ['Sore throat and cough', 'Upper respiratory tract infection', 'J06.9', [], [['AMX500', 15, '500mg', 'TDS', 5], ['CTZ10', 5, '10mg', 'OD', 5]]],
  ['Burning urination', 'Urinary tract infection', 'N39.0', [['URI', 'Leucocytes ++, Nitrites +, Protein trace']], [['CIP500', 10, '500mg', 'BD', 5]]],
  ['Epigastric pain after meals', 'Gastritis', 'K29.7', [['HPY', 'Negative']], [['OMP20', 14, '20mg', 'OD', 14], ['ANTAC', 1, '10ml', 'TDS', 7]]],
  ['Fever for a week, abdominal pain', 'Typhoid fever', 'A01.0', [['TYPHI', 'Positive'], ['WIDAL', 'Positive (O 1:320)']], [['CIP500', 14, '500mg', 'BD', 7], ['PCM500', 18, '1g', 'TDS', 3]]],
  ['Lower back pain', 'Joint pains / arthralgia', 'M25.5', [], [['DICLO50', 10, '50mg', 'BD', 5], ['OMP20', 5, '20mg', 'OD', 5]]],
  ['Cut on the hand', 'Injury / wound', 'T14.9', [], [['FLUC500', 20, '500mg', 'QID', 5], ['PCM500', 10, '1g', 'TDS', 3]]],
  ['Vaginal itching and discharge', 'Sexually transmitted infection', 'A64', [['HVS', 'Yeast cells seen, few pus cells']], [['FLU150', 1, '150mg', 'Stat', 1], ['CLOTPES', 1, '500mg', 'Stat', 1]]],
  ['Tooth ache', 'Dental caries', 'K02.9', [], [['AMX500', 15, '500mg', 'TDS', 5], ['IBU400', 10, '400mg', 'TDS', 3]]],
  ['Red itchy eyes', 'Conjunctivitis', 'H10.9', [], [['CHLORE', 1, '1 drop', 'QID', 5]]],
  ['Tiredness and dizziness', 'Anaemia', 'D64.9', [['HB', 9.2], ['FBC', 'Hb 9.2, MCV 71 (low), PLT 260']], [['FEFOL', 30, '1 tab', 'OD', 30]]],
];

function vitalsFor(ageY, sick) {
  const fever = sick && rnd() < 0.5;
  if (ageY < 5) return { temp: fever ? +between(38, 39.5).toFixed(1) : +between(36.5, 37.4).toFixed(1), pulse: Math.round(between(100, 140)), resp: Math.round(between(26, 40)), spo2: Math.round(between(94, 99)), weight: +(3.5 + ageY * 2.3 + between(0, 2)).toFixed(1), height: Math.round(50 + ageY * 11) };
  if (ageY < 13) return { temp: fever ? +between(38, 39.2).toFixed(1) : +between(36.5, 37.3).toFixed(1), pulse: Math.round(between(80, 115)), resp: Math.round(between(18, 28)), spo2: Math.round(between(96, 99)), weight: +(ageY * 3 + 8 + between(0, 4)).toFixed(1), height: Math.round(80 + ageY * 6) };
  return { temp: fever ? +between(37.9, 39).toFixed(1) : +between(36.3, 37.2).toFixed(1), sys: Math.round(between(108, 132)), dia: Math.round(between(68, 84)), pulse: Math.round(between(64, 98)), resp: Math.round(between(14, 20)), spo2: Math.round(between(96, 99)), weight: +between(52, 90).toFixed(1), height: Math.round(between(155, 182)) };
}

function seedSample(D, cfg) {
  seed = 42;
  const { run, get, all, now, addDays } = D;
  const item = code => get('SELECT * FROM items WHERE code=?', code);
  const test = code => get('SELECT * FROM lab_tests WHERE code=?', code);
  const svc = code => get('SELECT * FROM services WHERE code=?', code);
  const cons = cfg.type === 'pharmacy' ? svc('PCONS') : svc('CONS');

  // ---------- stock: two batches per item (one older, one newer) ----------
  for (const it of all('SELECT * FROM items')) {
    const low = ['SALB', 'AUG625', 'CEFTR1', 'INSMIX', 'GLUSTR', 'MONTE'].includes(it.code);
    const packs1 = low ? 1 : Math.ceil(between(2, 6));
    const packs2 = low ? 0 : Math.ceil(between(4, 12));
    const loose = it.sell_loose && it.pack_size > 1 ? Math.floor(between(0, it.pack_size * 0.8)) : 0;
    const soon = ['AMX500', 'ORS', 'VITC', 'CALPOL', 'COFSYR'].includes(it.code) ? 40 : Math.round(between(150, 300));
    const b1 = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
      it.id, 'B' + (2400 + it.id) + 'A', addDays(now(), soon), packs1 * it.pack_size + loose, it.cost, pick(['Dawa Ltd', 'Harleys Ltd', 'Laborex Kenya']), daysAgo(90)).lastInsertRowid;
    run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, b1, packs1 * it.pack_size + loose, 'receive', 'Opening stock', 'system', daysAgo(90));
    if (packs2) {
      const b2 = run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)',
        it.id, 'B' + (2400 + it.id) + 'B', addDays(now(), Math.round(between(400, 900))), packs2 * it.pack_size, it.cost, pick(['Surgipharm Ltd', 'Phillips Pharmaceuticals', 'KEMSA']), daysAgo(20)).lastInsertRowid;
      run('INSERT INTO stock_moves(item_id,batch_id,qty,type,ref,by_user,created_at) VALUES(?,?,?,?,?,?,?)', it.id, b2, packs2 * it.pack_size, 'receive', 'GRN', 'system', daysAgo(20));
    }
  }
  // one expired batch to show the alert
  const ex = item('VITBCO');
  run('INSERT INTO batches(item_id,batch_no,expiry,qty,cost,supplier,received_at) VALUES(?,?,?,?,?,?,?)', ex.id, 'B0EXP1', addDays(now(), -12), 35, ex.cost, 'Dawa Ltd', daysAgo(400));

  // ---------- patients ----------
  const scripted = [
    ['Wanjiku', 'Kamau', 'F', '1988-03-14', 'Nairobi', 'Penicillin', 'Hypertension'],
    ['Otieno', 'Ochieng', 'M', '1975-07-02', 'Kisumu', '', 'Type 2 diabetes'],
    ['Achieng', 'Atieno', 'F', '1996-11-21', 'Nairobi', '', ''],
    ['Kiprono', 'Cheruiyot', 'M', '2001-01-09', 'Nakuru', '', ''],
    ['Mwende', 'Mutua', 'F', '1999-05-30', 'Machakos', 'Sulfa drugs', ''],
    ['Baraka', 'Njoroge', 'M', '2022-08-17', 'Kiambu', '', ''],
    ['Amina', 'Hassan', 'F', '1992-09-05', 'Mombasa', '', 'Asthma'],
    ['Kevin', 'Mwangi', 'M', '1985-12-12', 'Nairobi', '', ''],
    ['Faith', 'Wambui', 'F', '1994-02-26', 'Murang\'a', '', ''],
    ['Joseph', 'Kariuki', 'M', '1958-06-18', 'Nyeri', '', 'Hypertension, Type 2 diabetes'],
    ['Grace', 'Nyambura', 'F', '2019-04-03', 'Nairobi', '', ''],
    ['Brian', 'Omondi', 'M', '2014-10-22', 'Homa Bay', '', ''],
  ];
  const ids = [];
  const phone = i => ['0712', '0722', '0733', '0745', '0791', '0702', '0110', '0723', '0718', '0727', '0700', '0115', '0768', '0796'][i % 14] + String(482913 + i * 73157).slice(-6);
  const addPatient = (p, i) => {
    const adult = new Date(p[3]).getFullYear() < 2008;
    return run(`INSERT INTO patients(mrn,first_name,last_name,sex,dob,phone,national_id,sha_number,county,allergies,chronic,next_of_kin,sample,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?)`, D.nextMrn(), p[0], p[1], p[2], p[3], phone(i), adult ? String(21000000 + i * 734131 % 9000000) : '',
      rnd() < 0.8 ? 'SHA' + String(5000000 + i * 31337).slice(0, 7) : '', p[4], p[5] || '', p[6] || '',
      `${adult ? pick(['Spouse', 'Sibling', 'Parent']) : 'Parent'} - ${phone(i + 50)}`, daysAgo(200 - i * 4)).lastInsertRowid;
  };
  scripted.forEach((p, i) => ids.push(addPatient(p, i)));
  // generated patients across all ages
  const extra = [];
  const ages = [0.4, 0.9, 1.5, 2, 3, 4, 6, 8, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 37, 40, 44, 48, 52, 57, 63, 68, 72, 76, 81];
  ages.forEach((a, k) => {
    const sex = k % 2 ? 'M' : 'F';
    const dob = new Date(Date.now() - a * 365.25 * 864e5).toISOString().slice(0, 10);
    const chronic = a > 45 ? pick(['Hypertension', 'Type 2 diabetes', '', 'Hypertension', 'Arthritis', '']) : a > 18 && rnd() < 0.15 ? pick(['Asthma', 'Epilepsy', 'HIV - on ART']) : '';
    const allergy = rnd() < 0.12 ? pick(['Penicillin', 'Sulfa drugs', 'Aspirin', 'Peanuts']) : '';
    const p = [sex === 'F' ? pick(FIRST_F) : pick(FIRST_M), pick(LAST), sex, dob, pick(COUNTIES), allergy, chronic];
    extra.push({ id: addPatient(p, 12 + k), age: a, sex, chronic });
  });

  // ---------- history ----------
  const closedVisit = (pid, at, complaint, vit, dx, code, labs = [], rx = [], type = 'OPD') => {
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,triage_level,created_at,closed_at) VALUES(?,?,?,?,?,?,?,?)',
      pid, type, 'closed', 0, complaint, 'queue', at, at).lastInsertRowid;
    const bill = run('INSERT INTO bills(visit_id,patient_id,payer,status,receipt_no,created_at,closed_at) VALUES(?,?,?,?,?,?,?)',
      v, pid, rnd() < 0.3 ? 'sha' : 'cash', 'paid', 'RCT' + String(v).padStart(6, '0'), at, at).lastInsertRowid;
    if (vit) run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,glucose,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      v, pid, vit.temp, vit.sys, vit.dia, vit.pulse, vit.resp, vit.spo2, vit.weight, vit.height, vit.glucose, 'Nurse Jane Akinyi', at);
    if (dx) {
      run('INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        v, pid, complaint, 'Alert, stable.', dx, code, 'Treatment as prescribed. Review if not improving.', 'Dr. Peter Maina', at);
      if (cons.price > 0) line(bill, cons.name, 'consultation', 'services', cons.id, 1, cons.price, at);
    }
    for (const [c, val] of labs) {
      const t = test(c); if (!t) continue;
      const flag = t.kind === 'numeric' ? (val < t.ref_low ? 'L' : val > t.ref_high ? 'H' : 'N') : (t.abnormal_text && String(val).startsWith(t.abnormal_text) ? 'A' : 'N');
      const lo = run(`INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,status,result_value,result_text,flag,resulted_by,validated_by,billed,created_at,resulted_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`, v, pid, t.id, t.outsourced_only ? 'outsourced' : 'inhouse', 'validated',
        t.kind === 'numeric' ? val : null, t.kind === 'numeric' ? null : val, flag, 'Lab Tech Samuel Kibet', 'Dr. Peter Maina', at, at).lastInsertRowid;
      if (!t.outsourced_only) line(bill, t.name, 'lab', 'lab_orders', lo, 1, t.price, at);
    }
    for (const [c, qty, dose, freq, days] of rx) {
      const it = item(c); if (!it) continue;
      const pr = run(`INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,billed,prescriber,created_at,dispensed_at)
        VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`, v, pid, it.id, dose, freq, days, qty, 'dispensed', 'Dr. Peter Maina', at, at).lastInsertRowid;
      line(bill, it.name, 'drug', 'prescriptions', pr, qty, it.price, at);
    }
    const tot = get('SELECT COALESCE(SUM(amount),0) t FROM bill_lines WHERE bill_id=?', bill).t;
    if (tot > 0) run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)',
      bill, rnd() > 0.35 ? 'mpesa' : 'cash', tot, 'S' + Math.floor(rnd() * 1e9).toString(36).toUpperCase().padEnd(9, 'K'), 'Cashier Tom Odhiambo', at);
    return v;
  };
  function line(billId, desc, kind, refTable, refId, qty, price, at) {
    run('INSERT INTO bill_lines(bill_id,description,kind,ref_table,ref_id,qty,unit_price,amount,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      billId, desc, kind, refTable, refId, qty, price, qty * price, 'system', at);
  }

  // chronic patients with trends
  [[150, 98], [146, 94], [141, 92], [136, 88], [132, 86], [128, 84]].forEach(([s, d], i) => closedVisit(ids[0], daysAgo(150 - i * 28), 'Hypertension review',
    { temp: 36.6, sys: s, dia: d, pulse: 82 - i, resp: 16, spo2: 98, weight: 78 - i * 0.6, height: 162 }, 'Essential hypertension', 'I10', i === 2 ? [['CREAT', 78], ['CHOL', 5.6]] : [], [['AML5', 30, '5mg', 'OD', 30]]));
  [[13.2, 9.1], [11.8, 8.6], [10.4, 8.0], [9.1, 7.4], [8.2, 7.1]].forEach(([g, a], i) => closedVisit(ids[1], daysAgo(140 - i * 30), 'Diabetes review',
    { temp: 36.8, sys: 134, dia: 86, pulse: 78, resp: 16, spo2: 98, weight: 92 - i, height: 175, glucose: g }, 'Type 2 diabetes mellitus', 'E11.9',
    i % 2 === 0 ? [['RBS', g], ['HBA1C', a]] : [['RBS', g]], [['MET500', 60, '500mg', 'BD', 30]]));
  [[158, 96, 12.4], [150, 92, 10.9], [144, 90, 9.6]].forEach(([s, d, g], i) => closedVisit(ids[9], daysAgo(100 - i * 35), 'Chronic care review',
    { temp: 36.7, sys: s, dia: d, pulse: 88, resp: 18, spo2: 97, weight: 84, height: 170, glucose: g }, 'Essential hypertension', 'I10', [['RBS', g], ['CREAT', 98 + i * 6]],
    [['LOS50', 30, '50mg', 'OD', 30], ['MET500', 60, '500mg', 'BD', 30]]));
  closedVisit(ids[2], daysAgo(160), 'Fever and headache for 3 days', { temp: 38.6, sys: 112, dia: 72, pulse: 104, resp: 18, spo2: 98, weight: 58, height: 165 },
    'Malaria', 'B54', [['MRDT', 'Positive'], ['HB', 10.9]], [['AL2012', 1, '4 tabs', 'BD', 3], ['PCM500', 18, '1g', 'TDS', 3]]);
  closedVisit(ids[3], daysAgo(8), 'Cough and sore throat', { temp: 37.9, sys: 118, dia: 76, pulse: 92, resp: 18, spo2: 98, weight: 66, height: 178 },
    'Upper respiratory tract infection', 'J06.9', [], [['AMX500', 15, '500mg', 'TDS', 5], ['CTZ10', 5, '10mg', 'OD', 5]]);
  closedVisit(ids[5], daysAgo(6), 'Diarrhoea for 2 days', { temp: 37.4, pulse: 118, resp: 30, spo2: 98, weight: 13.5, height: 92 },
    'Diarrhoea', 'A09', [['STOOL', 'No ova or cysts seen']], [['ORS', 6, '1 sachet', 'After each loose stool', 3], ['ZNC20', 10, '20mg', 'OD', 10]]);
  closedVisit(ids[7], daysAgo(4), 'Burning urination', { temp: 37.2, sys: 124, dia: 80, pulse: 84, resp: 16, spo2: 99, weight: 80, height: 180 },
    'Urinary tract infection', 'N39.0', [['URI', 'Leucocytes ++, Nitrites +']], [['CIP500', 10, '500mg', 'BD', 5]]);
  closedVisit(ids[11], daysAgo(20), 'Abdominal pain', { temp: 36.9, pulse: 80, resp: 18, spo2: 99, weight: 38, height: 148 },
    'Intestinal worms', 'B83.9', [['STOOL', 'Ascaris ova seen']], [['ALB400', 1, '400mg', 'Stat', 1]]);
  closedVisit(ids[6], daysAgo(25), 'Wheezing at night', { temp: 36.8, sys: 116, dia: 74, pulse: 96, resp: 24, spo2: 94, weight: 61, height: 164 },
    'Asthma', 'J45.9', [], [['SALB', 1, '2 puffs', 'PRN', 30], ['PRED5', 15, '30mg', 'OD', 5]]);
  closedVisit(ids[8], daysAgo(10), 'Epigastric pain', { temp: 36.7, sys: 118, dia: 74, pulse: 82, resp: 16, spo2: 99, weight: 71.5, height: 167 },
    'Gastritis', 'K29.7', [['HPY', 'Negative']], [['OMP20', 14, '20mg', 'OD', 14]]);

  // generated patients' visits
  for (const p of extra) {
    const n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const at = daysAgo(Math.floor(between(1, 120)));
      if (p.chronic === 'Hypertension') closedVisit(p.id, at, 'Hypertension review', { ...vitalsFor(p.age, false), sys: Math.round(between(132, 156)), dia: Math.round(between(84, 98)) }, 'Essential hypertension', 'I10', [], [['AML10', 30, '10mg', 'OD', 30]]);
      else if (p.chronic === 'Type 2 diabetes') closedVisit(p.id, at, 'Diabetes review', { ...vitalsFor(p.age, false), glucose: +between(7, 13).toFixed(1) }, 'Type 2 diabetes mellitus', 'E11.9', [['RBS', +between(7, 13).toFixed(1)]], [['MET850', 60, '850mg', 'BD', 30]]);
      else {
        const c = pick(p.age < 13 ? ACUTE_CHILD : ACUTE_ADULT);
        if (c[1] === 'Sexually transmitted infection' && p.sex === 'M') continue;
        closedVisit(p.id, at, c[0], vitalsFor(p.age, true), c[1], c[2], c[3], c[4]);
      }
    }
  }

  // ---------- walk-in counter sales, last 14 days ----------
  const otc = ['PCM500', 'PANEX', 'CTZ10', 'ORS', 'VITC', 'IBU400', 'CONDOM', 'HCCR', 'OMP20', 'COFSYR', 'STREP', 'EC', 'ENO', 'MULTI', 'PLAST', 'PADS', 'CALPOL', 'BENYL', 'DETTOL', 'SANIT'];
  for (let d = 13; d >= 0; d--) {
    const n = 6 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) {
      const at = daysAgo(d, 8 + (k % 12));
      const b = run('INSERT INTO bills(patient_id,customer_name,payer,status,receipt_no,created_at,closed_at) VALUES(NULL,?,?,?,?,?,?)',
        'Walk-in customer', 'cash', 'paid', 'POS' + String(d * 100 + k).padStart(6, '0'), at, at).lastInsertRowid;
      let tot = 0;
      for (let j = 0; j < 1 + (k % 3); j++) {
        const it = item(pick(otc));
        const byPack = it.pack_size > 1 && rnd() < 0.3;
        const qty = it.sell_loose && !byPack ? Math.ceil(between(4, 20)) : 1;
        const price = byPack ? it.pack_price : it.price;
        line(b, it.name + (byPack ? ` (1 ${it.pack_name})` : ''), 'drug', 'items', it.id, qty, price, at);
        tot += qty * price;
      }
      run('INSERT INTO payments(bill_id,method,amount,reference,by_user,created_at) VALUES(?,?,?,?,?,?)',
        b, k % 3 ? 'mpesa' : 'cash', tot, k % 3 ? 'S' + Math.floor(rnd() * 1e9).toString(36).toUpperCase().padEnd(9, 'Q') : '', 'Cashier Tom Odhiambo', at);
    }
  }

  // ---------- today's live queue ----------
  const live = (pid, status, complaint, q, level = 'queue') => {
    const at = new Date(Date.now() - (150 - q * 22) * 60e3).toISOString();
    const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,triage_level,created_at) VALUES(?,?,?,?,?,?,?)', pid, 'OPD', status, q, complaint, level, at).lastInsertRowid;
    run('INSERT INTO bills(visit_id,patient_id,payer,status,created_at) VALUES(?,?,?,?,?)', v, pid, 'cash', 'open', at);
    return v;
  };
  const billOf = v => get('SELECT id FROM bills WHERE visit_id=?', v).id;
  live(ids[4], 'waiting_triage', 'Headache and body aches', 1);
  const kid = extra.find(p => p.age > 1 && p.age < 3);
  live(kid.id, 'waiting_triage', 'High fever and convulsion at home', 2, 'emergency');
  const v2 = live(ids[3], 'waiting_doctor', 'Follow-up: cough not resolving', 3, 'priority');
  run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    v2, ids[3], 37.6, 120, 78, 90, 20, 97, 65.5, 178, 'Nurse Jane Akinyi', new Date(Date.now() - 80 * 60e3).toISOString());
  const v3 = live(ids[7], 'in_lab', 'Fever, chills', 4);
  run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    v3, ids[7], 38.4, 122, 80, 102, 20, 98, 80, 180, 'Nurse Jane Akinyi', new Date(Date.now() - 60 * 60e3).toISOString());
  for (const c of ['MPS', 'HB']) {
    const t = test(c);
    const lo = run('INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,status,billed,created_at) VALUES(?,?,?,?,?,1,?)', v3, ids[7], t.id, 'inhouse', 'ordered', new Date(Date.now() - 50 * 60e3).toISOString()).lastInsertRowid;
    line(billOf(v3), t.name, 'lab', 'lab_orders', lo, 1, t.price, now());
  }
  if (cons.price > 0) line(billOf(v3), cons.name, 'consultation', 'services', cons.id, 1, cons.price, now());
  run("INSERT INTO notes(visit_id,patient_id,history,exam,diagnosis,dx_code,plan,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    v3, ids[7], 'Fever and chills x2 days', 'Febrile, no neck stiffness', 'Malaria', 'B54', 'Await blood slide', 'Dr. Peter Maina', now());
  const v4 = live(ids[1], 'waiting_doctor', 'Returned with outside lab results', 5);
  const tA = test('HBA1C');
  run(`INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,partner,status,result_value,flag,comment,resulted_by,billed,created_at,resulted_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`, v4, ids[1], tA.id, 'outsourced', (cfg.partners || ['Lancet Kenya'])[0], 'resulted', 6.9, 'H',
    'Entered from external lab report', 'Lab Tech Samuel Kibet', daysAgo(2), now());
  if (cfg.procedures) {
    const v5 = live(ids[11], 'billing', 'Male circumcision', 6);
    const s = svc('CIRC');
    const pr = run('INSERT INTO procedures(visit_id,patient_id,service_id,consent,notes,status,billed,by_user,created_at) VALUES(?,?,?,?,?,?,1,?,?)',
      v5, ids[11], s.id, 1, 'Consent signed by parent. Local anaesthesia. Procedure uneventful. Review in 7 days.', 'done', 'Dr. Peter Maina', now()).lastInsertRowid;
    line(billOf(v5), s.name, 'procedure', 'procedures', pr, 1, s.price, now());
    line(billOf(v5), item('CIRCKIT').name, 'drug', 'items', item('CIRCKIT').id, 1, item('CIRCKIT').price, now());
    line(billOf(v5), item('LIDO2').name, 'drug', 'items', item('LIDO2').id, 1, item('LIDO2').price, now());
  }

  // ---------- maternity ----------
  if (cfg.maternity) {
    const lmp = addDays(now(), -7 * 28);
    const preg = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)', ids[8], lmp, addDays(lmp, 280), 2, 1, 'active', daysAgo(150)).lastInsertRowid;
    [[12, null, null, 'Booking visit. Profile tests done.'], [20, 20, 148, 'IPTp dose 1 given'], [24, 24, 144, 'Well'], [26, 26, 142, 'IPTp dose 2 given']].forEach(([w, fh, fhr, note]) => {
      const at = new Date(new Date(lmp).getTime() + w * 7 * 864e5 + 7 * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)', ids[8], 'ANC', 'closed', 0, 'ANC visit', at, at).lastInsertRowid;
      run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)', preg, v, w, fh, fhr, w > 24 ? 'Cephalic' : '', note, at);
      run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,weight,height,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', v, ids[8], 36.7, Math.round(110 + w / 4), 70, 84, +(62 + w * 0.35).toFixed(1), 167, 'Midwife Rose Chebet', at);
      if (w === 12) for (const [c, val] of [['HB', 11.8], ['BGRP', 'O+'], ['VDRL', 'Non-reactive'], ['HIV', 'Non-reactive'], ['URI', 'Normal']]) {
        const t = test(c);
        run(`INSERT INTO lab_orders(visit_id,patient_id,test_id,mode,status,result_value,result_text,flag,resulted_by,validated_by,billed,created_at,resulted_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)`,
          v, ids[8], t.id, 'inhouse', 'validated', typeof val === 'number' ? val : null, typeof val === 'number' ? null : val, typeof val === 'number' && val < 11 ? 'L' : 'N', 'Lab Tech Samuel Kibet', 'Dr. Peter Maina', at, at);
      }
    });
    const lmp2 = addDays(now(), -7 * 39);
    const preg2 = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)', ids[2], lmp2, addDays(lmp2, 280), 1, 0, 'active', daysAgo(200)).lastInsertRowid;
    [[14, null, null], [22, 22, 150], [28, 28, 146], [34, 33, 140], [38, 37, 138]].forEach(([w, fh, fhr]) => {
      const at = new Date(new Date(lmp2).getTime() + w * 7 * 864e5 + 7 * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at,closed_at) VALUES(?,?,?,?,?,?,?)', ids[2], 'ANC', 'closed', 0, 'ANC visit', at, at).lastInsertRowid;
      run('INSERT INTO anc_visits(pregnancy_id,visit_id,gest_weeks,fundal_height,fhr,presentation,notes,created_at) VALUES(?,?,?,?,?,?,?,?)', preg2, v, w, fh, fhr, w > 30 ? 'Cephalic' : '', 'Normal', at);
    });
    // a recent delivery
    const mum = extra.find(p => p.sex === 'F' && p.age > 20 && p.age < 35);
    const lmp3 = addDays(now(), -7 * 41);
    const p3 = run('INSERT INTO pregnancies(patient_id,lmp,edd,gravida,parity,status,created_at) VALUES(?,?,?,?,?,?,?)', mum.id, lmp3, addDays(lmp3, 280), 3, 2, 'delivered', daysAgo(260)).lastInsertRowid;
    run(`INSERT INTO deliveries(pregnancy_id,patient_id,delivered_at,mode,outcome,baby_sex,baby_weight,apgar1,apgar5,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      p3, mum.id, daysAgo(5, 4), 'Spontaneous vaginal delivery', 'Live birth', 'F', 3.2, 8, 10, 'AMTSL done, oxytocin 10 IU IM. Blood loss ~250ml.');
  }
  if (cfg.admissions) {
    const admit = (pid, reason, wardName, hoursAgo, payer = 'sha') => {
      const at = new Date(Date.now() - hoursAgo * 3600e3).toISOString();
      const v = run('INSERT INTO visits(patient_id,type,status,queue_no,complaint,created_at) VALUES(?,?,?,?,?,?)', pid, 'IPD', 'admitted', 0, reason, at).lastInsertRowid;
      const bill = run('INSERT INTO bills(visit_id,patient_id,payer,status,created_at) VALUES(?,?,?,?,?)', v, pid, payer, 'open', at).lastInsertRowid;
      const bed = get(`SELECT b.id, w.daily_rate, w.name FROM beds b JOIN wards w ON w.id=b.ward_id WHERE w.name LIKE ? AND b.id NOT IN
        (SELECT bed_id FROM admissions WHERE status='admitted') ORDER BY b.id LIMIT 1`, wardName + '%') || get(`SELECT b.id, w.daily_rate, w.name FROM beds b JOIN wards w ON w.id=b.ward_id WHERE b.id NOT IN (SELECT bed_id FROM admissions WHERE status='admitted') LIMIT 1`);
      const a = run('INSERT INTO admissions(patient_id,visit_id,bed_id,reason,status,admitted_at,last_charged) VALUES(?,?,?,?,?,?,?)', pid, v, bed.id, reason, 'admitted', at, at.slice(0, 10)).lastInsertRowid;
      line(bill, `Bed day - ${bed.name}`, 'bed', 'admissions', a, 1, bed.daily_rate, at);
      const adm = svc('ADMFEE'); if (adm) line(bill, adm.name, 'bed', 'services', adm.id, 1, adm.price, at);
      run('INSERT INTO nursing_notes(admission_id,note,by_user,created_at) VALUES(?,?,?,?)', a, 'Admitted, stable. Vitals taken, IV line in situ.', 'Nurse Jane Akinyi', at);
      return { v, a, bill };
    };
    const labour = cfg.maternity ? admit(ids[2], 'Labour - 39 weeks, G1P0', 'Maternity', 6) : null;
    const pn = admit(ids[10], 'Severe pneumonia - IV antibiotics', 'Paediatric', 30);
    run('INSERT INTO vitals(visit_id,patient_id,temp,pulse,resp,spo2,weight,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', pn.v, ids[10], 38.2, 120, 30, 94, 21, 'Nurse Jane Akinyi', daysAgo(0, 6));
    const cef = item('CEFTR1');
    const prx = run(`INSERT INTO prescriptions(visit_id,patient_id,item_id,dose,frequency,days,qty,status,billed,prescriber,created_at,dispensed_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`,
      pn.v, ids[10], cef.id, '1g IV', 'OD', 5, 2, 'dispensed', 'Dr. Peter Maina', daysAgo(1), daysAgo(1)).lastInsertRowid;
    line(pn.bill, cef.name, 'drug', 'prescriptions', prx, 2, cef.price, daysAgo(1));
    if (labour) {
      [[4, 140, 3], [5, 138, 3], [6, 142, 4], [7, 136, 4]].forEach(([cm, fhr, ctx], i) => run(
        'INSERT INTO partograph(admission_id,at,dilation,fhr,contractions,descent,sys,dia,by_user) VALUES(?,?,?,?,?,?,?,?,?)',
        labour.a, new Date(Date.now() - (5 - i) * 3600e3).toISOString(), cm, fhr, ctx, 4 - i, 118, 76, 'Midwife Rose Chebet'));
      run('INSERT INTO vitals(visit_id,patient_id,temp,sys,dia,pulse,resp,spo2,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', labour.v, ids[2], 36.9, 118, 76, 88, 18, 99, 'Midwife Rose Chebet', daysAgo(0, 7));
    }
    admit(ids[9], 'Uncontrolled hypertension - observation', 'General', 50, 'cash');
  }

  // ---------- referrals, appointments, web orders ----------
  run('INSERT INTO referrals(patient_id,visit_id,direction,facility,reason,summary,urgency,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    ids[9], null, 'out', 'Kenyatta National Hospital', 'Specialist review - diabetic nephropathy screening',
    'Known HTN + T2DM. BP 144/90, RBS 9.6, creatinine rising. On losartan and metformin.', 'routine', 'sent', 'Dr. Peter Maina', daysAgo(30));
  run('INSERT INTO referrals(patient_id,visit_id,direction,facility,reason,summary,urgency,status,by_user,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    extra[3].id, null, 'in', 'Mbagathi County Hospital', 'Follow-up after discharge', 'Treated for pneumonia, completed IV antibiotics.', 'routine', 'received', 'Mary Wairimu', daysAgo(12));
  const ap = (pid, name, ph, service, day, time, source) => run('INSERT INTO appointments(patient_id,name,phone,service,date,time,source,status,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    pid, name, ph, service, addDays(now(), day), time, source, 'booked', source === 'web' ? 'Booked via website' : '', daysAgo(3));
  ap(ids[0], 'Wanjiku Kamau', phone(0), 'Hypertension review', 0, '11:00', 'desk');
  ap(null, 'Daniel Kiptoo', '0798765432', cfg.maternity ? 'Antenatal clinic visit' : 'Lab test: Random blood sugar', 1, '09:30', 'web');
  ap(ids[1], 'Otieno Ochieng', phone(1), 'Diabetes review', 3, '10:00', 'desk');
  ap(null, 'Lucy Wangari', '0711456789', 'Outpatient consultation', 2, '14:30', 'web');
  const wo = (name, ph, lines, status, note) => {
    const items = lines.map(([code, qty]) => { const it = item(code); return { id: it.id, name: it.name, qty, price: it.price, rx_only: !!it.rx_only, unit: it.unit }; });
    run('INSERT INTO web_orders(name,phone,items,total,delivery,prescription_note,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
      name, ph, JSON.stringify(items), items.reduce((a, l) => a + l.qty * l.price, 0), 'pickup', note, status, daysAgo(0, 7));
  };
  wo('Esther Muthoni', '0711222333', [['VITC', 30], ['ORS', 5], ['THERM', 1]], 'new', '');
  wo('Peter Gachanja', '0722888999', [['AMX500', 15], ['PCM500', 18]], 'awaiting_review', 'Dr. Njoroge, Mama Lucy Hospital, Rx 18832, 29 Oct');
}

module.exports = { seedSample };
