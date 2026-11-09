import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Badge, act, toast, money, fmtDT, fmtDate, fmtTime, Empty, Icon, Tip, todayISO, Stat } from '../ui';
import { askSupervisor } from '../shared/askPin';

const METHOD = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', sha: 'SHA', insurance: 'Insurance', bank: 'Bank', credit: 'Credit' };
const mname = m => METHOD[m] || m;

// ---------- the cashier's shift: shown above the counter sale ----------
export function ShiftBar({ onChange, refreshKey }) {
  const c = useContext(ConfigContext);
  const [s, setS] = useState(undefined);
  const reload = () => api.get('/shifts/current').then(setS).catch(() => setS(null));
  useEffect(() => { reload(); }, [refreshKey]);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => { const t = setInterval(reload, 30000); return () => clearInterval(t); }, []);
  if (s === undefined) return null;
  return <>
    {s ? <div className="shiftbar on">
      <Icon name="cash" size={18} />
      <div><b>Shift open</b> since {fmtTime(s.opened_at)} · float {money(s.opening_float)} · {s.receipts} sale{s.receipts === 1 ? '' : 's'} · cash expected in drawer <b>{money(s.expected)}</b></div>
      <button className="sm right" onClick={() => setClosing(true)}>Cash-up and close shift</button>
    </div> : <div className="shiftbar">
      <Icon name="alert" size={18} />
      <div>{c.require_shift ? <b>Open your shift before selling.</b> : <b>No shift open.</b>} Count the float in the cash drawer and open a shift so the drawer can be balanced at the end of the day.</div>
      <button className="sm primary right" onClick={() => setOpening(true)}>Open shift</button>
    </div>}
    {opening && <OpenShift onClose={() => setOpening(false)} onDone={() => { setOpening(false); reload(); onChange?.(); }} />}
    {closing && s && <CloseShift shift={s} onClose={() => setClosing(false)} onDone={() => { setClosing(false); reload(); onChange?.(); }} />}
  </>;
}

function OpenShift({ onClose, onDone }) {
  const [f, setF] = useState('');
  return <Modal title="Open shift" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={f === ''} onClick={async () => { await act(() => api.post('/shifts/open', { opening_float: f }), 'Shift opened'); onDone(); }}>Open shift</button></>}>
    <p className="muted">Count the money already in the drawer (the float for giving change) and enter it. Every sale and refund you take is linked to this shift.</p>
    <Field label="Opening float (KES)"><input type="number" min="0" autoFocus value={f} onChange={e => setF(e.target.value)} placeholder="e.g. 2000" /></Field>
  </Modal>;
}

// Count by denomination, the Kenyan way: notes and coins
const DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
function CloseShift({ shift, onClose, onDone }) {
  const [count, setCount] = useState({});
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const counted = DENOMS.reduce((a, d) => a + d * (Number(count[d]) || 0), 0);
  const variance = Math.round((counted - shift.expected) * 100) / 100;
  if (result) return <ZReport s={result} onClose={onDone} />;
  return <Modal wide title="Cash-up: close shift" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={async () => setResult(await act(() => api.post('/shifts/close', { counted_cash: counted, notes }), 'Shift closed'))}>Close shift</button></>}>
    <div className="grid g2">
      <div className="stack">
        <b>Count the drawer</b>
        <table className="table small"><tbody>{DENOMS.map(d => <tr key={d}><td>KES {d}</td><td style={{ width: 110 }}><input type="number" min="0" value={count[d] || ''} onChange={e => setCount({ ...count, [d]: e.target.value })} placeholder="0" /></td><td className="num">{money(d * (Number(count[d]) || 0))}</td></tr>)}</tbody></table>
      </div>
      <div className="stack">
        <div className="card" style={{ background: 'var(--bg)' }}>
          <div className="row"><span>Opening float</span><span className="right">{money(shift.opening_float)}</span></div>
          <div className="row"><span>+ Cash taken (after refunds)</span><span className="right">{money(shift.cashIn)}</span></div>
          <div className="row"><span>− Cash paid out (expenses)</span><span className="right">{money(shift.paidOut)}</span></div>
          <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}><b>Expected in drawer</b><b className="right">{money(shift.expected)}</b></div>
          <div className="row"><b>Counted</b><b className="right">{money(counted)}</b></div>
          <div className="row" style={{ fontSize: 18 }}><b>{variance === 0 ? 'Balanced' : variance > 0 ? 'Over' : 'Short'}</b><b className="right" style={{ color: variance === 0 ? 'var(--good)' : 'var(--bad)' }}>{money(Math.abs(variance))}</b></div>
        </div>
        <div className="small muted">Other takings this shift (not in the drawer): {shift.byMethod.filter(m => m.method !== 'cash').map(m => `${mname(m.method)} ${money(m.amount)}`).join(' · ') || 'none'}</div>
        {Math.abs(variance) >= 1 && <Field label="Explain the difference (required)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. change given twice, KES 50 short" /></Field>}
      </div>
    </div>
  </Modal>;
}

