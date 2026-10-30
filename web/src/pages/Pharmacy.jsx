import React, { useContext, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, Tabs, StatusBadge, Badge, act, money, fmtDate, fmtDT, fmtQty, Empty, todayISO, PageHead, Tip, Icon, Stat } from '../ui';
import { PayPanel, Receipt } from './Billing';
import ProductArt from '../shared/ProductArt';

const pl = (w, n) => n === 1 ? w : /(x|s|ch|sh)$/.test(w) ? w + 'es' : w + 's';

export default function Pharmacy() {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState(c.user.role === 'cashier' ? 'pos' : 'dispense');
  const [queue, reloadQ] = useData('/pharmacy/queue');
  const [orders, reloadO] = useData('/web-orders');
  const newOrders = (orders || []).filter(o => ['new', 'awaiting_review', 'confirmed'].includes(o.status)).length;
  return (
    <div className="page">
      <PageHead icon="pharmacy" title={c.type === 'pharmacy' ? 'Pharmacy & stock' : 'Pharmacy & stores'} sub="Stock is counted in single pieces. Selling 10 tablets from a box of 100 updates stock straight away." />
      <Tabs value={tab} onChange={setTab} tabs={[['dispense', `Prescriptions (${(queue || []).length})`], ['pos', 'Counter sale'], ['inventory', 'Inventory'], ['web', `Website orders${newOrders ? ` (${newOrders})` : ''}`], ['controlled', 'Controlled drugs register']]} />
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
    const ids = g.items.filter(i => sel[i.id] !== false && i.stock >= i.qty).map(i => i.id);
    await act(() => api.post(`/pharmacy/dispense/${g.visit_id}`, { prescription_ids: ids }), 'Dispensed. Stock updated and charged to the bill.');
    printLabels({ ...g, items: g.items.filter(i => ids.includes(i.id)) });
    reload();
  };
  if (!queue) return null;
  if (!queue.length) return <Empty icon="pharmacy">No prescriptions waiting. New ones appear here as soon as a clinician sends them.</Empty>;
  return <div className="stack">{queue.map(g => <div key={g.visit_id} className="card">
    <div className="cardhead"><h3>#{g.queue_no || '-'} {g.pname}</h3><span className="faint small">{g.mrn}</span>{g.inpatient && <Badge tone="info">Inpatient</Badge>}{g.allergies && <Badge tone="bad">Allergy: {g.allergies}</Badge>}
      <a className="right small" href={'#/visit/' + g.visit_id}>Open visit →</a></div>
    <div className="stack" style={{ gap: 8 }}>{g.items.map(i => <div key={i.id} className="row" style={{ flexWrap: 'nowrap', padding: 8, border: '1px solid var(--line)', borderRadius: 12 }}>
      <input type="checkbox" checked={sel[i.id] !== false && i.stock >= i.qty} disabled={i.stock < i.qty} onChange={e => setSel({ ...sel, [i.id]: e.target.checked })} />
      <ProductArt item={i} size={52} rounded={10} />
      <div style={{ flex: 1 }}><b>{i.name}</b> {i.controlled ? <Badge tone="bad">Controlled</Badge> : null}<div className="small muted">{i.dose} · {i.frequency} · {i.days} days · by {i.prescriber}</div></div>
      <div style={{ textAlign: 'right' }}><b>Give {i.qty_text}</b><div className="small">{i.stock < i.qty ? <Badge tone="bad">Only {i.stock_text}</Badge> : <span className="faint">{i.stock_text} in stock</span>}</div></div>
      <b style={{ width: 90, textAlign: 'right' }}>{money(i.qty * i.price)}</b>
    </div>)}</div>
    <div className="row mt"><button className="primary" onClick={() => go(g)}>Dispense and print labels</button><button onClick={() => printLabels(g)}><Icon name="print" size={14} />Labels only</button>
      <span className="faint small">Out-of-stock items stay pending so the patient can buy them elsewhere or come back.</span></div>
  </div>)}</div>;
}

