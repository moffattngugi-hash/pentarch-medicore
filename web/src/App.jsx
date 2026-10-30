import React, { useEffect, useState } from 'react';
import { api, getUser, setUser } from './api';
import { Icon, Logo, Toaster, act } from './ui';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientView from './pages/PatientView';
import Queue from './pages/Queue';
import Visit from './pages/Visit';
import Lab from './pages/Lab';
import Imaging from './pages/Imaging';
import Pharmacy from './pages/Pharmacy';
import Billing from './pages/Billing';
import Wards from './pages/Wards';
import Maternity from './pages/Maternity';
import Referrals from './pages/Referrals';
import Appointments from './pages/Appointments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

export const ConfigContext = React.createContext({});

const ROLE_PAGES = {
  admin: '*',
  reception: ['dashboard', 'patients', 'queue', 'appointments', 'referrals', 'billing'],
  nurse: ['dashboard', 'patients', 'queue', 'wards', 'maternity', 'referrals', 'appointments'],
  clinician: ['dashboard', 'patients', 'queue', 'lab', 'imaging', 'wards', 'maternity', 'referrals', 'appointments', 'reports'],
  lab: ['dashboard', 'patients', 'lab', 'imaging'],
  pharmacist: ['dashboard', 'patients', 'queue', 'pharmacy', 'billing', 'reports'],
  cashier: ['dashboard', 'billing', 'pharmacy', 'reports']
};

function useHash() {
  const [h, setH] = useState(window.location.hash.slice(2));
  useEffect(() => {
    const f = () => { setH(window.location.hash.slice(2)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export default function App() {
  const [config, setConfig] = useState(undefined);
  const [user, setU] = useState(getUser());
  const hash = useHash();

  const loadConfig = () => api.get('/config').then(r => setConfig(r)).catch(() => setConfig({ config: null }));
  useEffect(() => { loadConfig(); }, []);
  useEffect(() => {
    const c = config?.config;
    if (c?.color) document.documentElement.style.setProperty('--brand', c.color);
    document.title = c ? `${c.facility_name} · MediCore` : 'Pentarch MediCore';
  }, [config]);

  if (config === undefined) return <div className="empty">Loading…</div>;
  if (!config.config || hash === 'setup') {
    return <><Setup presets={config.presets} current={config.config} onDone={() => { setUser(null); setU(null); window.location.hash = '#/'; loadConfig(); }} /><Toaster /></>;
  }
  if (!user) return <><Login cfg={config.config} onLogin={u => { setUser(u); setU(u); }} /><Toaster /></>;

  const c = config.config;
  const allowed = p => ROLE_PAGES[user.role] === '*' || (ROLE_PAGES[user.role] || []).includes(p);
  const [page, id] = hash.split('/');
  const nav = [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['patients', 'Patients', 'patients'],
    ['queue', c.type === 'pharmacy' ? 'Service queue' : 'OPD queue', 'queue'],
    ['appointments', 'Appointments', 'appointments'],
    c.lab !== 'none' && ['lab', 'Laboratory', 'lab'],
    c.imaging !== 'none' && ['imaging', 'Imaging', 'imaging'],
    ['pharmacy', 'Pharmacy & stock', 'pharmacy'],
    ['billing', 'Billing & checkout', 'billing'],
    c.admissions && ['wards', 'Wards & beds', 'wards'],
    c.maternity && ['maternity', 'Maternity', 'maternity'],
    ['referrals', 'Referrals', 'referrals'],
    ['reports', 'Reports', 'reports'],
    ['settings', 'Settings', 'settings'],
  ].filter(Boolean).filter(([k]) => allowed(k));

  const current = page || 'dashboard';
  let body;
  const P = {
    dashboard: <Dashboard />, patients: id ? <PatientView id={id} /> : <Patients />, queue: <Queue />,
    visit: <Visit id={id} />, lab: <Lab />, imaging: <Imaging />, pharmacy: <Pharmacy />,
    billing: <Billing openId={id} />, wards: <Wards />, maternity: <Maternity />, referrals: <Referrals />,
    appointments: <Appointments />, reports: <Reports />, settings: <Settings reload={loadConfig} />
  };
  body = P[current] || <Dashboard />;

  return (
    <ConfigContext.Provider value={{ ...c, user, reload: loadConfig }}>
      <div className="app">
        <aside className="side">
          <div className="brand"><Logo /><div><b>{c.facility_name}</b><small>Pentarch MediCore</small></div></div>
          <nav className="nav">
            {nav.map(([k, label, icon]) => (
              <a key={k} href={'#/' + k} className={current === k || (k === 'queue' && current === 'visit') ? 'on' : ''}><Icon name={icon} />{label}</a>
            ))}
            <div className="sep">Public</div>
            <a href="/site" target="_blank" rel="noreferrer"><Icon name="globe" />Facility website</a>
          </nav>
          <div className="me">
            <b>{user.name}</b>
            <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
            <button className="sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => { setUser(null); setU(null); }}><Icon name="logout" size={14} />Switch user</button>
          </div>
        </aside>
        <main className="main">{body}</main>
      </div>
      <Toaster />
    </ConfigContext.Provider>
  );
}

function Login({ cfg, onLogin }) {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  useEffect(() => { api.get('/users').then(setUsers); }, []);
  const go = async e => {
    e.preventDefault();
    const u = await act(() => api.post('/login', { username: sel.username, pin }));
    onLogin(u);
  };
  return (
    <div className="setup">
      <div className="box" style={{ width: 'min(640px,100%)' }}>
        <div className="row" style={{ marginBottom: 18 }}><Logo size={20} /><div><h1>{cfg.facility_name}</h1><span className="muted">Pentarch MediCore · sign in</span></div></div>
        <div className="card">
          <h3>Who is working?</h3>
          <div className="grid g2">
            {users.map(u => <button key={u.id} className={'choice' + (sel?.id === u.id ? ' on' : '')} onClick={() => { setSel(u); setPin(''); }}>
              <b>{u.name}</b><span className="muted small" style={{ textTransform: 'capitalize' }}>{u.role}</span></button>)}
          </div>
          {sel && <form onSubmit={go} className="row mt">
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" autoFocus style={{ maxWidth: 160 }} />
            <button className="primary">Sign in</button>
            <span className="faint small">Demo PIN for every user: 1234</span>
          </form>}
        </div>
        <p className="faint small mt">Demo build · data stays on this computer · <a href="#/setup">change facility setup</a></p>
      </div>
    </div>
  );
}
