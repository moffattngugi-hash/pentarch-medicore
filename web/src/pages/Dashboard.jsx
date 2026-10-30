import React, { useContext, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ConfigContext } from '../App';
import { useData, money, Stat, StatusBadge, FlagBadge, fmtDate, fmtTime, Empty, Badge } from '../ui';

export default function Dashboard() {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/dashboard');
  useEffect(() => { const h = setInterval(reload, 20000); return () => clearInterval(h); }, [reload]);
  if (!d) return <div className="page">Loading…</div>;
  const days = d.days.map(x => ({ ...x, label: new Date(x.date).toLocaleDateString('en-KE', { weekday: 'short' }) }));
  const hour = new Date().getHours();
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {c.user.name.split(' ').filter(w => !['Dr.', 'Nurse', 'Lab', 'Tech', 'Pharm.', 'Cashier', 'Midwife', 'Facility'].includes(w))[0] || c.user.name}</h1>
          <p className="sub">{c.facility_name} · {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <div className="actions"><span className="demo-ribbon">Demo mode · M-Pesa, eTIMS and SHA are simulated</span></div>
      </div>

      <div className="grid g4">
        <Stat label="Revenue today" value={money(d.revenueToday)} hint={d.payToday.map(p => `${p.method} ${money(p.amt)}`).join(' · ') || 'No payments yet'} />
        <Stat label="Patients in queue" value={d.queue.length} hint={`${d.visitsToday} visits today · ${d.totalPatients} patients on file`} />
        {d.beds ? <Stat label="Bed occupancy" value={`${d.beds.occupied} / ${d.beds.total}`} hint={`${Math.round(d.beds.occupied / Math.max(1, d.beds.total) * 100)}% occupied`} />
          : <Stat label="Pending lab tests" value={d.pendingLab} hint="Ordered, sample not resulted" />}
        <Stat label="Unpaid bills" value={money(d.openBalance)} hint={`${d.openBills} open bills`} tone={d.openBalance > 0 ? 'warn' : null} />
      </div>

      <div className="grid g-side mt">
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h3>Live queue</h3><a className="right small" href="#/queue">Open queue board →</a></div>
            {d.queue.length ? <table className="table"><tbody>
              {d.queue.map(q => <tr key={q.id} className="click" onClick={() => (window.location.hash = '#/visit/' + q.id)}>
                <td style={{ width: 40 }}><b style={{ color: 'var(--brand)' }}>#{q.queue_no}</b></td>
                <td><b>{q.name}</b><div className="faint small">{q.complaint}</div></td>
                <td className="small muted">{fmtTime(q.created_at)}</td>
                <td><StatusBadge s={q.status} /></td></tr>)}
            </tbody></table> : <Empty>No one waiting.</Empty>}
          </div>
          <div className="card">
            <h3>Collections, last 7 days</h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={days} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v} />
                  <Tooltip formatter={v => money(v)} labelFormatter={(l, p) => p?.[0] ? fmtDate(p[0].payload.date) : l} />
                  <Bar dataKey="amount" fill="var(--brand)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {d.topDx.length > 0 && <div className="card">
            <h3>Top diagnoses, last 60 days</h3>
            {d.topDx.map(x => <div key={x.diagnosis} className="hbar" style={{ gridTemplateColumns: '200px 1fr 40px' }}>
              <span className="name">{x.diagnosis}</span>
              <div style={{ height: 10, borderRadius: 99, background: '#eef2f6' }}><div style={{ height: 10, borderRadius: 99, background: 'var(--brand)', width: (x.n / d.topDx[0].n * 100) + '%' }} /></div>
              <span className="val">{x.n}</span></div>)}
          </div>}
        </div>

        <div className="stack">
          {d.critical.length > 0 && <div className="card">
            <h3>Abnormal results to review</h3>
            <div className="stack">{d.critical.map(r => <a key={r.id} href={'#/patients/' + r.pid} className="row" style={{ color: 'inherit' }}>
              <div><b>{r.name}</b><div className="small muted">{r.test}: {r.result_value ?? r.result_text} {r.unit}</div></div>
              <span className="right"><FlagBadge flag={r.flag} /></span></a>)}</div>
          </div>}
          {(d.webOrders > 0 || d.webBookings > 0) && <div className="card">
            <h3>From the website</h3>
            <div className="row"><a href="#/pharmacy">{d.webOrders} new order{d.webOrders === 1 ? '' : 's'}</a><span className="faint">·</span><a href="#/appointments">{d.webBookings} booking{d.webBookings === 1 ? '' : 's'}</a></div>
          </div>}
          {c.maternity && <div className="card">
            <h3>Maternity</h3>
            <div className="row"><Badge tone="brand">{d.activePregnancies} active pregnancies</Badge><Badge tone="good">{d.deliveriesMonth} deliveries this month</Badge></div>
          </div>}
          <div className="card">
            <div className="cardhead"><h3>Stock alerts</h3><a className="right small" href="#/pharmacy">Inventory →</a></div>
            {d.lowStock.length === 0 && d.expiring.length === 0 && <Empty>All stock healthy.</Empty>}
            <div className="stack small">
              {d.lowStock.map(i => <div key={i.id} className="row"><span>{i.name}</span><span className="right"><Badge tone={i.stock === 0 ? 'bad' : 'warn'}>{i.stock === 0 ? 'Out of stock' : `${i.stock} left`}</Badge></span></div>)}
              {d.expiring.map(b => <div key={b.id} className="row"><span>{b.name} <span className="faint">({b.batch_no})</span></span><span className="right"><Badge tone={b.expiry < new Date().toISOString().slice(0, 10) ? 'bad' : 'warn'}>Expires {fmtDate(b.expiry)}</Badge></span></div>)}
            </div>
          </div>
          <div className="card">
            <div className="cardhead"><h3>Appointments today</h3><a className="right small" href="#/appointments">All →</a></div>
            {d.appointmentsToday.length ? d.appointmentsToday.map(a => <div key={a.id} className="row small" style={{ padding: '4px 0' }}><b>{a.time}</b><span>{a.name}</span><span className="faint">{a.service}</span>{a.source === 'web' && <Badge tone="info">web</Badge>}</div>) : <Empty>None booked.</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}