export function ZReport({ s, onClose }) {
  const c = useContext(ConfigContext);
  return <Modal title={`Shift report (Z) · ${s.user}`} onClose={onClose} footer={<><button onClick={onClose}>Close</button><button className="primary" onClick={() => window.print()}><Icon name="print" size={15} />Print</button></>}>
    <div className="receipt printable">
      <div className="c"><b>{c.facility_name}</b><br />SHIFT REPORT (Z)</div><hr />
      <div>Cashier: {s.user}</div><div>Opened: {fmtDT(s.opened_at)}</div><div>Closed: {s.closed_at ? fmtDT(s.closed_at) : 'still open (X report)'}</div><hr />
      <table><tbody>
        {s.byMethod.map(m => <tr key={m.method}><td>{mname(m.method)} ({m.n})</td><td style={{ textAlign: 'right' }}>{Number(m.amount).toLocaleString()}</td></tr>)}
        <tr><td>Receipts</td><td style={{ textAlign: 'right' }}>{s.receipts}</td></tr>
        <tr><td>Refunds ({s.refundCount})</td><td style={{ textAlign: 'right' }}>{Number(s.refunds).toLocaleString()}</td></tr>
        <tr><td>Cash paid out</td><td style={{ textAlign: 'right' }}>{Number(s.paidOut).toLocaleString()}</td></tr>
      </tbody></table><hr />
      <table><tbody>
        <tr><td>Opening float</td><td style={{ textAlign: 'right' }}>{Number(s.opening_float).toLocaleString()}</td></tr>
        <tr><td><b>Expected cash</b></td><td style={{ textAlign: 'right' }}><b>{Number(s.expected).toLocaleString()}</b></td></tr>
        {s.counted_cash != null && <tr><td>Counted cash</td><td style={{ textAlign: 'right' }}>{Number(s.counted_cash).toLocaleString()}</td></tr>}
        {s.variance != null && <tr><td><b>{s.variance === 0 ? 'Balanced' : s.variance > 0 ? 'Over' : 'Short'}</b></td><td style={{ textAlign: 'right' }}><b>{Math.abs(s.variance).toLocaleString()}</b></td></tr>}
      </tbody></table>
      {s.notes && <><hr /><div>Note: {s.notes}</div></>}
      <hr /><div className="c small">Signed: ____________ Supervisor: ____________</div>
    </div>
  </Modal>;
}

export function Shifts() {
  const [rows] = useData('/shifts');
  const [cur] = useData('/shifts/current');
  const [open, setOpen] = useState(null);
  return <div className="stack">
    <Tip id="shifts">Each cashier opens a shift with a float and closes it by counting the drawer. MediCore works out the cash that should be there, so shortages show up the same day.</Tip>
    {cur && <div className="row"><button onClick={() => setOpen(cur)}>Print X report (current shift, not closed)</button></div>}
    <div className="tablewrap"><table className="table">
      <thead><tr><th>Cashier</th><th>Opened</th><th>Closed</th><th className="num">Float</th><th className="num">Cash taken</th><th className="num">Other</th><th className="num">Expected</th><th className="num">Counted</th><th>Result</th></tr></thead>
      <tbody>{(rows || []).map(s => <tr key={s.id} className="click" onClick={() => setOpen(s)}>
        <td><b>{s.user}</b></td><td className="small">{fmtDT(s.opened_at)}</td><td className="small">{s.closed_at ? fmtDT(s.closed_at) : <Badge tone="info">Open</Badge>}</td>
        <td className="num">{money(s.opening_float)}</td><td className="num">{money(s.cashIn)}</td><td className="num">{money(s.byMethod.filter(m => m.method !== 'cash').reduce((a, m) => a + m.amount, 0))}</td>
        <td className="num">{money(s.expected)}</td><td className="num">{s.counted_cash != null ? money(s.counted_cash) : '-'}</td>
        <td>{s.variance == null ? '-' : s.variance === 0 ? <Badge tone="good">Balanced</Badge> : <Badge tone="bad">{s.variance > 0 ? 'Over' : 'Short'} {money(Math.abs(s.variance))}</Badge>}</td></tr>)}</tbody>
    </table>{rows && !rows.length && <Empty icon="cash">No shifts yet. Cashiers open one from the counter sale screen.</Empty>}</div>
    {open && <ZReport s={open} onClose={() => setOpen(null)} />}
  </div>;
}

