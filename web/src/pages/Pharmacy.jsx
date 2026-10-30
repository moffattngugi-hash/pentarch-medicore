import React, { useContext, useMemo, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Tabs, StatusBadge, Badge, act, money, fmtDate, fmtDT, Empty, todayISO } from '../ui';
import { PayPanel, Receipt } from './Billing';

export default function Pharmacy() {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState(c.user.role === 'cashier' ? 'pos' : 'dispense');
  const [queue, reloadQ] = useData('/pharmacy/queue');
  const [orders, reloadO] = useData('/web-orders');
  const newOrders = (orders || []).filter(o => ['new', 'awaiting_review'].includes(o.status)).length;
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Pharmacy & stock</h1><p className="sub">Dispensing uses first-expiry-first-out across batches. Expired batches are never sold.</p></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['dispense', `Prescriptions (${(queue || []).length})`], ['pos', 'Counter sale (POS)'], ['inventory', 'Inventory'], ['web', `Website orders${newOrders ? ` (${newOrders})` : ''}`], ['controlled', 'Controlled drugs register']]} />
      {tab === 'dispense' && <Dispense queue={queue} reload={reloadQ} />}
      {tab === 'pos' && <POS />}
      {tab === 'inventory' && <Inventory />}
      {tab === 'web' && <WebOrders orders={orders} reload={reloadO} />}
      {tab === 'controlled' && <Controlled />}
    </div>
  );
}

function Dispense({ queue, reload }) {
  const [sel, setSel] = useState({});
  const go = async g => {
    const ids = g.items.filter(i => sel[i.id] !== false).map(i => i.id);
    await act(() => api.post(`/pharmacy/dispense/${g.visit_id}`, { prescription_ids: ids }), 'Dispensed and stock updated');
    reload();
  };
  if (!queue) return null;
  if (!queue.length) return <Empty>No prescriptions waiting.</Empty>;
  return <div className="stack">{queue.map(g => <div key={g.visit_id} className="card">
    <div className="cardhead"><h3>#{g.queue_no || '-'} {g.pname}</h3><span className="faint small">{g.mrn}</span>{g.allergies && <Badge tone="bad">Allergy: {g.allergies}</Badge>}
      <a className="right small" href={'#/visit/' + g.visit_id}>Open visit →</a></div>
    <table className="table"><thead><tr><th /><th>Medicine</th><th>Directions</th><th>Qty</th><th>Stock</th><th className="num">Amount</th></tr></thead>
      <tbody>{g.items.map(i => <tr key={i.id}>
        <td style={{ width: 30 }}><input type="checkbox" style={{ width: 'auto' }} checked={sel[i.id] !== false} disabled={i.stock < i.qty} onChange={e => setSel({ ...sel, [i.id]: e.target.checked })} /></td>
        <td><b>{i.name}</b> {i.controlled ? <Badge tone="bad">Controlled</Badge> : null}<div className="faint small">by {i.prescriber}</div></td>
        <td>{i.dose} {i.frequency} for {i.days} days</td><td>{i.qty} {i.unit}</td>
        <td>{i.stock < i.qty ? <Badge tone="bad">Only {i.stock}</Badge> : <span className="muted">{i.stock}</span>}</td>
        <td className="num">{money(i.qty * i.price)}</td></tr>)}</tbody></table>
    <div className="row mt"><button className="primary" onClick={() => go(g)}>Dispense and print labels</button>
      <button onClick={() => printLabels(g)}>Labels only</button></div>
  </div>)}</div>;
}

function printLabels(g) {
  const w = window.open('', '_blank', 'width=420,height=600');
  w.document.write(`<html><body style="font-family:system-ui">${g.items.map(i => `<div style="border:1px solid #000;padding:8px;margin:8px;width:300px"><b>${i.name}</b><br/>${g.pname}<br/>Take ${i.dose || ''} ${i.frequency} for ${i.days} days<br/>Qty: ${i.qty}<br/><small>${new Date().toLocaleDateString('en-KE')}</small></div>`).join('')}<script>print()</script></body></html>`);
  w.document.close();
}

