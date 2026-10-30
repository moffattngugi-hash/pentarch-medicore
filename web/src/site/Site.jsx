import React, { useEffect, useMemo, useState } from 'react';
import ProductArt from '../shared/ProductArt';

const money = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
const B = new URLSearchParams(window.location.search).get('b');
async function call(url, body) {
  const r = await fetch('/api/public' + url + (B ? (url.includes('?') ? '&' : '?') + 'b=' + B : ''), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const P = {
  cross: 'M13 5h6v8h8v6h-8v8h-6v-8H5v-6h8z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  cart: 'M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  pill: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7',
  flask: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19l-6-10V3M7 14h10',
  steth: 'M6 3v6a6 6 0 0 0 12 0V3M12 15v3a3 3 0 0 0 6 0v-1M18 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  bed: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9',
  cal: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  x: 'M18 6 6 18M6 6l12 12',
};
const I = ({ n, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
const CAT_ICON = { 'Pain & fever': '🌡️', 'Cold, cough & flu': '🤧', 'Malaria': '🦟', 'Stomach & digestion': '🫃', 'Allergy': '🌼', 'Vitamins & supplements': '💊', 'Chronic care': '❤️',
  'Skin care': '🧴', 'Eye & ear': '👁️', 'Mum & baby': '🍼', 'Sexual & reproductive health': '🛡️', 'First aid': '🩹', 'Medical devices': '🩺', 'Personal care': '🧼', 'Prescription medicines': '℞' };
const DEPT = { Haematology: '#dc2626', Parasitology: '#16a34a', 'Clinical chemistry': '#2563eb', Hormones: '#9333ea', Serology: '#ea580c', Urinalysis: '#ca8a04', Microbiology: '#0d9488', 'Histology & cytology': '#db2777' };
const SVC_ICON = { consultation: 'steth', procedure: 'heart', bed: 'bed', other: 'shield' };

export default function Site() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [view, setView] = useState(null);
  const [limit, setLimit] = useState(16);
  useEffect(() => {
    call('/site').then(x => { setD(x); document.title = `${x.facility.name} · ${x.facility.tagline || ''}`; if (x.facility.color) document.documentElement.style.setProperty('--brand', x.facility.color); }).catch(e => setErr(e.message));
  }, []);
  // in-stock over-the-counter items first, prescription medicines after
  const products = useMemo(() => (d?.products || []).filter(p => (cat === 'All' || p.shop_cat === cat) && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.in_stock - a.in_stock) || (a.rx_only - b.rx_only) || a.shop_cat.localeCompare(b.shop_cat) || a.name.localeCompare(b.name)), [d, q, cat]);
  if (err) return <div style={{ padding: 40 }}>{err}</div>;
  if (!d) return <div style={{ padding: 40 }}>Loading…</div>;
  const f = d.facility;
  const cats = [...new Set(d.products.map(p => p.shop_cat))].filter(Boolean).sort((a, b) => a === 'Prescription medicines' ? 1 : b === 'Prescription medicines' ? -1 : a.localeCompare(b));
  const add = (p, n = 1) => { setCart(c => c.find(x => x.id === p.id) ? c.map(x => x.id === p.id ? { ...x, qty: x.qty + n } : x) : [...c, { ...p, qty: n }]); };
  const inCart = id => cart.find(x => x.id === id)?.qty || 0;
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const groups = {};
  for (const s of d.services) (groups[s.category] ||= []).push(s);
  const catName = { consultation: 'Consultations', procedure: 'Procedures', bed: 'Inpatient care', other: 'Other services' };
  const depts = [...new Set(d.tests.map(t => t.dept))];
  const featured = d.products.filter(p => p.in_stock && !p.rx_only).slice(0, 4);
  const unit = p => p.pack_size > 1 ? `${p.pack_name} of ${p.pack_size}` : p.unit;
  const goShop = c => { setCat(c); setLimit(16); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); };

  return <>
    <div className="topbar"><div className="wrap"><span>Order online, pick up in store · Pay with M-Pesa</span><span className="hide-sm"><I n="phone" s={14} /> {f.phone} · <I n="pin" s={14} /> {f.location}</span></div></div>
    <header className="top"><div className="wrap">
      <a className="mark" href="#top"><i><svg width="18" height="18" viewBox="0 0 32 32"><path d={P.cross} fill="white" /></svg></i><span>{f.name}</span></a>
      {f.shop && <div className="hsearch hide-sm"><I n="search" s={18} /><input value={q} onChange={e => { setQ(e.target.value); setCat('All'); }} onFocus={() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })} placeholder="Search medicines, vitamins, baby care…" /></div>}
      <nav className="links"><a href="#services">Services</a>{d.tests.length > 0 && <a href="#tests">Lab tests</a>}{f.shop && <a href="#shop">Shop</a>}<a href="#book">Book</a></nav>
      {f.shop && <button className="btn icon" onClick={() => setShowCart(true)} aria-label="Cart"><I n="cart" />{count > 0 && <span className="dot">{count}</span>}</button>}
    </div></header>

    <section className="hero" id="top"><div className="wrap hero-grid">
      <div>
        <span className="eyebrow">{f.type === 'pharmacy' ? 'Licensed pharmacy' : f.type === 'clinic' ? 'Medical clinic' : 'Hospital'} · {f.location}</span>
        <h1>{f.tagline || f.name}</h1>
        <p>Genuine medicines, honest prices and caring staff. Walk in, book online, or order your medicines and collect them when it suits you.</p>
        <div className="cta"><a className="btn light" href="#book"><I n="cal" s={18} />Book a visit</a>{f.shop && <a className="btn ghost" href="#shop"><I n="pill" s={18} />Shop medicines</a>}</div>
        <div className="pills">{[f.lab !== 'none' && (f.lab === 'outsourced' ? 'Lab tests via partner labs' : 'On-site laboratory'), f.imaging !== 'none' && 'Scans and X-rays', f.maternity && 'Maternity and baby care', f.admissions && `${f.beds || ''} inpatient beds`, f.procedures && 'Minor procedures', 'SHA accepted'].filter(Boolean).map(h => <span key={h} className="pill">✓ {h}</span>)}</div>
      </div>
      <div className="hero-art hide-sm">{featured.map((p, i) => <div key={p.id} className={'float f' + i}><ProductArt item={p} size={150} rounded={20} /></div>)}</div>
    </div></section>

    <div className="wrap trust">{[['shield', 'Licensed & genuine', 'Pharmacy and Poisons Board registered products only'], ['steth', 'Qualified staff', 'Pharmacists and clinicians on duty'], ['cash', 'Pay your way', 'M-Pesa, cash, card, SHA and insurance'], ['truck', 'Pick-up or delivery', 'Order online, collect at the counter']].map(([n, t, s]) =>
      <div key={t} className="tr"><span className="tri"><I n={n} /></span><div><b>{t}</b><span>{s}</span></div></div>)}</div>

    {f.shop && <section id="shop"><div className="wrap">
      <div className="sechead"><div><h2>Shop by category</h2><p className="lead">Prescription medicines need a valid prescription, which our pharmacist checks before dispensing.</p></div></div>
      <div className="cats">{cats.map(c => <button key={c} className={'cat' + (cat === c ? ' on' : '')} onClick={() => goShop(cat === c ? 'All' : c)}><span className="ce">{CAT_ICON[c] || '💊'}</span><span>{c}</span><small>{d.products.filter(p => p.shop_cat === c).length} items</small></button>)}</div>
      <div className="shopbar">
        <h3>{cat === 'All' ? 'All products' : cat} <small>{products.length} items</small></h3>
        <div className="hsearch"><I n="search" s={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" /></div>
        {cat !== 'All' && <button className="btn light sm" onClick={() => setCat('All')}>Show all</button>}
      </div>
      <div className="grid">{products.slice(0, limit).map(p => <div key={p.id} className={'prod' + (p.in_stock ? '' : ' oos')}>
        <button className="pimg" onClick={() => setView(p)} aria-label={'View ' + p.name}><ProductArt item={p} size={170} rounded={14} /></button>
        <div className="tags">{p.rx_only && <span className="tag rx">℞ Prescription</span>}{!p.in_stock && <span className="tag out">Out of stock</span>}</div>
        <button className="pname" onClick={() => setView(p)}>{p.name}</button>
        <span className="punit">{unit(p)}</span>
        <div className="prow"><b className="price">{money(p.price)}</b>
          {inCart(p.id) ? <div className="stepper"><button onClick={() => setCart(cart.map(x => x.id === p.id ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0))}>−</button><span>{inCart(p.id)}</span><button onClick={() => add(p)}>+</button></div>
            : <button className="btn primary sm" disabled={!p.in_stock} onClick={() => add(p)}>Add</button>}</div>
      </div>)}</div>
      {!products.length && <p className="lead" style={{ textAlign: 'center', padding: 30 }}>Nothing matches “{q}”. Call us on {f.phone} and we'll help.</p>}
      {products.length > limit && <div style={{ textAlign: 'center', marginTop: 20 }}><button className="btn light" onClick={() => setLimit(limit + 24)}>Show more ({products.length - limit} more)</button></div>}
    </div></section>}

    <section id="services" className="alt"><div className="wrap">
      <div className="sechead"><div><h2>Our services</h2><p className="lead">Clear prices, no surprises.</p></div></div>
      {Object.entries(groups).map(([k, list]) => <div key={k} style={{ marginBottom: 24 }}>
        <h3 className="grouph"><span className="gi"><I n={SVC_ICON[k] || 'heart'} s={18} /></span>{catName[k] || k}</h3>
        <div className="cards">{list.map(s => <div key={s.name} className="card svc"><b>{s.name}</b><span className="price">{money(s.price)}</span></div>)}</div>
      </div>)}
      {d.imaging.length > 0 && <div style={{ marginBottom: 24 }}><h3 className="grouph"><span className="gi"><I n="scan" s={18} /></span>Scans and X-rays {f.imaging === 'outsourced' && <small style={{ fontWeight: 400, color: 'var(--ink-2)' }}>(through our partner imaging centres)</small>}</h3>
        <div className="cards">{d.imaging.map(s => <div key={s.name} className="card svc"><b>{s.name}</b><span className="muted">{s.modality}{f.imaging === 'inhouse' ? ` · ${money(s.price)}` : ''}</span></div>)}</div></div>}
    </div></section>

    {d.tests.length > 0 && <section id="tests"><div className="wrap">
      <div className="sechead"><div><h2>Laboratory tests</h2><p className="lead">{f.lab === 'outsourced' ? 'Samples are processed by accredited partner labs and results come back to us.' : 'Most results are ready the same day.'}</p></div></div>
      <div className="depts">{depts.map(dp => <div key={dp} className="dept" style={{ '--dc': DEPT[dp] || 'var(--brand)' }}>
        <h3><span className="dd" />{dp}<small>{d.tests.filter(t => t.dept === dp).length} tests</small></h3>
        {d.tests.filter(t => t.dept === dp).map(t => <div key={t.name} className="trow"><span>{t.name}<small>{t.sample} · results in {t.tat}</small></span><b>{money(t.price)}</b></div>)}
      </div>)}</div>
    </div></section>}

    <section id="book" className="alt"><div className="wrap book-grid">
      <div><h2>Book an appointment</h2><p className="lead">Pick a service and a time. We'll confirm by SMS. For emergencies, call <b>{f.phone}</b> or come straight in.</p>
        <div className="contact"><div><I n="phone" /><span>{f.phone}</span></div><div><I n="pin" /><span>{f.location}</span></div><div><I n="clock" /><span>Mon–Sat 7:00–21:00 · Sun 9:00–17:00</span></div></div></div>
      <Booking d={d} />
    </div></section>

    <footer><div className="wrap fgrid">
      <div><b className="fb">{f.name}</b><p>{f.tagline}</p><p>{f.location}<br />{f.phone}<br />{f.email}</p></div>
      <div><b>Visit us</b><p>Mon–Sat 7:00–21:00<br />Sun & holidays 9:00–17:00</p></div>
      <div><b>We accept</b><p>M-Pesa · Cash · Card<br />SHA · Private insurance</p></div>
      {d.others.length > 0 && <div><b>Our other branches</b><p>{d.others.map(o => <a key={o.id} href={'/site?b=' + o.id} style={{ display: 'block' }}>{o.name}</a>)}</p></div>}
    </div><div className="wrap fine">© {new Date().getFullYear()} {f.name} · Powered by Pentarch MediCore</div></footer>

    {f.shop && count > 0 && !showCart && <button className="btn primary cartbtn" onClick={() => setShowCart(true)}><I n="cart" s={18} />{count} item{count === 1 ? '' : 's'} · {money(cart.reduce((a, l) => a + l.qty * l.price, 0))}</button>}
    {showCart && <Cart cart={cart} setCart={setCart} onClose={() => setShowCart(false)} />}
    {view && <div className="drawer center" onMouseDown={e => e.target === e.currentTarget && setView(null)}><div className="qv">
      <button className="close" onClick={() => setView(null)} aria-label="Close"><I n="x" /></button>
      <ProductArt item={view} size={260} rounded={20} />
      <div className="qvb">
        <span className="eyebrow dark">{view.shop_cat}</span>
        <h2>{view.name}</h2>
        <p className="punit">{unit(view)}{view.strength ? ` · ${view.strength}` : ''}</p>
        <b className="price big">{money(view.price)}</b>
        {view.description && <p>{view.description}</p>}
        {view.rx_only && <p className="note">℞ Prescription-only medicine. Add it to your order and give us the prescription details; our pharmacist will confirm before dispensing.</p>}
        <p className="muted small">Always read the label. If symptoms persist, see a clinician.</p>
        <button className="btn primary" disabled={!view.in_stock} onClick={() => { add(view); setView(null); }}>{view.in_stock ? 'Add to order' : 'Out of stock'}</button>
      </div>
    </div></div>}
  </>;
}

function Booking({ d }) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ date: tomorrow, time: '09:00', service: d.services[0]?.name || 'Consultation' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try { const r = await call('/booking', f); setMsg({ ok: r.message }); } catch (er) { setMsg({ err: er.message }); } finally { setBusy(false); }
  };
  if (msg?.ok) return <div className="card ok big">✓ {msg.ok}<br /><button className="btn light sm" style={{ marginTop: 12 }} onClick={() => setMsg(null)}>Book another</button></div>;
  const options = [...d.services.map(s => s.name), ...d.tests.map(t => 'Lab test: ' + t.name)];
  return <form className="card form" onSubmit={submit}>
    <label>Full name<input required onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Phone<input required placeholder="07XX XXX XXX" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
    <label className="full">Service<select value={f.service} onChange={e => setF({ ...f, service: e.target.value })}>{options.map(o => <option key={o}>{o}</option>)}</select></label>
    <label>Date<input type="date" value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setF({ ...f, date: e.target.value })} /></label>
    <label>Time<input type="time" value={f.time} min="07:00" max="21:00" onChange={e => setF({ ...f, time: e.target.value })} /></label>
    <label className="full">Anything we should know? (optional)<textarea onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <div className="full"><button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Request booking'}</button>{msg?.err && <div className="err">{msg.err}</div>}</div>
  </form>;
}

