import React, { useState } from 'react';
import { api } from '../api';
import { useData, Badge, Stat, Modal, Field, Icon, Logo, act, money, fmtDate, Empty, Tip } from '../ui';
import Onboard, { TYPE_ART, TypeCards } from './Onboard';

const TYPE_LABEL = { pharmacy: 'Pharmacy', clinic: 'Clinic', hospital: 'Hospital' };

// Pentarch super admin: every client organisation and branch on this installation
export default function Admin({ session, types, onOpen, onLogout }) {
  const [orgs, reload] = useData('/admin/orgs');
  const [creating, setCreating] = useState(false);
  const [addTo, setAddTo] = useState(null);
  const [del, setDel] = useState(null);
  if (creating) return <Onboard types={types} asSuper onCancel={() => setCreating(false)} onDone={r => { setCreating(false); reload(); alert(`Created. The owner signs in with username "${r.admin_username}" and the PIN you set.`); }} />;
  const all = (orgs || []).flatMap(o => o.branches);
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'linear-gradient(120deg,#0b1220,#13233f)', color: 'white', padding: '22px 30px' }}>
        <div className="row" style={{ maxWidth: 1300, margin: '0 auto' }}>
          <Logo /><div><h1 style={{ color: 'white' }}>Pentarch console</h1><span style={{ color: '#94a3b8' }}>Signed in as {session.user.name}. You see every facility on this installation.</span></div>
          <div className="right row"><button className="primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} />New facility</button>
            <button onClick={onLogout}><Icon name="logout" size={15} />Sign out</button></div>
        </div>
      </div>
      <div className="page" style={{ maxWidth: 1300, margin: '0 auto' }}>
        <Tip id="console">Each client organisation can have several branches of different types. <b>Open</b> a branch to work inside it as administrator (for support or demos). Clients only ever see their own facilities.</Tip>
        <div className="grid g4" style={{ marginBottom: 18 }}>
          <Stat icon="branches" label="Organisations" value={(orgs || []).length} />
          <Stat icon="grid" label="Branches" value={all.length} hint={['pharmacy', 'clinic', 'hospital'].map(t => `${all.filter(b => b.type === t).length} ${t}`).join(' · ')} />
          <Stat icon="patients" label="Patients on file" value={all.reduce((a, b) => a + b.patients, 0).toLocaleString()} />
          <Stat icon="cash" label="Collections, 30 days" value={money(all.reduce((a, b) => a + b.revenue30, 0))} />
        </div>
        {orgs && !orgs.length && <div className="card"><Empty icon="branches">No facilities yet. Click <b>New facility</b> to set up the first client.</Empty></div>}
        <div className="stack">{(orgs || []).map(o => <div key={o.id} className="card">
          <div className="cardhead"><h2>{o.name}</h2><span className="muted small">Owner {o.owner_name} · {o.phone} {o.email && `· ${o.email}`} · admin sign-in <b>{o.admin}</b> · {o.users} users · since {fmtDate(o.created_at)}</span>
            <div className="right row"><button className="sm" onClick={() => setAddTo(o)}><Icon name="plus" size={14} />Add branch</button>
              <button className="sm danger" onClick={() => setDel(o)}>Remove</button></div></div>
          <div className="tablewrap" style={{ boxShadow: 'none' }}><table className="table">
            <thead><tr><th>Branch</th><th>Type</th><th className="num">Patients</th><th className="num">Today</th><th className="num">30 days</th><th className="num">In queue</th><th className="num">Low stock</th><th /></tr></thead>
            <tbody>{o.branches.map(b => <tr key={b.id}>
              <td><b>{b.name}</b> {b.sample ? <Badge tone="warn">sample data</Badge> : null}<div className="faint small">{b.location}</div></td>
              <td><span className="badge" style={{ background: TYPE_ART[b.type]?.bg, color: TYPE_ART[b.type]?.color }}>{TYPE_LABEL[b.type]}</span></td>
              <td className="num">{b.patients}</td><td className="num">{money(b.revenueToday)}</td><td className="num">{money(b.revenue30)}</td>
              <td className="num">{b.inQueue}</td><td className="num">{b.lowStock ? <Badge tone="warn">{b.lowStock}</Badge> : 0}</td>
              <td><button className="sm primary" onClick={() => onOpen(b.id)}>Open</button></td></tr>)}</tbody>
          </table></div>
        </div>)}</div>
      </div>
      {addTo && <NewBranch org={addTo} types={types} onClose={() => setAddTo(null)} onDone={() => { setAddTo(null); reload(); }} />}
      {del && <ConfirmDelete org={del} onClose={() => setDel(null)} onDone={() => { setDel(null); reload(); }} />}
    </div>
  );
}

export function NewBranch({ org, types, onClose, onDone }) {
  const [f, setF] = useState({ type: 'pharmacy', sample: false });
  const save = async () => {
    const r = await act(() => api.post('/org/branches', { ...f, org_id: org?.id, options: { ...types[f.type].defaults } }), 'Branch created');
    onDone(r);
  };
  return <Modal wide title={`New branch${org ? ' · ' + org.name : ''}`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!f.name} onClick={save}>Create branch</button></>}>
    <div className="stack">
      <TypeCards value={f.type} onPick={t => setF({ ...f, type: t })} />
      <div className="fields">
        <Field label="Branch name *"><input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. SPENSA Pharmacy - Rongai" /></Field>
        <Field label="Location"><input value={f.location || ''} onChange={e => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Same as main if blank" /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.sample} onChange={e => setF({ ...f, sample: e.target.checked })} />Load sample data for training</label>
      <p className="faint small">The new branch gets its own patients, stock and money records. The owner sees all branches together on the <b>All branches</b> page. Services can be changed in the branch's Settings.</p>
    </div>
  </Modal>;
}

function ConfirmDelete({ org, onClose, onDone }) {
  const [t, setT] = useState('');
  const go = async () => { await act(() => api.del('/admin/orgs/' + org.id), 'Organisation removed'); onDone(); };
  return <Modal title={`Remove ${org.name}?`} onClose={onClose} footer={<><button onClick={onClose}>Cancel</button><button className="danger solid" disabled={t !== org.name} onClick={go}>Remove</button></>}>
    <p>This removes the organisation, its users and access to its branches from this installation. Branch data files stay in the <code>data/branches</code> folder as a backup.</p>
    <div className="mt"><Field label={`Type "${org.name}" to confirm`}><input value={t} onChange={e => setT(e.target.value)} /></Field></div>
  </Modal>;
}