function POS() {
  const [items] = useData('/items');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const results = useMemo(() => (items || []).filter(i => i.category !== 'reagent' && i.price > 0 && (i.name.toLowerCase().includes(q.toLowerCase()) || (i.code || '').toLowerCase().includes(q.toLowerCase()))).slice(0, 12), [items, q]);
  const add = i => setCart(c => c.find(x => x.item_id === i.id) ? c.map(x => x.item_id === i.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { item_id: i.id, name: i.name, price: i.price, qty: 1, rx_only: i.rx_only, stock: i.stock, rx_ref: '' }]);
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const needsRx = cart.some(l => l.rx_only && !l.rx_ref);
  const finish = async p => {
    const r = await act(() => api.post('/pos/sale', { customer: customer || 'Walk-in customer', lines: cart, payments: [p] }), 'Sale complete');
    setCart([]); setCustomer(''); setPhone(''); setPaying(false); setReceipt(r);
  };
  return <div className="grid g-side">
    <div className="card">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Scan barcode or search medicine…" autoFocus />
      <div className="grid g2 mt" style={{ gap: 8 }}>{results.map(i => <button key={i.id} className="choice" disabled={i.stock <= 0} onClick={() => add(i)} style={{ padding: 10 }}>
        <b className="small">{i.name}</b><div className="row small"><span className="muted">{money(i.price)} / {i.unit}</span>
          <span className="right">{i.stock <= 0 ? <Badge tone="bad">Out</Badge> : <span className="faint">{i.stock} left</span>}</span>{i.rx_only ? <Badge tone="warn">Rx</Badge> : null}</div></button>)}</div>
    </div>
    <div className="card stack">
      <h3>Cart</h3>
      <Field label="Customer name (optional)"><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in customer" /></Field>
      {cart.map((l, i) => <div key={l.item_id} className="stack" style={{ gap: 4, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
        <div className="row small"><b>{l.name}</b><button className="ghost sm right" onClick={() => setCart(cart.filter((_, j) => j !== i))}>✕</button></div>
        <div className="row small"><input type="number" min="1" max={l.stock} value={l.qty} style={{ width: 80 }} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
          <span className="muted">× {money(l.price)}</span><b className="right">{money(l.qty * l.price)}</b></div>
        {l.rx_only ? <input placeholder="Prescription-only: prescriber name / Rx number" value={l.rx_ref} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, rx_ref: e.target.value } : x))} style={{ borderColor: l.rx_ref ? null : '#f59e0b' }} /> : null}
      </div>)}
      {!cart.length && <Empty>Cart is empty.</Empty>}
      <div className="row" style={{ fontSize: 18 }}><b>Total</b><b className="right">{money(total)}</b></div>
      {needsRx && <div className="alert warn small">Record the prescription for each Rx-only item before selling.</div>}
      <button className="primary" disabled={!cart.length || needsRx} onClick={() => setPaying(true)}>Take payment</button>
    </div>
    {paying && <Modal title={`Payment · ${money(total)}`} onClose={() => setPaying(false)}>
      <PayPanel balance={total} phone={phone} onPay={finish} />
    </Modal>}
    {receipt && <Receipt bill={receipt} onClose={() => setReceipt(null)} />}
  </div>;
}

