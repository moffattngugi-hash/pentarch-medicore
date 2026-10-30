import React, { useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Badge, FlagBadge, StatusBadge, Modal, Field, Tabs, act, age, fmtDT, fmtTime, money, Empty } from '../ui';
import { HealthBar, VITAL_RANGES } from './PatientView';
import { ReferralForm } from './Referrals';
import { ResultEntry } from './Lab';

// Common outpatient diagnoses used for MOH 705 reporting (ICD-10 codes; ICD-11 mapping to follow DHA guidance)
export const DIAGNOSES = [
  ['Malaria', 'B54'], ['Upper respiratory tract infection', 'J06.9'], ['Pneumonia', 'J18.9'], ['Diarrhoea', 'A09'],
  ['Urinary tract infection', 'N39.0'], ['Essential hypertension', 'I10'], ['Type 2 diabetes mellitus', 'E11.9'],
  ['Typhoid fever', 'A01.0'], ['Intestinal worms', 'B83.9'], ['Gastritis', 'K29.7'], ['Asthma', 'J45.9'],
  ['Skin infection / dermatitis', 'L30.9'], ['Otitis media', 'H66.9'], ['Conjunctivitis', 'H10.9'], ['Joint pains / arthralgia', 'M25.5'],
  ['Dental caries', 'K02.9'], ['Injury / wound', 'T14.9'], ['Anaemia', 'D64.9'], ['Sexually transmitted infection', 'A64'],
  ['Supervision of normal pregnancy', 'Z34.9'], ['Circumcision (routine)', 'Z41.2'], ['Other', 'R69']
];
const FREQ = [['OD', 1], ['BD', 2], ['TDS', 3], ['QID', 4], ['Nocte', 1], ['PRN', 1], ['Stat', 1]];

