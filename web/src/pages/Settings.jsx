import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext, ROLES } from '../App';
import { useData, Field, Tabs, Badge, act, money, PageHead, Tip, Modal, Icon } from '../ui';
import { TypeCards, ModuleOptions } from './Onboard';

export default function Settings({ reload, refreshProfile }) {
  const c = useContext(ConfigContext);
  const admin = ['admin', 'superadmin'].includes(c.user.role);
  const [tab, setTab] = useState(admin ? 'facility' : 'account');
  return (
    <div className="page">
      <PageHead icon="settings" title="Settings" sub={`${c.facility_name} · ${c.type} · lab ${c.lab} · imaging ${c.imaging} · ${c.billing_mode} billing`} />
      <Tabs value={tab} onChange={setTab} tabs={[admin && ['facility', 'Facility details'], admin && ['type', 'Type & services'], admin && ['prices', 'Service prices'], admin && ['users', 'Staff & access'],
        admin && ['data', 'Data & backup'], ['account', 'My account'], ['network', 'Other devices']]} />
      {tab === 'facility' && <Facility reload={reload} refreshProfile={refreshProfile} />}
      {tab === 'type' && <TypeServices reload={reload} refreshProfile={refreshProfile} />}
      {tab === 'prices' && <Prices />}
      {tab === 'users' && <Users />}
      {tab === 'data' && <Data reload={reload} />}
      {tab === 'account' && <Account />}
      {tab === 'network' && <Network />}
    </div>
  );
}

function Facility({ reload, refreshProfile }) {
  const c = useContext(ConfigContext);
  const [f, setF] = useState({ ...c, partners: (c.partners || []).join('\n') });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const { user, reload: _r, session, branch, branches, ...rest } = f;
    await act(() => api.put('/config', { ...rest, partners: f.partners.split('\n').map(s => s.trim()).filter(Boolean) }), 'Settings saved');
    await refreshProfile(); reload();
  };
  return <div className="card stack">
    <div className="fields">
      <Field label="Facility name"><input value={f.facility_name} onChange={e => set('facility_name', e.target.value)} /></Field>
      <Field label="Tagline (website)"><input value={f.tagline || ''} onChange={e => set('tagline', e.target.value)} /></Field>
      <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
      <Field label="Email"><input value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
      <Field label="Location"><input value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
      <Field label="KMHFR facility code"><input value={f.kmhfr || ''} onChange={e => set('kmhfr', e.target.value)} /></Field>
      <Field label="KRA PIN"><input value={f.kra_pin || ''} onChange={e => set('kra_pin', e.target.value)} /></Field>
      <Field label="Brand colour"><input type="color" value={f.color || '#0f766e'} onChange={e => set('color', e.target.value)} style={{ height: 40, padding: 3 }} /></Field>
    </div>
    <Field label="Partner labs, imaging centres and referral hospitals (one per line)"><textarea value={f.partners} onChange={e => set('partners', e.target.value)} /></Field>
    <div className="row" style={{ gap: 18 }}>
      <label className="check"><input type="checkbox" checked={!!f.auto_checkout} onChange={e => set('auto_checkout', e.target.checked)} />Close the visit automatically once the bill is fully paid</label>
      <label className="check"><input type="checkbox" checked={f.web_shop !== false} onChange={e => set('web_shop', e.target.checked)} />Medicine shop on the website</label>
    </div>
    <div><button className="primary" onClick={save}>Save details</button></div>
  </div>;
}

function TypeServices({ reload, refreshProfile }) {
  const c = useContext(ConfigContext);
  const [boot] = useData('/bootstrap');
  const [o, setO] = useState({ type: c.type, lab: c.lab, imaging: c.imaging, consultation: c.consultation, procedures: c.procedures, maternity: c.maternity, admissions: c.admissions, beds: c.beds, theatre: c.theatre, billing_mode: c.billing_mode });
  const set = (k, v) => setO(x => ({ ...x, [k]: v }));
  const pickType = t => { const d = boot?.types[t]?.defaults || {}; setO(x => ({ ...x, type: t, admissions: d.admissions, maternity: d.maternity, theatre: d.theatre, beds: x.beds || d.beds, lab: x.lab === 'none' ? d.lab : x.lab, imaging: x.imaging === 'none' ? d.imaging : x.imaging })); };
  const save = async () => { await act(() => api.put('/config', o), 'Saved. Menus updated for the new setup.'); await refreshProfile(); reload(); };
  return <div className="card stack">
    <Tip id="typeswitch">You can switch between pharmacy, clinic and hospital at any time. <b>No data is lost</b>: patients, stock, bills and history stay. Only the menus and modules change. Wards are created automatically when admissions are switched on.</Tip>
    <TypeCards value={o.type} onPick={pickType} />
    <ModuleOptions type={o.type} o={o} set={set} />
    <div><button className="primary" onClick={save}>Save type and services</button></div>
  </div>;
}

