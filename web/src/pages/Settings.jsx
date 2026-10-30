import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Field, Tabs, Badge, act, money } from '../ui';

export default function Settings({ reload }) {
  const c = useContext(ConfigContext);
  const [tab, setTab] = useState('facility');
  const [f, setF] = useState({ ...c, partners: (c.partners || []).join('\n') });
  const [cfgInfo] = useData('/config');
  const [cat, reloadCat] = useData('/catalogue');
  const [users] = useData('/users');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const { user, reload: _r, ...rest } = f;
    await act(() => api.put('/config', { ...rest, partners: f.partners.split('\n').map(s => s.trim()).filter(Boolean) }), 'Settings saved');
    reload();
  };
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Settings</h1><p className="sub">{c.type} · lab {c.lab} · imaging {c.imaging} · billing {c.billing_mode}</p></div>
        <div className="actions"><a href="#/setup"><button>Run setup wizard again</button></a></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[['facility', 'Facility & billing'], ['prices', 'Service prices'], ['users', 'Users & roles'], ['system', 'Network & backup']]} />
      {tab === 'facility' && <div className="card stack">
        <div className="fields">
          <Field label="Facility name"><input value={f.facility_name} onChange={e => set('facility_name', e.target.value)} /></Field>
          <Field label="Tagline"><input value={f.tagline || ''} onChange={e => set('tagline', e.target.value)} /></Field>
          <Field label="Phone"><input value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input value={f.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Location"><input value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
          <Field label="KMHFR code"><input value={f.kmhfr || ''} onChange={e => set('kmhfr', e.target.value)} /></Field>
          <Field label="KRA PIN"><input value={f.kra_pin || ''} onChange={e => set('kra_pin', e.target.value)} /></Field>
          <Field label="Brand colour"><input type="color" value={f.color || '#0f766e'} onChange={e => set('color', e.target.value)} style={{ height: 38, padding: 3 }} /></Field>
        </div>
        <Field label="Partner labs, imaging centres and referral hospitals (one per line)"><textarea value={f.partners} onChange={e => set('partners', e.target.value)} /></Field>
        <div className="row">
          <Field label="Billing mode"><select value={f.billing_mode} onChange={e => set('billing_mode', e.target.value)}><option value="auto">Automatic: charges post as services are given</option><option value="manual">Manual: cashier builds each bill</option></select></Field>
          <label className="check"><input type="checkbox" checked={!!f.auto_checkout} onChange={e => set('auto_checkout', e.target.checked)} />Automatic checkout when paid in full</label>
          <label className="check"><input type="checkbox" checked={f.web_shop !== false} onChange={e => set('web_shop', e.target.checked)} />Medicine shop on website</label>
        </div>
        <div><button className="primary" onClick={save}>Save settings</button></div>
      </div>}
      {tab === 'prices' && cat && <div className="tablewrap"><table className="table">
        <thead><tr><th>Service</th><th>Category</th><th className="num">Price (KES)</th></tr></thead>
        <tbody>{cat.services.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.category}</td>
          <td className="num"><input type="number" defaultValue={s.price} style={{ width: 120, textAlign: 'right' }} onBlur={async e => { if (Number(e.target.value) !== s.price) { await act(() => api.put('/services/' + s.id, { price: Number(e.target.value) }), 'Price updated'); reloadCat(); } }} /></td></tr>)}</tbody>
      </table><p className="faint small" style={{ padding: 10 }}>Lab test prices are in Laboratory → Test catalogue; medicine prices in Pharmacy → Inventory.</p></div>}
      {tab === 'users' && <div className="tablewrap"><table className="table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th></tr></thead>
        <tbody>{(users || []).map(u => <tr key={u.id}><td>{u.name}</td><td>{u.username}</td><td><Badge tone="brand">{u.role}</Badge></td></tr>)}</tbody>
      </table><p className="faint small" style={{ padding: 10 }}>Each role sees only the screens it needs. Demo PIN for all users is 1234.</p></div>}
      {tab === 'system' && <div className="card stack">
        <h3>Connect other devices</h3>
        <p>MediCore runs on this computer. Other PCs, tablets and phones on the same Wi-Fi open it in a browser at:</p>
        {(cfgInfo?.lan || []).map(a => <code key={a} style={{ fontSize: 15 }}>{a}</code>)}
        <p className="muted">The facility website is at the same address followed by <code>/site</code>.</p>
        <h3 className="mt">Backup</h3>
        <p>All data lives in one file: <code>data/medicore.db</code>. Copy it to a USB drive to back up. Cloud backup and sync come in the next phase.</p>
        <h3 className="mt">Integrations</h3>
        <div className="row">{['M-Pesa Daraja', 'KRA eTIMS', 'SHA claims', 'DHA HIE (AfyaConnect)', 'KHIS / DHIS2', 'SMS'].map(x => <Badge key={x} tone="warn">{x}: demo</Badge>)}</div>
      </div>}
    </div>
  );
}
