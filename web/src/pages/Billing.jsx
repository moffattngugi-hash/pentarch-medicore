import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Tabs, StatusBadge, Badge, act, toast, money, fmtDT, fmtTime, Empty, Icon } from '../ui';

// ---------- M-Pesa STK push (simulated in demo) ----------
export function MpesaPush({ amount, phone: initPhone, onPaid }) {
  const [phone, setPhone] = useState(initPhone || '');
  const [state, setState] = useState(null);
  const start = async () => {
    const r = await act(() => api.post('/mpesa/stk', { phone, amount }));
    setState('pending');
    const poll = async () => {
      const s = await api.get('/mpesa/stk/' + r.checkout_id);
      if (s.status === 'pending') setTimeout(poll, 1000);
      else { setState('done'); toast(`M-Pesa confirmed: ${s.receipt}`); onPaid(s.receipt); }
    };
    setTimeout(poll, 1000);
  };
  return <div className="row">
    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XX XXX XXX" style={{ maxWidth: 170 }} />
    <button className="primary" disabled={state === 'pending' || !phone} onClick={start} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
      {state === 'pending' ? 'Waiting for customer PIN…' : `Send M-Pesa prompt for ${money(amount)}`}</button>
  </div>;
}

export function PayPanel({ balance, phone, onPay }) {
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(balance);
  const [ref, setRef] = useState('');
  useEffect(() => setAmount(balance), [balance]);
  const pay = (m = method, r = ref, a = amount) => onPay({ method: m, amount: Number(a), reference: r });
  return <div className="stack">
    <div className="row">{[['cash', 'Cash'], ['mpesa', 'M-Pesa'], ['card', 'Card'], ['sha', 'SHA'], ['insurance', 'Insurance']].map(([k, l]) =>
      <button key={k} className={method === k ? 'primary' : ''} onClick={() => setMethod(k)}>{l}</button>)}</div>
    <div className="row">
      <Field label="Amount (KES)"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ maxWidth: 160 }} /></Field>
      {method === 'cash' && amount > balance && <span className="muted">Change: <b>{money(amount - balance)}</b></span>}
    </div>
    {method === 'mpesa' && <MpesaPush amount={Number(amount)} phone={phone} onPaid={code => pay('mpesa', code)} />}
    {method === 'mpesa' && <span className="faint small">Or, for Till/Paybill payments already made, type the M-Pesa code: <input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} placeholder="e.g. SJK3H2L9QX" style={{ maxWidth: 160, display: 'inline-block' }} /> <button className="sm" disabled={!ref} onClick={() => pay()}>Record</button></span>}
    {['card', 'insurance'].includes(method) && <Field label="Reference / authorisation no."><input value={ref} onChange={e => setRef(e.target.value)} /></Field>}
    {method === 'sha' && <div className="alert info small">Demo: SHA eligibility shows as active and the claim is recorded locally. Live SHA claims connect after DHA certification.</div>}
    {method !== 'mpesa' && <div><button className="primary" disabled={!(amount > 0)} onClick={() => pay(method, method === 'sha' ? 'SHA-CLAIM-DEMO-' + Date.now().toString().slice(-6) : ref)}>Record {money(amount)} {method === 'sha' ? 'as SHA claim' : ''}</button></div>}
  </div>;
}

// ---------- receipt ----------
export function Receipt({ bill, onClose }) {
  const c = useContext(ConfigContext);
  return <Modal title="Receipt" onClose={onClose} footer={<><button onClick={onClose}>Close</button><button className="primary" onClick={() => window.print()}><Icon name="print" size={15} />Print</button></>}>
    <div className="receipt printable">
      <div className="c"><b style={{ fontSize: 15 }}>{c.facility_name}</b><br />{c.location}<br />Tel {c.phone}<br />KRA PIN {c.kra_pin}</div>
      <hr />
      <div>{bill.receipt_no || 'DRAFT'} · {fmtDT(bill.closed_at || bill.created_at)}</div>
      <div>Customer: {bill.name}{bill.mrn ? ` (${bill.mrn})` : ''}</div>
      <hr />
      <table><tbody>
        {bill.lines.map(l => <tr key={l.id}><td>{l.description}<br /><span style={{ color: '#64748b' }}>{l.qty} × {Number(l.unit_price).toLocaleString()}</span></td><td style={{ textAlign: 'right' }}>{Number(l.amount).toLocaleString()}</td></tr>)}
      </tbody></table>
      <hr />
      <table><tbody>
        <tr><td><b>TOTAL</b></td><td style={{ textAlign: 'right' }}><b>{money(bill.total)}</b></td></tr>
        {bill.payments.map(p => <tr key={p.id}><td style={{ textTransform: 'uppercase' }}>{p.method} {p.reference}</td><td style={{ textAlign: 'right' }}>{Number(p.amount).toLocaleString()}</td></tr>)}
        <tr><td>Balance</td><td style={{ textAlign: 'right' }}>{money(bill.balance)}</td></tr>
      </tbody></table>
      <hr />
      <div className="c small">eTIMS: DEMO MODE - not a tax invoice<br />CU {bill.etims?.cu_serial} · Inv {bill.etims?.invoice_no || '-'}<br />
        <svg width="70" height="70" viewBox="0 0 7 7" style={{ margin: '6px auto', display: 'block' }}>{[...Array(49)].map((_, i) => ((i * 7919 + (bill.id || 1) * 31) % 3 === 0) && <rect key={i} x={i % 7} y={Math.floor(i / 7)} width="1" height="1" />)}</svg>
        Served by {bill.payments[0]?.by_user || '-'}<br />Thank you · Get well soon</div>
    </div>
  </Modal>;
}

