import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Tabs, StatusBadge, FlagBadge, Badge, act, fmtDT, money, age, Empty, PageHead, Tip, Stat, Icon } from '../ui';

export const DEPT_COLOR = {
  Haematology: '#dc2626', Parasitology: '#16a34a', 'Clinical chemistry': '#2563eb', Hormones: '#9333ea', Serology: '#ea580c',
  Urinalysis: '#ca8a04', Microbiology: '#0d9488', 'Histology & cytology': '#db2777',
};
const PRESETS = {
  MPS: ['Negative', 'Positive (+)', 'Positive (++)', 'Positive (+++)'], MRDT: ['Negative', 'Positive (P. falciparum)'], HCG: ['Negative', 'Positive'],
  HIV: ['Non-reactive', 'Reactive'], VDRL: ['Non-reactive', 'Reactive'], HBSAG: ['Negative', 'Positive'], HCV: ['Negative', 'Positive'],
  WIDAL: ['Negative', 'Positive (O 1:160)', 'Positive (O 1:320)'], TYPHI: ['Negative', 'Positive'], HPY: ['Negative', 'Positive'], HPYS: ['Negative', 'Positive'],
  BRUC: ['Negative', 'Positive'], RF: ['Negative', 'Positive'], COVID: ['Negative', 'Positive'], SICK: ['Negative', 'Positive'], AFB: ['No AFB seen', 'Positive (scanty)', 'Positive (1+)', 'Positive (2+)'],
  BGRP: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], VIA: ['Negative', 'Positive', 'Suspicious for cancer'],
  STOOL: ['No ova or cysts seen', 'Ascaris ova seen', 'Hookworm ova seen', 'E. histolytica cysts seen', 'Giardia cysts seen'],
  UPROT: ['Negative', 'Trace', '+', '++', '+++'], GENEX: ['MTB not detected', 'MTB detected, RIF resistance not detected', 'MTB detected, RIF resistance detected'],
};

