import React, { useContext, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Badge, act, money, fmtDT, age, Empty, PatientPicker } from '../ui';

export default function Wards() {
  const c = useContext(ConfigContext);
  const [wards, reload] = useData('/wards');
  const [open, setOpen] = useState(null);
  const [admitBed, setAdmitBed] = useState(null);
  if (!wards) return <div className="page">Loading…</div>;
  const total = wards.reduce((a, w) => a + w.beds.length, 0);
  const occ = wards.reduce((a, w) => a + w.beds.filter(b => b.admission_id).length, 0);
  const days = t => Math.max(1, Math.ceil((Date.now() - new Date(t)) / 864e5));
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Wards & beds</h1><p className="sub">{occ} of {total} beds occupied ({Math.round(occ / Math.max(1, total) * 100)}%). Click a bed to manage the patient or admit.</p></div>
        <div className="actions"><button onClick={async () => { const r = await act(() => api.post('/wards/charge')); alert(`${r.posted} bed-day charge(s) posted to interim bills.`); }}>Post today's bed charges</button></div>
      </div>
      <div className="stack">{wards.map(w => <div key={w.id} className="card">
        <div className="cardhead"><h3>{w.name}</h3><span className="muted small">{money(w.daily_rate)} per day</span>
          <span className="right"><Badge tone="info">{w.beds.filter(b => b.admission_id).length} / {w.beds.length} occupied</Badge></span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {w.beds.map(b => b.admission_id
            ? <button key={b.id} className="choice on" style={{ padding: 10 }} onClick={() => setOpen(b)}><b className="small">{b.label} · {b.pname}</b>
              <span className="small muted">{b.sex} · {age(b.dob)} · day {days(b.admitted_at)}</span><div className="small" style={{ marginTop: 2 }}>{b.reason}</div></button>
            : <button key={b.id} className="choice" style={{ padding: 10, borderStyle: 'dashed' }} onClick={() => setAdmitBed(b)}><b className="small">{b.label}</b><span className="small faint">Free · admit</span></button>)}
        </div>
      </div>)}</div>
      {open && <AdmissionPanel bed={open} wards={wards} maternity={c.maternity} onClose={() => { setOpen(null); reload(); }} />}
      {admitBed && <AdmitHere bed={admitBed} onClose={() => setAdmitBed(null)} onDone={() => { setAdmitBed(null); reload(); }} />}
    </div>
  );
}