// ---------- returns and refunds ----------
export function RefundDialog({ onClose, onDone, billId: initial }) {
  const c = useContext(ConfigContext);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [billId, setBillId] = useState(initial || null);
  const [d, setD] = useState(null);
  const [qty, setQty] = useState({});
  const [f, setF] = useState({ reason: '', method: 'cash', restock: true, reference: '' });
  useEffect(() => { if (q.length < 2) return setFound([]); const t = setTimeout(() => api.get('/receipts/search?q=' + encodeURIComponent(q)).then(setFound), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (billId) api.get(`/bills/${billId}/refundable`).then(setD); }, [billId]);
  const amount = d ? d.lines.reduce((a, l) => a + (Number(qty[l.id]) || 0) * l.unit_price, 0) : 0;
  const submit = async () => {
    const pin = await askSupervisor(c.user, `Refund of ${money(amount)}`);
    if (pin === null) return;
    const r = await act(() => api.post(`/bills/${billId}/refund`, { ...f, pin, lines: Object.entries(qty).map(([line_id, q2]) => ({ line_id: Number(line_id), qty: Number(q2) })) }));
    toast(`Refund ${r.refund_no}: ${money(r.amount)} by ${mname(f.method)}`);
    onDone?.();
  };
  return <Modal wide title="Return and refund" onClose={onClose} footer={billId && <><button onClick={onClose}>Cancel</button><button className="primary" disabled={!amount || !f.reason} onClick={submit}>Refund {money(amount)}</button></>}>
    {!billId ? <div className="stack">
      <Field label="Find the receipt" hint="Receipt number (e.g. POS000231), customer name or M-Pesa code"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type to search" /></Field>
      {found.map(b => <button key={b.id} type="button" className="ticket" onClick={() => setBillId(b.id)} style={{ textAlign: 'left' }}><b>{b.receipt_no}</b> · {b.name} <span className="faint small">{fmtDT(b.closed_at)}</span><span className="right">{money(b.total)}</span></button>)}
      {q.length > 1 && !found.length && <Empty icon="search">No paid receipt matches.</Empty>}
    </div> : !d ? <p className="muted">Loading…</p> : <div className="stack">
      <table className="table small"><thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Already returned</th><th style={{ width: 110 }}>Return</th><th className="num">Refund</th></tr></thead>
        <tbody>{d.lines.map(l => <tr key={l.id}><td>{l.description}<div className="faint">{money(l.unit_price)} each</div></td><td className="num">{l.qty}</td><td className="num">{l.refunded || '-'}</td>
          <td>{l.left > 0 ? <input type="number" min="0" max={l.left} value={qty[l.id] || ''} onChange={e => setQty({ ...qty, [l.id]: Math.min(l.left, Math.max(0, Number(e.target.value))) })} placeholder="0" /> : <Badge>Fully returned</Badge>}</td>
          <td className="num">{money((Number(qty[l.id]) || 0) * l.unit_price)}</td></tr>)}</tbody></table>
      <div className="fields">
        <Field label="Reason *"><select value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}><option value="">Choose…</option>{['Wrong item sold', 'Customer changed mind (unopened)', 'Damaged or defective', 'Expired on sale', 'Doctor changed prescription', 'Overcharged', 'Other'].map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Refund by"><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option value="cash">Cash from drawer</option><option value="mpesa">M-Pesa (send back)</option><option value="card">Card reversal</option></select></Field>
        {f.method !== 'cash' && <Field label="Reversal reference"><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value.toUpperCase() })} /></Field>}
      </div>
      <label className="check"><input type="checkbox" checked={f.restock} onChange={e => setF({ ...f, restock: e.target.checked })} />Put returned items back on the shelf (untick for damaged or opened medicine)</label>
      {d.refunds.length > 0 && <div className="small faint">Earlier refunds on this receipt: {d.refunds.map(r => `${r.refund_no} ${money(r.amount)}`).join(' · ')}</div>}
      <div className="alert info small">Good practice: opened or temperature-sensitive medicines are not resold. Untick “Put back on the shelf” for them.</div>
    </div>}
  </Modal>;
}