function printLabels(g) {
  if (!g.items.length) return;
  const w = window.open('', '_blank', 'width=420,height=600');
  if (!w) return;
  w.document.write(`<html><body style="font-family:system-ui">${g.items.map(i => `<div style="border:1px solid #000;padding:8px;margin:8px;width:300px"><b>${i.name}</b><br/>${g.pname}<br/>${i.dose || ''} · ${i.frequency} for ${i.days} days<br/>Quantity: ${i.qty_text || i.qty}<br/><small>${new Date().toLocaleDateString('en-KE')}</small></div>`).join('')}<script>print()</script></body></html>`);
  w.document.close();
}

function useCategories(items) {
  return useMemo(() => ['All', ...[...new Set((items || []).map(i => i.shop_cat).filter(Boolean))].sort()], [items]);
}

function POS() {
  const [items, reloadItems] = useData('/items');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState('');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const cats = useCategories(items);
  const results = useMemo(() => (items || []).filter(i => i.category !== 'reagent' && (cat === 'All' || i.shop_cat === cat) &&
    (i.name.toLowerCase().includes(q.toLowerCase()) || (i.code || '').toLowerCase().includes(q.toLowerCase()) || (i.barcode || '') === q)).slice(0, 40), [items, q, cat]);
  const priceOf = l => l.mode === 'pack' ? l.item.pack_price : l.item.price;
  const baseOf = l => l.mode === 'pack' ? l.qty * l.item.pack_size : l.qty;
  const add = it => setCart(c => {
    const mode = it.pack_size > 1 && !it.sell_loose ? 'pack' : 'unit';
    const ex = c.find(x => x.item.id === it.id && x.mode === mode);
    return ex ? c.map(x => x === ex ? { ...x, qty: x.qty + 1 } : x) : [...c, { item: it, qty: 1, mode, rx_ref: '' }];
  });
  const total = cart.reduce((a, l) => a + l.qty * priceOf(l), 0);
  const needsRx = cart.some(l => l.item.rx_only && !l.rx_ref);
  const short = cart.find(l => baseOf(l) > l.item.stock);
  const finish = async p => {
    const r = await act(() => api.post('/pos/sale', { customer: customer || 'Walk-in customer', lines: cart.map(l => ({ item_id: l.item.id, qty: l.qty, mode: l.mode, rx_ref: l.rx_ref })), payments: [p] }), 'Sale complete');
    setCart([]); setCustomer(''); setPaying(false); setReceipt(r); reloadItems();
  };
  return <div className="grid g-side">
    <div className="stack">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Scan barcode or search medicine, supply or device…" autoFocus style={{ fontSize: 15, padding: 12 }} />
      <div className="row" style={{ gap: 5 }}>{cats.map(x => <button key={x} className={'sm' + (cat === x ? ' primary' : '')} onClick={() => setCat(x)}>{x}</button>)}</div>
      <div className="pgrid">{results.map(i => <button key={i.id} type="button" className={'pcard' + (i.stock <= 0 ? ' out' : '')} disabled={i.stock <= 0} onClick={() => add(i)}>
        <div className="art"><ProductArt item={i} size={110} /></div>
        <span className="nm">{i.name}</span>
        <div className="row small"><span className="pr">{money(i.sell_loose || i.pack_size === 1 ? i.price : i.pack_price)}</span><span className="faint">/{i.sell_loose || i.pack_size === 1 ? i.unit : i.pack_name}</span>
          {i.rx_only ? <Badge tone="warn">Rx</Badge> : null}</div>
        <span className="small" style={{ color: i.stock <= 0 ? 'var(--bad)' : i.stock <= i.reorder_level ? 'var(--warn)' : 'var(--ink-3)' }}>{i.stock <= 0 ? 'Out of stock' : i.stock_text}</span>
      </button>)}</div>
      {items && !results.length && <Empty icon="search">Nothing matches “{q}”.</Empty>}
    </div>
    <div className="card stack" style={{ position: 'sticky', top: 16, alignSelf: 'start' }}>
      <div className="row"><h3 style={{ margin: 0 }}>Cart</h3><span className="faint small right">{cart.length} line{cart.length === 1 ? '' : 's'}</span></div>
      <Field label="Customer name (optional)"><input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in customer" /></Field>
      {cart.map((l, i) => <div key={i} className="stack" style={{ gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
        <div className="row" style={{ flexWrap: 'nowrap' }}><ProductArt item={l.item} size={40} rounded={8} /><b className="small" style={{ flex: 1 }}>{l.item.name}</b><button className="ghost sm" onClick={() => setCart(cart.filter((_, j) => j !== i))} aria-label="Remove">✕</button></div>
        <div className="row small">
          {l.item.pack_size > 1 && <div className="seg">
            {l.item.sell_loose ? <button className={l.mode === 'unit' ? 'on' : ''} onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, mode: 'unit' } : x))}>{pl(l.item.unit, 2)}</button> : null}
            <button className={l.mode === 'pack' ? 'on' : ''} onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, mode: 'pack' } : x))}>{pl(l.item.pack_name, 2)} of {l.item.pack_size}</button></div>}
          <input type="number" min="1" value={l.qty} style={{ width: 74 }} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} />
          <span className="muted">× {money(priceOf(l))}</span><b className="right">{money(l.qty * priceOf(l))}</b></div>
        {baseOf(l) > l.item.stock && <span className="small" style={{ color: 'var(--bad)' }}>Only {l.item.stock_text} in stock</span>}
        {l.item.rx_only ? <input placeholder="Prescription-only: prescriber name or Rx number" value={l.rx_ref} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, rx_ref: e.target.value } : x))} style={{ borderColor: l.rx_ref ? null : '#f59e0b' }} /> : null}
      </div>)}
      {!cart.length && <Empty icon="pharmacy">Tap a product to add it.</Empty>}
      <div className="row" style={{ fontSize: 20 }}><b>Total</b><b className="right">{money(total)}</b></div>
      {needsRx && <div className="alert warn small">Record the prescription for each Rx-only item before selling.</div>}
      <button className="primary" style={{ justifyContent: 'center', padding: 12 }} disabled={!cart.length || needsRx || !!short} onClick={() => setPaying(true)}>Take payment</button>
    </div>
    {paying && <Modal title={`Payment · ${money(total)}`} onClose={() => setPaying(false)}><PayPanel balance={total} onPay={finish} /></Modal>}
    {receipt && <Receipt bill={receipt} onClose={() => setReceipt(null)} />}
  </div>;
}