export function ResultEntry({ order, onClose, onDone }) {
  const [val, setVal] = useState('');
  const [comment, setComment] = useState(order.mode === 'outsourced' ? `Result from ${order.partner || 'external lab'} report` : '');
  const numeric = order.kind === 'numeric';
  const opts = PRESETS[order.code];
  const flagPreview = numeric && val !== '' ? (Number(val) < order.ref_low ? 'L' : Number(val) > order.ref_high ? 'H' : 'N') : null;
  const save = async () => { await act(() => api.post(`/lab/orders/${order.id}/result`, numeric ? { value: val, comment } : { text: val, comment }), 'Result saved'); onDone(); };
  return <Modal title={`Result: ${order.name}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={val === ''} onClick={save}>Save result</button></>}>
    <div className="row" style={{ marginBottom: 14 }}><b>{order.pname}</b>{order.dept && <span className="dept" style={{ '--dc': DEPT_COLOR[order.dept] }}>{order.dept}</span>}
      {order.mode === 'outsourced' && <Badge tone="info">Outside lab: {order.partner}</Badge>}</div>
    {numeric ? <div className="row" style={{ alignItems: 'flex-end' }}>
      <div style={{ width: 180 }}><Field label={`Value (${order.unit})`}><input type="number" step="0.1" autoFocus value={val} onChange={e => setVal(e.target.value)} style={{ fontSize: 20, fontWeight: 700 }} /></Field></div>
      <span className="muted small" style={{ paddingBottom: 10 }}>Normal {order.ref_low}–{order.ref_high} {order.unit}</span>{flagPreview && <span style={{ paddingBottom: 8 }}><FlagBadge flag={flagPreview} /></span>}
    </div> : opts ? <div className="row">{opts.map(o => <button key={o} className={val === o ? 'primary' : ''} onClick={() => setVal(o)}>{o}</button>)}
      <input placeholder="Other result" value={opts.includes(val) ? '' : val} onChange={e => setVal(e.target.value)} style={{ maxWidth: 220 }} /></div>
      : <Field label="Result"><textarea autoFocus value={val} onChange={e => setVal(e.target.value)} placeholder={{ FBC: 'WBC 7.2, Hb 13.1, PLT 250, Neut 60%, Lymph 30%', URI: 'Leucocytes -, Nitrites -, Protein -, Glucose -, pus cells 0-2/hpf', LFT: 'ALT 30, AST 28, ALP 90, TBil 12, Albumin 40', UEC: 'Urea 4.2, Na 139, K 4.1, Cl 102, Creat 80', LIPID: 'TC 4.8, LDL 2.9, HDL 1.3, TG 1.4' }[order.code] || ''} /></Field>}
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
  const [only, setOnly] = useState(null);
  const show = st => { setTab('pending'); setOnly(only === st ? null : st); };
  const reload = () => { reloadP(); reloadD(); };
  const collect = async o => { await act(() => api.post(`/lab/orders/${o.id}/collect`), 'Sample collected'); reload(); };
  const validate = async o => { await act(() => api.post(`/lab/orders/${o.id}/validate`), 'Result validated and released'); reload(); };
  const pend = (pending || []).filter(o => o.status !== 'resulted');
  const toValidate = (pending || []).filter(o => o.status === 'resulted');
  return (
    <div className="page">
      <PageHead icon="lab" title="Laboratory" sub={c.lab === 'both' ? 'In-house tests plus requisitions to partner labs' : c.lab === 'outsourced' ? 'All tests go to partner labs; results are entered on return' : 'In-house laboratory'} />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat icon="lab" label="Waiting for sample" value={pend.filter(o => o.status === 'ordered').length} onClick={() => show('ordered')} />
        <Stat icon="queue" label="Sample taken, running" value={pend.filter(o => o.status === 'collected').length} onClick={() => show('collected')} />
        <Stat icon="referrals" label="Sent to outside labs" value={pend.filter(o => o.status === 'sent_out').length} onClick={() => show('sent_out')} />
        <Stat icon="check" label="Waiting validation" value={toValidate.length} tone={toValidate.length ? 'warn' : null} onClick={() => { setOnly(null); setTab('validate'); }} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `Worklist (${pend.length})`], ['validate', `To validate (${toValidate.length})`], ['done', 'Completed (14 days)'], ['catalogue', `Test menu (${(tests || []).length})`]]} />
      {tab === 'pending' && <>
        {only && <div className="tip"><Icon name="info" size={16} /><div>Showing only <b>{STATUS[only]?.[0]}</b> tests. <a href="#" onClick={e => { e.preventDefault(); setOnly(null); }}>Show the whole worklist</a></div></div>}
        <Tip id="labflow">Workflow: <b>Collect sample</b> → <b>Enter result</b> → a second person <b>validates</b> before release. Abnormal values are flagged automatically against the normal range for the patient's sex.</Tip>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Ordered</th><th>Patient</th><th>Test</th><th>Sample</th><th>Where</th><th>Status</th><th /></tr></thead>
          <tbody>{pend.filter(o => !only || o.status === only).map(o => <tr key={o.id}>
            <td className="small">{fmtDT(o.created_at)}</td><td><b>{o.pname}</b><div className="faint small">{o.mrn} · {o.sex} · {age(o.dob)}</div></td>
            <td><b>{o.name}</b><div><span className="dept" style={{ '--dc': DEPT_COLOR[o.dept] }}>{o.dept}</span></div></td><td className="small">{o.sample}<div className="faint">{o.tat}</div></td>
            <td className="small">{o.mode === 'outsourced' ? <Badge tone="info">{o.partner}</Badge> : 'In-house'}</td><td><StatusBadge s={o.status} /></td>
            <td><div className="row">{o.status === 'ordered' && <button className="sm" onClick={() => collect(o)}>Collect sample</button>}
              <button className="sm primary" onClick={() => setEntering(o)}>Enter result</button></div></td></tr>)}</tbody>
        </table>{pending && !pend.length && <Empty icon="lab">Worklist is clear.</Empty>}</div>
      </>}
      {tab === 'validate' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Patient</th><th>Test</th><th>Result</th><th>Range</th><th>Flag</th><th>Entered by</th><th /></tr></thead>
        <tbody>{toValidate.map(o => <tr key={o.id}><td><b>{o.pname}</b></td><td>{o.name}</td><td><b>{o.result_value ?? o.result_text}</b> {o.result_value != null && o.unit}</td>
          <td className="small muted">{o.ref_low != null ? `${o.ref_low}–${o.ref_high}` : ''}</td><td><FlagBadge flag={o.flag} /></td>
          <td className="small">{o.resulted_by}</td><td><button className="sm primary" onClick={() => validate(o)}>Validate</button></td></tr>)}</tbody>
      </table>{!toValidate.length && <Empty icon="check">Nothing waiting for validation.</Empty>}<p className="faint small" style={{ padding: 10 }}>In-house results need a second person to validate before release.</p></div>}
      {tab === 'done' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Resulted</th><th>Patient</th><th>Test</th><th>Result</th><th>Flag</th><th>Status</th></tr></thead>
        <tbody>{(done || []).map(o => <tr key={o.id}><td className="small">{fmtDT(o.resulted_at)}</td><td>{o.pname}</td><td>{o.name}</td><td><b>{o.result_value ?? o.result_text}</b> {o.result_value != null && o.unit}</td><td><FlagBadge flag={o.flag} /></td><td><StatusBadge s={o.status} /></td></tr>)}</tbody>
      </table>{done && !done.length && <Empty icon="lab">No results in the last 14 days.</Empty>}</div>}
      {tab === 'catalogue' && <Catalogue tests={tests || []} reload={reloadT} admin={['admin', 'superadmin'].includes(c.user.role)} />}
      {entering && <ResultEntry order={entering} onClose={() => setEntering(null)} onDone={() => { setEntering(null); reload(); }} />}
    </div>
  );
}

function Catalogue({ tests, reload, admin }) {
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(null);
  const [q, setQ] = useState('');
  const depts = [...new Set(tests.map(t => t.dept))];
  const shown = tests.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
  const save = async () => { await act(() => api.put('/lab/tests/' + edit.id, edit), 'Test updated'); setEdit(null); reload(); };
  const add = async () => { await act(() => api.post('/lab/tests', adding), 'Test added'); setAdding(null); reload(); };
  return <div className="stack">
    <div className="row"><input placeholder="Search the test menu" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} />
      <div className="row">{depts.map(d => <span key={d} className="dept" style={{ '--dc': DEPT_COLOR[d] }}>{d} · {tests.filter(t => t.dept === d).length}</span>)}</div>
      {admin && <button className="primary right" onClick={() => setAdding({ dept: depts[0], kind: 'text' })}><Icon name="plus" size={15} />Add test</button>}</div>
    {depts.map(d => {
      const list = shown.filter(t => t.dept === d);
      if (!list.length) return null;
      return <div key={d} className="card" style={{ borderTop: `4px solid ${DEPT_COLOR[d]}` }}>
        <div className="cardhead"><h3 style={{ color: DEPT_COLOR[d] }}>{d}</h3><span className="faint small">{list.length} tests</span></div>
        <div className="tgrid">{list.map(t => <button key={t.id} type="button" className="tcard" style={{ '--dc': DEPT_COLOR[d], cursor: admin ? 'pointer' : 'default' }} onClick={() => admin && setEdit(t)}>
          <span style={{ flex: 1 }}><b>{t.name}</b>
            <span className="small faint" style={{ display: 'block' }}>{t.sample} · {t.tat}</span>
            <span className="small muted" style={{ display: 'block' }}>{t.ref_low != null ? `Normal ${t.ref_low}–${t.ref_high} ${t.unit}${t.ref_low_f != null ? ` (F ${t.ref_low_f}–${t.ref_high_f})` : ''}` : t.abnormal_text ? `Abnormal if ${t.abnormal_text.toLowerCase()}` : 'Descriptive result'}</span></span>
          <span style={{ textAlign: 'right' }}><b style={{ color: 'var(--brand)' }}>{t.price ? money(t.price) : 'Free'}</b>{t.outsourced_only ? <div><Badge tone="info">outside</Badge></div> : null}</span>
        </button>)}</div>
      </div>;
    })}
    {edit && <Modal title={edit.name} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="fields">
        <Field label="Price (KES)"><input type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>
        <Field label="Turnaround time"><input value={edit.tat || ''} onChange={e => setEdit({ ...edit, tat: e.target.value })} /></Field>
        {edit.kind === 'numeric' && <><Field label={`Normal low (${edit.unit})`}><input type="number" value={edit.ref_low ?? ''} onChange={e => setEdit({ ...edit, ref_low: e.target.value })} /></Field>
          <Field label={`Normal high (${edit.unit})`}><input type="number" value={edit.ref_high ?? ''} onChange={e => setEdit({ ...edit, ref_high: e.target.value })} /></Field></>}
      </div>
      <label className="check mt"><input type="checkbox" checked={!!edit.outsourced_only} onChange={e => setEdit({ ...edit, outsourced_only: e.target.checked })} />Always sent to an outside lab</label>
    </Modal>}
    {adding && <Modal title="Add a test" onClose={() => setAdding(null)} footer={<><button onClick={() => setAdding(null)}>Cancel</button><button className="primary" disabled={!adding.name} onClick={add}>Add test</button></>}>
      <div className="fields">
        <Field label="Test name *" span={2}><input value={adding.name || ''} onChange={e => setAdding({ ...adding, name: e.target.value })} /></Field>
        <Field label="Department"><select value={adding.dept} onChange={e => setAdding({ ...adding, dept: e.target.value })}>{Object.keys(DEPT_COLOR).map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Result type"><select value={adding.kind} onChange={e => setAdding({ ...adding, kind: e.target.value })}><option value="text">Descriptive / positive-negative</option><option value="numeric">Number with normal range</option></select></Field>
        {adding.kind === 'numeric' && <><Field label="Unit"><input value={adding.unit || ''} onChange={e => setAdding({ ...adding, unit: e.target.value })} /></Field>
          <Field label="Normal low"><input type="number" onChange={e => setAdding({ ...adding, ref_low: e.target.value })} /></Field>
          <Field label="Normal high"><input type="number" onChange={e => setAdding({ ...adding, ref_high: e.target.value })} /></Field></>}
        <Field label="Sample"><input value={adding.sample || ''} onChange={e => setAdding({ ...adding, sample: e.target.value })} placeholder="e.g. Blood (plain)" /></Field>
        <Field label="Price (KES)"><input type="number" onChange={e => setAdding({ ...adding, price: e.target.value })} /></Field>
        <Field label="Turnaround"><input value={adding.tat || ''} onChange={e => setAdding({ ...adding, tat: e.target.value })} placeholder="e.g. 1 hr" /></Field>
      </div>
      <label className="check mt"><input type="checkbox" onChange={e => setAdding({ ...adding, outsourced_only: e.target.checked })} />Always sent to an outside lab</label>
    </Modal>}
  </div>;
}