function AdmitHere({ bed, onClose, onDone }) {
  const [p, setP] = useState(null);
  const [reason, setReason] = useState('');
  const go = async () => {
    const v = await act(() => api.post('/visits', { patient_id: p.id, type: 'IPD', complaint: reason }));
    await act(() => api.post(`/visits/${v.id}/admit`, { bed_id: bed.id, reason }), `Admitted to ${bed.label}`);
    onDone();
  };
  return <Modal title={`Admit to bed ${bed.label}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!p || !reason} onClick={go}>Admit</button></>}>
    {!p ? <PatientPicker onPick={setP} /> : <p><b>{p.first_name} {p.last_name}</b> <span className="faint">{p.mrn}</span> <button className="sm" onClick={() => setP(null)}>Change</button></p>}
    <div className="mt"><Field label="Reason for admission"><input value={reason} onChange={e => setReason(e.target.value)} /></Field></div>
  </Modal>;
}

function AdmissionPanel({ bed, wards, maternity, onClose }) {
  const [a, reload] = useData('/admissions/' + bed.admission_id);
  const [note, setNote] = useState('');
  const [discharge, setDischarge] = useState(null);
  const [transfer, setTransfer] = useState(false);
  if (!a) return null;
  const free = wards.flatMap(w => w.beds.filter(b => !b.admission_id).map(b => ({ ...b, ward: w.name })));
  const addNote = async () => { await act(() => api.post(`/admissions/${a.id}/note`, { note }), 'Note added'); setNote(''); reload(); };
  const isLabour = maternity && /labou?r/i.test(a.reason || '');
  return <Modal wide title={`${bed.pname} · ${a.ward} ${a.bed}`} onClose={onClose} footer={<>
    <button onClick={() => (window.location.hash = '#/visit/' + a.visit_id)}>Open clinical record (vitals, orders, Rx)</button>
    <button onClick={() => setTransfer(true)}>Transfer bed</button>
    <button className="primary" onClick={() => setDischarge('')}>Discharge</button></>}>
    <div className="row" style={{ marginBottom: 12 }}><Badge tone="info">Admitted {fmtDT(a.admitted_at)}</Badge><span>{a.reason}</span><span className="right muted small">{money(a.daily_rate)} / day · bed charges post daily to the interim bill</span></div>
    {isLabour && <Partograph admissionId={a.id} />}
    <h3 className="mt">Nursing notes</h3>
    <div className="row" style={{ margin: '8px 0' }}><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 14:00 vitals stable, IV fluids running, patient comfortable" /><button className="primary" disabled={!note} onClick={addNote}>Add</button></div>
    <div className="timeline">{a.notes.map(n => <div key={n.id} className="ev"><div className="small faint">{fmtDT(n.created_at)} · {n.by_user}</div>{n.note}</div>)}</div>
    {transfer && <div className="card mt"><b>Transfer to:</b><div className="row mt">{free.map(b => <button key={b.id} className="sm" onClick={async () => { await act(() => api.post(`/admissions/${a.id}/transfer`, { bed_id: b.id }), 'Transferred'); onClose(); }}>{b.ward} · {b.label}</button>)}</div></div>}
    {discharge !== null && <Modal title="Discharge summary" onClose={() => setDischarge(null)} footer={<button className="primary" onClick={async () => {
      const r = await act(() => api.post(`/admissions/${a.id}/discharge`, { summary: discharge }), 'Discharged. Final bill is ready at the cashier.');
      window.location.hash = '#/visit/' + r.visit_id;
    }}>Discharge and send to cashier</button>}>
      <Field label="Diagnosis, treatment given, condition on discharge, follow-up plan and medicines to take home"><textarea style={{ minHeight: 160 }} value={discharge} onChange={e => setDischarge(e.target.value)} /></Field>
    </Modal>}
  </Modal>;
}

// WHO partograph: active labour from 4 cm; alert line at 1 cm/hour, action line 4 hours to its right
function Partograph({ admissionId }) {
  const [rows, reload] = useData(`/admissions/${admissionId}/partograph`);
  const [f, setF] = useState({});
  if (!rows) return null;
  const t0 = rows[0] ? new Date(rows[0].at).getTime() : Date.now();
  const start = rows[0]?.dilation || 4;
  const pts = rows.map(r => ({ h: Math.round((new Date(r.at) - t0) / 360e3) / 10, dilation: r.dilation, fhr: r.fhr }));
  const alertLine = [{ h: 0, alert: start }, { h: 10 - start, alert: 10 }];
  const actionLine = [{ h: 4, action: start }, { h: 14 - start, action: 10 }];
  const last = pts[pts.length - 1];
  const behind = last && last.dilation < start + last.h;
  const save = async () => { await act(() => api.post(`/admissions/${admissionId}/partograph`, f), 'Partograph updated'); setF({}); reload(); };
  return <div className="card" style={{ background: '#faf5ff' }}>
    <div className="cardhead"><h3>Partograph</h3>{last && <Badge tone={behind ? 'warn' : 'good'}>{behind ? 'Crossed alert line - review progress' : 'Progress normal'}</Badge>}
      <span className="right faint small">Cervical dilation (cm) vs hours in active labour</span></div>
    <div style={{ height: 230 }}>
      <ResponsiveContainer>
        <LineChart margin={{ left: 0, right: 16 }}>
          <CartesianGrid stroke="#e9d5ff" />
          <XAxis type="number" dataKey="h" domain={[0, 12]} ticks={[0, 2, 4, 6, 8, 10, 12]} fontSize={11.5} unit="h" />
          <YAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} fontSize={11.5} width={30} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line data={alertLine} dataKey="alert" name="Alert line" stroke="#f59e0b" strokeDasharray="5 4" dot={false} />
          <Line data={actionLine} dataKey="action" name="Action line" stroke="#dc2626" strokeDasharray="5 4" dot={false} />
          <Line data={pts} dataKey="dilation" name="Dilation (cm)" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 5, fill: '#7c3aed' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="fields mt" style={{ gridTemplateColumns: 'repeat(5, 1fr) auto', alignItems: 'end' }}>
      <Field label="Dilation (cm)"><input type="number" value={f.dilation || ''} onChange={e => setF({ ...f, dilation: e.target.value })} /></Field>
      <Field label="Fetal HR"><input type="number" value={f.fhr || ''} onChange={e => setF({ ...f, fhr: e.target.value })} /></Field>
      <Field label="Contractions /10 min"><input type="number" value={f.contractions || ''} onChange={e => setF({ ...f, contractions: e.target.value })} /></Field>
      <Field label="BP sys"><input type="number" value={f.sys || ''} onChange={e => setF({ ...f, sys: e.target.value })} /></Field>
      <Field label="BP dia"><input type="number" value={f.dia || ''} onChange={e => setF({ ...f, dia: e.target.value })} /></Field>
      <button className="primary" disabled={!f.dilation} onClick={save}>Plot</button>
    </div>
    <p className="faint small mt">Latest: {rows.length ? `${last.dilation} cm, FHR ${last.fhr}` : 'none'} · record delivery from the Maternity page.</p>
  </div>;
}