function Inventory() {
  const c = useContext(ConfigContext);
  const [items, reload] = useData('/items');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [open, setOpen] = useState(null);
  const [receive, setReceive] = useState(null);
  const [adding, setAdding] = useState(false);
  const cats = useCategories(items);
  const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const list = (items || []).filter(i => (cat === 'All' || i.shop_cat === cat) && (i.name + ' ' + (i.grp || '') + ' ' + (i.code || '')).toLowerCase().includes(q.toLowerCase()))
    .filter(i => filter === 'low' ? i.stock <= i.reorder_level : filter === 'expiry' ? (i.next_expiry && i.next_expiry <= soon) || i.expired_qty > 0 : filter === 'out' ? i.stock <= 0 : true);
  const all = items || [];
  return <div className="stack">
    <div className="grid g4">
      <Stat icon="box" label="Items in catalogue" value={all.length} hint={`${all.filter(i => i.stock > 0).length} in stock`} />
      <Stat icon="cash" label="Stock value at cost" value={money(all.reduce((a, i) => a + i.stock * (i.cost || 0), 0))} hint={`${money(all.reduce((a, i) => a + i.stock * i.price, 0))} at selling price`} />
      <Stat icon="alert" label="Below reorder level" value={all.filter(i => i.stock <= i.reorder_level).length} tone="warn" />
      <Stat icon="appointments" label="Expiring in 90 days" value={all.filter(i => i.next_expiry && i.next_expiry <= soon).length} hint={`${all.filter(i => i.expired_qty > 0).length} with expired batches`} />
    </div>
    <div className="row">
      <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, group or code" style={{ paddingLeft: 34 }} />
        <span style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-3)' }}><Icon name="search" size={16} /></span></div>
      <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}><option value="all">All stock</option><option value="low">Below reorder level</option><option value="out">Out of stock</option><option value="expiry">Expiring / expired</option></select>
      <div className="seg"><button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Grid"><Icon name="grid" size={15} /></button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="List"><Icon name="list" size={15} /></button></div>
      <div className="right row"><button onClick={() => setAdding(true)}><Icon name="plus" size={15} />New item</button><button className="primary" onClick={() => setReceive({})}>Receive stock</button></div>
    </div>
    <div className="row" style={{ gap: 5 }}>{cats.map(x => <button key={x} className={'sm' + (cat === x ? ' primary' : '')} onClick={() => setCat(x)}>{x}</button>)}</div>
    {view === 'grid' ? <div className="pgrid">{list.map(i => <button key={i.id} type="button" className={'pcard' + (i.stock <= 0 ? ' out' : '')} onClick={() => setOpen(i.id)}>
      <div className="art"><ProductArt item={i} size={110} /></div>
      <span className="nm">{i.name}</span>
      <div className="row small"><span className="pr">{money(i.pack_price)}</span><span className="faint">/{i.pack_size > 1 ? `${i.pack_name} of ${i.pack_size}` : i.unit}</span></div>
      {i.pack_size > 1 && i.sell_loose ? <span className="small faint">{money(i.price)} per {i.unit}</span> : null}
      <span className="small" style={{ fontWeight: 600, color: i.stock <= 0 ? 'var(--bad)' : i.stock <= i.reorder_level ? 'var(--warn)' : 'var(--good)' }}>{i.stock <= 0 ? 'Out of stock' : i.stock_text}</span>
    </button>)}</div>
      : <div className="tablewrap"><table className="table">
        <thead><tr><th>Item</th><th>Group</th><th className="num">In stock</th><th className="num">Reorder at</th><th>Next expiry</th><th className="num">Pack price</th><th className="num">Unit price</th><th>Flags</th></tr></thead>
        <tbody>{list.map(i => <tr key={i.id} className="click" onClick={() => setOpen(i.id)}>
          <td><div className="row" style={{ flexWrap: 'nowrap' }}><ProductArt item={i} size={36} rounded={8} /><div><b>{i.name}</b><div className="faint small">{i.code}</div></div></div></td><td className="small">{i.grp}</td>
          <td className="num"><b style={{ color: i.stock <= 0 ? 'var(--bad)' : i.stock <= i.reorder_level ? 'var(--warn)' : null }}>{i.stock_text}</b></td>
          <td className="num muted small">{fmtQty(i, i.reorder_level)}</td>
          <td className="small">{i.next_expiry ? <span style={{ color: i.next_expiry <= soon ? 'var(--warn)' : null }}>{fmtDate(i.next_expiry)}</span> : '-'} {i.expired_qty > 0 && <Badge tone="bad">expired stock</Badge>}</td>
          <td className="num">{money(i.pack_price)}</td><td className="num">{i.pack_size > 1 && i.sell_loose ? money(i.price) : '-'}</td>
          <td><div className="row">{i.rx_only ? <Badge tone="warn">Rx</Badge> : <Badge>OTC</Badge>}{i.controlled ? <Badge tone="bad">Controlled</Badge> : null}</div></td></tr>)}</tbody>
      </table></div>}
    {items && !list.length && <Empty icon="box">No items match.</Empty>}
    {open && <ItemDetail id={open} onReceive={it => setReceive({ item_id: it.id })} onClose={() => { setOpen(null); reload(); }} />}
    {receive && <ReceiveStock items={all} initial={receive} onClose={() => setReceive(null)} onDone={() => { setReceive(null); reload(); }} />}
    {adding && <NewItem onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
  </div>;
}

