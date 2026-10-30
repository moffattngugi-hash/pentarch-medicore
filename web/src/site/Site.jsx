import React, { useEffect, useMemo, useState } from 'react';

const money = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
async function call(url, body) {
  const r = await fetch('/api/public' + url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const Cross = () => <svg width="18" height="18" viewBox="0 0 32 32"><path d="M13 5h6v8h8v6h-8v8h-6v-8H5v-6h8z" fill="white" /></svg>;

export default function Site() {
  const [d, setD] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { call('/site').then(x => { setD(x); document.title = x.facility.name; if (x.facility.color) document.documentElement.style.setProperty('--brand', x.facility.color); }); }, []);
  const products = useMemo(() => (d?.products || []).filter(p => p.name.toLowerCase().includes(q.toLowerCase())), [d, q]);
  if (!d) return <div style={{ padding: 40 }}>Loading…</div>;
  const f = d.facility;
  const add = p => setCart(c => c.find(x => x.id === p.id) ? c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...p, qty: 1 }]);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const highlights = [
    f.type === 'pharmacy' ? 'Licensed pharmacy' : f.type === 'clinic' ? 'Outpatient clinic' : 'Hospital',
    f.lab !== 'none' && (f.lab === 'outsourced' ? 'Lab tests via partner labs' : 'On-site laboratory'),
    f.imaging !== 'none' && 'Scans and X-rays', f.maternity && 'Maternity and baby care',
    f.admissions && `${f.beds || ''} inpatient beds`, f.procedures && 'Minor procedures', 'SHA and M-Pesa accepted'
  ].filter(Boolean);
  const groups = {};
  for (const s of d.services) (groups[s.category] ||= []).push(s);
  const catName = { consultation: 'Consultations', procedure: 'Procedures', bed: 'Inpatient care' };

  return <>
    <header className="top"><div className="wrap">
      <a className="mark" href="#top"><i><Cross /></i>{f.name}</a>
      <nav className="links"><a href="#services">Services</a>{d.tests.length > 0 && <a href="#tests">Lab tests</a>}{f.shop && <a href="#shop">Shop</a>}<a href="#book">Book</a><a href="#contact">Contact</a></nav>
      <a className="btn primary" href="#book">Book a visit</a>
    </div></header>

    <div className="hero" id="top"><div className="wrap">
      <h1>{f.tagline || f.name}</h1>
      <p>{f.name} in {f.location}. Walk in, book online, or order your medicines for pickup. Call us on {f.phone}.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="btn light" href="#book">Book an appointment</a>
        {f.shop && <a className="btn light" href="#shop" style={{ background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,.5)' }}>Order medicines</a>}
      </div>
      <div className="pills">{highlights.map(h => <span key={h} className="pill">{h}</span>)}</div>
    </div></div>

    <section id="services"><div className="wrap">
      <h2>Our services</h2><p className="lead">Transparent prices. Pay by M-Pesa, cash, card or SHA.</p>
      {Object.entries(groups).map(([k, list]) => <div key={k} style={{ marginBottom: 22 }}>
        <h3 style={{ margin: '0 0 10px', color: 'var(--ink-2)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '.06em' }}>{catName[k] || k}</h3>
        <div className="cards">{list.map(s => <div key={s.name} className="card"><h3>{s.name}</h3><span className="price">{money(s.price)}</span></div>)}</div>
      </div>)}
    </div></section>

    {d.tests.length > 0 && <section id="tests" className="alt"><div className="wrap">
      <h2>Laboratory tests</h2><p className="lead">{f.lab === 'outsourced' ? 'Samples are processed by accredited partner labs; results come back to us.' : 'Most results are ready the same day.'}</p>
      <div className="tests">{d.tests.map(t => <div key={t.name}><span>{t.name} <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>· {t.sample}</span></span><b>{money(t.price)}</b></div>)}</div>
    </div></section>}

    {f.shop && <section id="shop"><div className="wrap">
      <h2>Order medicines</h2><p className="lead">Pick up at the counter or get it delivered. Prescription medicines need a valid prescription, which our pharmacist reviews before dispensing.</p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search medicines" style={{ width: '100%', maxWidth: 380, marginBottom: 18 }} />
      <div className="cards">{products.map(p => <div key={p.id} className="card prod">
        <h3>{p.name}</h3>
        <div style={{ display: 'flex', gap: 6 }}>{p.rx_only && <span className="tag rx">Prescription</span>}{!p.in_stock && <span className="tag out">Out of stock</span>}</div>
        <div className="row"><span className="price">{money(p.price)}<span style={{ color: 'var(--ink-2)', fontWeight: 400, fontSize: 13 }}> / {p.unit}</span></span>
          <button className="btn primary" style={{ marginLeft: 'auto', padding: '8px 12px' }} disabled={!p.in_stock} onClick={() => add(p)}>Add</button></div>
      </div>)}</div>
    </div></section>}

    <section id="book" className="alt"><div className="wrap"><h2>Book an appointment</h2><p className="lead">We will confirm by SMS. For emergencies, call {f.phone} or come straight in.</p><Booking d={d} /></div></section>

    <footer id="contact"><div className="wrap grid">
      <div><b style={{ fontSize: 17 }}>{f.name}</b><p>{f.location}<br />{f.phone}<br />{f.email}</p></div>
      <div><b>Hours</b><p>Mon–Sat 7:00–21:00<br />Sun 9:00–17:00</p></div>
      <div><b>We accept</b><p>M-Pesa · Cash · Card<br />SHA · Private insurance</p></div>
    </div><div className="wrap" style={{ marginTop: 24, fontSize: 12.5 }}>Powered by Pentarch MediCore · Pentarch Systems Solutions</div></footer>

    {f.shop && count > 0 && <button className="btn primary cartbtn" onClick={() => setShowCart(true)}>Cart · {count} item{count === 1 ? '' : 's'} · {money(cart.reduce((a, l) => a + l.qty * l.price, 0))}</button>}
    {showCart && <Cart cart={cart} setCart={setCart} onClose={() => setShowCart(false)} />}
  </>;
}

function Booking({ d }) {
  const [f, setF] = useState({ date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), time: '09:00', service: d.services[0]?.name || 'Consultation' });
  const [msg, setMsg] = useState(null);
  const submit = async e => {
    e.preventDefault();
    try { const r = await call('/booking', f); setMsg({ ok: r.message }); } catch (er) { setMsg({ err: er.message }); }
  };
  const options = [...d.services.map(s => s.name), ...d.tests.map(t => 'Lab test: ' + t.name)];
  return <form className="form" onSubmit={submit}>
    <label>Full name<input required onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Phone<input required placeholder="07XX XXX XXX" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
    <label className="full">Service<select value={f.service} onChange={e => setF({ ...f, service: e.target.value })}>{options.map(o => <option key={o}>{o}</option>)}</select></label>
    <label>Date<input type="date" value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={e => setF({ ...f, date: e.target.value })} /></label>
    <label>Time<input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label>
    <label className="full">Notes (optional)<textarea onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <div className="full"><button className="btn primary">Request booking</button>{msg?.ok && <div className="ok">{msg.ok}</div>}{msg?.err && <div className="err">{msg.err}</div>}</div>
  </form>;
}

function Cart({ cart, setCart, onClose }) {
  const [f, setF] = useState({ delivery: 'pickup' });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const rx = cart.some(l => l.rx_only);
  const order = async () => {
    try {
      const r = await call('/order', { ...f, items: cart.map(l => ({ id: l.id, qty: l.qty })) });
      setDone(r); setCart([]); setErr(null);
    } catch (e) { setErr(e.message); }
  };
  return <div className="drawer" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="panel">
    <div style={{ display: 'flex' }}><h2 style={{ fontSize: 22 }}>Your order</h2><button className="btn light" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button></div>
    {done ? <div className="ok"><b>Order {done.order_no} received.</b><br />{done.message}<br />Total {money(done.total)}</div> : <>
      {cart.map((l, i) => <div key={l.id} className="line"><div style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{l.name}</b><br /><span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{money(l.price)} / {l.unit}</span></div>
        <input type="number" min="1" value={l.qty} style={{ width: 70 }} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
        <button className="btn light" style={{ padding: '6px 10px' }} onClick={() => setCart(cart.filter((_, j) => j !== i))}>✕</button></div>)}
      <div style={{ display: 'flex', fontSize: 18 }}><b>Total</b><b style={{ marginLeft: 'auto' }}>{money(total)}</b></div>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <label>Full name<input onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>M-Pesa phone number<input placeholder="07XX XXX XXX" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
        <label>Delivery<select value={f.delivery} onChange={e => setF({ ...f, delivery: e.target.value })}><option value="pickup">Pick up at the pharmacy</option><option value="delivery">Deliver to me (fee confirmed by phone)</option></select></label>
        {rx && <label>Prescription details (doctor, facility, date, or prescription number)<textarea onChange={e => setF({ ...f, prescription_note: e.target.value })} /></label>}
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" disabled={!cart.length} onClick={order}>Place order</button>
      <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>You will receive an M-Pesa prompt to pay once the pharmacy confirms your order.</p>
    </>}
  </div></div>;
}
