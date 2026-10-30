import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Badge, FlagBadge, StatusBadge, TriageBadge, TRIAGE, Modal, Field, Tabs, act, age, ageYears, fmtDT, fmtTime, money, fmtQty, Empty, Icon } from '../ui';
import { HealthBar, VITAL_RANGES } from './PatientView';
import { ReferralForm } from './Referrals';
import { ResultEntry, DEPT_COLOR } from './Lab';
import ProductArt from '../shared/ProductArt';

// Common outpatient diagnoses mapped to MOH 705 lines (ICD-10 codes; ICD-11 mapping to follow DHA guidance)
export const DIAGNOSES = [
  ['Malaria', 'B54'], ['Upper respiratory tract infection', 'J06.9'], ['Pneumonia', 'J18.9'], ['Diarrhoea', 'A09'],
  ['Urinary tract infection', 'N39.0'], ['Essential hypertension', 'I10'], ['Type 2 diabetes mellitus', 'E11.9'],
  ['Typhoid fever', 'A01.0'], ['Intestinal worms', 'B83.9'], ['Gastritis', 'K29.7'], ['Asthma', 'J45.9'],
  ['Skin infection / dermatitis', 'L30.9'], ['Otitis media', 'H66.9'], ['Conjunctivitis', 'H10.9'], ['Joint pains / arthralgia', 'M25.5'],
  ['Dental caries', 'K02.9'], ['Injury / wound', 'T14.9'], ['Anaemia', 'D64.9'], ['Sexually transmitted infection', 'A64'],
  ['Tuberculosis (presumptive)', 'A16.9'], ['Brucellosis', 'A23.9'], ['Mental disorder', 'F99'], ['Epilepsy', 'G40.9'],
  ['Supervision of normal pregnancy', 'Z34.9'], ['Family planning', 'Z30.9'], ['Circumcision (routine)', 'Z41.2'], ['Other', 'R69'],
];
const FREQ = [['OD', 1, 'once a day'], ['BD', 2, 'twice a day'], ['TDS', 3, 'three times a day'], ['QID', 4, 'four times a day'], ['Nocte', 1, 'at night'], ['PRN', 1, 'when needed'], ['Stat', 1, 'single dose now']];
const DANGER = ['Obstructed breathing', 'Severe respiratory distress', 'Central cyanosis', 'Signs of shock (cold hands, weak fast pulse)', 'Coma / unconscious', 'Convulsing now', 'Severe dehydration', 'Heavy bleeding'];
const PRIORITY_SIGNS = ['Very high fever (≥39°C)', 'Severe pain', 'Severe pallor', 'Infant under 2 months', 'Trauma / major injury', 'Pregnant with danger signs', 'Restless or very irritable', 'Referred urgently'];