function ItemDetail({ id, onClose, onReceive }) {
  const [d, reload] = useData('/items/' + id);
  const [adj, setAdj] = useState(null);
  const [edit, setEdit] = useState(null);
  const fileRef = useRef();
  if (!d) return null;
  const it = d.item;
  const save = async () => { await act(() => api.put('/items/' + id, edit), 'Item updated'); setEdit(null); reload(); };
  const upload = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => { await act(() => api.post(`/items/${id}/image`, { dataUrl: r.result }), 'Photo saved'); reload(); };
    r.readAsDataURL(f);
  };
  return <Modal wide title={it.name} onClose={onClose} footer={<><button onClick={() => { onClose(); onReceive(it); }}>Receive stock</button><button className="primary" onClick={onClose}>Done</button></>}>
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 18 }}>
      <div className="stack" style={{ alignItems: 'center' }}>
        <ProductArt item={it} size={150} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
        <div className="row"><button className="sm" onClick={() => fileRef.current.click()}><Icon name="upload" size={14} />{it.image ? 'Change photo' : 'Upload photo'}</button>
          {it.image && <button className="sm ghost" onClick={async () => { await api.del(`/items/${id}/image`); reload(); }}>Remove</button>}</div>
      </div>
      <div style={{ flex: 1 }} className="stack">
        <div className="row"><Badge>{it.grp}</Badge><Badge tone="brand">{it.shop_cat}</Badge>{it.rx_only ? <Badge tone="warn">Prescription only</Badge> : <Badge tone="good">Over the counter</Badge>}{it.controlled ? <Badge tone="bad">Controlled (DDA)</Badge> : null}</div>
        <div className="grid g3" style={{ gap: 10 }}>
          <div><div className="faint small">In stock</div><b style={{ fontSize: 18 }}>{it.stock_text}</b><div className="faint small">{it.stock} {pl(it.unit, it.stock)} in total</div></div>
          <div><div className="faint small">Pack</div><b>{it.pack_size > 1 ? `${it.pack_name} of ${it.pack_size} ${pl(it.unit, it.pack_size)}` : `per ${it.unit}`}</b><div className="faint small">{it.sell_loose ? 'Sold loose or by pack' : 'Sold by pack only'}</div></div>
          <div><div className="faint small">Selling price</div><b>{money(it.pack_price)}</b>{it.pack_size > 1 && <div className="small">{money(it.price)} per {it.unit}</div>}<div className="faint small">Cost {money(it.cost * it.pack_size)} · margin {it.pack_price ? Math.round((1 - it.cost * it.pack_size / it.pack_price) * 100) : 0}%</div></div>
        </div>
        {it.description && <p className="small muted">{it.description}</p>}
        <div><button className="sm" onClick={() => setEdit({ ...it })}>Edit prices and settings</button></div>
      </div>
    </div>
    {edit && <div className="card stack mt" style={{ boxShadow: 'none', background: '#fafbfc' }}>
      <div className="fields"><Field label="Name" span={2}><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
        <Field label={`Price per ${it.pack_size > 1 ? it.pack_name : it.unit}`}><input type="number" value={edit.pack_price} onChange={e => setEdit({ ...edit, pack_price: e.target.value, ...(it.pack_size === 1 ? { price: e.target.value } : {}) })} /></Field>
        {it.pack_size > 1 && <Field label={`Price per ${it.unit} (loose)`}><input type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>}
        <Field label={`Cost per ${it.unit}`}><input type="number" value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} /></Field>
        <Field label={`Reorder level (${pl(it.unit, 2)})`}><input type="number" value={edit.reorder_level} onChange={e => setEdit({ ...edit, reorder_level: e.target.value })} /></Field>
        <Field label="Barcode"><input value={edit.barcode || ''} onChange={e => setEdit({ ...edit, barcode: e.target.value })} /></Field>
        <Field label="Description (shown on website)" span={3}><input value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field></div>
      <div className="row"><label className="check"><input type="checkbox" checked={!!edit.rx_only} onChange={e => setEdit({ ...edit, rx_only: e.target.checked })} />Prescription only</label>
        <label className="check"><input type="checkbox" checked={!!edit.controlled} onChange={e => setEdit({ ...edit, controlled: e.target.checked })} />Controlled (DDA register)</label>
        {it.pack_size > 1 && <label className="check"><input type="checkbox" checked={!!edit.sell_loose} onChange={e => setEdit({ ...edit, sell_loose: e.target.checked })} />Can sell loose pieces</label>}
        <label className="check"><input type="checkbox" checked={!!edit.web} onChange={e => setEdit({ ...edit, web: e.target.checked })} />Show on website</label>
        <button className="primary right" onClick={save}>Save</button></div>
    </div>}
    <h3 className="mt">Batches (first to expire is sold first)</h3>
    <table className="table"><thead><tr><th>Batch</th><th>Expiry</th><th className="num">Quantity</th><th>Supplier</th><th>Received</th><th /></tr></thead>
      <tbody>{d.batches.map(b => <tr key={b.id}><td>{b.batch_no}</td><td>{fmtDate(b.expiry)} {b.expiry < todayISO() && <Badge tone="bad">Expired</Badge>}</td><td className="num">{b.qty_text}</td><td>{b.supplier}</td><td className="small">{fmtDate(b.received_at)}</td>
        <td><button className="sm" onClick={() => setAdj({ batch_id: b.id, new_qty: b.qty, reason: 'Stock take' })}>Count / adjust</button></td></tr>)}</tbody></table>
    {!d.batches.length && <Empty icon="box">No stock received yet.</Empty>}
    {adj && <div className="row mt"><span className="small">Counted quantity ({pl(it.unit, 2)}):</span><input type="number" value={adj.new_qty} onChange={e => setAdj({ ...adj, new_qty: e.target.value })} style={{ width: 110 }} />
      <select value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} style={{ width: 'auto' }}>{['Stock take', 'Damaged', 'Expired - disposed', 'Returned to supplier', 'Theft / loss'].map(r => <option key={r}>{r}</option>)}</select>
      <button className="primary" onClick={async () => { await act(() => api.post('/stock/adjust', adj), 'Stock adjusted'); setAdj(null); reload(); }}>Save count</button><button className="ghost" onClick={() => setAdj(null)}>Cancel</button></div>}
    <h3 className="mt">Recent movements</h3>
    <table className="table small"><tbody>{d.moves.map(m => <tr key={m.id}><td>{fmtDT(m.created_at)}</td><td style={{ textTransform: 'capitalize' }}>{m.type}</td><td className="num" style={{ color: m.qty < 0 ? 'var(--bad)' : 'var(--good)' }}>{m.qty > 0 ? '+' : ''}{m.qty} {pl(it.unit, Math.abs(m.qty))}</td><td>{m.ref}</td><td className="faint">{m.by_user}</td></tr>)}</tbody></table>
    {!d.moves.length && <Empty icon="list">No movements yet.</Empty>}
  </Modal>;
}