// ---------- checkout ----------
export function Checkout({ id, onClose, onChanged }) {
  const c = useContext(ConfigContext);
  const [b, setB] = useState(null);
  const [cat] = useData('/catalogue');
  const [addQ, setAddQ] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [disc, setDisc] = useState(null);
  const load = () => api.get('/bills/' + id).then(setB);
  useEffect(() => { load(); }, [id]);
  if (!b) return null;
  const upd = async (p, msg) => { const r = await act(p, msg); setB(r); onChanged?.(); return r; };
  const options = cat ? [
    ...cat.services.filter(s => s.price > 0).map(s => ({ label: `${s.name} (service)`, description: s.name, kind: s.category, ref_table: 'services', ref_id: s.id, unit_price: s.price })),
    ...cat.tests.filter(t => t.price > 0).map(t => ({ label: `${t.name} (lab)`, description: t.name, kind: 'lab', unit_price: t.price })),
    ...cat.imaging.map(t => ({ label: `${t.name} (imaging)`, description: t.name, kind: 'imaging', unit_price: t.price })),
    ...cat.items.filter(i => i.price > 0).map(i => ({ label: `${i.name} (${i.stock} in stock)`, description: i.name, kind: 'drug', ref_table: 'items', ref_id: i.id, unit_price: i.price })),
  ].filter(o => addQ.length > 1 && o.label.toLowerCase().includes(addQ.toLowerCase())).slice(0, 8) : [];
  const closed = b.status !== 'open';
  const checkout = async credit => { const r = await upd(() => api.post(`/bills/${b.id}/checkout`, { credit }), credit ? 'Moved to debtors (credit)' : 'Checked out'); setReceipt(r); };
  const pay = async p => {
    const r = await upd(() => api.post(`/bills/${b.id}/pay`, p), 'Payment recorded');
    if (r.status === 'paid' && r.visit?.status === 'closed') { toast('Paid in full - visit closed automatically'); setReceipt(r); }
  };

  return <Modal wide title={<>Checkout · {b.name} <span className="faint" style={{ fontWeight: 400 }}>{b.mrn}</span></>} onClose={onClose}
    footer={<>{!closed && <button onClick={() => checkout(true)}>Bill to account (credit)</button>}{closed ? <button className="primary" onClick={() => setReceipt(b)}>Print receipt</button> : <button className="primary" disabled={b.balance > 0.01 || b.total <= 0} onClick={() => checkout(false)}>Complete checkout</button>}</>}>
    <div className="grid g2">
      <div className="stack">
        <div className="row"><b>Charges</b><StatusBadge s={b.status} />
          {!closed && <select className="right" value={b.payer} style={{ width: 'auto' }} onChange={e => upd(() => api.post(`/bills/${b.id}/payer`, { payer: e.target.value }))}>
            <option value="cash">Cash patient</option><option value="sha">SHA</option><option value="insurance">Private insurance</option><option value="corporate">Corporate</option></select>}</div>
        <table className="table small"><tbody>
          {b.lines.map(l => <tr key={l.id}><td>{l.description}<div className="faint">{l.qty} × {money(l.unit_price)} · {fmtTime(l.created_at)}</div></td><td className="num">{money(l.amount)}</td>
            <td style={{ width: 28 }}>{!closed && <button className="ghost sm" title="Remove (supervisor)" onClick={() => {
              const pin = c.user.role === 'admin' ? '1234' : window.prompt('Supervisor PIN to remove this charge (demo: 1234)');
              if (pin) upd(() => api.del(`/bills/${b.id}/lines/${l.id}`, { pin }), 'Charge removed');
            }}>✕</button>}</td></tr>)}
        </tbody></table>
        {!b.lines.length && <Empty>No charges yet.</Empty>}
        {b.suggestions.length > 0 && !closed && <div className="card" style={{ background: '#fffbeb' }}>
          <div className="row"><b className="small">From this visit, not yet billed</b><button className="sm right" onClick={async () => { for (const s of b.suggestions) await api.post(`/bills/${b.id}/lines`, s); load(); onChanged?.(); toast('All added'); }}>Add all</button></div>
          {b.suggestions.map((s, i) => <div key={i} className="row small" style={{ marginTop: 6 }}><span>{s.description} × {s.qty}</span><span className="right">{money(s.qty * s.unit_price)}</span><button className="sm" onClick={() => upd(() => api.post(`/bills/${b.id}/lines`, s), 'Added')}>Add</button></div>)}
        </div>}
        {!closed && <div style={{ position: 'relative' }}>
          <input value={addQ} onChange={e => setAddQ(e.target.value)} placeholder="Add a charge: search service, test or item" />
          {options.length > 0 && <div className="card" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, padding: 4 }}>{options.map((o, i) =>
            <div key={i} className="ticket" style={{ marginBottom: 2 }} onClick={() => { upd(() => api.post(`/bills/${b.id}/lines`, { ...o, qty: 1 }), 'Added'); setAddQ(''); }}>{o.label} <span className="right faint">{money(o.unit_price)}</span></div>)}</div>}
        </div>}
        {!closed && <button className="sm" onClick={() => setDisc({ amount: '', reason: '' })}>Discount / waiver</button>}
      </div>
      <div className="stack">
        <div className="card" style={{ background: '#f8fafc' }}>
          <div className="row"><span>Total</span><b className="right">{money(b.total)}</b></div>
          <div className="row"><span>Paid</span><span className="right">{money(b.paid)}</span></div>
          <div className="row" style={{ fontSize: 18 }}><b>Balance</b><b className="right" style={{ color: b.balance > 0 ? 'var(--bad)' : 'var(--good)' }}>{money(b.balance)}</b></div>
        </div>
        {b.payments.map(p => <div key={p.id} className="row small"><Badge tone="good">{p.method.toUpperCase()}</Badge><span>{p.reference}</span><span className="right">{money(p.amount)}</span></div>)}
        {!closed && b.balance > 0 && <PayPanel balance={b.balance} phone={b.phone} onPay={pay} />}
        {b.payer === 'sha' && <div className="alert info small">SHA member {b.sha_number || '(no number on file)'} · demo eligibility check: <b>active</b>. Pre-authorisation and claim submission connect live after DHA certification.</div>}
        <p className="faint small">{c.auto_checkout ? 'Automatic checkout is on: the visit closes once paid in full.' : 'Manual checkout: press “Complete checkout” after payment.'}</p>
      </div>
    </div>
    {disc && <Modal title="Discount or waiver" onClose={() => setDisc(null)} footer={<button className="primary" onClick={async () => {
      const pin = c.user.role === 'admin' ? '1234' : window.prompt('Supervisor PIN (demo: 1234)');
      await upd(() => api.post(`/bills/${b.id}/discount`, { ...disc, pin }), 'Discount applied'); setDisc(null);
    }}>Apply</button>}>
      <div className="fields"><Field label="Amount (KES)"><input type="number" value={disc.amount} onChange={e => setDisc({ ...disc, amount: e.target.value })} /></Field>
        <Field label="Reason"><input value={disc.reason} onChange={e => setDisc({ ...disc, reason: e.target.value })} /></Field></div>
    </Modal>}
    {receipt && <Receipt bill={receipt} onClose={() => { setReceipt(null); onClose(); }} />}
  </Modal>;
}

