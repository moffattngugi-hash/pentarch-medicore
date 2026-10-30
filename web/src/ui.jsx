import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api';

// ---------- formatting ----------
export const money = n => 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
export const fmtDate = d => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDT = d => d ? `${fmtDate(d)} ${fmtTime(d)}` : '';
export function age(dob, at = new Date()) {
  if (!dob) return '';
  const y = (new Date(at) - new Date(dob)) / (365.25 * 864e5);
  if (y < 1) return Math.max(0, Math.floor(y * 12)) + ' mo';
  if (y < 5) return Math.floor(y) + ' y ' + Math.floor((y % 1) * 12) + ' mo';
  return Math.floor(y) + ' y';
}
export const ageYears = dob => dob ? (Date.now() - new Date(dob)) / (365.25 * 864e5) : 30;
export const todayISO = () => new Date().toISOString().slice(0, 10);
const plural = (w, n) => n === 1 ? w : /(x|s|ch|sh)$/.test(w) ? w + 'es' : w + 's';
// stock in base units shown as packs + loose units, e.g. "12 boxes + 40 tabs"
export function fmtQty(it, q) {
  q = Math.round(q || 0);
  if (!it.pack_size || it.pack_size <= 1) return `${q} ${plural(it.unit, q)}`;
  const p = Math.floor(q / it.pack_size), l = q % it.pack_size;
  return [p && `${p} ${plural(it.pack_name, p)}`, l && `${l} ${plural(it.unit, l)}`].filter(Boolean).join(' + ') || `0 ${plural(it.unit, 0)}`;
}

// ---------- data hook ----------
export function useData(url, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!url) return;
    api.get(url).then(d => { setData(d); setError(null); }).catch(e => setError(e.message));
  }, [url]);
  useEffect(() => { load(); }, [load, ...deps]);
  return [data, load, error];
}

// ---------- toast ----------
let pushToast = () => {};
export function toast(msg, err) { pushToast({ msg, err, id: Date.now() }); }
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => { pushToast = setT; }, []);
  useEffect(() => { if (t) { const h = setTimeout(() => setT(null), t.err ? 5000 : 3000); return () => clearTimeout(h); } }, [t]);
  return t ? <div className={'toast' + (t.err ? ' err' : '')} role="status">{t.err ? '⚠ ' : '✓ '}{t.msg}</div> : null;
}
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, true); throw e; }
}

// ---------- components ----------
export function Modal({ title, onClose, children, footer, wide, xl }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '') + (xl ? ' xl' : '')} role="dialog" aria-modal="true">
        <div className="mh"><h2>{title}</h2><button className="ghost right" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
export function Badge({ tone, children, title }) { return <span className={'badge ' + (tone || '')} title={title}>{children}</span>; }
export function Field({ label, children, span, hint }) {
  return <label className="f" style={span ? { gridColumn: `span ${span}` } : null}><span>{label}</span>{children}{hint && <small className="faint">{hint}</small>}</label>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.filter(Boolean).map(t => {
    const [k, l] = Array.isArray(t) ? t : [t, t];
    return <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>;
  })}</div>;
}
export function Empty({ children, icon = 'search' }) { return <div className="empty"><span className="empty-ic"><Icon name={icon} size={22} /></span><div>{children}</div></div>; }
export function Stat({ label, value, hint, tone, icon }) {
  return <div className="card stat">
    {icon && <span className="stat-ic"><Icon name={icon} size={18} /></span>}
    <span className="label">{label}</span><span className="value" style={tone ? { color: `var(--${tone})` } : null}>{value}</span>{hint && <span className="hint">{hint}</span>}
  </div>;
}
// Page header with icon and optional one-line guidance
export function PageHead({ icon, title, sub, children }) {
  return <div className="pagehead">
    {icon && <span className="page-ic"><Icon name={icon} size={22} /></span>}
    <div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
    {children && <div className="actions">{children}</div>}
  </div>;
}
// Dismissible how-to tip, remembered per tip
export function Tip({ id, children }) {
  const key = 'mc_tip_' + id;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  if (hidden) return null;
  return <div className="tip"><Icon name="info" size={16} /><div>{children}</div>
    <button className="ghost sm" onClick={() => { setHidden(true); try { localStorage.setItem(key, '1'); } catch {} }} aria-label="Hide tip">Got it</button></div>;
}