function ReceiveStock({ items, initial, onClose, onDone }) {
  const [suppliers] = useData('/suppliers');
  const [f, setF] = useState({ supplier: 'Dawa Ltd', expiry: new Date(Date.now() + 540 * 864e5).toISOString().slice(0, 10), packs: '', loose: '', ...initial });
  const [q, setQ] = useState('');
  const it = items.find(i => i.id === f.item_id);
  const total = it ? (Number(f.packs) || 0) * it.pack_size + (Number(f.loose) || 0) : 0;
  const save = async () => { const r = await act(() => api.post('/stock/receive', f)); onDone(); alert(`Received ${r.received} of ${it.name}.`); };
  const matches = q.length > 1 ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return <Modal wide title="Receive stock (goods received note)" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!it || !total || !f.expiry} onClick={save}>Receive {it && total ? fmtQty(it, total) : ''}</button></>}>
    {!it ? <div style={{ position: 'relative' }}><Field label="Item"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search the item you received" /></Field>
      {matches.length > 0 && <div className="dropdown">{matches.map(i => <button key={i.id} className="dd-item" onClick={() => setF({ ...f, item_id: i.id, pack_cost: Math.round(i.cost * i.pack_size) })}><ProductArt item={i} size={34} rounded={7} /><span>{i.name} <span className="faint small">· {i.stock_text} in stock</span></span></button>)}</div>}</div>
      : <div className="row" style={{ flexWrap: 'nowrap' }}><ProductArt item={it} size={64} /><div><b>{it.name}</b><div className="small muted">Pack: {it.pack_size > 1 ? `${it.pack_name} of ${it.pack_size} ${pl(it.unit, it.pack_size)}` : it.unit} · in stock {it.stock_text}</div></div>{!initial.item_id && <button className="sm right" onClick={() => setF({ ...f, item_id: null })}>Change</button>}</div>}
    {it && <div className="fields mt">
      <Field label={`Number of ${pl(it.pack_size > 1 ? it.pack_name : it.unit, 2)}`}><input type="number" min="0" value={f.packs} onChange={e => setF({ ...f, packs: e.target.value })} autoFocus /></Field>
      {it.pack_size > 1 && <Field label={`Plus loose ${pl(it.unit, 2)}`}><input type="number" min="0" value={f.loose} onChange={e => setF({ ...f, loose: e.target.value })} /></Field>}
      <Field label="Batch number"><input value={f.batch_no || ''} onChange={e => setF({ ...f, batch_no: e.target.value })} /></Field>
      <Field label="Expiry date *"><input type="date" value={f.expiry} min={todayISO()} onChange={e => setF({ ...f, expiry: e.target.value })} /></Field>
      <Field label={`Cost per ${it.pack_size > 1 ? it.pack_name : it.unit} (KES)`}><input type="number" value={f.pack_cost || ''} onChange={e => setF({ ...f, pack_cost: e.target.value })} /></Field>
      <Field label="Supplier"><input list="suppliers" value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /><datalist id="suppliers">{(suppliers || []).map(s => <option key={s.id} value={s.name} />)}</datalist></Field>
      <Field label="Supplier invoice no."><input value={f.invoice || ''} onChange={e => setF({ ...f, invoice: e.target.value })} /></Field>
    </div>}
    {it && total > 0 && <div className="alert info mt">Adds <b>{fmtQty(it, total)}</b> ({total} {pl(it.unit, total)}). New stock: <b>{fmtQty(it, it.stock + total)}</b>.</div>}
    <p className="faint small mt">Live build: supplier invoices are checked against KRA eTIMS.</p>
  </Modal>;
}