function Cart({ cart, setCart, onClose }) {
  const [f, setF] = useState({ delivery: 'pickup' });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const rx = cart.some(l => l.rx_only);
  const order = async () => {
    try { const r = await call('/order', { ...f, items: cart.map(l => ({ id: l.id, qty: l.qty })) }); setDone(r); setCart([]); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  return <div className="drawer" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="panel">
    <div style={{ display: 'flex', alignItems: 'center' }}><h2 style={{ fontSize: 22, margin: 0 }}>Your order</h2><button className="btn light sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button></div>
    {done ? <div className="ok"><b>Order {done.order_no} received.</b><br />{done.message}<br />Total {money(done.total)}</div> : <>
      {cart.map((l, i) => <div key={l.id} className="line"><ProductArt item={l} size={56} rounded={10} /><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{l.name}</b><br /><span className="muted small">{money(l.price)} · {l.pack_size > 1 ? `${l.pack_name} of ${l.pack_size}` : l.unit}</span></div>
        <div className="stepper"><button onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0))}>−</button><span>{l.qty}</span><button onClick={() => setCart(cart.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))}>+</button></div></div>)}
      {!cart.length && <p className="muted">Your cart is empty.</p>}
      <div style={{ display: 'flex', fontSize: 19 }}><b>Total</b><b style={{ marginLeft: 'auto' }}>{money(total)}</b></div>
      <div className="form" style={{ gridTemplateColumns: '1fr', padding: 0 }}>
        <label>Full name<input onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>M-Pesa phone number<input placeholder="07XX XXX XXX" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
        <label>Collection<select value={f.delivery} onChange={e => setF({ ...f, delivery: e.target.value })}><option value="pickup">Pick up at the counter</option><option value="delivery">Deliver to me (fee confirmed by phone)</option></select></label>
        {rx && <label>Prescription details (doctor, facility, date or prescription number)<textarea onChange={e => setF({ ...f, prescription_note: e.target.value })} /></label>}
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" disabled={!cart.length} onClick={order}>Place order</button>
      <p className="muted small">You'll get an M-Pesa prompt once the pharmacy confirms your order.</p>
    </>}
  </div></div>;
}
