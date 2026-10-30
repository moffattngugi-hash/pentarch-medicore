import React, { useState } from 'react';
import { api } from '../api';
import { useData, Modal, Field, StatusBadge, Badge, act, fmtDate, Empty, PatientPicker, todayISO } from '../ui';

export default function Appointments() {
  const [list, reload] = useData('/appointments');
  const [adding, setAdding] = useState(false);
  const checkIn = async a => {
    let pid = a.patient_id;
    if (!pid) {
      const [first, ...rest] = a.name.split(' ');
      const found = (await api.get('/patients?q=' + encodeURIComponent(a.phone)))[0];
      pid = found ? found.id : (await act(() => api.post('/patients', { first_name: first, last_name: rest.join(' ') || '-', phone: a.phone, sex: 'F' }))).id;
    }
    const v = await act(() => api.post('/visits', { patient_id: pid, complaint: a.service }), 'Checked in and added to queue');
    await api.post(`/appointments/${a.id}/status`, { status: 'arrived' });
    window.location.hash = '#/visit/' + v.id;
  };
  const groups = {};
  for (const a of list || []) (groups[a.date] ||= []).push(a);
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Appointments</h1><p className="sub">Desk bookings and bookings made on the facility website. Checking in adds the patient to the queue.</p></div>
        <div className="actions"><button className="primary" onClick={() => setAdding(true)}>+ Book appointment</button></div></div>
      {Object.entries(groups).map(([date, rows]) => <div key={date} className="card" style={{ marginBottom: 12 }}>
        <h3>{date === todayISO() ? 'Today' : fmtDate(date)}</h3>
        <table className="table"><tbody>{rows.map(a => <tr key={a.id}><td style={{ width: 70 }}><b>{a.time}</b></td><td><b>{a.name}</b> <span className="faint small">{a.phone}</span></td>
          <td>{a.service}</td><td>{a.source === 'web' ? <Badge tone="info">Website</Badge> : <Badge>Desk</Badge>}</td><td><StatusBadge s={a.status} /></td>
          <td className="row">{a.status === 'booked' && <><button className="sm primary" onClick={() => checkIn(a)}>Check in</button>
            <button className="sm" onClick={async () => { await api.post(`/appointments/${a.id}/status`, { status: 'cancelled' }); reload(); }}>Cancel</button></>}</td></tr>)}</tbody></table>
      </div>)}
      {list && !list.length && <Empty>No upcoming appointments.</Empty>}
      {adding && <Book onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function Book({ onClose, onDone }) {
  const [p, setP] = useState(null);
  const [f, setF] = useState({ date: todayISO(), time: '09:00', service: 'Consultation' });
  const save = async () => { await act(() => api.post('/appointments', { ...f, patient_id: p.id, name: `${p.first_name} ${p.last_name}`, phone: p.phone }), 'Appointment booked'); onDone(); };
  return <Modal title="Book appointment" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!p} onClick={save}>Book</button></>}>
    {!p ? <PatientPicker onPick={setP} /> : <p><b>{p.first_name} {p.last_name}</b> <span className="faint">{p.mrn}</span></p>}
    <div className="fields mt">
      <Field label="Date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Time"><input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></Field>
      <Field label="Service"><input value={f.service} onChange={e => setF({ ...f, service: e.target.value })} /></Field>
    </div>
    <p className="faint small mt">An SMS reminder is sent the day before (simulated in the demo).</p>
  </Modal>;
}
