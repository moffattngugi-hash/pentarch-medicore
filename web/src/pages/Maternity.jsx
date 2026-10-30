import React, { useState } from 'react';
import { api } from '../api';
import { useData, Modal, Field, Tabs, Badge, act, fmtDate, fmtDT, Empty } from '../ui';
import { AncForm } from './PatientView';

export default function Maternity() {
  const [d, reload] = useData('/maternity');
  const [tab, setTab] = useState('anc');
  const [anc, setAnc] = useState(null);
  const [deliver, setDeliver] = useState(null);
  if (!d) return <div className="page">Loading…</div>;
  const weeks = lmp => Math.floor((Date.now() - new Date(lmp)) / (7 * 864e5));
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Maternity</h1><p className="sub">Antenatal care, labour and delivery, postnatal care. Feeds MOH 405, 333, 406 and 711.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['anc', `Active pregnancies (${d.pregnancies.length})`], ['deliveries', `Deliveries (${d.deliveries.length})`]]} />
      {tab === 'anc' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Mother</th><th>Gestation</th><th>EDD</th><th>G/P</th><th>ANC contacts</th><th>Last ANC</th><th>Status</th><th /></tr></thead>
        <tbody>{d.pregnancies.map(p => {
          const w = weeks(p.lmp);
          return <tr key={p.id}>
            <td><a href={'#/patients/' + p.patient_id}><b>{p.pname}</b></a> <span className="faint small">{p.mrn}</span></td>
            <td><b>{w} wk</b><div style={{ height: 5, background: '#eef2f6', borderRadius: 9, width: 90, marginTop: 4 }}><div style={{ height: 5, borderRadius: 9, background: 'var(--brand)', width: Math.min(100, w / 40 * 100) + '%' }} /></div></td>
            <td>{fmtDate(p.edd)}</td><td>G{p.gravida} P{p.parity}</td>
            <td>{p.anc_count} / 8 {p.anc_count < Math.min(8, Math.max(1, Math.floor(w / 5))) && <Badge tone="warn">behind</Badge>}</td>
            <td className="small">{fmtDate(p.last_anc)}</td>
            <td>{p.admission_id ? <Badge tone="bad">In labour ward</Badge> : w >= 37 ? <Badge tone="warn">Term</Badge> : <Badge tone="good">Antenatal</Badge>}</td>
            <td className="row"><button className="sm" onClick={() => setAnc(p)}>ANC visit</button>{w >= 28 && <button className="sm primary" onClick={() => setDeliver(p)}>Record delivery</button>}</td></tr>;
        })}</tbody>
      </table>{!d.pregnancies.length && <Empty>No active pregnancies. Register one from a patient's dashboard.</Empty>}</div>}
      {tab === 'deliveries' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Date</th><th>Mother</th><th>Mode</th><th>Outcome</th><th>Baby</th><th>APGAR</th></tr></thead>
        <tbody>{d.deliveries.map(x => <tr key={x.id}><td className="small">{fmtDT(x.delivered_at)}</td><td>{x.pname}</td><td>{x.mode}</td><td>{x.outcome}</td>
          <td>{x.baby_sex === 'M' ? 'Boy' : 'Girl'}, {x.baby_weight} kg {x.baby_weight < 2.5 && <Badge tone="warn">LBW</Badge>}</td><td>{x.apgar1} / {x.apgar5}</td></tr>)}</tbody>
      </table>{!d.deliveries.length && <Empty>No deliveries recorded yet.</Empty>}</div>}
      {anc && <AncForm pr={anc} onClose={() => setAnc(null)} onSaved={() => { setAnc(null); reload(); }} />}
      {deliver && <DeliveryForm pr={deliver} onClose={() => setDeliver(null)} onSaved={() => { setDeliver(null); reload(); setTab('deliveries'); }} />}
    </div>
  );
}

function DeliveryForm({ pr, onClose, onSaved }) {
  const [f, setF] = useState({ mode: 'Spontaneous vaginal delivery', outcome: 'Live birth', baby_sex: 'F', apgar1: 8, apgar5: 9 });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => { await act(() => api.post(`/pregnancies/${pr.id}/delivery`, f), 'Delivery recorded and charged to the admission bill'); onSaved(); };
  return <Modal title={`Delivery · ${pr.pname}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!f.baby_weight} onClick={save}>Save delivery</button></>}>
    <div className="fields">
      <Field label="Mode"><select value={f.mode} onChange={e => set('mode', e.target.value)}>{['Spontaneous vaginal delivery', 'Assisted vaginal delivery', 'Caesarean section', 'Breech delivery'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Outcome"><select value={f.outcome} onChange={e => set('outcome', e.target.value)}>{['Live birth', 'Fresh stillbirth', 'Macerated stillbirth'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Baby sex"><select value={f.baby_sex} onChange={e => set('baby_sex', e.target.value)}><option value="F">Female</option><option value="M">Male</option></select></Field>
      <Field label="Birth weight (kg)"><input type="number" step="0.01" onChange={e => set('baby_weight', e.target.value)} /></Field>
      <Field label="APGAR 1 min"><input type="number" value={f.apgar1} onChange={e => set('apgar1', e.target.value)} /></Field>
      <Field label="APGAR 5 min"><input type="number" value={f.apgar5} onChange={e => set('apgar5', e.target.value)} /></Field>
      <Field label="Notes (3rd stage, blood loss, oxytocin given)" span={3}><textarea onChange={e => set('notes', e.target.value)} /></Field>
    </div>
  </Modal>;
}
