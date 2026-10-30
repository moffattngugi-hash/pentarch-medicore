import React, { useContext, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, CartesianGrid, Legend } from 'recharts';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Badge, FlagBadge, StatusBadge, Modal, Field, Tabs, act, age, fmtDate, fmtDT, money, Empty } from '../ui';
import { PatientForm } from './Patients';
import { ReferralForm } from './Referrals';

// Reference ranges for adult vitals (WHO / Kenya clinical guidelines; adult values)
export const VITAL_RANGES = {
  sys: { name: 'Systolic BP', unit: 'mmHg', min: 70, max: 200, lo: 90, hi: 120, hi2: 140 },
  dia: { name: 'Diastolic BP', unit: 'mmHg', min: 40, max: 120, lo: 60, hi: 80, hi2: 90 },
  pulse: { name: 'Pulse', unit: 'bpm', min: 30, max: 180, lo: 60, hi: 100 },
  temp: { name: 'Temperature', unit: '°C', min: 34, max: 41, lo: 36.1, hi: 37.2, hi2: 37.9 },
  resp: { name: 'Respiratory rate', unit: '/min', min: 6, max: 40, lo: 12, hi: 20 },
  spo2: { name: 'SpO₂', unit: '%', min: 80, max: 100, lo: 95, hi: 100.01 },
  bmi: { name: 'BMI', unit: 'kg/m²', min: 12, max: 45, lo: 18.5, hi: 24.9, hi2: 29.9 },
  glucose: { name: 'Blood glucose', unit: 'mmol/L', min: 2, max: 25, lo: 3.9, hi: 7.8, hi2: 11 },
};
export function classify(r, v) {
  if (v == null) return null;
  if (v < r.lo || (r.hi2 ? v > r.hi2 : v > r.hi)) return ['Abnormal', 'bad'];
  if (v > r.hi) return ['Borderline', 'warn'];
  return ['Normal', 'good'];
}
export function HealthBar({ r, v }) {
  if (v == null || Number.isNaN(v)) return null;
  const pct = x => Math.max(0, Math.min(100, (x - r.min) / (r.max - r.min) * 100));
  const c = classify(r, v);
  return (
    <div className="hbar">
      <span className="name">{r.name}</span>
      <div className={'track' + (r.hi2 ? ' three' : '')} style={{ '--lo': pct(r.lo) + '%', '--hi': pct(r.hi) + '%', '--hi2': pct(r.hi2 || r.hi) + '%' }}
        title={`Normal ${r.lo}–${r.hi} ${r.unit}`}>
        <span className="pin" style={{ left: pct(v) + '%' }} />
      </div>
      <span className="val">{Math.round(v * 10) / 10} <span className="faint small">{r.unit}</span> <Badge tone={c[1]}>{c[0]}</Badge></span>
    </div>
  );
}
const bmi = v => v.weight && v.height ? v.weight / Math.pow(v.height / 100, 2) : null;
const shortDate = d => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

