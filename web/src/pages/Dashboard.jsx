import React, { useContext, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ConfigContext } from '../App';
import { useData, money, Stat, StatusBadge, TriageBadge, FlagBadge, fmtDate, fmtTime, fmtDT, Empty, Badge, Icon, Modal, age } from '../ui';

export default function Dashboard() {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/dashboard');
  const [open, setOpen] = useState(null);
  useEffect(() => { const h = setInterval(reload, 20000); return () => clearInterval(h); }, [reload]);
  if (!d) return <div className="page">Loading…</div>;
  const days = d.days.map(x => ({ ...x, label: new Date(x.date).toLocaleDateString('en-KE', { weekday: 'short' }) }));
  const hour = new Date().getHours();
  const first = c.user.name.split(' ').filter(w => !/\.$/.test(w) && !['Nurse', 'Lab', 'Tech', 'Cashier', 'Midwife', 'Pentarch', 'Super'].includes(w))[0] || '';
  const isAdmin = ['admin', 'superadmin'].includes(c.user.role);
  return (
    <div className="page">
      <div className="pagehead">
        <div><h1>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}{first ? `, ${first}` : ''}</h1>
          <p className="sub">{c.facility_name} · {new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <div className="actions"><span className="demo-ribbon">Demo mode · M-Pesa, eTIMS and SHA are simulated</span></div>
      </div>
      {d.sample && isAdmin && <div className="tip"><Icon name="info" size={16} /><div>This branch is running on <b>sample data</b> for demos and training. When the facility goes live, remove it in <a href="#/settings">Settings → Data</a>. The medicine catalogue and prices stay.</div></div>}

      <div className="grid g-auto">
        <Stat icon="cash" label="Collected today" value={money(d.revenueToday)} hint={d.payToday.map(p => `${mname(p.method)} ${money(p.amt)}`).join(' · ') || 'No payments yet'} onClick={() => setOpen('revenue')} />
        <Stat icon="queue" label="Patients waiting" value={d.queue.length} hint={`${d.visitsToday} visits today · ${d.totalPatients} on file`} onClick={() => setOpen('queue')} />
        {c.lab !== 'none' && <Stat icon="lab" label="Lab tests pending" value={d.pendingLab} hint="Ordered, not yet resulted" onClick={() => setOpen('lab')} />}
        {d.beds && <Stat icon="wards" label="Bed occupancy" value={`${d.beds.occupied} / ${d.beds.total}`} hint={`${Math.round(d.beds.occupied / Math.max(1, d.beds.total) * 100)}% occupied`} onClick={() => setOpen('beds')} />}
        <Stat icon="billing" label="Unpaid bills" value={money(d.openBalance)} hint={`${d.openBills} open bills`} tone={d.openBalance > 0 ? 'warn' : null} onClick={() => setOpen('bills')} />
      </div>
      {open && <Detail k={open} onClose={() => setOpen(null)} />}

      <div className="grid g-side mt">
        <div className="stack">
          <div className="card">
            <div className="cardhead"><h3>Live queue</h3><span className="faint small">Emergencies first, then priority, then arrival time</span><a className="right small" href="#/queue">Queue board →</a></div>
            {d.queue.length ? <table className="table"><tbody>
              {d.queue.map(q => <tr key={q.id} className="click" onClick={() => (window.location.hash = '#/visit/' + q.id)}>
                <td style={{ width: 44 }}><b style={{ color: 'var(--brand)' }}>#{q.queue_no}</b></td>
                <td><b>{q.name}</b><div className="faint small">{q.complaint}</div></td>
                <td><TriageBadge level={q.triage_level} /></td>
                <td className="small muted">{fmtTime(q.created_at)}</td>
                <td><StatusBadge s={q.status} /></td></tr>)}
            </tbody></table> : <Empty icon="queue">No one waiting.</Empty>}
          </div>
          <div className="card">
            <h3>Collections, last 7 days</h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={days} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v} allowDecimals={false} />
                  <Tooltip formatter={v => money(v)} labelFormatter={(l, p) => p?.[0] ? fmtDate(p[0].payload.date) : l} />
                  <Bar dataKey="amount" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {d.topDx.length > 0 && <div className="card">
            <h3>Top diagnoses, last 60 days</h3>
            {d.topDx.map(x => <div key={x.diagnosis} className="hbar" style={{ gridTemplateColumns: '220px 1fr 40px' }}>
              <span className="name">{x.diagnosis}</span>
              <div style={{ height: 10, borderRadius: 99, background: '#eef2f6' }}><div style={{ height: 10, borderRadius: 99, background: 'var(--brand)', width: (x.n / d.topDx[0].n * 100) + '%' }} /></div>
              <span className="val">{x.n}</span></div>)}
          </div>}
        </div>

        <div className="stack">
          {d.critical.length > 0 && <div className="card">
            <h3>Abnormal results to review</h3>
            <div className="stack">{d.critical.map(r => <a key={r.id} href={'#/patients/' + r.pid} className="row" style={{ color: 'inherit' }}>
              <div><b>{r.name}</b><div className="small muted">{r.test}: {r.result_value ?? r.result_text} {r.result_value != null && r.unit}</div></div>
              <span className="right"><FlagBadge flag={r.flag} /></span></a>)}</div>
          </div>}
          {(d.webOrders > 0 || d.webBookings > 0) && <div className="card">
            <h3>From the website</h3>
            <div className="row"><a href="#/pharmacy">{d.webOrders} order{d.webOrders === 1 ? '' : 's'} to handle</a><span className="faint">·</span><a href="#/appointments">{d.webBookings} booking{d.webBookings === 1 ? '' : 's'}</a></div>
          </div>}
          {c.maternity && <div className="card">
            <h3>Maternity</h3>
            <div className="row"><Badge tone="brand">{d.activePregnancies} active pregnancies</Badge><Badge tone="good">{d.deliveriesMonth} deliveries in 30 days</Badge></div>
          </div>}
          <div className="card">
            <div className="cardhead"><h3>Stock alerts</h3><a className="right small" href="#/pharmacy">Inventory →</a></div>
            {d.lowStock.length === 0 && d.expiring.length === 0 && <Empty icon="box">All stock healthy.</Empty>}
            <div className="stack small">
              {d.lowStock.map(i => <div key={i.id} className="row" style={{ flexWrap: 'nowrap' }}><span style={{ minWidth: 0 }}>{i.name}</span><span className="right"><Badge tone={i.stock === 0 ? 'bad' : 'warn'}>{i.stock === 0 ? 'Out of stock' : i.stock_text}</Badge></span></div>)}
              {d.expiring.map(b => <div key={b.id} className="row" style={{ flexWrap: 'nowrap' }}><span style={{ minWidth: 0 }}>{b.name} <span className="faint">({b.batch_no})</span></span><span className="right"><Badge tone={b.expiry < new Date().toISOString().slice(0, 10) ? 'bad' : 'warn'}>{b.expiry < new Date().toISOString().slice(0, 10) ? 'Expired' : 'Exp. ' + fmtDate(b.expiry)}</Badge></span></div>)}
            </div>
            {d.lowStockCount > d.lowStock.length && <p className="faint small mt">+{d.lowStockCount - d.lowStock.length} more below reorder level</p>}
          </div>
          <div className="card">
            <div className="cardhead"><h3>Appointments today</h3><a className="right small" href="#/appointments">All →</a></div>
            {d.appointmentsToday.length ? d.appointmentsToday.map(a => <div key={a.id} className="row small" style={{ padding: '4px 0' }}><b>{a.time}</b><span>{a.name}</span><span className="faint">{a.service}</span>{a.source === 'web' && <Badge tone="info">web</Badge>}</div>) : <Empty icon="appointments">None booked.</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- drill-down behind each card ----------
const TITLES = { revenue: 'Collections today', queue: 'Patients waiting now', lab: 'Lab tests in progress', beds: 'Bed occupancy', bills: 'Unpaid bills' };
const LINKS = { revenue: ['#/reports', 'Open reports'], queue: ['#/queue', 'Open queue board'], lab: ['#/lab', 'Open lab'], beds: ['#/wards', 'Open wards'], bills: ['#/billing', 'Open billing'] };
const mins = t => Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
const waited = t => { const m = mins(t); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} days`; };
function Bars({ rows, label, value, fmt = v => v }) {
  const max = Math.max(1, ...rows.map(value));
  return <div className="stack" style={{ gap: 8 }}>{rows.map((r, i) => <div key={i} className="hbar" style={{ gridTemplateColumns: '150px 1fr auto' }}>
    <span className="name">{label(r)}</span><div className="minibar"><i style={{ width: (value(r) / max * 100) + '%' }} /></div><span className="val">{fmt(value(r))}</span></div>)}</div>;
}
const go = h => () => { window.location.hash = h; };
const METHOD = { mpesa: 'M-Pesa', cash: 'Cash', card: 'Card', sha: 'SHA', insurance: 'Insurance', credit: 'Credit' };
const mname = m => METHOD[m] || m;

function Detail({ k, onClose }) {
  const [d] = useData('/dashboard/detail/' + k);
  const [href, text] = LINKS[k];
  return <Modal title={TITLES[k]} onClose={onClose} wide footer={<><button className="ghost" onClick={onClose}>Close</button><button className="primary" onClick={() => { onClose(); window.location.hash = href; }}>{text} →</button></>}>
    {!d ? <p className="muted">Loading…</p> : <DetailBody k={k} d={d} close={onClose} />}
  </Modal>;
}
function DetailBody({ k, d, close }) {
  const open = h => () => { close(); go(h)(); };
  if (k === 'revenue') {
    const diff = d.today - d.yesterday;
    return <>
      <div className="kpis">
        <div className="kpi"><b>{money(d.today)}</b><span>Today</span></div>
        <div className="kpi"><b>{money(d.yesterday)}</b><span>Yesterday</span></div>
        <div className="kpi"><b>{money(d.avg7)}</b><span>Daily average, last 7 days</span></div>
        <div className="kpi"><b style={{ color: diff >= 0 ? 'var(--good)' : 'var(--bad)' }}>{diff >= 0 ? '+' : '−'}{money(Math.abs(diff))}</b><span>vs yesterday</span></div>
      </div>
      <div className="grid g2">
        <div><h4>By payment method</h4>{d.byMethod.length ? <Bars rows={d.byMethod} label={r => `${mname(r.method)} (${r.n})`} value={r => r.amt} fmt={money} /> : <p className="faint small">No payments yet today.</p>}</div>
        <div><h4>Billed today by type</h4>{d.byKind.length ? <Bars rows={d.byKind} label={r => r.kind[0].toUpperCase() + r.kind.slice(1)} value={r => r.amt} fmt={money} /> : <p className="faint small">Nothing billed yet today.</p>}</div>
      </div>
      <h4 className="mt">Payments received today</h4>
      {d.payments.length ? <table className="table"><thead><tr><th>Time</th><th>From</th><th>Method</th><th>Reference</th><th>By</th><th className="num">Amount</th></tr></thead><tbody>
        {d.payments.map(p => <tr key={p.id} className="click" onClick={open('#/billing/' + p.bill_id)}><td>{fmtTime(p.created_at)}</td><td>{p.who}</td><td><Badge>{mname(p.method)}</Badge></td><td className="small muted">{p.reference || p.receipt_no || '—'}</td><td className="small">{p.by_user}</td><td className="num"><b>{money(p.amount)}</b></td></tr>)}
      </tbody></table> : <Empty icon="cash">No payments received yet today.</Empty>}
    </>;
  }
  if (k === 'queue') {
    const tri = l => d.rows.filter(r => (r.triage_level || 'queue') === l).length;
    return <>
      <div className="kpis">
        <div className="kpi"><b style={{ color: 'var(--bad)' }}>{tri('emergency')}</b><span>Emergency</span></div>
        <div className="kpi"><b style={{ color: 'var(--warn)' }}>{tri('priority')}</b><span>Priority</span></div>
        <div className="kpi"><b>{tri('queue')}</b><span>Routine</span></div>
        <div className="kpi"><b>{d.visitsToday}</b><span>Visits today ({d.seenToday} done)</span></div>
        <div className="kpi"><b>{d.newToday}</b><span>New patients today</span></div>
      </div>
      {d.byStatus.length > 0 && <><h4>Where patients are waiting</h4><Bars rows={d.byStatus} label={r => <StatusBadge s={r.status} />} value={r => r.n} /></>}
      <h4 className="mt">Waiting list</h4>
      {d.rows.length ? <table className="table"><thead><tr><th>#</th><th>Patient</th><th>Complaint</th><th>Triage</th><th>Stage</th><th>Waiting</th></tr></thead><tbody>
        {d.rows.map(q => <tr key={q.id} className="click" onClick={open('#/visit/' + q.id)}><td><b>#{q.queue_no}</b></td><td><b>{q.name}</b><div className="faint small">{q.mrn} · {q.sex} · {age(q.dob)}</div></td><td className="small">{q.complaint || '—'}</td><td><TriageBadge level={q.triage_level} /></td><td><StatusBadge s={q.status} /></td><td className="small" style={{ color: mins(q.created_at) > 60 ? 'var(--bad)' : null }}>{waited(q.created_at)}</td></tr>)}
      </tbody></table> : <Empty icon="queue">No one waiting.</Empty>}
    </>;
  }
  if (k === 'lab') {
    const n = s => d.rows.filter(r => r.status === s).length;
    return <>
      <div className="kpis">
        <div className="kpi"><b>{n('ordered')}</b><span>Waiting for sample</span></div>
        <div className="kpi"><b>{n('collected')}</b><span>Running</span></div>
        <div className="kpi"><b>{n('sent_out')}</b><span>At outside lab</span></div>
        <div className="kpi"><b style={{ color: n('resulted') ? 'var(--warn)' : null }}>{n('resulted')}</b><span>Waiting validation</span></div>
        <div className="kpi"><b>{d.doneToday}</b><span>Resulted today ({d.abnormalToday} abnormal)</span></div>
      </div>
      {d.byDept.length > 0 && <><h4>By department</h4><Bars rows={d.byDept} label={r => r.dept} value={r => r.n} /></>}
      <h4 className="mt">Tests in progress</h4>
      {d.rows.length ? <table className="table"><thead><tr><th>Patient</th><th>Test</th><th>Where</th><th>Status</th><th>Ordered</th></tr></thead><tbody>
        {d.rows.map(o => <tr key={o.id} className="click" onClick={open('#/lab')}><td><b>{o.name}</b></td><td>{o.test}<div className="faint small">{o.dept}{o.tat ? ' · ready in ' + o.tat : ''}</div></td><td className="small">{o.mode === 'outsourced' ? o.partner || 'Outside lab' : 'In-house'}</td><td><StatusBadge s={o.status} /></td><td className="small muted">{waited(o.created_at)} ago</td></tr>)}
      </tbody></table> : <Empty icon="lab">No tests in progress.</Empty>}
    </>;
  }
  if (k === 'beds') {
    const tot = d.wards.reduce((a, w) => a + w.total, 0), occ = d.wards.reduce((a, w) => a + w.occupied, 0);
    return <>
      <div className="kpis">
        <div className="kpi"><b>{occ} / {tot}</b><span>Beds occupied</span></div>
        <div className="kpi"><b>{tot - occ}</b><span>Beds free</span></div>
        <div className="kpi"><b>{d.admittedToday}</b><span>Admitted today</span></div>
        <div className="kpi"><b>{d.dischargedToday}</b><span>Discharged today</span></div>
      </div>
      <h4>By ward</h4>
      <Bars rows={d.wards} label={w => w.name} value={w => w.occupied} fmt={v => v} />
      <div className="small faint mt">{d.wards.map(w => `${w.name}: ${w.occupied} of ${w.total} beds · ${money(w.daily_rate)}/day`).join('  ·  ')}</div>
      <h4 className="mt">Patients admitted now</h4>
      {d.rows.length ? <table className="table"><thead><tr><th>Patient</th><th>Ward / bed</th><th>Reason</th><th>Admitted</th></tr></thead><tbody>
        {d.rows.map(a => <tr key={a.id} className="click" onClick={open('#/wards')}><td><b>{a.name}</b></td><td>{a.ward} · {a.bed}</td><td className="small">{a.reason}</td><td className="small muted">{fmtDT(a.admitted_at)}<div>{waited(a.admitted_at)}</div></td></tr>)}
      </tbody></table> : <Empty icon="wards">No one admitted.</Empty>}
    </>;
  }
  const sum = r => r.reduce((a, b) => a + b.balance, 0);
  return <>
    <div className="kpis">
      <div className="kpi"><b style={{ color: 'var(--warn)' }}>{money(sum(d.open))}</b><span>Open bills ({d.open.length}) — patients still in the facility</span></div>
      <div className="kpi"><b style={{ color: 'var(--bad)' }}>{money(sum(d.credit))}</b><span>On credit ({d.credit.length}) — to follow up</span></div>
    </div>
    {d.rows.length ? <table className="table"><thead><tr><th>Bill</th><th>Patient / customer</th><th>Payer</th><th>Status</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead><tbody>
      {d.rows.map(b => <tr key={b.id} className="click" onClick={open('#/billing/' + b.id)}><td className="small">#{b.id}<div className="faint">{waited(b.created_at)} ago</div></td><td><b>{b.who}</b></td><td className="small">{b.payer || 'Cash'}</td><td><StatusBadge s={b.status} /></td><td className="num">{money(b.total)}</td><td className="num">{money(b.paid)}</td><td className="num"><b>{money(b.balance)}</b></td></tr>)}
    </tbody></table> : <Empty icon="billing">No unpaid bills.</Empty>}
  </>;
}
