import React, { useContext, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ConfigContext } from '../App';
import { useData, Tabs, Stat, Badge, money, fmtDate, fmtDT, Empty, todayISO, Icon } from '../ui';

const minus = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function csv(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const body = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  a.download = name; a.click();
}

export default function Reports() {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState('finance');
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Reports</h1><p className="sub">Management reports and MOH monthly summaries, generated from what staff already recorded.</p></div>
        <div className="actions"><button onClick={() => window.print()}><Icon name="print" size={15} />Print</button></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['finance', 'Revenue'], ['stock', 'Stock'], ['moh705', 'MOH 705 (OPD morbidity)'], c.type !== 'pharmacy' && ['moh711', 'MOH 711 / service summary'], c.lab !== 'none' && ['lab', 'Lab workload'], ['audit', 'Audit trail']]} />
      <div className="printable">
        {tab === 'finance' && <Finance />}
        {tab === 'stock' && <Stock />}
        {tab === 'moh705' && <Moh705 />}
        {tab === 'moh711' && <Moh711 />}
        {tab === 'lab' && <LabReport />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  );
}

function Range({ from, to, setFrom, setTo }) {
  return <div className="row noprint" style={{ marginBottom: 14 }}>
    <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 170 }} /><span>to</span>
    <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 170 }} />
    {[['Today', 0], ['7 days', 6], ['30 days', 29]].map(([l, n]) => <button key={l} className="sm" onClick={() => { setFrom(minus(n)); setTo(todayISO()); }}>{l}</button>)}
  </div>;
}