export default function Visit({ id }) {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/visits/' + id, [id]);
  const [tab, setTab] = useState(null);
  const [admit, setAdmit] = useState(false);
  const [refer, setRefer] = useState(false);
  if (!d) return <div className="page">Loading…</div>;
  const { visit: v, patient: p } = d;
  const role = c.user.role;
  const defTab = tab || (v.status === 'waiting_triage' ? 'triage' : role === 'lab' ? 'results' : v.status === 'pharmacy' && role === 'pharmacist' ? 'orders' : c.consultation === false ? 'orders' : 'consult');
  const isChild = ageYears(p.dob) < 13;
  const vt = d.vitals[0];
  const move = async status => { await act(() => api.put(`/visits/${v.id}/status`, { status }), 'Patient sent on'); reload(); };
  const closed = v.status === 'closed';

  return (
    <div className="page">
      <a href="#/queue" className="back">← Queue</a>
      <div className="pagehead">
        <span className="avatar" style={{ width: 50, height: 50, fontSize: 17, background: p.sex === 'F' ? '#fce7f3' : '#e0f2fe', color: p.sex === 'F' ? '#9d174d' : '#075985' }}>{p.first_name[0]}{p.last_name[0]}</span>
        <div>
          <h1>{p.first_name} {p.last_name} <span className="faint" style={{ fontWeight: 400, fontSize: 15 }}>#{v.queue_no || '-'} · {v.type}</span></h1>
          <div className="row sub"><span>{p.mrn}</span><span>·</span><span>{p.sex === 'F' ? 'Female' : 'Male'}, {age(p.dob)}</span><span>·</span><span>Arrived {fmtTime(v.created_at)}</span>
            <TriageBadge level={v.triage_level} /><StatusBadge s={v.status} /><a href={'#/patients/' + p.id}>Patient dashboard →</a></div>
        </div>
        <div className="actions">
          {!closed && v.status !== 'admitted' && <>
            {c.lab !== 'none' && v.status !== 'in_lab' && <button onClick={() => move('in_lab')}>Send to lab</button>}
            {v.status !== 'pharmacy' && <button onClick={() => move('pharmacy')}>Send to pharmacy</button>}
            {v.status !== 'billing' && <button onClick={() => move('billing')}>Send to cashier</button>}
            {c.admissions && <button onClick={() => setAdmit(true)}>Admit</button>}
            <button onClick={() => setRefer(true)}>Refer</button>
          </>}
          {d.bill && <button className="primary" onClick={() => (window.location.hash = '#/billing/' + d.bill.id)}><Icon name="billing" size={15} />Bill · {money(d.bill.balance)}</button>}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {p.allergies ? <div className="alert bad"><b>Allergies:</b> {p.allergies}</div> : <div className="alert good">No known allergies</div>}
        {p.chronic && <div className="alert info"><b>Chronic:</b> {p.chronic}</div>}
        {v.complaint && <div className="alert warn"><b>Complaint:</b> {v.complaint}{v.pain != null && ` · pain ${v.pain}/10`}</div>}
        {d.admission && <div className="alert info"><b>Admitted</b> to {d.admission.ward}, bed {d.admission.bed}</div>}
        {closed && <div className="alert good"><b>Visit closed</b> {fmtDT(v.closed_at)}</div>}
      </div>

      <div className="grid g-side">
        <div>
          <Tabs value={defTab} onChange={setTab} tabs={[
            c.consultation !== false && ['triage', 'Triage & vitals'], c.consultation !== false && ['consult', 'Consultation'],
            ['orders', 'Orders & prescriptions'], ['results', `Results (${d.labs.length + d.imaging.length})`], c.procedures && ['procedures', 'Procedures']]} />
          {defTab === 'triage' && <Triage v={v} isChild={isChild} reload={reload} vitals={d.vitals} />}
          {defTab === 'consult' && <Consult v={v} notes={d.notes} reload={reload} onNext={() => setTab('orders')} />}
          {defTab === 'orders' && <Orders v={v} d={d} reload={reload} />}
          {defTab === 'results' && <Results d={d} reload={reload} />}
          {defTab === 'procedures' && <Procedures v={v} d={d} reload={reload} />}
        </div>
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h3>Vitals</h3><span className="right faint small">{vt ? fmtTime(vt.created_at) + ' · ' + vt.recorded_by : 'not taken'}</span></div>
            {vt ? Object.entries(VITAL_RANGES).filter(([k]) => !(isChild && ['sys', 'dia', 'pulse', 'resp', 'bmi'].includes(k))).map(([k, r]) =>
              <HealthBar key={k} r={r} v={k === 'bmi' ? (vt.weight && vt.height ? vt.weight / Math.pow(vt.height / 100, 2) : null) : vt[k]} />)
              : <Empty icon="thermo">No vitals yet. Record them in Triage.</Empty>}
            {vt?.weight && <p className="small muted">Weight {vt.weight} kg{vt.height ? ` · height ${vt.height} cm` : ''}{vt.muac ? ` · MUAC ${vt.muac} cm` : ''}{isChild && vt.pulse ? ` · pulse ${vt.pulse}, RR ${vt.resp || '-'}` : ''}</p>}
          </div>
          {d.bill && <div className="card">
            <div className="cardhead"><h3>Bill</h3><span className="right"><StatusBadge s={d.bill.status} /></span></div>
            {d.bill.lines.length ? <table className="table small"><tbody>
              {d.bill.lines.map(l => <tr key={l.id}><td>{l.description}{l.qty !== 1 && <span className="faint"> × {l.qty}</span>}</td><td className="num">{money(l.amount)}</td></tr>)}
              <tr><td><b>Total</b></td><td className="num"><b>{money(d.bill.total)}</b></td></tr>
              <tr><td>Paid</td><td className="num">{money(d.bill.paid)}</td></tr>
              <tr><td><b>Balance</b></td><td className="num"><b>{money(d.bill.balance)}</b></td></tr>
            </tbody></table> : <Empty icon="billing">{c.billing_mode === 'manual' ? 'Manual billing: the cashier adds charges at checkout.' : 'No charges yet.'}</Empty>}
            <p className="faint small">{c.billing_mode === 'auto' ? 'Automatic billing: charges appear as services are given.' : 'Manual billing is on.'}</p>
          </div>}
          {d.referrals.length > 0 && <div className="card"><h3>Referrals</h3>{d.referrals.map(r => <div key={r.id} className="small"><b>{r.facility}</b> · {r.reason}</div>)}</div>}
        </div>
      </div>
      {admit && <AdmitModal v={v} onClose={() => setAdmit(false)} onDone={() => { setAdmit(false); reload(); }} />}
      {refer && <ReferralForm patient={p} visitId={v.id} onClose={() => setRefer(false)} onSaved={() => { setRefer(false); reload(); }} />}
    </div>
  );
}