function NewItem({ onClose, onDone }) {
  const [f, setF] = useState({ category: 'drug', form: 'tablet', unit: 'tab', pack_size: 100, pack_name: 'box', web: true, shop_cat: 'Pain & fever', grp: 'Other' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => { await act(() => api.post('/items', f), 'Item added'); onDone(); };
  const FORMS = [['tablet', 'tab'], ['capsule', 'cap'], ['syrup', 'bottle'], ['injection', 'vial'], ['infusion', 'bag'], ['cream', 'tube'], ['ointment', 'tube'], ['drops', 'bottle'], ['inhaler', 'inhaler'], ['sachet', 'sachet'], ['device', 'pc'], ['kit', 'test'], ['gloves', 'pair'], ['syringe', 'pc'], ['solution', 'bottle']];
  return <Modal wide title="New item" onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!f.name || !f.pack_price} onClick={save}>Add item</button></>}>
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 18 }}>
      <ProductArt item={{ ...f, name: f.name || 'New item' }} size={130} />
      <div className="fields" style={{ flex: 1 }}>
        <Field label="Name *" span={2}><input onChange={e => set('name', e.target.value)} placeholder="e.g. Paracetamol 120mg/5ml syrup 60ml" autoFocus /></Field>
        <Field label="Strength"><input onChange={e => set('strength', e.target.value)} placeholder="e.g. 500mg" /></Field>
        <Field label="Form"><select value={f.form} onChange={e => { const x = FORMS.find(y => y[0] === e.target.value); setF({ ...f, form: x[0], unit: x[1] }); }}>{FORMS.map(([fm]) => <option key={fm}>{fm}</option>)}</select></Field>
        <Field label="Base unit" hint="What you count: tab, cap, bottle…"><input value={f.unit} onChange={e => set('unit', e.target.value)} /></Field>
        <Field label="Units per pack"><input type="number" min="1" value={f.pack_size} onChange={e => set('pack_size', e.target.value)} /></Field>
        <Field label="Pack name"><input value={f.pack_name} onChange={e => set('pack_name', e.target.value)} placeholder="box, strip, bottle" /></Field>
        <Field label="Selling price per pack *"><input type="number" onChange={e => set('pack_price', e.target.value)} /></Field>
        <Field label="Price per unit (loose)" hint="Blank = pack price ÷ units + 20%"><input type="number" onChange={e => set('price', e.target.value)} /></Field>
        <Field label="Cost per pack"><input type="number" onChange={e => set('pack_cost', e.target.value)} /></Field>
        <Field label="Category"><select value={f.category} onChange={e => set('category', e.target.value)}><option value="drug">Medicine</option><option value="consumable">Supply / device</option><option value="reagent">Lab reagent</option></select></Field>
        <Field label="Shop category"><select value={f.shop_cat} onChange={e => set('shop_cat', e.target.value)}>{['Pain & fever', 'Cold, cough & flu', 'Prescription medicines', 'Malaria', 'Stomach & digestion', 'Allergy', 'Vitamins & supplements', 'Chronic care', 'Skin care', 'Eye & ear', 'Mum & baby', 'Sexual & reproductive health', 'First aid', 'Medical devices', 'Personal care', 'Clinical supplies', 'Lab supplies'].map(x => <option key={x}>{x}</option>)}</select></Field>
      </div>
    </div>
    <div className="row mt"><label className="check"><input type="checkbox" onChange={e => set('rx_only', e.target.checked)} />Prescription only</label>
      <label className="check"><input type="checkbox" onChange={e => set('controlled', e.target.checked)} />Controlled</label>
      <label className="check"><input type="checkbox" checked={f.web} onChange={e => set('web', e.target.checked)} />Show on website</label></div>
  </Modal>;
}

