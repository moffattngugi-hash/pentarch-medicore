import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api';

// ---------- formatting ----------
export const money = n => 'KES ' + Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
export const fmtDate = d => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const fmtTime = d => d ? new Date(d).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtDT = d => d ? `${fmtDate(d)} ${fmtTime(d)}` : '';
export function age(dob, at = new Date()) {
  if (!dob) return '';
  const ms = new Date(at) - new Date(dob);
  const y = ms / (365.25 * 864e5);
  if (y < 1) return Math.max(0, Math.floor(y * 12)) + ' mo';
  if (y < 5) return Math.floor(y) + ' y ' + Math.floor((y % 1) * 12) + ' mo';
  return Math.floor(y) + ' y';
}
export const todayISO = () => new Date().toISOString().slice(0, 10);

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
  useEffect(() => { if (t) { const h = setTimeout(() => setT(null), 3200); return () => clearTimeout(h); } }, [t]);
  return t ? <div className={'toast' + (t.err ? ' err' : '')}>{t.msg}</div> : null;
}
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, true); throw e; }
}

// ---------- components ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="mh"><h2>{title}</h2><button className="ghost right" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
export function Badge({ tone, children }) { return <span className={'badge ' + (tone || '')}>{children}</span>; }
export function Field({ label, children, span }) {
  return <label className="f" style={span ? { gridColumn: `span ${span}` } : null}><span>{label}</span>{children}</label>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs">{tabs.filter(Boolean).map(t => {
    const [k, l] = Array.isArray(t) ? t : [t, t];
    return <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>;
  })}</div>;
}
export function Empty({ children }) { return <div className="empty">{children}</div>; }
export function Stat({ label, value, hint, tone }) {
  return <div className="card stat"><span className="label">{label}</span><span className="value" style={tone ? { color: `var(--${tone})` } : null}>{value}</span>{hint && <span className="hint">{hint}</span>}</div>;
}

export const STATUS = {
  waiting_triage: ['Waiting triage', 'warn'], waiting_doctor: ['Waiting clinician', 'info'], in_lab: ['In lab', 'brand'],
  pharmacy: ['Pharmacy', 'brand'], billing: ['Cashier', 'warn'], admitted: ['Admitted', 'info'], closed: ['Done', 'good'],
  ordered: ['Ordered', 'warn'], collected: ['Sample taken', 'info'], sent_out: ['Sent out', 'info'], resulted: ['Resulted', 'brand'], validated: ['Validated', 'good'],
  pending: ['Pending', 'warn'], dispensed: ['Dispensed', 'good'], reported: ['Reported', 'good'],
  open: ['Open', 'warn'], paid: ['Paid', 'good'], credit: ['On credit', 'bad'],
  booked: ['Booked', 'info'], arrived: ['Arrived', 'good'], cancelled: ['Cancelled', ''], new: ['New', 'warn'],
  awaiting_review: ['Rx review', 'bad'], confirmed: ['Rx approved', 'info'], discharged: ['Discharged', 'good'], active: ['Active', 'info'], fulfilled: ['Fulfilled', 'good'], sent: ['Sent', 'info'], received: ['Received', 'good']
};
export function StatusBadge({ s }) { const [l, t] = STATUS[s] || [s, '']; return <Badge tone={t}>{l}</Badge>; }
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
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35'
};
export function Icon({ name, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ''} /></svg>;
}
export function Logo({ size = 18 }) {
  return <div className="logo"><svg width={size} height={size} viewBox="0 0 32 32"><path d="M13 5h6v8h8v6h-8v8h-6v-8H5v-6h8z" fill="white" /></svg></div>;
}

// Picks a patient by search; used in many places
export function PatientPicker({ onPick, placeholder = 'Search patient by name, phone, MRN or ID' }) {
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
      {list.length > 0 && <div className="card" style={{ position: 'absolute', zIndex: 10, left: 0, right: 0, padding: 4, maxHeight: 260, overflowY: 'auto' }}>
        {list.map(p => <div key={p.id} className="ticket" style={{ marginBottom: 2 }} onClick={() => { onPick(p); setQ(''); setList([]); }}>
          <b>{p.first_name} {p.last_name}</b> <span className="faint small">{p.mrn} · {p.sex} · {age(p.dob)} · {p.phone}</span>
        </div>)}
      </div>}
    </div>
  );
}
