import React, { useState, useContext } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, act, age, fmtDate, Empty, Badge } from '../ui';

const COUNTIES = ['Nairobi', 'Kiambu', 'Machakos', 'Kajiado', 'Nakuru', 'Mombasa', 'Kisumu', 'Uasin Gishu', 'Nyeri', 'Murang\'a', 'Embu', 'Meru', 'Kakamega', 'Homa Bay', 'Kilifi', 'Other'];

export function PatientForm({ initial, onSaved, onCancel, startVisit }) {
  const [p, setP] = useState(initial || { sex: 'F', county: 'Nairobi' });
  const [visit, setVisit] = useState(!!startVisit);
  const [complaint, setComplaint] = useState('');
  const set = (k, v) => setP(x => ({ ...x, [k]: v }));
  const save = async () => {
    const saved = initial?.id ? await act(() => api.put('/patients/' + initial.id, p), 'Patient updated') : await act(() => api.post('/patients', p), 'Patient registered');
    let v = null;
    if (visit && !initial?.id) v = await act(() => api.post('/visits', { patient_id: saved.id, complaint }));
    onSaved(saved, v);
  };
  return (
    <Modal title={initial?.id ? 'Edit patient' : 'Register patient'} onClose={onCancel} wide
      footer={<><button onClick={onCancel}>Cancel</button><button className="primary" onClick={save}>{initial?.id ? 'Save' : visit ? 'Register and add to queue' : 'Register'}</button></>}>
      <div className="fields">
        <Field label="First name *"><input value={p.first_name || ''} onChange={e => set('first_name', e.target.value)} autoFocus /></Field>
        <Field label="Last name *"><input value={p.last_name || ''} onChange={e => set('last_name', e.target.value)} /></Field>
        <Field label="Sex"><select value={p.sex} onChange={e => set('sex', e.target.value)}><option value="F">Female</option><option value="M">Male</option></select></Field>
        <Field label="Date of birth"><input type="date" value={p.dob || ''} onChange={e => set('dob', e.target.value)} /></Field>
        <Field label="Phone"><input value={p.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="07XX XXX XXX" /></Field>
        <Field label="National ID / birth cert."><input value={p.national_id || ''} onChange={e => set('national_id', e.target.value)} /></Field>
        <Field label="SHA number"><input value={p.sha_number || ''} onChange={e => set('sha_number', e.target.value)} /></Field>
        <Field label="County"><select value={p.county || ''} onChange={e => set('county', e.target.value)}>{COUNTIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Allergies" span={2}><input value={p.allergies || ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. Penicillin" /></Field>
        <Field label="Chronic conditions" span={2}><input value={p.chronic || ''} onChange={e => set('chronic', e.target.value)} placeholder="e.g. Hypertension" /></Field>
        <Field label="Next of kin (name, relationship, phone)" span={4}><input value={p.next_of_kin || ''} onChange={e => set('next_of_kin', e.target.value)} /></Field>
      </div>
      {!initial?.id && <div className="stack mt">
        <label className="check"><input type="checkbox" checked={visit} onChange={e => setVisit(e.target.checked)} />Start a visit and add to the queue now</label>
        {visit && <Field label="Reason for visit"><input value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="e.g. Fever for 2 days" /></Field>}
      </div>}
      <p className="faint small mt">Consent: the patient agrees to their data being kept by this facility under the Data Protection Act, 2019.</p>
    </Modal>
  );
}

export default function Patients() {
  const c = useContext(ConfigContext);
  const [q, setQ] = useState('');
  const [list, reload] = useData('/patients?q=' + encodeURIComponent(q), [q]);
  const [adding, setAdding] = useState(false);
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Patients</h1><p className="sub">Search before registering to avoid duplicate files.</p></div>
        <div className="actions"><button className="primary" onClick={() => setAdding(true)}>+ Register patient</button></div>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, phone, MRN, national ID or SHA number" style={{ maxWidth: 520, marginBottom: 14 }} />
      <div className="tablewrap">
        <table className="table">
          <thead><tr><th>Patient</th><th>MRN</th><th>Sex / age</th><th>Phone</th><th>SHA</th><th>Flags</th><th>Last visit</th></tr></thead>
          <tbody>
            {(list || []).map(p => <tr key={p.id} className="click" onClick={() => (window.location.hash = '#/patients/' + p.id)}>
              <td><b>{p.first_name} {p.last_name}</b></td><td className="muted">{p.mrn}</td><td>{p.sex} · {age(p.dob)}</td>
              <td>{p.phone}</td><td className="small">{p.sha_number ? <Badge tone="good">{p.sha_number}</Badge> : <span className="faint">-</span>}</td>
              <td className="row">{p.allergies && <Badge tone="bad">Allergy</Badge>}{p.chronic && <Badge tone="info">{p.chronic}</Badge>}</td>
              <td className="small muted">{fmtDate(p.last_visit)}</td></tr>)}
          </tbody>
        </table>
        {list && !list.length && <Empty>No patients match “{q}”.</Empty>}
      </div>
      {adding && <PatientForm startVisit={c.consultation !== false} onCancel={() => setAdding(false)} onSaved={(p, v) => { setAdding(false); reload(); window.location.hash = v ? '#/visit/' + v.id : '#/patients/' + p.id; }} />}
    </div>
  );
}
