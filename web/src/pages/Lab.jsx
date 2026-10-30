import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Tabs, StatusBadge, FlagBadge, Badge, act, fmtDT, money, age, Empty } from '../ui';

export function ResultEntry({ order, onClose, onDone }) {
  const [val, setVal] = useState('');
  const [comment, setComment] = useState(order.mode === 'outsourced' ? `Result from ${order.partner || 'external lab'} report` : '');
  const numeric = order.kind === 'numeric';
  const presets = { MPS: ['Negative', 'Positive (+)', 'Positive (++)', 'Positive (+++)'], MRDT: ['Negative', 'Positive'], HCG: ['Negative', 'Positive'], HIV: ['Non-reactive', 'Reactive'], VDRL: ['Non-reactive', 'Reactive'], WIDAL: ['Negative', 'Positive (O 1:160)', 'Positive (O 1:320)'], HPY: ['Negative', 'Positive'], BGRP: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] };
  const opts = presets[order.code];
  const flagPreview = numeric && val !== '' ? (Number(val) < order.ref_low ? 'L' : Number(val) > order.ref_high ? 'H' : 'N') : null;
  const save = async () => {
    await act(() => api.post(`/lab/orders/${order.id}/result`, numeric ? { value: val, comment } : { text: val, comment }), 'Result saved');
    onDone();
  };
  return <Modal title={`Result: ${order.name}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={val === ''} onClick={save}>Save result</button></>}>
    <p className="muted" style={{ marginBottom: 12 }}>{order.pname}{order.mode === 'outsourced' && <> · <Badge tone="info">Outside lab: {order.partner}</Badge></>}</p>
    {numeric ? <div className="row">
      <Field label={`Value (${order.unit})`}><input type="number" step="0.1" autoFocus value={val} onChange={e => setVal(e.target.value)} /></Field>
      <span className="muted small">Normal {order.ref_low}–{order.ref_high} {order.unit}</span>{flagPreview && <FlagBadge flag={flagPreview} />}
    </div> : opts ? <div className="row">{opts.map(o => <button key={o} className={val === o ? 'primary' : ''} onClick={() => setVal(o)}>{o}</button>)}</div>
      : <Field label="Result"><textarea autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder={order.code === 'FBC' ? 'WBC 7.2, Hb 13.1, PLT 250…' : ''} /></Field>}
    <div className="mt"><Field label="Comment"><input value={comment} onChange={e => setComment(e.target.value)} /></Field></div>
  </Modal>;
}

export default function Lab() {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState('pending');
  const [pending, reloadP] = useData('/lab/orders');
  const [done, reloadD] = useData('/lab/orders?status=done');
  const [tests, reloadT] = useData('/lab/tests');
  const [entering, setEntering] = useState(null);
  const reload = () => { reloadP(); reloadD(); };
  const collect = async o => { await act(() => api.post(`/lab/orders/${o.id}/collect`), 'Sample collected'); reload(); };
  const validate = async o => { await act(() => api.post(`/lab/orders/${o.id}/validate`), 'Result validated and released'); reload(); };
  const pend = (pending || []).filter(o => o.status !== 'resulted');
  const toValidate = (pending || []).filter(o => o.status === 'resulted');
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Laboratory</h1><p className="sub">{c.lab === 'both' ? 'In-house tests plus requisitions to partner labs' : c.lab === 'outsourced' ? 'All tests sent to partner labs; results entered on return' : 'In-house laboratory'}</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `Worklist (${pend.length})`], ['validate', `To validate (${toValidate.length})`], ['done', 'Completed (14 days)'], ['catalogue', 'Test catalogue']]} />
      {tab === 'pending' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Ordered</th><th>Patient</th><th>Test</th><th>Sample</th><th>Where</th><th>Status</th><th /></tr></thead>
        <tbody>{pend.map(o => <tr key={o.id}>
          <td className="small">{fmtDT(o.created_at)}</td><td><b>{o.pname}</b><div className="faint small">{o.mrn} · {o.sex} · {age(o.dob)}</div></td>
          <td>{o.name}</td><td className="small">{o.sample}</td><td className="small">{o.mode === 'outsourced' ? <Badge tone="info">{o.partner}</Badge> : 'In-house'}</td><td><StatusBadge s={o.status} /></td>
          <td className="row">{o.status === 'ordered' && <button className="sm" onClick={() => collect(o)}>Collect sample</button>}
            <button className="sm primary" onClick={() => setEntering(o)}>Enter result</button></td></tr>)}</tbody>
      </table>{pending && !pend.length && <Empty>Worklist is clear.</Empty>}</div>}
      {tab === 'validate' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Patient</th><th>Test</th><th>Result</th><th>Flag</th><th>Entered by</th><th /></tr></thead>
        <tbody>{toValidate.map(o => <tr key={o.id}><td><b>{o.pname}</b></td><td>{o.name}</td><td><b>{o.result_value ?? o.result_text}</b> {o.result_value != null && o.unit}</td><td><FlagBadge flag={o.flag} /></td>
          <td className="small">{o.resulted_by}</td><td><button className="sm primary" onClick={() => validate(o)}>Validate</button></td></tr>)}</tbody>
      </table>{!toValidate.length && <Empty>Nothing waiting for validation.</Empty>}<p className="faint small" style={{ padding: 10 }}>In-house results need a second person to validate before release. Sign in as another user to validate.</p></div>}
      {tab === 'done' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Resulted</th><th>Patient</th><th>Test</th><th>Result</th><th>Flag</th><th>Status</th></tr></thead>
        <tbody>{(done || []).map(o => <tr key={o.id}><td className="small">{fmtDT(o.resulted_at)}</td><td>{o.pname}</td><td>{o.name}</td><td><b>{o.result_value ?? o.result_text}</b> {o.result_value != null && o.unit}</td><td><FlagBadge flag={o.flag} /></td><td><StatusBadge s={o.status} /></td></tr>)}</tbody>
      </table></div>}
      {tab === 'catalogue' && <Catalogue tests={tests || []} reload={reloadT} />}
      {entering && <ResultEntry order={entering} onClose={() => setEntering(null)} onDone={() => { setEntering(null); reload(); }} />}
    </div>
  );
}

function Catalogue({ tests, reload }) {
  const [edit, setEdit] = useState(null);
  const save = async () => { await act(() => api.put('/lab/tests/' + edit.id, edit), 'Test updated'); setEdit(null); reload(); };
  return <div className="tablewrap"><table className="table">
    <thead><tr><th>Code</th><th>Test</th><th>Sample</th><th>Normal range</th><th className="num">Price</th><th>Where</th><th /></tr></thead>
    <tbody>{tests.map(t => <tr key={t.id}><td className="muted">{t.code}</td><td>{t.name}</td><td>{t.sample}</td><td className="small">{t.ref_low != null ? `${t.ref_low}–${t.ref_high} ${t.unit}` : t.abnormal_text ? `Abnormal if ${t.abnormal_text}` : '-'}</td>
      <td className="num">{money(t.price)}</td><td>{t.outsourced_only ? <Badge tone="info">Outside only</Badge> : 'In-house'}</td><td><button className="sm" onClick={() => setEdit(t)}>Edit</button></td></tr>)}</tbody>
    {edit && <Modal title={edit.name} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="fields">
        <Field label="Price (KES)"><input type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>
        {edit.kind === 'numeric' && <><Field label="Normal low"><input type="number" value={edit.ref_low} onChange={e => setEdit({ ...edit, ref_low: e.target.value })} /></Field>
          <Field label="Normal high"><input type="number" value={edit.ref_high} onChange={e => setEdit({ ...edit, ref_high: e.target.value })} /></Field></>}
      </div>
      <label className="check mt"><input type="checkbox" checked={!!edit.outsourced_only} onChange={e => setEdit({ ...edit, outsourced_only: e.target.checked })} />Always sent to an outside lab</label>
    </Modal>}
  </table></div>;
}