export const STATUS = {
  waiting_triage: ['Waiting triage', 'warn'], waiting_doctor: ['Waiting clinician', 'info'], in_lab: ['In lab', 'brand'],
  pharmacy: ['Pharmacy', 'brand'], billing: ['Cashier', 'warn'], admitted: ['Admitted', 'info'], closed: ['Done', 'good'],
  ordered: ['Ordered', 'warn'], collected: ['Sample taken', 'info'], sent_out: ['Sent out', 'info'], resulted: ['Resulted', 'brand'], validated: ['Validated', 'good'],
  pending: ['Pending', 'warn'], dispensed: ['Dispensed', 'good'], reported: ['Reported', 'good'],
  open: ['Open', 'warn'], paid: ['Paid', 'good'], credit: ['On credit', 'bad'],
  booked: ['Booked', 'info'], arrived: ['Arrived', 'good'], cancelled: ['Cancelled', ''], new: ['New', 'warn'],
  awaiting_review: ['Rx review', 'bad'], confirmed: ['Rx approved', 'info'], fulfilled: ['Fulfilled', 'good'], sent: ['Sent', 'info'], received: ['Received', 'good'],
  discharged: ['Discharged', 'good'], active: ['Active', 'info'],
};
export function StatusBadge({ s }) { const [l, t] = STATUS[s] || [s, '']; return <Badge tone={t}>{l}</Badge>; }
export const TRIAGE = {
  emergency: ['Emergency', 'bad', 'Treat immediately: airway, breathing, circulation, coma, convulsion, severe dehydration'],
  priority: ['Priority', 'warn', 'Seen next: very high fever, severe pain, pallor, young infant, trauma, pregnancy with danger signs'],
  queue: ['Queue', 'good', 'Stable: seen in turn'],
};
export function TriageBadge({ level }) { const [l, t, d] = TRIAGE[level] || TRIAGE.queue; return <Badge tone={t} title={d}>{l}</Badge>; }
export function FlagBadge({ flag }) {
  if (!flag) return null;
  const m = { N: ['Normal', 'good'], H: ['High', 'warn'], L: ['Low', 'warn'], HH: ['Critical high', 'bad'], LL: ['Critical low', 'bad'], A: ['Abnormal', 'bad'] };
  const [l, t] = m[flag] || [flag, ''];
  return <Badge tone={t}>{l}</Badge>;
}

const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  patients: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  queue: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  lab: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19l-6-10V3M7 14h10',
  imaging: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 12h8M12 8v8',
  pharmacy: 'M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7zM8.5 8.5l7 7',
  billing: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  wards: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9',
  maternity: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z',
  referrals: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  appointments: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  reports: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  branches: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  cash: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  heart: 'M22 12h-4l-3 9L9 3l-3 9H2',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  box: 'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  check: 'M20 6 9 17l-5-5',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
};
export function Icon({ name, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ''} /></svg>;
}
export function Logo({ size = 18 }) {
  return <div className="logo"><svg width={size} height={size} viewBox="0 0 32 32"><path d="M13 5h6v8h8v6h-8v8h-6v-8H5v-6h8z" fill="white" /></svg></div>;
}

// Picks a patient by search; used in many places
export function PatientPicker({ onPick, placeholder = 'Search patient by name, phone, MRN or ID number' }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    if (q.length < 2) { setList([]); return; }
    const h = setTimeout(() => api.get('/patients?q=' + encodeURIComponent(q)).then(setList).catch(() => {}), 200);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} autoFocus />
      {q.length >= 2 && <div className="dropdown">
        {list.map(p => <button type="button" key={p.id} className="dd-item" onClick={() => { onPick(p); setQ(''); setList([]); }}>
          <b>{p.first_name} {p.last_name}</b> <span className="faint small">{p.mrn} · {p.sex} · {age(p.dob)} · {p.phone}</span>
        </button>)}
        {!list.length && <div className="dd-item faint">No match. Register the patient first.</div>}
      </div>}
    </div>
  );
}