export default function Visit({ id }) {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/visits/' + id, [id]);
  const [tab, setTab] = useState(null);
  const [admit, setAdmit] = useState(false);
  const [refer, setRefer] = useState(false);
  if (!d) return <div className="page">Loading…</div>;
  const { visit: v, patient: p } = d;
  const role = c.user.role;
  const defTab = tab || (v.status === 'waiting_triage' ? 'triage' : role === 'lab' ? 'results' : v.status === 'pharmacy' && role === 'pharmacist' ? 'orders' : 'consult');
  const isChild = (Date.now() - new Date(p.dob)) / (365.25 * 864e5) < 13;
  const vt = d.vitals[0];
  const move = async status => { await act(() => api.put(`/visits/${v.id}/status`, { status }), 'Patient sent on'); reload(); };
  const closed = v.status === 'closed';

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <a href="#/queue" className="small">← Queue</a>
          <h1 style={{ marginTop: 4 }}>{p.first_name} {p.last_name} <span className="faint" style={{ fontWeight: 400, fontSize: 15 }}>#{v.queue_no || '-'} · {v.type}</span></h1>
          <div className="row sub"><span>{p.mrn}</span><span>·</span><span>{p.sex === 'F' ? 'Female' : 'Male'}, {age(p.dob)}</span><span>·</span><span>Arrived {fmtTime(v.created_at)}</span><StatusBadge s={v.status} /><a href={'#/patients/' + p.id}>Full patient dashboard →</a></div>
        </div>
        <div className="actions">
          {!closed && v.status !== 'admitted' && <>
            {c.lab !== 'none' && v.status !== 'in_lab' && <button onClick={() => move('in_lab')}>Send to lab</button>}
            {v.status !== 'pharmacy' && <button onClick={() => move('pharmacy')}>Send to pharmacy</button>}
            {v.status !== 'billing' && <button onClick={() => move('billing')}>Send to cashier</button>}
            {c.admissions && <button onClick={() => setAdmit(true)}>Admit</button>}
            <button onClick={() => setRefer(true)}>Refer</button>
          </>}
          {d.bill && <button className="primary" onClick={() => (window.location.hash = '#/billing/' + d.bill.id)}>Bill · {money(d.bill.balance)}</button>}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        {p.allergies ? <div className="alert bad"><b>Allergies:</b> {p.allergies}</div> : <div className="alert good">No known allergies</div>}
        {p.chronic && <div className="alert info"><b>Chronic:</b> {p.chronic}</div>}
        {v.complaint && <div className="alert warn"><b>Complaint:</b> {v.complaint}</div>}
        {d.admission && <div className="alert info"><b>Admitted</b> to {d.admission.ward}, bed {d.admission.bed}</div>}
      </div>

      <div className="grid g-side">
        <div>
          <Tabs value={defTab} onChange={setTab} tabs={[
            c.consultation !== false && ['triage', 'Triage & vitals'], c.consultation !== false && ['consult', 'Consultation'],
            ['orders', 'Orders & prescriptions'], ['results', `Results (${d.labs.length + d.imaging.length})`],
            c.procedures && ['procedures', 'Procedures']]} />
          {defTab === 'triage' && <Triage v={v} isChild={isChild} reload={reload} vitals={d.vitals} />}
          {defTab === 'consult' && <Consult v={v} notes={d.notes} reload={reload} />}
          {defTab === 'orders' && <Orders v={v} d={d} reload={reload} />}
          {defTab === 'results' && <Results d={d} reload={reload} />}
          {defTab === 'procedures' && <Procedures v={v} d={d} reload={reload} />}
        </div>
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h3>Vitals</h3><span className="right faint small">{vt ? fmtTime(vt.created_at) : 'not taken'}</span></div>
            {vt ? Object.entries(VITAL_RANGES).filter(([k]) => !(isChild && ['sys', 'dia', 'pulse', 'resp'].includes(k))).map(([k, r]) =>
              <HealthBar key={k} r={r} v={k === 'bmi' ? (vt.weight && vt.height && !isChild ? vt.weight / Math.pow(vt.height / 100, 2) : null) : vt[k]} />)
              : <Empty>No vitals recorded for this visit.</Empty>}
            {vt?.weight && <p className="small muted">Weight {vt.weight} kg{vt.height ? ` · height ${vt.height} cm` : ''}{vt.muac ? ` · MUAC ${vt.muac} cm` : ''}</p>}
          </div>
          {d.bill && <div className="card">
            <div className="cardhead"><h3>Bill</h3><span className="right"><StatusBadge s={d.bill.status} /></span></div>
            {d.bill.lines.length ? <table className="table small"><tbody>
              {d.bill.lines.map(l => <tr key={l.id}><td>{l.description}{l.qty !== 1 && <span className="faint"> × {l.qty}</span>}</td><td className="num">{money(l.amount)}</td></tr>)}
              <tr><td><b>Total</b></td><td className="num"><b>{money(d.bill.total)}</b></td></tr>
              <tr><td>Paid</td><td className="num">{money(d.bill.paid)}</td></tr>
              <tr><td><b>Balance</b></td><td className="num"><b>{money(d.bill.balance)}</b></td></tr>
            </tbody></table> : <Empty>{c.billing_mode === 'manual' ? 'Manual billing: the cashier adds charges at checkout.' : 'No charges yet.'}</Empty>}
            <p className="faint small">{c.billing_mode === 'auto' ? 'Automatic billing: charges appear as services are ordered.' : 'Manual billing is on.'}</p>
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
  const [f, setF] = useState({});
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const save = async () => { await act(() => api.post(`/visits/${v.id}/vitals`, f), 'Vitals saved'); setF({}); reload(); };
  const n = (k, label, step = 1) => <Field label={label}><input type="number" step={step} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>;
  return (
    <div className="card">
      <h3>Record vitals</h3>
      <div className="fields">
        {n('temp', 'Temperature (°C)', 0.1)}
        {!isChild && n('sys', 'BP systolic (mmHg)')}{!isChild && n('dia', 'BP diastolic (mmHg)')}
        {n('pulse', 'Pulse (bpm)')}{n('resp', 'Resp. rate (/min)')}{n('spo2', 'SpO₂ (%)')}
        {n('weight', 'Weight (kg)', 0.1)}{n('height', 'Height (cm)')}
        {n('glucose', 'Blood glucose (mmol/L)', 0.1)}{isChild && n('muac', 'MUAC (cm)', 0.1)}
      </div>
      {f.weight && f.height && !isChild && <p className="small mt">BMI: <b>{(f.weight / Math.pow(f.height / 100, 2)).toFixed(1)}</b></p>}
      <div className="row mt"><button className="primary" onClick={save}>Save vitals {v.status === 'waiting_triage' && 'and send to clinician'}</button></div>
      {vitals.length > 0 && <table className="table small mt"><thead><tr><th>Time</th><th>T</th><th>BP</th><th>P</th><th>RR</th><th>SpO₂</th><th>Wt</th><th>By</th></tr></thead>
        <tbody>{vitals.map(x => <tr key={x.id}><td>{fmtTime(x.created_at)}</td><td>{x.temp}</td><td>{x.sys ? `${x.sys}/${x.dia}` : '-'}</td><td>{x.pulse}</td><td>{x.resp}</td><td>{x.spo2}</td><td>{x.weight}</td><td className="faint">{x.recorded_by}</td></tr>)}</tbody></table>}
    </div>
  );
}

function Consult({ v, notes, reload }) {
  const [f, setF] = useState({ diagnosis: '', dx_code: '' });
  const set = (k, val) => setF(x => ({ ...x, [k]: val }));
  const save = async () => { await act(() => api.post(`/visits/${v.id}/note`, f), 'Consultation saved'); setF({ diagnosis: '', dx_code: '' }); reload(); };
  return (
    <div className="stack">
      <div className="card">
        <h3>Clinical note</h3>
        <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="History / presenting complaint"><textarea value={f.history || ''} onChange={e => set('history', e.target.value)} placeholder={v.complaint || ''} /></Field>
          <Field label="Examination findings"><textarea value={f.exam || ''} onChange={e => set('exam', e.target.value)} /></Field>
          <Field label="Diagnosis">
            <select value={f.diagnosis} onChange={e => { const x = DIAGNOSES.find(d => d[0] === e.target.value); setF(o => ({ ...o, diagnosis: e.target.value, dx_code: x ? x[1] : '' })); }}>
              <option value="">Select diagnosis…</option>{DIAGNOSES.map(([n, code]) => <option key={n} value={n}>{n} ({code})</option>)}
            </select>
          </Field>
          <Field label="ICD-10 code"><input value={f.dx_code} onChange={e => set('dx_code', e.target.value)} /></Field>
          <Field label="Plan" span={2}><textarea value={f.plan || ''} onChange={e => set('plan', e.target.value)} placeholder="Investigations, treatment, follow-up" /></Field>
        </div>
        <div className="row mt"><button className="primary" onClick={save}>Save note</button><span className="faint small">Next: go to Orders to request tests or prescribe.</span></div>
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

function Orders({ v, d, reload }) {
  const c = useContext(ConfigContext);
  const [cat] = useData('/catalogue');
  const [tests, setTests] = useState([]);
  const [labMode, setLabMode] = useState(c.lab === 'outsourced' ? 'outsourced' : 'inhouse');
  const [partner, setPartner] = useState((c.partners || [])[0] || '');
  const [img, setImg] = useState({});
  const [rx, setRx] = useState([]);
  const [filter, setFilter] = useState('');
  if (!cat) return <div className="card">Loading catalogue…</div>;
  const drugs = cat.items.filter(i => i.category === 'drug');
  const orderLabs = async () => {
    await act(() => api.post(`/visits/${v.id}/lab-orders`, { test_ids: tests, mode: labMode, partner }), labMode === 'outsourced' ? 'Requisition created for outside lab' : 'Lab tests ordered');
    setTests([]); reload();
  };
  const orderImg = async () => { await act(() => api.post(`/visits/${v.id}/imaging-orders`, img), 'Imaging requested'); setImg({}); reload(); };
  const addRx = () => setRx(r => [...r, { item_id: '', dose: '', frequency: 'TDS', days: 5, qty: 15 }]);
  const setRow = (i, k, val) => setRx(r => r.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, [k]: val };
    const it = drugs.find(dd => dd.id === Number(n.item_id));
    if (['frequency', 'days', 'item_id'].includes(k) && it && ['tab', 'cap'].includes(it.unit)) {
      const f = FREQ.find(ff => ff[0] === n.frequency)?.[1] || 1;
      n.qty = n.frequency === 'Stat' ? 1 : f * (Number(n.days) || 1);
    } else if (k === 'item_id' && it) n.qty = 1;
    return n;
  }));
  const saveRx = async () => {
    const items = rx.filter(r => r.item_id).map(r => ({ ...r, item_id: Number(r.item_id), qty: Number(r.qty), days: Number(r.days) }));
    await act(() => api.post(`/visits/${v.id}/prescriptions`, { items }), 'Prescription sent to pharmacy');
    setRx([]);
    if (v.status !== 'admitted') await api.put(`/visits/${v.id}/status`, { status: 'pharmacy' });
    reload();
  };
  const visibleTests = cat.tests.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));
  const allergy = (d.patient.allergies || '').toLowerCase();

  return (
    <div className="stack">
      {c.lab !== 'none' && <div className="card">
        <div className="cardhead"><h3>Laboratory tests</h3>
          {c.lab === 'both' && <div className="row right">
            <select value={labMode} onChange={e => setLabMode(e.target.value)} style={{ width: 'auto' }}><option value="inhouse">Our lab</option><option value="outsourced">Send to outside lab</option></select>
            {labMode === 'outsourced' && <select value={partner} onChange={e => setPartner(e.target.value)} style={{ width: 'auto' }}>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select>}
          </div>}
          {c.lab === 'outsourced' && <select className="right" value={partner} onChange={e => setPartner(e.target.value)} style={{ width: 'auto' }}>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select>}
        </div>
        <input placeholder="Filter tests" value={filter} onChange={e => setFilter(e.target.value)} style={{ marginBottom: 10 }} />
        <div className="grid g2" style={{ gap: 4 }}>
          {visibleTests.map(t => <label key={t.id} className="check small" style={{ padding: '4px 6px', borderRadius: 6, background: tests.includes(t.id) ? 'var(--brand-soft)' : null }}>
            <input type="checkbox" checked={tests.includes(t.id)} onChange={e => setTests(x => e.target.checked ? [...x, t.id] : x.filter(y => y !== t.id))} />
            <span>{t.name}</span><span className="right faint">{t.outsourced_only || labMode === 'outsourced' ? <Badge tone="info">outside lab</Badge> : money(t.price)}</span>
          </label>)}
        </div>
        <div className="row mt"><button className="primary" disabled={!tests.length} onClick={orderLabs}>Order {tests.length || ''} test{tests.length === 1 ? '' : 's'}</button>
          <span className="faint small">Outside-lab tests print a requisition; the patient pays the partner lab directly.</span></div>
      </div>}

      {c.imaging !== 'none' && <div className="card">
        <h3>Imaging {c.imaging === 'outsourced' && <Badge tone="info">outsourced</Badge>}</h3>
        <div className="fields">
          <Field label="Study"><select value={img.study_id || ''} onChange={e => setImg({ ...img, study_id: Number(e.target.value) })}><option value="">Select…</option>{cat.imaging.map(s => <option key={s.id} value={s.id}>{s.name}{c.imaging === 'inhouse' ? ` · ${money(s.price)}` : ''}</option>)}</select></Field>
          {c.imaging === 'outsourced' && <Field label="Imaging centre"><select value={img.partner || ''} onChange={e => setImg({ ...img, partner: e.target.value })}><option value="">Default</option>{(c.partners || []).map(x => <option key={x}>{x}</option>)}</select></Field>}
          <Field label="Clinical notes" span={2}><input value={img.notes || ''} onChange={e => setImg({ ...img, notes: e.target.value })} /></Field>
        </div>
        <div className="row mt"><button disabled={!img.study_id} onClick={orderImg}>Request imaging</button></div>
      </div>}

      <div className="card">
        <div className="cardhead"><h3>Prescription</h3><button className="right sm" onClick={addRx}>+ Add medicine</button></div>
        {rx.length === 0 && <Empty>Click “Add medicine” to prescribe.</Empty>}
        {rx.map((r, i) => {
          const it = drugs.find(x => x.id === Number(r.item_id));
          const warn = it && allergy && allergy.split(/[ ,]+/).some(a => a.length > 3 && it.name.toLowerCase().includes(a.slice(0, 5)));
          return <div key={i} className="stack" style={{ marginBottom: 10 }}>
            <div className="fields" style={{ gridTemplateColumns: '3fr 1fr 1fr 70px 80px 32px', alignItems: 'end' }}>
              <Field label="Medicine"><select value={r.item_id} onChange={e => setRow(i, 'item_id', e.target.value)}><option value="">Select…</option>
                {drugs.map(x => <option key={x.id} value={x.id} disabled={x.stock <= 0}>{x.name} · {x.stock} in stock{x.controlled ? ' · controlled' : ''}</option>)}</select></Field>
              <Field label="Dose"><input value={r.dose} onChange={e => setRow(i, 'dose', e.target.value)} placeholder="e.g. 500mg" /></Field>
              <Field label="Frequency"><select value={r.frequency} onChange={e => setRow(i, 'frequency', e.target.value)}>{FREQ.map(f => <option key={f[0]}>{f[0]}</option>)}</select></Field>
              <Field label="Days"><input type="number" value={r.days} onChange={e => setRow(i, 'days', e.target.value)} /></Field>
              <Field label={`Qty${it ? ' (' + it.unit + ')' : ''}`}><input type="number" value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)} /></Field>
              <button className="ghost" onClick={() => setRx(x => x.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
            </div>
            {warn && <div className="alert bad small">Possible allergy conflict: patient is allergic to {d.patient.allergies}.</div>}
          </div>;
        })}
        {rx.length > 0 && <div className="row"><button className="primary" onClick={saveRx}>Send prescription to pharmacy</button><span className="faint small">Charges post when the pharmacist dispenses.</span></div>}
      </div>

      {(d.labs.length > 0 || d.prescriptions.length > 0 || d.imaging.length > 0) && <div className="card">
        <h3>Ordered this visit</h3>
        <table className="table small"><tbody>
          {d.labs.map(l => <tr key={'l' + l.id}><td><Badge tone="brand">Lab</Badge></td><td>{l.name}</td><td>{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td></tr>)}
          {d.imaging.map(l => <tr key={'i' + l.id}><td><Badge tone="info">Imaging</Badge></td><td>{l.name}</td><td>{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td></tr>)}
          {d.prescriptions.map(r => <tr key={'r' + r.id}><td><Badge tone="good">Rx</Badge></td><td>{r.name}</td><td>{r.dose} {r.frequency} × {r.days}d (qty {r.qty})</td><td><StatusBadge s={r.status} /></td></tr>)}
        </tbody></table>
        {d.labs.some(l => l.mode === 'outsourced') && <button className="sm mt" onClick={() => printRequisition(d, c)}>Print outside-lab requisition</button>}
      </div>}
    </div>
  );
}

function printRequisition(d, c) {
  const labs = d.labs.filter(l => l.mode === 'outsourced');
  const w = window.open('', '_blank', 'width=700,height=800');
  w.document.write(`<html><head><title>Lab requisition</title><style>body{font-family:system-ui;padding:24px}td,th{border:1px solid #ccc;padding:6px;text-align:left}table{border-collapse:collapse;width:100%}</style></head><body>
    <h2>${c.facility_name}</h2><p>${c.location} · ${c.phone}</p><h3>Laboratory requisition - to ${labs[0]?.partner || ''}</h3>
    <p><b>Patient:</b> ${d.patient.first_name} ${d.patient.last_name} (${d.patient.mrn}) · ${d.patient.sex} · DOB ${d.patient.dob || ''}</p>
    <p><b>Clinical notes:</b> ${d.notes[0]?.diagnosis || d.visit.complaint || ''}</p>
    <table><tr><th>Test</th><th>Sample</th></tr>${labs.map(l => `<tr><td>${l.name}</td><td></td></tr>`).join('')}</table>
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
          <td>{l.name}</td><td><b>{l.result_value ?? l.result_text ?? '-'}</b> {l.result_value != null && l.unit}{l.comment && <div className="faint small">{l.comment}</div>}</td>
          <td className="small muted">{l.ref_low != null ? `${l.ref_low}–${l.ref_high} ${l.unit}` : ''}</td><td><FlagBadge flag={l.flag} /></td>
          <td className="small">{l.mode === 'outsourced' ? `Outside · ${l.partner || ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td>
          <td>{!['resulted', 'validated'].includes(l.status) && (l.mode === 'outsourced' || ['lab', 'admin'].includes(c.user.role)) &&
            <button className="sm" onClick={() => setEntering(l)}>{l.mode === 'outsourced' ? 'Enter outside result' : 'Enter result'}</button>}</td>
        </tr>)}</tbody>
      </table>{!d.labs.length && <Empty>No lab tests for this visit.</Empty>}</div>
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
    {i.status !== 'reported' && <div className="stack mt"><Field label={i.mode === 'outsourced' ? 'Type or paste the report the patient brought back' : 'Radiology report'}><textarea value={rep} onChange={e => setRep(e.target.value)} /></Field>
      <div><button className="primary sm" disabled={!rep} onClick={save}>Save report</button></div></div>}
  </div>;
}

function Procedures({ v, d, reload }) {
  const [cat] = useData('/catalogue');
  const [f, setF] = useState({ consent: false, consumables: [] });
  if (!cat) return null;
  const svc = cat.services.filter(s => s.category === 'procedure');
  const cons = cat.items.filter(i => i.category === 'consumable' || i.code === 'LIDO2');
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
      <h4 className="mt small muted">Consumables used (deducted from stock)</h4>
      {f.consumables.map((x, i) => <div key={i} className="row" style={{ marginTop: 6 }}>
        <select value={x.item_id || ''} style={{ maxWidth: 320 }} onChange={e => setF({ ...f, consumables: f.consumables.map((y, j) => j === i ? { ...y, item_id: Number(e.target.value) } : y) })}><option value="">Select…</option>{cons.map(it => <option key={it.id} value={it.id}>{it.name} ({it.stock})</option>)}</select>
        <input type="number" value={x.qty} style={{ width: 90 }} onChange={e => setF({ ...f, consumables: f.consumables.map((y, j) => j === i ? { ...y, qty: Number(e.target.value) } : y) })} />
      </div>)}
      <button className="sm mt" onClick={() => setF({ ...f, consumables: [...f.consumables, { qty: 1 }] })}>+ Consumable</button>
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
  const go = async () => { await act(() => api.post(`/visits/${v.id}/admit`, { bed_id: bed, reason }), 'Patient admitted. Bed charges will post daily.'); onDone(); };
  return <Modal title="Admit patient" onClose={onClose} wide footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!bed} onClick={go}>Admit</button></>}>
    <Field label="Reason for admission"><input value={reason} onChange={e => setReason(e.target.value)} /></Field>
    {(wards || []).map(w => <div key={w.id} className="mt">
      <b>{w.name}</b> <span className="faint small">{money(w.daily_rate)} per day · {w.beds.filter(b => !b.admission_id).length} free</span>
      <div className="row" style={{ marginTop: 6 }}>{w.beds.map(b => <button key={b.id} className={'sm' + (bed === b.id ? ' primary' : '')} disabled={!!b.admission_id} onClick={() => setBed(b.id)} title={b.pname || 'Free'}>{b.label}</button>)}</div>
    </div>)}
  </Modal>;
}