function Finance() {
  const [from, setFrom] = useState(minus(29));
  const [to, setTo] = useState(todayISO());
  const [d] = useData(`/reports/summary?from=${from}&to=${to}`, [from, to]);
  if (!d) return null;
  const total = d.byMethod.reduce((a, r) => a + r.amount, 0);
  return <div className="stack">
    <Range {...{ from, to, setFrom, setTo }} />
    <div className="grid g4">
      <Stat label="Collected" value={money(total)} hint={`${fmtDate(d.from)} – ${fmtDate(d.to)}`} />
      <Stat label="Visits" value={d.visits} />
      <Stat label="New patients" value={d.newPatients} />
      <Stat label="Debtors" value={money(d.debtors.reduce((a, b) => a + b.balance, 0))} hint={`${d.debtors.length} credit bills`} href="#/billing" />
    </div>
    <div className="card"><h3>Collections by day</h3><div style={{ height: 230 }}><ResponsiveContainer>
      <BarChart data={d.byDay}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="day" fontSize={11} tickFormatter={x => x.slice(5)} tickLine={false} axisLine={false} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v} /><Tooltip formatter={v => money(v)} />
        <Bar dataKey="amount" fill="var(--brand)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
    <div className="grid g3">
      <div className="card"><h3>By payment method</h3><table className="table"><tbody>{d.byMethod.map(r => <tr key={r.method}><td style={{ textTransform: 'uppercase' }}>{r.method}</td><td className="faint small">{r.n} payments</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>By service type</h3><table className="table"><tbody>{d.byKind.map(r => <tr key={r.kind}><td style={{ textTransform: 'capitalize' }}>{r.kind}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>By cashier</h3><table className="table"><tbody>{d.byUser.map(r => <tr key={r.by_user}><td>{r.by_user}</td><td className="faint small">{r.n}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
    </div>
    <div className="card"><h3>Top-selling medicines</h3><table className="table"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead>
      <tbody>{d.topItems.map(r => <tr key={r.description}><td>{r.description}</td><td className="num">{r.qty}</td><td className="num">{money(r.amount)}</td></tr>)}</tbody></table></div>
  </div>;
}

function Stock() {
  const [d] = useData('/reports/stock');
  if (!d) return null;
  return <div className="stack">
    <div className="grid g4">
      <Stat label="Stock value (cost)" value={money(d.totalValue)} />
      <Stat label="Stock value (retail)" value={money(d.totalRetail)} hint={`Potential margin ${money(d.totalRetail - d.totalValue)}`} />
      <Stat label="Below reorder level" value={d.items.filter(i => i.stock <= i.reorder_level).length} tone="warn" href="#/pharmacy" />
      <Stat label="Expiring in 90 days" value={d.nearExpiry.length} hint={`${d.expired.length} batches already expired`} tone={d.nearExpiry.length ? 'warn' : null} />
    </div>
    <div className="card"><div className="cardhead"><h3>Near expiry and expired</h3></div>
      <table className="table"><thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th className="num">Qty</th></tr></thead>
        <tbody>{[...d.expired, ...d.nearExpiry].map(b => <tr key={b.id}><td>{b.name}</td><td>{b.batch_no}</td><td>{fmtDate(b.expiry)} {b.expiry < todayISO() ? <Badge tone="bad">Expired</Badge> : <Badge tone="warn">Soon</Badge>}</td><td className="num">{b.qty}</td></tr>)}</tbody></table>
      {!d.expired.length && !d.nearExpiry.length && <Empty>Nothing expiring in the next 90 days.</Empty>}</div>
    <div className="card"><div className="cardhead"><h3>Reorder list</h3><button className="sm right noprint" onClick={() => csv('reorder-list.csv', d.items.filter(i => i.stock <= i.reorder_level).map(i => ({ item: i.name, stock: i.stock, reorder_level: i.reorder_level, suggested_order: i.reorder_level * 2 - i.stock })))}>Download CSV</button></div>
      <table className="table"><thead><tr><th>Item</th><th className="num">In stock</th><th className="num">Reorder level</th><th className="num">Suggested order</th></tr></thead>
        <tbody>{d.items.filter(i => i.stock <= i.reorder_level).map(i => <tr key={i.id}><td>{i.name}</td><td className="num">{i.stock}</td><td className="num">{i.reorder_level}</td><td className="num"><b>{i.reorder_level * 2 - i.stock}</b></td></tr>)}</tbody></table></div>
  </div>;
}

function Moh705() {
  const c = useContext(ConfigContext);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [d] = useData('/reports/moh705?month=' + month, [month]);
  if (!d) return null;
  const tot = d.rows.reduce((a, r) => ({ u: a.u + r.under5, o: a.o + r.over5 }), { u: 0, o: 0 });
  return <div className="card">
    <div className="cardhead"><div><h3>MOH 705A / 705B · Outpatient morbidity summary</h3><p className="faint small">{c.facility_name} · KMHFR {c.kmhfr} · {month}</p></div>
      <div className="right row noprint"><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 170 }} />
        <button className="sm" onClick={() => csv(`MOH705_${month}.csv`, d.rows.map(r => ({ diagnosis: r.diagnosis, moh705a_under5: r.under5, moh705b_5_and_over: r.over5 })))}>Export for KHIS</button></div></div>
    <table className="table"><thead><tr><th>Diagnosis (new cases)</th><th className="num">705A: under 5</th><th className="num">705B: 5 and over</th><th className="num">Total</th></tr></thead>
      <tbody>{d.rows.map(r => <tr key={r.diagnosis}><td>{r.diagnosis}</td><td className="num">{r.under5}</td><td className="num">{r.over5}</td><td className="num"><b>{r.under5 + r.over5}</b></td></tr>)}
        <tr><td><b>Total</b></td><td className="num"><b>{tot.u}</b></td><td className="num"><b>{tot.o}</b></td><td className="num"><b>{tot.u + tot.o}</b></td></tr></tbody></table>
    {!d.rows.length && <Empty>No diagnoses recorded in {month}.</Empty>}
    <p className="faint small mt">Submit to the sub-county HRIO by the 5th of the following month. Direct KHIS (DHIS2) upload comes in the certified build.</p>
  </div>;
}

function Moh711() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [d] = useData('/reports/moh711?month=' + month, [month]);
  if (!d) return null;
  const rows = [['ANC first visits', d.anc_first], ['ANC re-visits', d.anc_revisit], ['Deliveries', d.deliveries], ['Live births', d.live_births], ['Low birth weight (<2.5 kg)', d.low_birth_weight],
    ['Admissions', d.admissions], ['Discharges', d.discharges], ['Referrals out', d.referrals_out], ['Referrals in', d.referrals_in]];
  return <div className="card">
    <div className="cardhead"><h3>MOH 711 integrated service summary (selected indicators)</h3><input className="right noprint" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 170 }} /></div>
    <table className="table"><tbody>{rows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="num"><b>{v}</b></td></tr>)}</tbody></table>
  </div>;
}

function LabReport() {
  const [d] = useData(`/reports/summary?from=${minus(29)}&to=${todayISO()}`);
  if (!d) return null;
  return <div className="card"><h3>Lab workload, last 30 days (MOH 240 register summary)</h3>
    <table className="table"><thead><tr><th>Test</th><th className="num">Total</th><th className="num">Outsourced</th><th className="num">Avg. turnaround (in-house)</th></tr></thead>
      <tbody>{d.labs.map(r => <tr key={r.name}><td>{r.name}</td><td className="num">{r.n}</td><td className="num">{r.outsourced}</td><td className="num">{r.tat_min != null ? `${r.tat_min} min` : '-'}</td></tr>)}</tbody></table></div>;
}

function Audit() {
  const [rows] = useData('/audit');
  return <div className="tablewrap"><table className="table">
    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th></tr></thead>
    <tbody>{(rows || []).map(r => <tr key={r.id}><td className="small">{fmtDT(r.created_at)}</td><td>{r.user}</td><td>{r.action}</td><td className="small">{r.entity} #{r.entity_id}</td></tr>)}</tbody>
  </table>{rows && !rows.length && <Empty>No activity yet.</Empty>}<p className="faint small" style={{ padding: 10 }}>Every view or change of a patient record is logged (Data Protection Act, 2019).</p></div>;
}
