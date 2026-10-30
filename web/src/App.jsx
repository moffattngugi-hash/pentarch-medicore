import React, { useEffect, useState } from 'react';
import { api, getSession, setSession, getBranchId, setBranch, onSessionExpired } from './api';
import { Icon, Logo, Toaster, act, toast } from './ui';
import Onboard from './pages/Onboard';
import Admin from './pages/Admin';
import Branches from './pages/Branches';
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
  superadmin: '*', admin: '*',
  reception: ['dashboard', 'patients', 'queue', 'appointments', 'referrals', 'billing'],
  nurse: ['dashboard', 'patients', 'queue', 'wards', 'maternity', 'referrals', 'appointments'],
  clinician: ['dashboard', 'patients', 'queue', 'lab', 'imaging', 'wards', 'maternity', 'referrals', 'appointments', 'reports'],
  lab: ['dashboard', 'patients', 'lab', 'imaging'],
  pharmacist: ['dashboard', 'patients', 'queue', 'pharmacy', 'billing', 'reports'],
  cashier: ['dashboard', 'billing', 'pharmacy', 'reports'],
};
export const ROLES = [['admin', 'Administrator'], ['reception', 'Reception / records'], ['nurse', 'Nurse / midwife'], ['clinician', 'Clinical officer / doctor'],
  ['lab', 'Lab technician'], ['pharmacist', 'Pharmacist'], ['cashier', 'Cashier']];
export const TYPE_LABEL = { pharmacy: 'Pharmacy', clinic: 'Clinic', hospital: 'Hospital' };

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
  const [boot, setBoot] = useState(null);
  const [session, setS] = useState(getSession());
  const [branch, setB] = useState(getBranchId());
  const [cfg, setCfg] = useState(null);
  const hash = useHash();

  useEffect(() => { api.get('/bootstrap').then(setBoot).catch(() => setBoot({ hasOrgs: true, types: {} })); }, []);
  useEffect(() => onSessionExpired(() => { setS(null); setB(null); toast('Your session ended. Please sign in again.', true); }), []);
  const login = s => {
    setSession(s); setS(s);
    const first = s.user.role === 'superadmin' ? null : (s.branch_id || s.branches[0]?.id || null);
    setBranch(first); setB(first);
    window.location.hash = first ? '#/' : '#/admin';
  };
  const logout = async () => { try { await api.post('/logout'); } catch {} setSession(null); setS(null); setB(null); setCfg(null); };
  const chooseBranch = id => { setBranch(id); setB(id); setCfg(null); window.location.hash = '#/'; };
  const refreshProfile = async () => { const p = await api.get('/me'); const s = { ...getSession(), ...p }; setSession(s); setS(s); };
  const loadConfig = () => branch && api.get('/config').then(setCfg).catch(e => toast(e.message, true));
  useEffect(() => { setCfg(null); if (session && branch) loadConfig(); }, [session?.token, branch]);
  useEffect(() => {
    const c = cfg?.config;
    document.documentElement.style.setProperty('--brand', c?.color || '#0f766e');
    document.title = c ? `${c.facility_name} · MediCore` : 'Pentarch MediCore';
  }, [cfg]);

  if (!boot) return <div className="empty">Loading…</div>;
  if (!session) {
    if (!boot.hasOrgs) return <><Onboard types={boot.types} first onDone={s => { setBoot({ ...boot, hasOrgs: true }); login(s); }} /><Toaster /></>;
    return <><Login onLogin={login} /><Toaster /></>;
  }
  const isSuper = session.user.role === 'superadmin';
  if (isSuper && (!branch || hash === 'admin')) {
    return <><Admin session={session} types={boot.types} onOpen={id => { refreshProfile(); chooseBranch(id); }} onLogout={logout} /><Toaster /></>;
  }
  if (!cfg) return <div className="empty">Opening facility…</div>;

  const c = cfg.config;
  const user = session.user;
  const allowed = p => ROLE_PAGES[user.role] === '*' || (ROLE_PAGES[user.role] || []).includes(p);
  const [page, id] = hash.split('/');
  const many = session.branches.length > 1;
  const nav = [
    ['dashboard', 'Dashboard', 'dashboard'],
    (['admin', 'superadmin'].includes(user.role) && !user.branch_id) && ['branches', many ? 'All branches' : 'Branches', 'branches'],
    ['patients', 'Patients', 'patients'],
    ['queue', c.type === 'pharmacy' ? 'Service queue' : 'OPD queue', 'queue'],
    ['appointments', 'Appointments', 'appointments'],
    c.lab !== 'none' && ['lab', 'Laboratory', 'lab'],
    c.imaging !== 'none' && ['imaging', 'Imaging', 'imaging'],
    ['pharmacy', c.type === 'pharmacy' ? 'Pharmacy & stock' : 'Pharmacy & stores', 'pharmacy'],
    ['billing', 'Billing & checkout', 'billing'],
    c.admissions && ['wards', 'Wards & beds', 'wards'],
    c.maternity && ['maternity', 'Maternity', 'maternity'],
    ['referrals', 'Referrals', 'referrals'],
    ['reports', 'Reports', 'reports'],
    ['settings', 'Settings', 'settings'],
  ].filter(Boolean).filter(([k]) => k === 'branches' || allowed(k));
  const current = page || 'dashboard';
  const P = {
    dashboard: <Dashboard />, branches: <Branches onOpen={chooseBranch} refreshProfile={refreshProfile} />,
    patients: id ? <PatientView id={id} /> : <Patients />, queue: <Queue />, visit: <Visit id={id} />,
    lab: <Lab />, imaging: <Imaging />, pharmacy: <Pharmacy />, billing: <Billing openId={id} />, wards: <Wards />,
    maternity: <Maternity />, referrals: <Referrals />, appointments: <Appointments />, reports: <Reports />,
    settings: <Settings reload={loadConfig} refreshProfile={refreshProfile} />,
  };
  const pageAllowed = current === 'visit' ? allowed('queue') || allowed('patients') : current === 'branches' || allowed(current);
  const initials = user.name.split(' ').filter(w => /^[A-Z]/.test(w) && !/\.$/.test(w)).slice(0, 2).map(w => w[0]).join('');

  return (
    <ConfigContext.Provider value={{ ...c, user, session, branch: cfg.branch, branches: session.branches, reload: loadConfig }}>
      <div className="app">
        <aside className="side">
          <div className="brand"><Logo /><div><b>{c.facility_name}</b><small>{TYPE_LABEL[c.type]} · Pentarch MediCore</small></div></div>
          {(many || isSuper) && <div className="branch-switch">
            <select value={branch} onChange={e => chooseBranch(Number(e.target.value))} aria-label="Switch branch">
              {session.branches.map(b => <option key={b.id} value={b.id}>{b.name} · {TYPE_LABEL[b.type]}</option>)}
            </select>
          </div>}
          <nav className="nav">
            {isSuper && <a href="#/admin"><Icon name="shield" />Pentarch console</a>}
            {nav.map(([k, label, icon]) => <a key={k} href={'#/' + k} className={current === k || (k === 'queue' && current === 'visit') ? 'on' : ''}><Icon name={icon} />{label}</a>)}
            <div className="sep">Public</div>
            <a href={'/site?b=' + branch} target="_blank" rel="noreferrer"><Icon name="globe" />Facility website</a>
            <div className="ver">MediCore v{boot?.version || ''}</div>
          </nav>
          <div className="me">
            <span className="avatar">{initials || 'U'}</span>
            <div style={{ minWidth: 0 }}><b>{user.name}</b><span style={{ textTransform: 'capitalize' }}>{user.role === 'superadmin' ? 'Pentarch super admin' : user.role}</span></div>
            <button className="ghost sm right" style={{ color: '#cbd5e1' }} onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="logout" size={16} /></button>
          </div>
        </aside>
        <main className="main">{pageAllowed ? <Guard key={current + (id || '')}>{P[current] || <Dashboard />}</Guard> : <div className="page"><div className="alert warn">Your role does not have access to this page. Ask the administrator if you need it.</div></div>}</main>
      </div>
      <Toaster />
    </ConfigContext.Provider>
  );
}