export function Returns() {
  const [rows, reload] = useData('/reports/sales?from=' + new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  return <div className="stack">
    <div className="row"><button className="primary" onClick={() => setOpen(true)}>New return / refund</button><span className="faint small">Every refund needs a reason and a supervisor PIN. Restocked items go back to the batch they came from.</span></div>
    <div className="tablewrap"><table className="table"><thead><tr><th>Refund</th><th>Receipt</th><th>Date</th><th>Items</th><th>Reason</th><th>By / approved</th><th>Method</th><th className="num">Amount</th></tr></thead>
      <tbody>{(rows?.refunds || []).map(r => <tr key={r.id}><td><b>{r.refund_no}</b></td><td>{r.receipt_no}</td><td className="small">{fmtDT(r.created_at)}</td><td className="small">{JSON.parse(r.lines).map(l => `${l.qty} × ${l.description}`).join('; ')}</td>
        <td className="small">{r.reason}{r.restock ? '' : ' · not restocked'}</td><td className="small">{r.by_user} / {r.approved_by}</td><td>{mname(r.method)}</td><td className="num"><b>{money(r.amount)}</b></td></tr>)}</tbody></table>
      {rows && !rows.refunds.length && <Empty icon="cash">No refunds in the last 30 days.</Empty>}</div>
    {open && <RefundDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
  </div>;
}

// ---------- expenses and petty cash ----------
export function Expenses() {
  const c = useContext(ConfigContext);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [d, reload] = useData('/expenses?from=' + from, [from]);
  const [f, setF] = useState(null);
  const total = (d?.rows || []).reduce((a, r) => a + r.amount, 0);
  const byCat = {}; (d?.rows || []).forEach(r => byCat[r.category] = (byCat[r.category] || 0) + r.amount);
  const max = Math.max(1, ...Object.values(byCat));
  return <div className="stack">
    <div className="row"><button className="primary" onClick={() => setF({ date: todayISO(), category: '', amount: '', method: 'cash', description: '' })}><Icon name="plus" size={15} />Record expense</button>
      <span className="faint small">Cash expenses paid from the drawer are taken off the cashier's expected cash.</span>
      <div className="right row small">From <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} /></div></div>
    <div className="grid g-side">
      <div className="tablewrap"><table className="table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Paid by</th><th>By</th><th className="num">Amount</th>{c.user.role === 'admin' && <th />}</tr></thead>
        <tbody>{(d?.rows || []).map(r => <tr key={r.id}><td className="small">{fmtDate(r.date)}</td><td>{r.category}</td><td className="small">{r.description}</td><td>{mname(r.method)}</td><td className="small">{r.by_user}</td><td className="num"><b>{money(r.amount)}</b></td>
          {c.user.role === 'admin' && <td><button className="ghost sm" onClick={async () => { await act(() => api.del('/expenses/' + r.id), 'Expense deleted'); reload(); }}>✕</button></td>}</tr>)}</tbody></table>
        {d && !d.rows.length && <Empty icon="cash">No expenses recorded in this period.</Empty>}</div>
      <div className="card stack"><b>Total {money(total)}</b>
        {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="stack" style={{ gap: 3 }}><div className="row small"><span>{k}</span><span className="right">{money(v)}</span></div><div className="minibar"><i style={{ width: (v / max * 100) + '%' }} /></div></div>)}</div>
    </div>
    {f && <Modal title="Record expense" onClose={() => setF(null)} footer={<><button onClick={() => setF(null)}>Cancel</button><button className="primary" disabled={!f.amount || !f.category} onClick={async () => { await act(() => api.post('/expenses', f), 'Expense recorded'); setF(null); reload(); }}>Save</button></>}>
      <div className="fields">
        <Field label="Date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Category *"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}><option value="">Choose…</option>{(d?.categories || []).map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Amount (KES) *"><input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid by"><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option value="cash">Cash from drawer</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="card">Card</option></select></Field>
        <Field label="Description" span={2}><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="e.g. KPLC tokens" /></Field>
        <Field label="Receipt / reference"><input value={f.reference || ''} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
    </Modal>}
  </div>;
}