export default function PatientView({ id }) {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/patients/' + id, [id]);
  const [tab, setTab] = useState('overview');
  const [edit, setEdit] = useState(false);
  const [visitModal, setVisitModal] = useState(false);
  const [refer, setRefer] = useState(false);
  const [preg, setPreg] = useState(false);
  if (!d) return <div className="page">Loading…</div>;
  const p = d.patient;
  const isChild = (Date.now() - new Date(p.dob)) / (365.25 * 864e5) < 13;
  const openVisit = d.visits.find(v => v.status !== 'closed');
  const latest = {};
  for (const v of d.vitals) for (const k of ['sys', 'dia', 'pulse', 'temp', 'resp', 'spo2', 'glucose']) if (v[k] != null) latest[k] = v[k];
  const lastWH = [...d.vitals].reverse().find(v => v.weight && v.height);
  if (lastWH && !isChild) latest.bmi = bmi(lastWH);
  const lastVital = d.vitals[d.vitals.length - 1];

  const bpData = d.vitals.filter(v => v.sys).map(v => ({ date: shortDate(v.created_at), Systolic: v.sys, Diastolic: v.dia }));
  const wtData = d.vitals.filter(v => v.weight).map(v => ({ date: shortDate(v.created_at), Weight: v.weight, BMI: bmi(v) ? Math.round(bmi(v) * 10) / 10 : null }));
  const gluData = [
    ...d.vitals.filter(v => v.glucose).map(v => ({ t: v.created_at, Glucose: v.glucose })),
    ...d.labs.filter(l => l.code === 'RBS' && l.result_value != null && !d.vitals.some(v => v.glucose && Math.abs(new Date(v.created_at) - new Date(l.created_at)) < 864e5)).map(l => ({ t: l.created_at, Glucose: l.result_value }))
  ].sort((a, b) => a.t.localeCompare(b.t)).map(x => ({ ...x, date: shortDate(x.t) }));
  const numericLabs = {};
  for (const l of d.labs) if (l.kind === 'numeric' && l.result_value != null) (numericLabs[l.code] ||= { name: l.name, unit: l.unit, lo: l.ref_low, hi: l.ref_high, pts: [] }).pts.push({ date: shortDate(l.resulted_at || l.created_at), value: l.result_value, flag: l.flag });
  const pregnancy = d.pregnancies.find(x => x.status === 'active');

  const events = [
    ...d.visits.map(v => ({ t: v.created_at, kind: v.type === 'ANC' ? 'ANC visit' : v.type === 'IPD' ? 'Inpatient episode' : 'Visit', text: [v.complaint, v.diagnosis && `→ ${v.diagnosis}`].filter(Boolean).join(' '), link: '#/visit/' + v.id, status: v.status })),
    ...d.labs.map(l => ({ t: l.resulted_at || l.created_at, kind: 'Lab' + (l.mode === 'outsourced' ? ` (outsourced${l.partner ? ': ' + l.partner : ''})` : ''), text: `${l.name}: ${l.result_value ?? l.result_text ?? 'pending'} ${l.result_value != null ? l.unit || '' : ''}`, flag: l.flag })),
    ...d.imaging.map(i => ({ t: i.created_at, kind: 'Imaging', text: `${i.name}${i.report ? ' - ' + i.report.slice(0, 120) : ''}`, status: i.status })),
    ...d.procedures.map(x => ({ t: x.created_at, kind: 'Procedure', text: `${x.name}${x.notes ? ' - ' + x.notes : ''}` })),
    ...d.referrals.map(r => ({ t: r.created_at, kind: r.direction === 'in' ? 'Referred in' : 'Referred out', text: `${r.facility}: ${r.reason}` })),
    ...d.admissions.map(a => ({ t: a.admitted_at, kind: 'Admitted', text: `${a.ward} ${a.bed} - ${a.reason}${a.discharged_at ? ` · discharged ${fmtDate(a.discharged_at)}` : ''}` })),
    ...d.pregnancies.filter(x => x.delivery).map(x => ({ t: x.delivery.delivered_at, kind: 'Delivery', text: `${x.delivery.mode}, ${x.delivery.outcome}, ${x.delivery.baby_sex === 'M' ? 'boy' : 'girl'} ${x.delivery.baby_weight} kg` })),
  ].sort((a, b) => String(b.t).localeCompare(String(a.t)));

  const startVisit = async complaint => {
    const v = await act(() => api.post('/visits', { patient_id: p.id, complaint }), 'Added to queue');
    window.location.hash = '#/visit/' + v.id;
  };

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <a href="#/patients" className="small">← Patients</a>
          <h1 style={{ marginTop: 4 }}>{p.first_name} {p.last_name}</h1>
          <div className="row sub">
            <span>{p.mrn}</span><span>·</span><span>{p.sex === 'F' ? 'Female' : 'Male'}, {age(p.dob)}</span><span>·</span><span>{p.phone}</span>
            {p.sha_number ? <Badge tone="good">SHA {p.sha_number} · demo: active</Badge> : <Badge>No SHA number</Badge>}
          </div>
        </div>
        <div className="actions">
          {openVisit ? <button className="primary" onClick={() => (window.location.hash = '#/visit/' + openVisit.id)}>Open current visit</button>
            : <button className="primary" onClick={() => setVisitModal(true)}>Start visit</button>}
          {c.maternity && p.sex === 'F' && !pregnancy && !isChild && <button onClick={() => setPreg(true)}>Register pregnancy</button>}
          <button onClick={() => setRefer(true)}>Refer</button>
          <button onClick={() => setEdit(true)}>Edit</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        {p.allergies ? <div className="alert bad"><b>Allergies:</b> {p.allergies}</div> : <div className="alert good">No known allergies</div>}
        {p.chronic && <div className="alert info"><b>Chronic:</b> {p.chronic}</div>}
        {pregnancy && <div className="alert info"><b>Pregnant:</b> {Math.floor((Date.now() - new Date(pregnancy.lmp)) / (7 * 864e5))} weeks · EDD {fmtDate(pregnancy.edd)}</div>}
        {d.admissions.find(a => a.status === 'admitted') && <div className="alert warn"><b>Admitted:</b> {d.admissions.find(a => a.status === 'admitted').ward}</div>}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Health overview'], ['timeline', `Timeline (${events.length})`], ['results', 'Results'], ['meds', 'Medications'], ['bills', 'Bills']]} />

      {tab === 'overview' && <div className="grid g-side">
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h3>Health bars</h3><span className="right faint small">{lastVital ? 'Latest readings · ' + fmtDT(lastVital.created_at) : 'No vitals yet'}</span></div>
            {Object.keys(latest).length ? Object.entries(VITAL_RANGES).filter(([k]) => !(isChild && ['sys', 'dia', 'pulse', 'resp'].includes(k))).map(([k, r]) => <HealthBar key={k} r={r} v={latest[k]} />)
              : <Empty>Take vitals at triage to see health bars.</Empty>}
            {Object.values(numericLabs).map(l => l.lo != null && <HealthBar key={l.name} r={{ name: l.name, unit: l.unit, lo: l.lo, hi: l.hi, min: l.lo * 0.4, max: l.hi * 1.6 }} v={l.pts[l.pts.length - 1].value} />)}
            <p className="faint small mt">Green = within the normal adult reference range; amber = borderline; red = outside range. Ranges for children differ{isChild ? ', so adult BP and pulse bars are hidden' : ''}.</p>
          </div>
          {bpData.length > 1 && <Trend title="Blood pressure" data={bpData} keys={[['Systolic', '#dc2626'], ['Diastolic', '#2563eb']]} band={[90, 120]} line={80} unit="mmHg" note="shaded = normal systolic 90–120 · dashed = diastolic upper limit 80" />}
          {gluData.length > 1 && <Trend title="Blood glucose" data={gluData} keys={[['Glucose', '#9333ea']]} band={[3.9, 7.8]} unit="mmol/L" />}
          {wtData.length > 1 && <Trend title="Weight" data={wtData} keys={[['Weight', '#0f766e']]} unit="kg" />}
          {Object.values(numericLabs).filter(l => l.pts.length > 1 && l.name !== 'Random blood sugar').map(l =>
            <Trend key={l.name} title={l.name} data={l.pts.map(x => ({ date: x.date, [l.name]: x.value }))} keys={[[l.name, '#ea580c']]} band={l.lo != null ? [l.lo, l.hi] : null} unit={l.unit} />)}
          {pregnancy && <PregnancyCard pr={pregnancy} reload={reload} />}
        </div>
        <div className="stack">
          <div className="card">
            <h3>At a glance</h3>
            <div className="stack small">
              <div className="row"><span className="muted">Visits</span><b className="right">{d.visits.length}</b></div>
              <div className="row"><span className="muted">Last diagnosis</span><b className="right">{d.notes[0]?.diagnosis || '-'}</b></div>
              <div className="row"><span className="muted">Lab tests</span><b className="right">{d.labs.length}</b></div>
              <div className="row"><span className="muted">Abnormal results</span><b className="right">{d.labs.filter(l => l.flag && l.flag !== 'N').length}</b></div>
              <div className="row"><span className="muted">Outstanding balance</span><b className="right">{money(d.bills.reduce((a, b) => a + (b.status === 'paid' ? 0 : b.balance), 0))}</b></div>
              <div className="row"><span className="muted">County</span><b className="right">{p.county}</b></div>
              <div className="row"><span className="muted">National ID</span><b className="right">{p.national_id || '-'}</b></div>
              <div className="row"><span className="muted">Next of kin</span><span className="right">{p.next_of_kin}</span></div>
            </div>
          </div>
          <div className="card">
            <h3>Recent activity</h3>
            <div className="timeline">{events.slice(0, 8).map((e, i) => <Ev key={i} e={e} />)}</div>
          </div>
        </div>
      </div>}

      {tab === 'timeline' && <div className="card"><div className="timeline">{events.map((e, i) => <Ev key={i} e={e} />)}</div>{!events.length && <Empty>Nothing recorded yet.</Empty>}</div>}

      {tab === 'results' && <div className="stack">
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Range</th><th>Flag</th><th>Where</th><th>Status</th></tr></thead>
          <tbody>{[...d.labs].reverse().map(l => <tr key={l.id}><td className="small">{fmtDate(l.resulted_at || l.created_at)}</td><td>{l.name}</td>
            <td><b>{l.result_value ?? l.result_text ?? '-'}</b> {l.result_value != null && l.unit}</td>
            <td className="small muted">{l.ref_low != null ? `${l.ref_low}–${l.ref_high} ${l.unit}` : ''}</td><td><FlagBadge flag={l.flag} /></td>
            <td className="small">{l.mode === 'outsourced' ? `Outsourced${l.partner ? ' · ' + l.partner : ''}` : 'In-house'}</td><td><StatusBadge s={l.status} /></td></tr>)}</tbody>
        </table>{!d.labs.length && <Empty>No lab results.</Empty>}</div>
        {d.imaging.length > 0 && <div className="card"><h3>Imaging</h3>{d.imaging.map(i => <div key={i.id} style={{ marginBottom: 10 }}><b>{i.name}</b> <StatusBadge s={i.status} /> <span className="faint small">{fmtDate(i.created_at)} {i.partner && '· ' + i.partner}</span><p className="small">{i.report}</p></div>)}</div>}
      </div>}

      {tab === 'meds' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Date</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Days</th><th>Qty</th><th>Status</th></tr></thead>
        <tbody>{d.prescriptions.map(r => <tr key={r.id}><td className="small">{fmtDate(r.created_at)}</td><td>{r.name}</td><td>{r.dose}</td><td>{r.frequency}</td><td>{r.days}</td><td>{r.qty}</td><td><StatusBadge s={r.status} /></td></tr>)}</tbody>
      </table>{!d.prescriptions.length && <Empty>No prescriptions.</Empty>}</div>}

      {tab === 'bills' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Date</th><th>Receipt</th><th>Payer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead>
        <tbody>{d.bills.map(b => <tr key={b.id} className="click" onClick={() => (window.location.hash = '#/billing/' + b.id)}><td className="small">{fmtDate(b.created_at)}</td><td>{b.receipt_no || '-'}</td><td style={{ textTransform: 'uppercase' }} className="small">{b.payer}</td>
          <td className="num">{money(b.total)}</td><td className="num">{money(b.paid)}</td><td className="num">{money(b.balance)}</td><td><StatusBadge s={b.status} /></td></tr>)}</tbody>
      </table></div>}

      {edit && <PatientForm initial={p} onCancel={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      {visitModal && <StartVisit onClose={() => setVisitModal(false)} onStart={startVisit} />}
      {refer && <ReferralForm patient={p} visitId={openVisit?.id} onClose={() => setRefer(false)} onSaved={() => { setRefer(false); reload(); }} />}
      {preg && <PregnancyForm patient={p} onClose={() => setPreg(false)} onSaved={() => { setPreg(false); reload(); }} />}
    </div>
  );
}

function Ev({ e }) {
  const inner = <><div className="small faint">{fmtDT(e.t)} · {e.kind}</div><div>{e.text} {e.flag && e.flag !== 'N' && <FlagBadge flag={e.flag} />}</div></>;
  return <div className="ev">{e.link ? <a href={e.link} style={{ color: 'inherit' }}>{inner}</a> : inner}</div>;
}

export function Trend({ title, data, keys, band, line, note, unit, height = 200 }) {
  return (
    <div className="card">
      <div className="cardhead"><h3>{title}</h3><span className="right faint small">{unit}{note ? ` · ${note}` : band ? ` · shaded = normal ${band[0]}–${band[1]}` : ''}</span></div>
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 0, right: 12, top: 6 }}>
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="#22c55e" fillOpacity={0.1} stroke="none" />}
            {line && <ReferenceLine y={line} stroke="#2563eb" strokeDasharray="4 4" strokeOpacity={0.6} />}
            <XAxis dataKey="date" fontSize={11.5} tickLine={false} axisLine={false} />
            <YAxis fontSize={11.5} tickLine={false} axisLine={false} domain={[d => Math.floor(Math.min(d, band ? band[0] : d, line ?? d) * 0.95), d => Math.ceil(Math.max(d, band ? band[1] : d) * 1.03)]} allowDecimals={false} width={40} />
            <Tooltip />
            {keys.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
            {keys.map(([k, col]) => <Line key={k} dataKey={k} stroke={col} strokeWidth={2} dot={{ r: 3, fill: col, stroke: col }} connectNulls isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PregnancyCard({ pr, reload }) {
  const weeks = Math.floor((Date.now() - new Date(pr.lmp)) / (7 * 864e5));
  const [anc, setAnc] = useState(false);
  const fh = pr.anc.filter(a => a.fundal_height).map(a => ({ week: a.gest_weeks, 'Fundal height': a.fundal_height, low: a.gest_weeks - 2, high: a.gest_weeks + 2 }));
  return (
    <div className="card">
      <div className="cardhead"><h3>Pregnancy</h3><button className="right sm primary" onClick={() => setAnc(true)}>Record ANC visit</button></div>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <div className="stat"><span className="label">Gestation</span><span className="value">{weeks} wk</span></div>
        <div className="stat"><span className="label">EDD</span><span className="value" style={{ fontSize: 18 }}>{fmtDate(pr.edd)}</span></div>
        <div className="stat"><span className="label">Gravida / Para</span><span className="value">G{pr.gravida} P{pr.parity}</span></div>
        <div className="stat"><span className="label">ANC contacts</span><span className="value">{pr.anc.length} / 8</span><span className="hint">Kenya follows the WHO 8-contact model</span></div>
      </div>
      <div style={{ height: 8, background: '#eef2f6', borderRadius: 99 }}><div style={{ height: 8, borderRadius: 99, background: 'var(--brand)', width: Math.min(100, weeks / 40 * 100) + '%' }} /></div>
      <div className="row small faint" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>LMP {fmtDate(pr.lmp)}</span><span>Trimester {weeks < 14 ? 1 : weeks < 28 ? 2 : 3}</span><span>40 wk</span></div>
      {fh.length > 1 && <div style={{ height: 200, marginTop: 12 }}>
        <ResponsiveContainer>
          <LineChart data={fh} margin={{ left: 0, right: 12 }}>
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            <XAxis dataKey="week" fontSize={11.5} tickLine={false} axisLine={false} />
            <YAxis fontSize={11.5} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
            <Tooltip />
            <Line dataKey="low" stroke="#86efac" strokeDasharray="4 4" dot={false} name="Expected (low)" />
            <Line dataKey="high" stroke="#86efac" strokeDasharray="4 4" dot={false} name="Expected (high)" />
            <Line dataKey="Fundal height" stroke="#7c3aed" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>}
      <p className="faint small">Fundal height in cm should be within about 2 of the gestation in weeks (dashed lines) from 20 weeks.</p>
      {anc && <AncForm pr={pr} onClose={() => setAnc(false)} onSaved={() => { setAnc(false); reload(); }} />}
    </div>
  );
}

export function AncForm({ pr, onClose, onSaved }) {
  const [f, setF] = useState({ presentation: 'Cephalic' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => { await act(() => api.post(`/pregnancies/${pr.id}/anc`, f), 'ANC visit recorded and billed'); onSaved(); };
  return <Modal title="ANC visit" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
    <div className="fields">
      <Field label="BP systolic"><input type="number" onChange={e => set('sys', e.target.value)} /></Field>
      <Field label="BP diastolic"><input type="number" onChange={e => set('dia', e.target.value)} /></Field>
      <Field label="Weight (kg)"><input type="number" onChange={e => set('weight', e.target.value)} /></Field>
      <Field label="Fundal height (cm)"><input type="number" onChange={e => set('fundal_height', e.target.value)} /></Field>
      <Field label="Fetal heart rate (bpm)"><input type="number" onChange={e => set('fhr', e.target.value)} /></Field>
      <Field label="Presentation"><select value={f.presentation} onChange={e => set('presentation', e.target.value)}>{['Cephalic', 'Breech', 'Transverse', 'Not determined'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Notes" span={3}><textarea onChange={e => set('notes', e.target.value)} /></Field>
    </div>
  </Modal>;
}

function PregnancyForm({ patient, onClose, onSaved }) {
  const [f, setF] = useState({ gravida: 1, parity: 0 });
  const save = async () => { await act(() => api.post('/pregnancies', { ...f, patient_id: patient.id }), 'Pregnancy registered'); onSaved(); };
  return <Modal title="Register pregnancy" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
    <div className="fields">
      <Field label="Last menstrual period (LMP)"><input type="date" onChange={e => setF({ ...f, lmp: e.target.value })} /></Field>
      <Field label="Gravida"><input type="number" value={f.gravida} onChange={e => setF({ ...f, gravida: e.target.value })} /></Field>
      <Field label="Parity"><input type="number" value={f.parity} onChange={e => setF({ ...f, parity: e.target.value })} /></Field>
    </div>
    {f.lmp && <p className="mt">EDD: <b>{fmtDate(new Date(new Date(f.lmp).getTime() + 280 * 864e5))}</b> (Naegele's rule)</p>}
  </Modal>;
}

function StartVisit({ onClose, onStart }) {
  const [c, setC] = useState('');
  return <Modal title="Start visit" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={() => onStart(c)}>Add to queue</button></>}>
    <Field label="Reason for visit"><input autoFocus value={c} onChange={e => setC(e.target.value)} placeholder="e.g. Fever for 2 days" /></Field>
  </Modal>;
}