function WebOrders({ orders, reload }) {
  const [paying, setPaying] = useState(null);
  const status = async (o, s, p) => { await act(() => api.post(`/web-orders/${o.id}/status`, { status: s, payment: p?.method, reference: p?.reference }), s === 'fulfilled' ? 'Order fulfilled, stock deducted, receipt issued' : 'Order updated'); setPaying(null); reload(); };
  if (!orders) return null;
  if (!orders.length) return <Empty icon="globe">No website orders yet. Open the facility website and place one.</Empty>;
  return <div className="stack">
    <Tip id="weborders">Orders from your website land here. Prescription items wait for a pharmacist to approve the prescription. Then send the customer an M-Pesa prompt and fulfil the order.</Tip>
    {orders.map(o => <div key={o.id} className="card">
      <div className="cardhead"><h3>WEB-{o.id} · {o.name}</h3><span className="muted small">{o.phone} · {fmtDT(o.created_at)} · {o.delivery === 'delivery' ? 'Delivery' : 'Pick-up'}</span><span className="right"><StatusBadge s={o.status} /></span></div>
      <table className="table small"><tbody>{o.items.map((l, i) => <tr key={i}><td>{l.name} {l.rx_only && <Badge tone="warn">Rx</Badge>}</td><td>{l.qty} {pl(l.unit || 'pc', l.qty)}</td><td className="num">{money(l.qty * l.price)}</td></tr>)}
        <tr><td><b>Total</b></td><td /><td className="num"><b>{money(o.total)}</b></td></tr></tbody></table>
      {o.prescription_note && <div className="alert warn small mt"><b>Prescription details from customer:</b> {o.prescription_note}</div>}
      {['new', 'awaiting_review', 'confirmed'].includes(o.status) && <div className="row mt">
        {o.status === 'awaiting_review' && <button className="primary" onClick={() => status(o, 'confirmed')}>Pharmacist approves prescription</button>}
        {o.status !== 'awaiting_review' && <button className="primary" onClick={() => setPaying(o)}>Collect payment and fulfil</button>}
        <button className="danger" onClick={() => status(o, 'cancelled')}>Cancel order</button></div>}
    </div>)}
    {paying && <Modal title={`Fulfil WEB-${paying.id} · ${money(paying.total)}`} onClose={() => setPaying(null)}>
      <PayPanel balance={paying.total} phone={paying.phone} onPay={p => status(paying, 'fulfilled', p)} />
    </Modal>}
  </div>;
}

function Controlled() {
  const [rows] = useData('/controlled-register');
  return <div className="stack">
    <Tip id="dda">Pharmacy and Poisons Board register for controlled (DDA) drugs, generated automatically from receiving, dispensing and stock counts.</Tip>
    <div className="tablewrap"><table className="table">
      <thead><tr><th>Date</th><th>Drug</th><th>Batch</th><th>Movement</th><th className="num">Quantity</th><th>Reference</th><th>By</th></tr></thead>
      <tbody>{(rows || []).map(r => <tr key={r.id}><td className="small">{fmtDT(r.created_at)}</td><td>{r.name}</td><td>{r.batch_no}</td><td style={{ textTransform: 'capitalize' }}>{r.type}</td>
        <td className="num" style={{ color: r.qty < 0 ? 'var(--bad)' : 'var(--good)' }}>{r.qty > 0 ? '+' : ''}{r.qty} {pl(r.unit, Math.abs(r.qty))}</td><td>{r.ref}</td><td className="small">{r.by_user}</td></tr>)}</tbody>
    </table>{rows && !rows.length && <Empty icon="shield">No controlled drug movements yet.</Empty>}</div>
  </div>;
}