function Inventory() {
  const [items, reload] = useData('/items');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [receive, setReceive] = useState(false);
  const [adding, setAdding] = useState(false);
  const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const list = (items || []).filter(i => i.name.toLowerCase().includes(q.toLowerCase()))
    .filter(i => filter === 'low' ? i.stock <= i.reorder_level : filter === 'expiry' ? (i.next_expiry && i.next_expiry <= soon) || i.expired_qty > 0 : true);
  const value = (items || []).reduce((a, i) => a + i.stock * (i.cost || 0), 0);
  return <div className="stack">
    <div className="row">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" style={{ maxWidth: 320 }} />
      <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="all">All items</option><option value="low">Below reorder level</option><option value="expiry">Expiring within 90 days / expired</option></select>
      <span className="muted small">Stock value at cost: <b>{money(value)}</b></span>
      <div className="right row"><button onClick={() => setAdding(true)}>+ New item</button><button className="primary" onClick={() => setReceive(true)}>Receive stock</button></div>
    </div>
    <div className="tablewrap"><table className="table">
      <thead><tr><th>Item</th><th>Category</th><th className="num">Stock</th><th className="num">Reorder at</th><th>Next expiry</th><th className="num">Cost</th><th className="num">Price</th><th>Flags</th></tr></thead>
      <tbody>{list.map(i => <tr key={i.id} className="click" onClick={() => setOpen(i.id)}>
        <td><b>{i.name}</b> <span className="faint small">{i.code}</span></td><td className="small">{i.category}</td>
        <td className="num"><b style={{ color: i.stock <= 0 ? 'var(--bad)' : i.stock <= i.reorder_level ? 'var(--warn)' : null }}>{i.stock}</b> <span className="faint small">{i.unit}</span></td>
        <td className="num muted">{i.reorder_level}</td>
        <td className="small">{i.next_expiry ? <span style={{ color: i.next_expiry <= soon ? 'var(--warn)' : null }}>{fmtDate(i.next_expiry)}</span> : '-'}{i.expired_qty > 0 && <Badge tone="bad">{i.expired_qty} expired</Badge>}</td>
        <td className="num small">{money(i.cost)}</td><td className="num">{money(i.price)}</td>
        <td className="row">{i.rx_only ? <Badge tone="warn">Rx only</Badge> : <Badge>OTC</Badge>}{i.controlled ? <Badge tone="bad">Controlled</Badge> : null}</td></tr>)}</tbody>
    </table></div>
    {open && <ItemDetail id={open} onClose={() => { setOpen(null); reload(); }} />}
    {receive && <ReceiveStock items={items || []} onClose={() => setReceive(false)} onDone={() => { setReceive(false); reload(); }} />}
    {adding && <NewItem onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
  </div>;
}

function ItemDetail({ id, onClose }) {
  const [d, reload] = useData('/items/' + id);
  const [adj, setAdj] = useState(null);
  const [edit, setEdit] = useState(null);
  if (!d) return null;
  const save = async () => { await act(() => api.put('/items/' + id, edit), 'Item updated'); setEdit(null); reload(); };
  return <Modal wide title={d.item.name} onClose={onClose}>
    <div className="row" style={{ marginBottom: 12 }}><Badge>{d.item.category}</Badge><span className="muted">Price {money(d.item.price)} · cost {money(d.item.cost)} · margin {d.item.price ? Math.round((1 - d.item.cost / d.item.price) * 100) : 0}%</span><button className="sm right" onClick={() => setEdit({ ...d.item })}>Edit item</button></div>
    {edit && <div className="card stack" style={{ marginBottom: 12 }}>
      <div className="fields"><Field label="Name"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label="Price"><input type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>
        <Field label="Cost"><input type="number" value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} /></Field>
        <Field label="Reorder level"><input type="number" value={edit.reorder_level} onChange={e => setEdit({ ...edit, reorder_level: e.target.value })} /></Field></div>
      <div className="row"><label className="check"><input type="checkbox" checked={!!edit.rx_only} onChange={e => setEdit({ ...edit, rx_only: e.target.checked })} />Prescription only</label>
        <label className="check"><input type="checkbox" checked={!!edit.controlled} onChange={e => setEdit({ ...edit, controlled: e.target.checked })} />Controlled (DDA register)</label>
        <label className="check"><input type="checkbox" checked={!!edit.web} onChange={e => setEdit({ ...edit, web: e.target.checked })} />Show on website</label>
        <button className="primary right" onClick={save}>Save</button></div>
    </div>}
    <h3>Batches</h3>
    <table className="table"><thead><tr><th>Batch</th><th>Expiry</th><th className="num">Qty</th><th>Supplier</th><th>Received</th><th /></tr></thead>
      <tbody>{d.batches.map(b => <tr key={b.id}><td>{b.batch_no}</td><td>{fmtDate(b.expiry)} {b.expiry < todayISO() && <Badge tone="bad">Expired</Badge>}</td><td className="num">{b.qty}</td><td>{b.supplier}</td><td className="small">{fmtDate(b.received_at)}</td>
        <td><button className="sm" onClick={() => setAdj({ batch_id: b.id, new_qty: b.qty, reason: 'Stock take' })}>Adjust</button></td></tr>)}</tbody></table>
    {adj && <div className="row mt"><input type="number" value={adj.new_qty} onChange={e => setAdj({ ...adj, new_qty: e.target.value })} style={{ width: 100 }} />
      <select value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} style={{ width: 'auto' }}>{['Stock take', 'Damaged', 'Expired - disposed', 'Returned to supplier'].map(r => <option key={r}>{r}</option>)}</select>
      <button className="primary" onClick={async () => { await act(() => api.post('/stock/adjust', adj), 'Stock adjusted'); setAdj(null); reload(); }}>Save count</button></div>}
    <h3 className="mt">Movements</h3>
    <table className="table small"><tbody>{d.moves.map(m => <tr key={m.id}><td>{fmtDT(m.created_at)}</td><td>{m.type}</td><td className="num" style={{ color: m.qty < 0 ? 'var(--bad)' : 'var(--good)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td><td>{m.ref}</td><td className="faint">{m.by_user}</td></tr>)}</tbody></table>
    {!d.moves.length && <Empty>No movements yet.</Empty>}
  </Modal>;
}

function ReceiveStock({ items, onClose, onDone }) {
  const [f, setF] = useState({ supplier: 'Dawa Ltd', expiry: new Date(Date.now() + 540 * 864e5).toISOString().slice(0, 10) });
  const save = async () => { await act(() => api.post('/stock/receive', f), 'Stock received'); onDone(); };
  return <Modal title="Receive stock (goods received note)" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Receive</button></>}>
    <div className="fields">
      <Field label="Item" span={2}><select value={f.item_id || ''} onChange={e => { const it = items.find(i => i.id === Number(e.target.value)); setF({ ...f, item_id: Number(e.target.value), cost: it?.cost }); }}><option value="">Select…</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Quantity"><input type="number" onChange={e => setF({ ...f, qty: e.target.value })} /></Field>
      <Field label="Batch number"><input onChange={e => setF({ ...f, batch_no: e.target.value })} /></Field>
      <Field label="Expiry date"><input type="date" value={f.expiry} onChange={e => setF({ ...f, expiry: e.target.value })} /></Field>
      <Field label="Unit cost (KES)"><input type="number" value={f.cost || ''} onChange={e => setF({ ...f, cost: e.target.value })} /></Field>
      <Field label="Supplier"><input value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /></Field>
    </div>
    <p className="faint small mt">Live build: supplier invoices are validated against KRA eTIMS.</p>
  </Modal>;
}

function NewItem({ onClose, onDone }) {
  const [f, setF] = useState({ category: 'drug', unit: 'tab', web: true });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => { await act(() => api.post('/items', f), 'Item added'); onDone(); };
  return <Modal title="New item" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Add item</button></>}>
    <div className="fields">
      <Field label="Name" span={2}><input onChange={e => set('name', e.target.value)} placeholder="e.g. Paracetamol 120mg/5ml syrup 60ml" /></Field>
      <Field label="Code"><input onChange={e => set('code', e.target.value)} /></Field>
      <Field label="Category"><select value={f.category} onChange={e => set('category', e.target.value)}><option value="drug">Medicine</option><option value="consumable">Consumable</option><option value="reagent">Lab reagent</option></select></Field>
      <Field label="Unit"><input value={f.unit} onChange={e => set('unit', e.target.value)} /></Field>
      <Field label="Cost (KES)"><input type="number" onChange={e => set('cost', e.target.value)} /></Field>
      <Field label="Selling price (KES)"><input type="number" onChange={e => set('price', e.target.value)} /></Field>
      <Field label="Reorder level"><input type="number" onChange={e => set('reorder_level', e.target.value)} /></Field>
    </div>
    <div className="row mt"><label className="check"><input type="checkbox" onChange={e => set('rx_only', e.target.checked)} />Prescription only</label>
      <label className="check"><input type="checkbox" onChange={e => set('controlled', e.target.checked)} />Controlled</label>
      <label className="check"><input type="checkbox" checked={f.web} onChange={e => set('web', e.target.checked)} />Show on website</label></div>
  </Modal>;
}

function WebOrders({ orders, reload }) {
  const [paying, setPaying] = useState(null);
  const status = async (o, s, payment) => { await act(() => api.post(`/web-orders/${o.id}/status`, { status: s, payment }), s === 'fulfilled' ? 'Order fulfilled, stock deducted, receipt issued' : 'Order updated'); setPaying(null); reload(); };
  if (!orders) return null;
  if (!orders.length) return <Empty>No website orders yet. Open the facility website and place one.</Empty>;
  return <div className="stack">{orders.map(o => <div key={o.id} className="card">
    <div className="cardhead"><h3>WEB-{o.id} · {o.name}</h3><span className="muted small">{o.phone} · {fmtDT(o.created_at)} · {o.delivery}</span><span className="right"><StatusBadge s={o.status} /></span></div>
    <table className="table small"><tbody>{o.items.map((l, i) => <tr key={i}><td>{l.name} {l.rx_only && <Badge tone="warn">Rx</Badge>}</td><td>× {l.qty}</td><td className="num">{money(l.qty * l.price)}</td></tr>)}
      <tr><td><b>Total</b></td><td /><td className="num"><b>{money(o.total)}</b></td></tr></tbody></table>
    {o.prescription_note && <div className="alert warn small mt"><b>Prescription details from customer:</b> {o.prescription_note}</div>}
    {['new', 'awaiting_review', 'confirmed'].includes(o.status) && <div className="row mt">
      {o.status === 'awaiting_review' && <button onClick={() => status(o, 'confirmed')}>Pharmacist approves prescription</button>}
      {o.status !== 'awaiting_review' && <button className="primary" onClick={() => setPaying(o)}>Collect payment and fulfil</button>}
      <button className="danger" onClick={() => status(o, 'cancelled')}>Cancel</button></div>}
  </div>)}
    {paying && <Modal title={`Fulfil WEB-${paying.id} · ${money(paying.total)}`} onClose={() => setPaying(null)}>
      <PayPanel balance={paying.total} phone={paying.phone} onPay={p => status(paying, 'fulfilled', p.method)} />
    </Modal>}
  </div>;
}

function Controlled() {
  const [rows] = useData('/controlled-register');
  return <div className="stack">
    <p className="muted">Pharmacy and Poisons Board register of controlled (DDA) drug movements, generated from dispensing and stock records.</p>
    <div className="tablewrap"><table className="table">
      <thead><tr><th>Date</th><th>Drug</th><th>Batch</th><th>Movement</th><th className="num">Qty</th><th>Reference</th><th>By</th></tr></thead>
      <tbody>{(rows || []).map(r => <tr key={r.id}><td className="small">{fmtDT(r.created_at)}</td><td>{r.name}</td><td>{r.batch_no}</td><td>{r.type}</td><td className="num">{r.qty}</td><td>{r.ref}</td><td className="small">{r.by_user}</td></tr>)}</tbody>
    </table>{rows && !rows.length && <Empty>No controlled drug movements yet. Dispense Tramadol or Diazepam to see entries.</Empty>}</div>
  </div>;
}