// ---------- customer accounts ----------
export function Customers() {
  const c = useContext(ConfigContext);
  const [q, setQ] = useState('');
  const [rows, reload] = useData('/customers?q=' + encodeURIComponent(q), [q]);
  const [f, setF] = useState(null);
  const [edit, setEdit] = useState(null);
  return <div className="stack">
    <div className="row"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone" style={{ maxWidth: 320 }} />
      <button className="primary right" onClick={() => setF({ name: '', phone: '', credit_limit: 0 })}><Icon name="plus" size={15} />New customer</button></div>
    <Tip id="customers">Regular customers earn 1 point per KES 100. Give trusted customers or companies a credit limit so they can buy now and pay at month end; what they owe shows under Credit / debtors.</Tip>
    <div className="tablewrap"><table className="table"><thead><tr><th>Customer</th><th>Phone</th><th className="num">Points</th><th className="num">Spent</th><th className="num">Credit limit</th><th className="num">Owes</th>{c.user.role === 'admin' && <th />}</tr></thead>
      <tbody>{(rows || []).map(r => <tr key={r.id}><td><b>{r.name}</b></td><td>{r.phone}</td><td className="num">{Math.round(r.points)}</td><td className="num">{money(r.spent)}</td><td className="num">{r.credit_limit ? money(r.credit_limit) : '-'}</td>
        <td className="num">{r.owed > 0 ? <b style={{ color: 'var(--bad)' }}>{money(r.owed)}</b> : '-'}</td>{c.user.role === 'admin' && <td><button className="sm" onClick={() => setEdit({ ...r })}>Edit</button></td>}</tr>)}</tbody></table>
      {rows && !rows.length && <Empty icon="patients">No customers yet.</Empty>}</div>
    {f && <Modal title="New customer" onClose={() => setF(null)} footer={<><button onClick={() => setF(null)}>Cancel</button><button className="primary" onClick={async () => { await act(() => api.post('/customers', f), 'Customer added'); setF(null); reload(); }}>Save</button></>}>
      <div className="fields"><Field label="Name *"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field><Field label="Phone *"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="07XX XXX XXX" /></Field>
        {c.user.role === 'admin' && <Field label="Credit limit (KES)" hint="0 = pays every time"><input type="number" value={f.credit_limit} onChange={e => setF({ ...f, credit_limit: e.target.value })} /></Field>}</div>
    </Modal>}
    {edit && <Modal title={edit.name} onClose={() => setEdit(null)} footer={<button className="primary" onClick={async () => { await act(() => api.put('/customers/' + edit.id, edit), 'Saved'); setEdit(null); reload(); }}>Save</button>}>
      <div className="fields"><Field label="Name"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Credit limit (KES)"><input type="number" value={edit.credit_limit} onChange={e => setEdit({ ...edit, credit_limit: e.target.value })} /></Field>
        <Field label="Notes" span={2}><input value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
    </Modal>}
  </div>;
}

// Pick a registered customer at the till (optional)
export function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(null);
  useEffect(() => { if (q.length < 2) return setList([]); const t = setTimeout(() => api.get('/customers?q=' + encodeURIComponent(q)).then(setList), 200); return () => clearTimeout(t); }, [q]);
  if (value) return <div className="row small" style={{ flexWrap: 'nowrap' }}><Icon name="patients" size={15} /><div style={{ flex: 1 }}><b>{value.name}</b> · {value.phone}<div className="faint">{Math.round(value.points)} points{value.credit_limit ? ` · credit limit ${money(value.credit_limit)}, owes ${money(value.owed || 0)}` : ''}</div></div><button className="ghost sm" onClick={() => onChange(null)}>✕</button></div>;
  return <div style={{ position: 'relative' }}>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Customer: walk-in, or search name / phone" />
    {(list.length > 0 || q.length > 2) && <div className="dropdown">{list.map(x => <button key={x.id} className="dd-item" onClick={() => { onChange(x); setQ(''); }}><span><b>{x.name}</b> <span className="faint small">{x.phone} · {Math.round(x.points)} pts</span></span></button>)}
      <button className="dd-item" onClick={() => setAdding({ name: /\d/.test(q) ? '' : q, phone: /\d/.test(q) ? q : '' })}><Icon name="plus" size={14} /><span>Add “{q}” as a new customer</span></button></div>}
    {adding && <Modal title="New customer" onClose={() => setAdding(null)} footer={<button className="primary" onClick={async () => { const r = await act(() => api.post('/customers', adding), 'Customer added'); setAdding(null); setQ(''); onChange({ ...r, owed: 0 }); }}>Save</button>}>
      <div className="fields"><Field label="Name"><input autoFocus value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })} /></Field><Field label="Phone"><input value={adding.phone} onChange={e => setAdding({ ...adding, phone: e.target.value })} /></Field></div>
    </Modal>}
  </div>;
}

export function ShiftStats() {
  const [s] = useData('/shifts/current');
  if (!s) return null;
  return <div className="grid g4"><Stat icon="cash" label="Expected in drawer" value={money(s.expected)} /><Stat icon="billing" label="Sales this shift" value={s.receipts} /><Stat icon="alert" label="Refunds" value={money(s.refunds)} /><Stat icon="list" label="Cash paid out" value={money(s.paidOut)} /></div>;
}
