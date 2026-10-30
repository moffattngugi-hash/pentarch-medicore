import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, PatientPicker, act, Badge, TriageBadge, age, PageHead, Tip, Icon } from '../ui';
import { PatientForm } from './Patients';

export default function Queue() {
  const c = useContext(ConfigContext);
  const [list, reload] = useData('/visits');
  const [adding, setAdding] = useState(false);
  const [register, setRegister] = useState(false);
  useEffect(() => { const h = setInterval(reload, 15000); return () => clearInterval(h); }, [reload]);
  const lanes = [
    c.consultation !== false && ['waiting_triage', 'Triage'],
    c.consultation !== false && ['waiting_doctor', c.type === 'pharmacy' ? 'Clinician / pharmacist' : 'Clinician'],
    c.lab !== 'none' && ['in_lab', 'Laboratory'],
    ['pharmacy', 'Pharmacy'],
    ['billing', 'Cashier'],
  ].filter(Boolean);
  const done = (list || []).filter(v => v.status === 'closed');
  const mins = t => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  return (
    <div className="page">
      <PageHead icon="queue" title={c.type === 'pharmacy' ? 'Service queue' : 'Outpatient queue'} sub="Patients move across the board as each service point finishes. Refreshes every 15 seconds.">
        <button onClick={() => setRegister(true)}>Register new patient</button>
        <button className="primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Add to queue</button>
      </PageHead>
      <Tip id="queue">Triage colours: <Badge tone="bad">Emergency</Badge> treat now, <Badge tone="warn">Priority</Badge> seen next, <Badge tone="good">Queue</Badge> seen in turn (Kenya ETAT+). Click a ticket to open the patient's visit.</Tip>
      <div className="board" style={{ gridTemplateColumns: `repeat(${lanes.length}, minmax(210px, 1fr))` }}>
        {lanes.map(([k, label]) => {
          const items = (list || []).filter(v => v.status === k);
          return <div key={k} className="lane">
            <h4>{label}<span>{items.length}</span></h4>
            {items.map(v => <div key={v.id} className={'ticket ' + (v.triage_level || '')} onClick={() => (window.location.hash = '#/visit/' + v.id)}>
              <div className="row"><span className="q">#{v.queue_no || '-'}</span><TriageBadge level={v.triage_level} /><span className="right faint small">{mins(v.created_at)}</span></div>
              <b style={{ display: 'block', marginTop: 4 }}>{v.name}</b>
              <div className="small muted">{v.sex === 'F' ? 'Female' : 'Male'} · {age(v.dob)}</div>
              {v.complaint && <div className="small" style={{ marginTop: 4 }}>{v.complaint}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                {v.allergies && <Badge tone="bad">Allergy</Badge>}
                {v.pending_labs > 0 && <Badge tone="brand">{v.pending_labs} lab</Badge>}
                {v.pending_rx > 0 && <Badge tone="info">{v.pending_rx} Rx</Badge>}
                {v.type === 'ANC' && <Badge tone="info">ANC</Badge>}
              </div>
            </div>)}
            {!items.length && <div className="faint small" style={{ textAlign: 'center', padding: 20 }}>Empty</div>}
          </div>;
        })}
      </div>
      <p className="faint small mt">{done.length} visit{done.length === 1 ? '' : 's'} completed today.</p>
      {adding && <AddToQueue onClose={() => setAdding(false)} onDone={v => { setAdding(false); reload(); window.location.hash = '#/visit/' + v.id; }} />}
      {register && <PatientForm startVisit onCancel={() => setRegister(false)} onSaved={(p, v) => { setRegister(false); reload(); if (v) window.location.hash = '#/visit/' + v.id; }} />}
    </div>
  );
}

function AddToQueue({ onClose, onDone }) {
  const [p, setP] = useState(null);
  const [complaint, setComplaint] = useState('');
  const go = async () => onDone(await act(() => api.post('/visits', { patient_id: p.id, complaint }), 'Added to queue'));
  return <Modal title="Add patient to queue" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!p} onClick={go}>Add to queue</button></>}>
    {!p ? <PatientPicker onPick={setP} /> : <div className="stack">
      <div className="row"><b>{p.first_name} {p.last_name}</b><span className="faint">{p.mrn}</span><button className="sm right" onClick={() => setP(null)}>Change</button></div>
      <Field label="Reason for visit"><input autoFocus value={complaint} onChange={e => setComplaint(e.target.value)} placeholder="e.g. Cough for 1 week" /></Field>
    </div>}
  </Modal>;
}