function Login({ onLogin }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [manual, setManual] = useState(false);
  useEffect(() => { api.get('/login-users').then(setList).catch(() => setList({ users: [] })); }, []);
  const go = async e => { e.preventDefault(); onLogin(await act(() => api.post('/login', { username: sel ? sel.username : username, pin }))); };
  const quick = list?.users?.length > 0 && !manual;
  return (
    <div className="setup">
      <div className="box" style={{ width: 'min(680px,100%)' }}>
        <div className="row" style={{ marginBottom: 20 }}><Logo size={20} /><div><h1>{list?.org?.name || 'Pentarch MediCore'}</h1><span className="muted">Sign in to continue</span></div></div>
        <div className="card">
          {quick ? <>
            <h3>Who is working?</h3>
            <div className="grid g2">{list.users.map(u => <button key={u.id} className={'choice' + (sel?.id === u.id ? ' on' : '')} onClick={() => { setSel(u); setPin(''); }}>
              <b>{u.name}</b><span className="muted small" style={{ textTransform: 'capitalize' }}>{u.role} · {u.username}</span></button>)}</div>
            {sel && <form onSubmit={go} className="row mt">
              <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter your PIN" autoFocus style={{ maxWidth: 200 }} />
              <button className="primary">Sign in</button>
            </form>}
            <p className="faint small mt">Not listed? <a href="#" onClick={e => { e.preventDefault(); setManual(true); setSel(null); }}>Sign in with your username</a></p>
          </> : <form onSubmit={go} className="stack">
            <h3>Sign in</h3>
            <label className="f"><span>Username</span><input value={username} onChange={e => setUsername(e.target.value)} autoFocus autoCapitalize="none" /></label>
            <label className="f"><span>PIN</span><input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} /></label>
            <div className="row"><button className="primary" disabled={!username || !pin}>Sign in</button>
              {list?.users?.length > 0 && <a href="#" onClick={e => { e.preventDefault(); setManual(false); }}>Pick from staff list</a>}</div>
          </form>}
        </div>
        <p className="faint small mt">Data stays on this computer. Sample staff PIN is 1234. Forgot your PIN? Ask your administrator to reset it.</p>
      </div>
    </div>
  );
}

// Keeps one broken screen from blanking the whole system; moving to another page resets it
class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error('Screen error', err); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="page"><div className="card" style={{ maxWidth: 560 }}>
      <h2>Something went wrong on this screen</h2>
      <p className="muted">Your data is safe. Go back to the dashboard or reload this page. If it keeps happening, note what you clicked and tell Pentarch support.</p>
      <p className="faint small">{String(this.state.err?.message || this.state.err)}</p>
      <div className="row mt"><button onClick={() => { window.location.hash = '#/dashboard'; }}>Dashboard</button><button className="primary" onClick={() => window.location.reload()}>Reload</button></div>
    </div></div>;
  }
}
