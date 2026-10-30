import React, { useContext, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ConfigContext } from '../App';
import { useData, Stat, Badge, PageHead, Tip, money, Icon, Modal } from '../ui';
import { TYPE_ART } from './Onboard';
import { NewBranch } from './Admin';

const TYPE_LABEL = { pharmacy: 'Pharmacy', clinic: 'Clinic', hospital: 'Hospital' };

// One owner, many branches: separate books, one view of what matters
export default function Branches({ onOpen, refreshProfile }) {
  const c = useContext(ConfigContext);
  const [d, reload] = useData('/org/overview');
  const [boot] = useData('/bootstrap');
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState(null);
  if (!d) return <div className="page">Loading…</div>;
  const B = d.branches;
  const sum = k => B.reduce((a, b) => a + (b[k] || 0), 0);
  const chart = B[0] ? B[0].days.map((x, i) => Object.fromEntries([['label', new Date(x.date).toLocaleDateString('en-KE', { weekday: 'short' })], ...B.map(b => [b.name, b.days[i].amount])])) : [];
  const beds = B.filter(b => b.beds);
  return (
    <div className="page">
      <PageHead icon="branches" title={d.org?.name || 'Branches'} sub={`${B.length} branch${B.length === 1 ? '' : 'es'} · each keeps its own patients, stock and money; totals are combined here`}>
        {c.user.role !== 'clinician' && <button className="primary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Add branch</button>}
      </PageHead>
      {B.length === 1 && <Tip id="branches">Have another pharmacy, clinic or hospital? Add it as a branch. It can be a different type, and you switch between branches from the selector at the top of the menu.</Tip>}
      <div className="grid g4">
        <Stat icon="cash" label="Collected today, all branches" value={money(sum('revenueToday'))} hint={`${money(sum('revenue7'))} in 7 days`} onClick={() => setMetric('money')} />
        <Stat icon="patients" label="Patients on file" value={sum('patients').toLocaleString()} hint={`${sum('visitsToday')} visits today · ${sum('inQueue')} waiting now`} onClick={() => setMetric('patients')} />
        <Stat icon="wards" label="Bed occupancy" value={beds.length ? `${beds.reduce((a, b) => a + b.beds.occupied, 0)} / ${beds.reduce((a, b) => a + b.beds.total, 0)}` : '—'} hint={beds.length ? 'across branches with wards' : 'no branch has wards'} onClick={() => setMetric('beds')} />
        <Stat icon="box" label="Stock value (cost)" value={money(sum('stockValue'))} hint={`${sum('lowStock')} items below reorder level`} tone={sum('lowStock') ? 'warn' : null} onClick={() => setMetric('stock')} />
      </div>
      {B.length > 1 && <div className="card mt"><h3>Collections by branch, last 7 days</h3>
        <div style={{ height: 240 }}><ResponsiveContainer><BarChart data={chart}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v} /><Tooltip formatter={v => money(v)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {B.map((b, i) => <Bar key={b.id} dataKey={b.name} stackId="a" fill={b.color || TYPE_ART[b.type]?.color} radius={i === B.length - 1 ? [5, 5, 0, 0] : 0} />)}
        </BarChart></ResponsiveContainer></div></div>}
      <div className="grid g3 mt">{B.map(b => {
        const max = Math.max(1, ...b.days.map(x => x.amount));
        return <div key={b.id} className="card bcard" style={{ '--bc': b.color || TYPE_ART[b.type]?.color }}>
          <div className="cardhead"><div><h3>{b.name}</h3><span className="faint small">{b.location}</span></div>
            <span className="right badge" style={{ background: TYPE_ART[b.type]?.bg, color: TYPE_ART[b.type]?.color }}>{TYPE_LABEL[b.type]}</span></div>
          <div className="grid g2" style={{ gap: 8 }}>
            <div><div className="faint small">Today</div><b style={{ fontSize: 18 }}>{money(b.revenueToday)}</b></div>
            <div><div className="faint small">30 days</div><b style={{ fontSize: 18 }}>{money(b.revenue30)}</b></div>
            <div><div className="faint small">Patients · queue</div><b>{b.patients} · {b.inQueue}</b></div>
            <div><div className="faint small">{b.beds ? 'Beds occupied' : 'Low stock items'}</div><b>{b.beds ? `${b.beds.occupied} / ${b.beds.total}` : b.lowStock}</b></div>
          </div>
          <div className="mini-bars mt" title="Last 7 days">{b.days.map(x => <i key={x.date} style={{ height: (x.amount / max * 100) + '%' }} />)}</div>
          <div className="row mt">{b.sample ? <Badge tone="warn">sample data</Badge> : null}{b.id === c.branch?.id ? <Badge tone="brand">You are here</Badge> : <button className="sm primary right" onClick={() => onOpen(b.id)}>Open branch</button>}</div>
        </div>;
      })}</div>
      {metric && <BranchBreakdown metric={metric} B={B} onOpen={id => { setMetric(null); onOpen(id); }} onClose={() => setMetric(null)} />}
      {adding && boot && <NewBranch types={boot.types} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await refreshProfile(); reload(); }} />}
    </div>
  );
}

// Per-branch comparison behind each combined card
const METRICS = {
  money: ['Collections by branch', [['Today', b => money(b.revenueToday), b => b.revenueToday], ['Last 7 days', b => money(b.revenue7), b => b.revenue7], ['Last 30 days', b => money(b.revenue30), b => b.revenue30]]],
  patients: ['Patients by branch', [['On file', b => b.patients.toLocaleString(), b => b.patients], ['Visits today', b => b.visitsToday, b => b.visitsToday], ['Waiting now', b => b.inQueue, b => b.inQueue]]],
  beds: ['Beds by branch', [['Occupied', b => b.beds ? `${b.beds.occupied} / ${b.beds.total}` : 'No wards', b => b.beds ? b.beds.occupied : 0], ['Occupancy', b => b.beds ? Math.round(b.beds.occupied / Math.max(1, b.beds.total) * 100) + '%' : '—', b => b.beds ? b.beds.occupied / Math.max(1, b.beds.total) : 0]]],
  stock: ['Stock by branch', [['Value at cost', b => money(b.stockValue), b => b.stockValue], ['Below reorder level', b => b.lowStock, b => b.lowStock]]],
};
export function BranchBreakdown({ metric, B, onOpen, onClose }) {
  const [title, cols] = METRICS[metric];
  const max = Math.max(1, ...B.map(cols[0][2]));
  return <Modal title={title} onClose={onClose} wide>
    <table className="table"><thead><tr><th>Branch</th><th style={{ width: '30%' }} />{cols.map(c => <th key={c[0]} className="num">{c[0]}</th>)}<th /></tr></thead><tbody>
      {[...B].sort((a, b) => cols[0][2](b) - cols[0][2](a)).map(b => <tr key={b.id}>
        <td><b>{b.name}</b><div className="faint small">{TYPE_LABEL[b.type]} · {b.location || ''}</div></td>
        <td><div className="minibar"><i style={{ width: (cols[0][2](b) / max * 100) + '%', background: b.color || TYPE_ART[b.type]?.color }} /></div></td>
        {cols.map(c => <td key={c[0]} className="num">{c[1](b)}</td>)}
        <td>{onOpen && <button className="sm" onClick={() => onOpen(b.id)}>Open</button>}</td></tr>)}
    </tbody></table>
  </Modal>;
}