function Prices() {
  const [cat, reload] = useData('/catalogue');
  const [adding, setAdding] = useState(null);
  if (!cat) return null;
  return <div className="stack">
    <div className="row"><Tip id="prices">Change a price and click away to save. Lab prices are under Laboratory → Test menu; medicine prices under Pharmacy → Inventory.</Tip></div>
    <div className="row"><button className="primary" onClick={() => setAdding({ category: 'procedure' })}><Icon name="plus" size={15} />Add service</button></div>
    {['consultation', 'procedure', 'bed', 'other'].map(k => {
      const list = cat.services.filter(s => s.category === k);
      if (!list.length) return null;
      return <div key={k} className="tablewrap"><table className="table">
        <thead><tr><th style={{ textTransform: 'capitalize' }}>{k === 'bed' ? 'Inpatient' : k} services</th><th className="num">Price (KES)</th></tr></thead>
        <tbody>{list.map(s => <tr key={s.id}><td>{s.name}</td><td className="num"><input type="number" defaultValue={s.price} style={{ width: 130, textAlign: 'right' }}
          onBlur={async e => { if (Number(e.target.value) !== s.price) { await act(() => api.put('/services/' + s.id, { price: Number(e.target.value) }), `${s.name}: ${money(e.target.value)}`); reload(); } }} /></td></tr>)}</tbody>
      </table></div>;
    })}
    {adding && <Modal title="Add a service" onClose={() => setAdding(null)} footer={<><button onClick={() => setAdding(null)}>Cancel</button><button className="primary" disabled={!adding.name} onClick={async () => { await act(() => api.post('/services', adding), 'Service added'); setAdding(null); reload(); }}>Add</button></>}>
      <div className="fields"><Field label="Name" span={2}><input autoFocus onChange={e => setAdding({ ...adding, name: e.target.value })} /></Field>
        <Field label="Type"><select value={adding.category} onChange={e => setAdding({ ...adding, category: e.target.value })}><option value="consultation">Consultation</option><option value="procedure">Procedure</option><option value="bed">Inpatient</option><option value="other">Other</option></select></Field>
        <Field label="Price (KES)"><input type="number" onChange={e => setAdding({ ...adding, price: e.target.value })} /></Field></div>
    </Modal>}
  </div>;
}

function Users() {
  const c = useContext(ConfigContext);
  const [users, reload] = useData('/org/users');
  const [edit, setEdit] = useState(null);
  const branchName = id => c.branches.find(b => b.id === id)?.name || 'All branches';
  const save = async () => {
    if (edit.id) await act(() => api.put('/org/users/' + edit.id, edit), 'Staff member updated');
    else await act(() => api.post('/org/users', edit), `Added ${edit.name}`);
    setEdit(null); reload();
  };
  return <div className="stack">
    <Tip id="users">Each person signs in with their own username and PIN, so every action in the audit trail is theirs. Limit someone to one branch, or leave it on all branches. Roles decide which menus they see.</Tip>
    <div className="row"><button className="primary" onClick={() => setEdit({ role: 'reception', branch_id: null })}><Icon name="plus" size={15} />Add staff member</button></div>
    <div className="tablewrap"><table className="table">
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th /></tr></thead>
      <tbody>{(users || []).map(u => <tr key={u.id}><td><b>{u.name}</b></td><td>{u.username}</td><td><Badge tone="brand">{ROLES.find(r => r[0] === u.role)?.[1] || u.role}</Badge></td><td>{branchName(u.branch_id)}</td>
        <td>{u.active ? <Badge tone="good">Active</Badge> : <Badge>Disabled</Badge>}</td><td><button className="sm" onClick={() => setEdit({ ...u })}>Edit</button></td></tr>)}</tbody>
    </table></div>
    {edit && <Modal title={edit.id ? `Edit ${edit.name}` : 'Add staff member'} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)}>Cancel</button><button className="primary" disabled={!edit.name || (!edit.id && (!edit.username || !edit.pin))} onClick={save}>Save</button></>}>
      <div className="fields">
        <Field label="Full name *"><input value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
        {!edit.id && <Field label="Username *"><input value={edit.username || ''} onChange={e => setEdit({ ...edit, username: e.target.value.toLowerCase().replace(/\s/g, '') })} autoCapitalize="none" /></Field>}
        <Field label="Role"><select value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Branch"><select value={edit.branch_id || ''} onChange={e => setEdit({ ...edit, branch_id: e.target.value ? Number(e.target.value) : null })}><option value="">All branches</option>{c.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label={edit.id ? 'New PIN (leave blank to keep)' : 'PIN (4–8 digits) *'}><input type="password" inputMode="numeric" value={edit.pin || ''} onChange={e => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      {edit.id && <label className="check mt"><input type="checkbox" checked={!!edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked ? 1 : 0 })} />Account active (untick when someone leaves)</label>}
    </Modal>}
  </div>;
}

