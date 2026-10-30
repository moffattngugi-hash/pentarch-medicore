import React, { useState } from 'react';
import { api } from '../api';
import { useData, Modal, Field, Tabs, StatusBadge, Badge, act, fmtDT, Empty, PatientPicker } from '../ui';

const FACILITIES = ['Kenyatta National Hospital', 'Mama Lucy Kibaki Hospital', 'Mbagathi County Hospital', 'Pumwani Maternity Hospital', 'Nairobi Women\'s Hospital', 'Aga Khan University Hospital', 'Lancet Kenya', 'Plaza Imaging Centre'];

export function ReferralForm({ patient, visitId, onClose, onSaved }) {
  const [f, setF] = useState({ direction: 'out', urgency: 'routine', facility: FACILITIES[0] });
  const [p, setP] = useState(patient || null);
  const save = async () => {
    const r = await act(() => api.post('/referrals', { ...f, patient_id: p.id, visit_id: visitId }), 'Referral recorded');
    onSaved(r);
    if (f.direction === 'out') printReferral(r, p);
  };
  return <Modal title="Referral" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!p || !f.reason} onClick={save}>{f.direction === 'out' ? 'Save and print referral note' : 'Save'}</button></>}>
    {!p ? <PatientPicker onPick={setP} /> : <p style={{ marginBottom: 12 }}><b>{p.first_name} {p.last_name}</b> <span className="faint">{p.mrn}</span></p>}
    <div className="fields">
      <Field label="Direction"><select value={f.direction} onChange={e => setF({ ...f, direction: e.target.value })}><option value="out">Referral out</option><option value="in">Referral in (received)</option></select></Field>
      <Field label={f.direction === 'out' ? 'Receiving facility' : 'Referring facility'}><input list="facilities" value={f.facility} onChange={e => setF({ ...f, facility: e.target.value })} /><datalist id="facilities">{FACILITIES.map(x => <option key={x} value={x} />)}</datalist></Field>
      <Field label="Urgency"><select value={f.urgency} onChange={e => setF({ ...f, urgency: e.target.value })}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></Field>
      <Field label="Reason" span={3}><input value={f.reason || ''} onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
      <Field label="Clinical summary (leave blank to build it from the visit: vitals, labs, treatment)" span={3}><textarea value={f.summary || ''} onChange={e => setF({ ...f, summary: e.target.value })} /></Field>
    </div>
    {visitId && f.direction === 'out' && <label className="check mt"><input type="checkbox" onChange={e => setF({ ...f, close_visit: e.target.checked })} />Send patient to cashier to close this visit</label>}
  </Modal>;
}

function printReferral(r, p) {
  const w = window.open('', '_blank', 'width=700,height=800');
  w.document.write(`<html><head><title>Referral</title></head><body style="font-family:system-ui;padding:24px;max-width:640px">
    <h2>Referral note</h2><p><b>To:</b> ${r.facility}<br/><b>Urgency:</b> ${r.urgency}<br/><b>Date:</b> ${new Date(r.created_at).toLocaleString('en-KE')}</p>
    <p><b>Patient:</b> ${p.first_name} ${p.last_name} (${p.mrn}) · ${p.sex} · DOB ${p.dob || ''} · ${p.phone || ''}</p>
    <p><b>Reason for referral:</b> ${r.reason}</p><p><b>Clinical summary:</b><br/>${(r.summary || '').replace(/\n/g, '<br/>')}</p>
    <p style="margin-top:40px">Referring clinician: ${r.by_user} &nbsp; Signature: ____________</p><script>print()</script></body></html>`);
  w.document.close();
}

export default function Referrals() {
  const [list, reload] = useData('/referrals');
  const [tab, setTab] = useState('out');
  const [adding, setAdding] = useState(false);
  const rows = (list || []).filter(r => r.direction === tab);
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Referrals</h1><p className="sub">Referral notes carry vitals, lab results and treatment given automatically.</p></div>
        <div className="actions"><button className="primary" onClick={() => setAdding(true)}>+ New referral</button></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['out', 'Referred out'], ['in', 'Referred in']]} />
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Date</th><th>Patient</th><th>Facility</th><th>Reason</th><th>Urgency</th><th>By</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} className="click" onClick={() => (window.location.hash = '#/patients/' + r.patient_id)}><td className="small">{fmtDT(r.created_at)}</td><td><b>{r.name}</b> <span className="faint small">{r.mrn}</span></td>
          <td>{r.facility}</td><td>{r.reason}</td><td><Badge tone={r.urgency === 'routine' ? '' : 'bad'}>{r.urgency}</Badge></td><td className="small">{r.by_user}</td></tr>)}</tbody>
      </table>{list && !rows.length && <Empty>No referrals.</Empty>}</div>
      {adding && <ReferralForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}