function Triage({ v, isChild, reload, vitals }) {
  const [f, setF] = useState({ triage_level: v.triage_level || 'queue', pain: v.pain ?? '', complaint: v.complaint || '' });
  const [signs, setSigns] = useState([]);
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const toggle = (s, level) => {
    const next = signs.includes(s) ? signs.filter(x => x !== s) : [...signs, s];
    setSigns(next);
    const lvl = next.some(x => DANGER.includes(x)) ? 'emergency' : next.some(x => PRIORITY_SIGNS.includes(x)) ? 'priority' : f.triage_level === 'emergency' || f.triage_level === 'priority' ? f.triage_level : 'queue';
    set('triage_level', lvl);
  };
  const save = async () => {
    await act(() => api.post(`/visits/${v.id}/vitals`, { ...f, complaint: [f.complaint, signs.length ? `Signs: ${signs.join(', ')}` : ''].filter(Boolean).join('. ') }), 'Triage saved');
    setF(x => ({ triage_level: x.triage_level, pain: x.pain, complaint: x.complaint })); setSigns([]); reload();
  };
  const n = (k, label, step = 1, ph) => <Field label={label}><input type="number" step={step} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></Field>;
  const bmi = f.weight && f.height && !isChild ? (f.weight / Math.pow(f.height / 100, 2)).toFixed(1) : null;
  return (
    <div className="stack">
      <div className="card">
        <h3>1. Check for danger signs</h3>
        <p className="muted small" style={{ marginBottom: 10 }}>Tick what you see. The triage level is set for you (Kenya ETAT+). You can still change it.</p>
        <div className="grid g2" style={{ gap: 6 }}>
          <div className="stack" style={{ gap: 4 }}><b className="small" style={{ color: 'var(--bad)' }}>Emergency signs</b>{DANGER.map(s => <label key={s} className="check small"><input type="checkbox" checked={signs.includes(s)} onChange={() => toggle(s)} />{s}</label>)}</div>
          <div className="stack" style={{ gap: 4 }}><b className="small" style={{ color: 'var(--warn)' }}>Priority signs</b>{PRIORITY_SIGNS.map(s => <label key={s} className="check small"><input type="checkbox" checked={signs.includes(s)} onChange={() => toggle(s)} />{s}</label>)}</div>
        </div>
        <div className="row mt">{Object.entries(TRIAGE).map(([k, [l, tone, desc]]) =>
          <button key={k} type="button" className={'choice' + (f.triage_level === k ? ' on' : '')} style={{ width: 'auto', flex: 1, padding: 10, borderColor: f.triage_level === k ? `var(--${tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'bad'})` : null }} onClick={() => set('triage_level', k)}>
            <b style={{ color: `var(--${tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'bad'})` }}>{l}</b><span className="small muted">{desc}</span></button>)}</div>
      </div>
      <div className="card">
        <h3>2. Complaint and vital signs</h3>
        <div className="fields">
          <Field label="Main complaint" span={3}><input value={f.complaint} onChange={e => set('complaint', e.target.value)} /></Field>
          <Field label={`Pain score: ${f.pain === '' ? '-' : f.pain}/10`}><input type="range" min="0" max="10" value={f.pain === '' ? 0 : f.pain} onChange={e => set('pain', e.target.value)} /></Field>
          {n('temp', 'Temperature (°C)', 0.1, '36.5')}
          {!isChild && n('sys', 'BP systolic (mmHg)', 1, '120')}{!isChild && n('dia', 'BP diastolic (mmHg)', 1, '80')}
          {n('pulse', 'Pulse (beats/min)')}{n('resp', 'Respiratory rate (/min)')}{n('spo2', 'SpO₂ (%)')}
          {n('weight', 'Weight (kg)', 0.1)}{n('height', 'Height / length (cm)')}
          {n('glucose', 'Blood glucose (mmol/L)', 0.1)}{isChild && n('muac', 'MUAC (cm)', 0.1, '13.5')}
        </div>
        <div className="row mt">
          {bmi && <Badge tone={bmi < 18.5 || bmi >= 30 ? 'bad' : bmi >= 25 ? 'warn' : 'good'}>BMI {bmi}</Badge>}
          {isChild && f.muac && <Badge tone={f.muac < 11.5 ? 'bad' : f.muac < 12.5 ? 'warn' : 'good'}>MUAC {f.muac < 11.5 ? 'severe malnutrition' : f.muac < 12.5 ? 'moderate malnutrition' : 'normal'}</Badge>}
          {f.temp >= 37.5 && <Badge tone={f.temp >= 39 ? 'bad' : 'warn'}>Fever</Badge>}
          {f.sys >= 140 && <Badge tone={f.sys >= 180 ? 'bad' : 'warn'}>High BP</Badge>}
          {f.spo2 && f.spo2 < 92 && <Badge tone="bad">Low oxygen: give O₂</Badge>}
        </div>
        <div className="row mt"><button className="primary" onClick={save}><Icon name="check" size={15} />Save triage{v.status === 'waiting_triage' && ' and send to clinician'}</button></div>
      </div>
      {vitals.length > 0 && <div className="tablewrap"><table className="table small"><thead><tr><th>Time</th><th>T °C</th><th>BP</th><th>Pulse</th><th>RR</th><th>SpO₂</th><th>Wt</th><th>By</th></tr></thead>
        <tbody>{vitals.map(x => <tr key={x.id}><td>{fmtTime(x.created_at)}</td><td>{x.temp ?? '-'}</td><td>{x.sys ? `${x.sys}/${x.dia}` : '-'}</td><td>{x.pulse ?? '-'}</td><td>{x.resp ?? '-'}</td><td>{x.spo2 ?? '-'}</td><td>{x.weight ?? '-'}</td><td className="faint">{x.recorded_by}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

function Consult({ v, notes, reload, onNext }) {
  const [f, setF] = useState({ diagnosis: '', dx_code: '' });
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const save = async () => { await act(() => api.post(`/visits/${v.id}/note`, f), 'Consultation saved'); setF({ diagnosis: '', dx_code: '' }); reload(); };
  return (
    <div className="stack">
      <div className="card">
        <h3>Clinical note</h3>
        <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="History / presenting complaint"><textarea value={f.history || ''} onChange={e => set('history', e.target.value)} placeholder={v.complaint || 'Onset, duration, associated symptoms'} /></Field>
          <Field label="Examination findings"><textarea value={f.exam || ''} onChange={e => set('exam', e.target.value)} placeholder="General exam, systems" /></Field>
          <Field label="Diagnosis">
            <select value={f.diagnosis} onChange={e => { const x = DIAGNOSES.find(dd => dd[0] === e.target.value); setF(o => ({ ...o, diagnosis: e.target.value, dx_code: x ? x[1] : '' })); }}>
              <option value="">Select diagnosis…</option>{DIAGNOSES.map(([nm, code]) => <option key={nm} value={nm}>{nm} ({code})</option>)}
            </select>
          </Field>
          <Field label="ICD-10 code"><input value={f.dx_code} onChange={e => set('dx_code', e.target.value)} /></Field>
          <Field label="Plan" span={2}><textarea value={f.plan || ''} onChange={e => set('plan', e.target.value)} placeholder="Investigations, treatment, advice, review date" /></Field>
        </div>
        <div className="row mt"><button className="primary" onClick={save}><Icon name="check" size={15} />Save note</button><button onClick={onNext}>Next: orders & prescription →</button></div>
      </div>
      {notes.map(n => <div key={n.id} className="card small">
        <div className="row"><b>{n.diagnosis || 'No diagnosis'}</b>{n.dx_code && <Badge>{n.dx_code}</Badge>}<span className="right faint">{fmtDT(n.created_at)} · {n.by_user}</span></div>
        {n.history && <p className="mt"><span className="muted">History:</span> {n.history}</p>}
        {n.exam && <p><span className="muted">Exam:</span> {n.exam}</p>}
        {n.plan && <p><span className="muted">Plan:</span> {n.plan}</p>}
      </div>)}
    </div>
  );
}

// Lab test picker grouped by department, with quick panels
export function TestPicker({ tests, panels, selected, setSelected, outsideAll }) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('Common');
  const COMMON = ['MPS', 'MRDT', 'HB', 'FBC', 'RBS', 'URI', 'HCG', 'WIDAL', 'TYPHI', 'HPY', 'STOOL', 'HIV', 'VDRL', 'BGRP', 'CREAT', 'HBA1C'];
  const depts = ['Common', 'All', ...new Set(tests.map(t => t.dept))];
  const shown = tests.filter(t => (q ? true : dept === 'All' || (dept === 'Common' ? COMMON.includes(t.code) || selected.includes(t.id) : t.dept === dept)) && t.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return <div className="stack">
    {panels?.length > 0 && <div className="row"><span className="small muted">Quick panels:</span>{panels.map(p => <button key={p.id} className="sm panel-chip" onClick={() => {
      const ids = tests.filter(t => p.codes.includes(t.code)).map(t => t.id);
      setSelected(s => [...new Set([...s, ...ids])]);
    }}>+ {p.name}</button>)}</div>}
    <div className="row">
      <input placeholder="Search all tests" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 260 }} />
      <div className="row" style={{ gap: 4 }}>{depts.map(dp => <button key={dp} className={'sm' + (dept === dp ? ' primary' : '')} style={dept === dp && DEPT_COLOR[dp] ? { background: DEPT_COLOR[dp], borderColor: DEPT_COLOR[dp] } : null} onClick={() => setDept(dp)}>{dp}</button>)}</div>
    </div>
    <div className="tgrid">{shown.map(t => <button type="button" key={t.id} className={'tcard' + (selected.includes(t.id) ? ' on' : '')} style={{ '--dc': DEPT_COLOR[t.dept] }} onClick={() => toggle(t.id)}>
      <span className="tick">{selected.includes(t.id) && <Icon name="check" size={13} />}</span>
      <span style={{ flex: 1 }}><b>{t.name}</b><span className="small faint">{t.sample} · {t.tat}</span></span>
      <span className="small" style={{ textAlign: 'right' }}>{t.outsourced_only || outsideAll ? <Badge tone="info">outside</Badge> : <b style={{ color: 'var(--brand)' }}>{money(t.price)}</b>}</span>
    </button>)}</div>
  </div>;
}

function Orders({ v, d, reload }) {
  const c = useContext(ConfigContext);
  const [cat] = useData('/catalogue');
  const [tests, setTests] = useState([]);
  const [labMode, setLabMode] = useState(c.lab === 'outsourced' ? 'outsourced' : 'inhouse');
  const [partner, setPartner] = useState((c.partners || [])[0] || '');
  const [img, setImg] = useState({});
  const [rx, setRx] = useState([]);
  const [drugQ, setDrugQ] = useState('');
  if (!cat) return <div className="card">Loading catalogue…</div>;
  const drugs = cat.items.filter(i => i.category === 'drug' || i.form === 'device');
  const orderLabs = async () => {
    await act(() => api.post(`/visits/${v.id}/lab-orders`, { test_ids: tests, mode: labMode, partner }), labMode === 'outsourced' ? 'Requisition created for outside lab' : 'Lab tests ordered');
    setTests([]); reload();
  };
  const orderImg = async () => { await act(() => api.post(`/visits/${v.id}/imaging-orders`, img), 'Imaging requested'); setImg({}); reload(); };
  const addRx = it => {
    const loose = ['tab', 'cap'].includes(it.unit);
    setRx(r => [...r, { item: it, item_id: it.id, dose: it.strength || '', per: 1, frequency: loose ? 'TDS' : 'Stat', days: loose ? 5 : 1, qty: loose ? 15 : 1 }]);
    setDrugQ('');
  };
  const setRow = (i, k, val) => setRx(r => r.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, [k]: val };
    if (['frequency', 'days', 'per'].includes(k) && ['tab', 'cap'].includes(n.item.unit)) {
      const f = FREQ.find(ff => ff[0] === n.frequency)?.[1] || 1;
      n.qty = n.frequency === 'Stat' ? Number(n.per) || 1 : Math.ceil((Number(n.per) || 1) * f * (Number(n.days) || 1));
    }
    return n;
  }));
  const saveRx = async () => {
    await act(() => api.post(`/visits/${v.id}/prescriptions`, { items: rx.map(r => ({ item_id: r.item_id, dose: r.dose + (r.per > 1 ? ` (${r.per} ${r.item.unit}s)` : ''), frequency: r.frequency, days: Number(r.days), qty: Number(r.qty) })) }), 'Prescription sent to pharmacy');
    setRx([]); reload();
  };
  const allergy = (d.patient.allergies || '').toLowerCase();
  const matches = drugQ.length > 1 ? drugs.filter(i => (i.name + ' ' + (i.grp || '')).toLowerCase().includes(drugQ.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="stack">
      {c.lab !== 'none' && <div className="card">
        <div className="cardhead"><h3>Laboratory tests</h3>
          {c.lab === 'both' && <div className="row right">
            <div className="seg"><button className={labMode === 'inhouse' ? 'on' : ''} onClick={() => setLabMode('inhouse')}>Our lab</button><button className={labMode === 'outsourced' ? 'on' : ''} onClick={() => setLabMode('outsourced')}>Outside lab</button></div>
            {labMode === 'outsourced' && <select value={partner} onChange={e => setPartner(e.target.value)} style={{ width: 'auto' }}>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select>}
          </div>}
          {c.lab === 'outsourced' && <select className="right" value={partner} onChange={e => setPartner(e.target.value)} style={{ width: 'auto' }}>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select>}
        </div>
        <TestPicker tests={cat.tests} panels={cat.panels} selected={tests} setSelected={setTests} outsideAll={labMode === 'outsourced'} />
        <div className="row mt"><button className="primary" disabled={!tests.length} onClick={orderLabs}>Order {tests.length || ''} test{tests.length === 1 ? '' : 's'}{tests.length ? ` · ${money(cat.tests.filter(t => tests.includes(t.id) && !t.outsourced_only && labMode === 'inhouse').reduce((a, t) => a + t.price, 0))}` : ''}</button>
          <span className="faint small">Outside-lab tests print a requisition; the patient pays the partner lab directly.</span></div>
      </div>}

      {c.imaging !== 'none' && <div className="card">
        <h3>Imaging {c.imaging === 'outsourced' && <Badge tone="info">sent out</Badge>}</h3>
        <div className="fields">
          <Field label="Study"><select value={img.study_id || ''} onChange={e => setImg({ ...img, study_id: Number(e.target.value) })}><option value="">Select…</option>
            {[...new Set(cat.imaging.map(s => s.modality))].map(m => <optgroup key={m} label={m}>{cat.imaging.filter(s => s.modality === m).map(s => <option key={s.id} value={s.id}>{s.name}{c.imaging === 'inhouse' ? ` · ${money(s.price)}` : ''}</option>)}</optgroup>)}</select></Field>
          {c.imaging === 'outsourced' && <Field label="Imaging centre"><select value={img.partner || ''} onChange={e => setImg({ ...img, partner: e.target.value })}><option value="">Default</option>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select></Field>}
          <Field label="Clinical notes" span={2}><input value={img.notes || ''} onChange={e => setImg({ ...img, notes: e.target.value })} placeholder="Why is the scan needed?" /></Field>
        </div>
        <div className="row mt"><button disabled={!img.study_id} onClick={orderImg}>Request imaging</button></div>
      </div>}

      <div className="card">
        <div className="cardhead"><h3>Prescription</h3><span className="faint small">Quantity is worked out from dose × frequency × days. The pharmacy sees exact pieces, not boxes.</span></div>
        <div style={{ position: 'relative' }}>
          <input value={drugQ} onChange={e => setDrugQ(e.target.value)} placeholder="Search medicine by name or group, e.g. amoxicillin, antimalarial" />
          {matches.length > 0 && <div className="dropdown">{matches.map(it => <button key={it.id} type="button" className="dd-item" disabled={it.stock <= 0} onClick={() => addRx(it)}>
            <ProductArt item={it} size={38} rounded={8} /><span style={{ flex: 1 }}><b>{it.name}</b><span className="faint small" style={{ display: 'block' }}>{it.grp} · {money(it.price)} per {it.unit}</span></span>
            <Badge tone={it.stock <= 0 ? 'bad' : it.stock <= it.reorder_level ? 'warn' : 'good'}>{it.stock <= 0 ? 'out of stock' : it.stock_text}</Badge></button>)}</div>}
        </div>
        {rx.map((r, i) => {
          const warn = allergy && allergy.split(/[ ,]+/).some(a => a.length > 3 && (r.item.name + ' ' + r.item.grp).toLowerCase().includes(a.slice(0, 5)));
          const loose = ['tab', 'cap'].includes(r.item.unit);
          return <div key={i} className="card" style={{ marginTop: 10, padding: 12, boxShadow: 'none', background: '#fafbfc' }}>
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <ProductArt item={r.item} size={56} rounded={10} />
              <div style={{ flex: 1 }}>
                <div className="row"><b>{r.item.name}</b>{r.item.controlled ? <Badge tone="bad">Controlled</Badge> : null}<button className="ghost sm right" onClick={() => setRx(x => x.filter((_, j) => j !== i))} aria-label="Remove">✕</button></div>
                <div className="fields mt" style={{ gridTemplateColumns: loose ? '1fr 90px 1.3fr 80px 90px' : '1fr 1.3fr 80px 90px', alignItems: 'end' }}>
                  <Field label="Dose"><input value={r.dose} onChange={e => setRow(i, 'dose', e.target.value)} placeholder="e.g. 500mg" /></Field>
                  {loose && <Field label={`${r.item.unit}s / dose`}><input type="number" min="0.5" step="0.5" value={r.per} onChange={e => setRow(i, 'per', e.target.value)} /></Field>}
                  <Field label="How often"><select value={r.frequency} onChange={e => setRow(i, 'frequency', e.target.value)}>{FREQ.map(f => <option key={f[0]} value={f[0]}>{f[0]} · {f[2]}</option>)}</select></Field>
                  <Field label="Days"><input type="number" min="1" value={r.days} onChange={e => setRow(i, 'days', e.target.value)} /></Field>
                  <Field label={`Qty (${r.item.unit}s)`}><input type="number" min="1" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} /></Field>
                </div>
                <div className="small muted mt">= {fmtQty(r.item, Number(r.qty))} · {money(r.qty * r.item.price)} · {r.item.stock < r.qty ? <b style={{ color: 'var(--bad)' }}>only {r.item.stock_text} in stock</b> : <span>{r.item.stock_text} in stock</span>}</div>
              </div>
            </div>
            {warn && <div className="alert bad small mt">Possible allergy conflict: the patient is allergic to {d.patient.allergies}.</div>}
          </div>;
        })}
        {rx.length > 0 && <div className="row mt"><button className="primary" onClick={saveRx}>Send prescription to pharmacy</button><span className="faint small">Charges post when the pharmacist dispenses.</span></div>}
      </div>

      {(d.labs.length > 0 || d.prescriptions.length > 0 || d.imaging.length > 0) && <div className="card">
        <h3>Ordered this visit</h3>
        <table className="table small"><tbody>
          {d.labs.map(l => <tr key={'l' + l.id}><td><span className="dept" style={{ '--dc': DEPT_COLOR[l.dept] }}>{l.dept}</span></td><td>{l.name}</td><td>{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td></tr>)}
          {d.imaging.map(l => <tr key={'i' + l.id}><td><Badge tone="info">Imaging</Badge></td><td>{l.name}</td><td>{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td></tr>)}
          {d.prescriptions.map(r => <tr key={'r' + r.id}><td><Badge tone="good">Rx</Badge></td><td>{r.name}</td><td>{r.dose} {r.frequency} × {r.days}d · {fmtQty(r, r.qty)}</td>
            <td className="row"><StatusBadge s={r.status} />{r.status === 'pending' && <button className="ghost sm" title="Cancel" onClick={async () => { await act(() => api.del('/prescriptions/' + r.id), 'Removed'); reload(); }}>✕</button>}</td></tr>)}
        </tbody></table>
        {d.labs.some(l => l.mode === 'outsourced') && <button className="sm mt" onClick={() => printRequisition(d, c)}><Icon name="print" size={14} />Print outside-lab requisition</button>}
      </div>}
    </div>
  );
}

function printRequisition(d, c) {
  const labs = d.labs.filter(l => l.mode === 'outsourced');
  const w = window.open('', '_blank', 'width=700,height=800');
  if (!w) return alert('Allow pop-ups to print the requisition.');
  w.document.write(`<html><head><title>Lab requisition</title><style>body{font-family:system-ui;padding:24px}td,th{border:1px solid #ccc;padding:6px;text-align:left}table{border-collapse:collapse;width:100%}</style></head><body>
    <h2>${c.facility_name}</h2><p>${c.location || ''} · ${c.phone || ''}</p><h3>Laboratory requisition - to ${labs[0]?.partner || ''}</h3>
    <p><b>Patient:</b> ${d.patient.first_name} ${d.patient.last_name} (${d.patient.mrn}) · ${d.patient.sex} · DOB ${d.patient.dob || ''}</p>
    <p><b>Clinical notes:</b> ${d.notes[0]?.diagnosis || d.visit.complaint || ''}</p>
    <table><tr><th>Test</th><th>Department</th></tr>${labs.map(l => `<tr><td>${l.name}</td><td>${l.dept}</td></tr>`).join('')}</table>
    <p style="margin-top:30px">Requested by: ________________ Date: ${new Date().toLocaleDateString('en-KE')}</p>
    <p>Please return results to the patient or email ${c.email || ''}.</p><script>print()</script></body></html>`);
  w.document.close();
}

function Results({ d, reload }) {
  const c = useContext(ConfigContext);
  const [entering, setEntering] = useState(null);
  return (
    <div className="stack">
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Test</th><th>Result</th><th>Normal range</th><th>Flag</th><th>Source</th><th>Status</th><th /></tr></thead>
        <tbody>{d.labs.map(l => <tr key={l.id}>
          <td><b>{l.name}</b><div><span className="dept" style={{ '--dc': DEPT_COLOR[l.dept] }}>{l.dept}</span></div></td>
          <td><b>{l.result_value ?? l.result_text ?? '-'}</b> {l.result_value != null && l.unit}{l.comment && <div className="faint small">{l.comment}</div>}</td>
          <td className="small muted">{l.ref_low != null ? `${l.ref_low}–${l.ref_high} ${l.unit}` : ''}</td><td><FlagBadge flag={l.flag} /></td>
          <td className="small">{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td>
          <td>{!['resulted', 'validated'].includes(l.status) && (l.mode === 'outsourced' || ['lab', 'admin', 'superadmin'].includes(c.user.role)) &&
            <button className="sm primary" onClick={() => setEntering(l)}>{l.mode === 'outsourced' ? 'Enter outside result' : 'Enter result'}</button>}</td>
        </tr>)}</tbody>
      </table>{!d.labs.length && <Empty icon="lab">No lab tests for this visit.</Empty>}</div>
      {d.imaging.map(i => <ImagingResult key={i.id} i={i} reload={reload} />)}
      {entering && <ResultEntry order={{ ...entering, pname: d.patient.first_name + ' ' + d.patient.last_name }} onClose={() => setEntering(null)} onDone={() => { setEntering(null); reload(); }} />}
    </div>
  );
}

function ImagingResult({ i, reload }) {
  const [rep, setRep] = useState('');
  const save = async () => { await act(() => api.post(`/imaging/orders/${i.id}/report`, { report: rep }), 'Report saved'); reload(); };
  return <div className="card">
    <div className="row"><h3>{i.name}</h3><StatusBadge s={i.status} /><span className="faint small right">{i.mode === 'outsourced' ? i.partner : 'In-house'}</span></div>
    {i.report && <p className="small mt" style={{ whiteSpace: 'pre-wrap' }}>{i.report}</p>}
    {i.status !== 'reported' && <div className="stack mt"><Field label={i.mode === 'outsourced' ? 'Type the report the patient brought back' : 'Radiology report'}><textarea value={rep} onChange={e => setRep(e.target.value)} /></Field>
      <div><button className="primary sm" disabled={!rep} onClick={save}>Save report</button></div></div>}
  </div>;
}

function Procedures({ v, d, reload }) {
  const [cat] = useData('/catalogue');
  const [f, setF] = useState({ consent: false, consumables: [] });
  if (!cat) return null;
  const svc = cat.services.filter(s => s.category === 'procedure');
  const cons = cat.items.filter(i => i.category === 'consumable' || ['injection', 'infusion'].includes(i.form));
  const save = async () => {
    await act(() => api.post(`/visits/${v.id}/procedures`, { ...f, consumables: f.consumables.filter(x => x.item_id && x.qty) }), 'Procedure recorded, consumables deducted from stock');
    setF({ consent: false, consumables: [] }); reload();
  };
  return <div className="stack">
    <div className="card">
      <h3>Record procedure</h3>
      <div className="fields">
        <Field label="Procedure" span={2}><select value={f.service_id || ''} onChange={e => setF({ ...f, service_id: Number(e.target.value) })}><option value="">Select…</option>{svc.map(s => <option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}</select></Field>
        <Field label="Procedure notes" span={4}><textarea value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Anaesthesia, findings, complications, follow-up date" /></Field>
      </div>
      <h4 className="mt small muted">Supplies used (deducted from stock, charged per piece)</h4>
      {f.consumables.map((x, i) => <div key={i} className="row" style={{ marginTop: 6 }}>
        <select value={x.item_id || ''} style={{ maxWidth: 380 }} onChange={e => setF({ ...f, consumables: f.consumables.map((y, j) => j === i ? { ...y, item_id: Number(e.target.value) } : y) })}><option value="">Select…</option>
          {cons.map(it => <option key={it.id} value={it.id}>{it.name} · {money(it.price)}/{it.unit} ({it.stock_text})</option>)}</select>
        <input type="number" min="1" value={x.qty} style={{ width: 90 }} onChange={e => setF({ ...f, consumables: f.consumables.map((y, j) => j === i ? { ...y, qty: Number(e.target.value) } : y) })} />
        <button className="ghost sm" onClick={() => setF({ ...f, consumables: f.consumables.filter((_, j) => j !== i) })}>✕</button>
      </div>)}
      <button className="sm mt" onClick={() => setF({ ...f, consumables: [...f.consumables, { qty: 1 }] })}>+ Supply</button>
      <label className="check mt"><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} /><b>Informed consent obtained and signed</b> (by patient or guardian)</label>
      <div className="row mt"><button className="primary" disabled={!f.service_id || !f.consent} onClick={save}>Save procedure</button></div>
    </div>
    {d.procedures.map(p => <div key={p.id} className="card small"><div className="row"><b>{p.name}</b><Badge tone="good">Consent recorded</Badge><span className="right faint">{fmtDT(p.created_at)} · {p.by_user}</span></div><p className="mt">{p.notes}</p></div>)}
  </div>;
}

function AdmitModal({ v, onClose, onDone }) {
  const [wards] = useData('/wards');
  const [bed, setBed] = useState(null);
  const [reason, setReason] = useState(v.complaint || '');
  const go = async () => { await act(() => api.post(`/visits/${v.id}/admit`, { bed_id: bed, reason }), 'Patient admitted. Bed charges post daily.'); onDone(); };
  return <Modal title="Admit patient" onClose={onClose} wide footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!bed || !reason} onClick={go}>Admit</button></>}>
    <Field label="Reason for admission"><input value={reason} onChange={e => setReason(e.target.value)} /></Field>
    {(wards || []).map(w => <div key={w.id} className="mt">
      <b>{w.name}</b> <span className="faint small">{money(w.daily_rate)} per day · {w.beds.filter(b => !b.admission_id).length} free</span>
      <div className="row" style={{ marginTop: 6 }}>{w.beds.map(b => <button key={b.id} className={'sm' + (bed === b.id ? ' primary' : '')} disabled={!!b.admission_id} onClick={() => setBed(b.id)} title={b.pname || 'Free'}>{b.label}</button>)}</div>
    </div>)}
  </Modal>;
}