function Data({ reload }) {
  const c = useContext(ConfigContext);
  const [confirm, setConfirm] = useState(null);
  const [zero, setZero] = useState(true);
  const clear = async () => {
    await act(() => api.post('/branch/clear-sample', { confirm, zero_stock: zero }), 'Sample data removed. The branch is ready for real use.');
    setConfirm(null); reload(); window.location.hash = '#/';
  };
  return <div className="stack">
    <div className="card stack">
      <h3>Start real use</h3>
      <p>Remove all sample patients, visits, lab results, prescriptions, bills, payments, appointments and website orders from <b>{c.facility_name}</b>.
        The medicine catalogue, lab menu, prices, wards, settings and staff accounts stay.</p>
      <label className="check"><input type="checkbox" checked={zero} onChange={e => setZero(e.target.checked)} />Also set all stock to zero (recommended, then receive your real stock)</label>
      <div><button className="danger" onClick={() => setConfirm('')}>Remove sample data…</button></div>
    </div>
    <div className="card stack">
      <h3>Backup</h3>
      <p>Each branch is one file in <code>data/branches</code> on the main computer, and users are in <code>data/registry.db</code>. Copy the whole <code>data</code> folder to a flash drive at least once a week. Automatic cloud backup comes with the online sync.</p>
    </div>
    {confirm !== null && <Modal title="Remove sample data?" onClose={() => setConfirm(null)} footer={<><button onClick={() => setConfirm(null)}>Cancel</button><button className="danger solid" disabled={confirm !== 'DELETE'} onClick={clear}>Remove permanently</button></>}>
      <p>This cannot be undone. Type <b>DELETE</b> to confirm.</p>
      <div className="mt"><input value={confirm} onChange={e => setConfirm(e.target.value)} autoFocus /></div>
    </Modal>}
  </div>;
}

function Account() {
  const c = useContext(ConfigContext);
  const [f, setF] = useState({});
  const save = async () => { await act(() => api.post('/me/pin', f), 'PIN changed'); setF({}); };
  return <div className="card stack" style={{ maxWidth: 520 }}>
    <h3>{c.user.name}</h3>
    <p className="muted">Username <b>{c.user.username}</b> · role {c.user.role}</p>
    <div className="fields">
      <Field label="Current PIN"><input type="password" inputMode="numeric" value={f.old_pin || ''} onChange={e => setF({ ...f, old_pin: e.target.value })} /></Field>
      <Field label="New PIN (4–8 digits)"><input type="password" inputMode="numeric" value={f.new_pin || ''} onChange={e => setF({ ...f, new_pin: e.target.value.replace(/\D/g, '') })} /></Field>
    </div>
    <div><button className="primary" disabled={!f.old_pin || !f.new_pin} onClick={save}>Change PIN</button></div>
  </div>;
}

function Network() {
  const [cfg] = useData('/config');
  return <div className="card stack">
    <h3>Use MediCore on other computers, tablets and phones</h3>
    <p>Only the main computer runs MediCore. Other devices <b>do not need Node.js or any installation</b>: connect them to the same Wi-Fi or office network and open this address in Chrome, Edge or Safari:</p>
    {(cfg?.lan || []).map(a => <code key={a} style={{ fontSize: 17, padding: '8px 12px', background: 'var(--brand-soft)', borderRadius: 8, alignSelf: 'flex-start' }}>{a}</code>)}
    <p className="muted">Tip: ask the router to always give the main computer the same IP address (a "DHCP reservation"), so this address never changes. Bookmark it on each device.</p>
    <p className="muted">The facility website for this branch is the same address followed by <code>/site</code>.</p>
    <h3 className="mt">Integrations</h3>
    <div className="row">{['M-Pesa Daraja', 'KRA eTIMS', 'SHA claims', 'DHA HIE (AfyaConnect)', 'KHIS / DHIS2', 'SMS reminders'].map(x => <Badge key={x} tone="warn">{x}: demo</Badge>)}</div>
  </div>;
}