export default function Billing({ openId }) {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState('open');
  const [list, reload] = useData('/bills?status=' + tab, [tab]);
  const [open, setOpen] = useState(openId ? Number(openId) : null);
  useEffect(() => { if (openId) setOpen(Number(openId)); }, [openId]);
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Billing & checkout</h1><p className="sub">{c.billing_mode === 'auto' ? 'Automatic billing: clinical actions post charges. ' : 'Manual billing: build each bill at the cashier. '}{c.auto_checkout ? 'Automatic checkout on.' : 'Manual checkout.'}</p></div>
        <div className="actions"><a href="#/settings" className="small">Change billing mode →</a></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['open', 'Open bills'], ['paid', 'Paid (7 days)'], ['credit', 'Credit / debtors']]} />
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Opened</th><th>Patient / customer</th><th>Visit</th><th>Payer</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr></thead>
        <tbody>{(list || []).map(b => <tr key={b.id} className="click" onClick={() => setOpen(b.id)}>
          <td className="small">{fmtDT(b.created_at)}</td><td><b>{b.name}</b> <span className="faint small">{b.mrn || b.receipt_no}</span></td>
          <td>{b.visit_status ? <StatusBadge s={b.visit_status} /> : <Badge>Counter sale</Badge>} {b.unbilled > 0 && <Badge tone="warn">{b.unbilled} unbilled</Badge>}</td>
          <td className="small" style={{ textTransform: 'uppercase' }}>{b.payer}</td>
          <td className="num">{money(b.total)}</td><td className="num">{money(b.paid)}</td><td className="num"><b>{money(b.balance)}</b></td>
          <td><button className="sm primary">{tab === 'open' ? 'Checkout' : 'View'}</button></td></tr>)}</tbody>
      </table>{list && !list.length && <Empty>No bills here.</Empty>}</div>
      {open && <Checkout id={open} onClose={() => { setOpen(null); reload(); if (openId) window.location.hash = '#/billing'; }} onChanged={reload} />}
    </div>
  );
}
