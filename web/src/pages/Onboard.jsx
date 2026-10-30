import React, { useState } from 'react';
import { api } from '../api';
import { Field, Logo, Icon, act } from '../ui';

export const TYPE_ART = {
  pharmacy: { color: '#0f766e', bg: '#ccfbf1', icon: 'pharmacy', text: 'Retail pharmacy. Optional lab, outside tests and scans, minor procedures.' },
  clinic: { color: '#7c3aed', bg: '#ede9fe', icon: 'heart', text: 'Outpatient care, lab, maternity and a few inpatient beds.' },
  hospital: { color: '#1d4ed8', bg: '#dbeafe', icon: 'wards', text: 'Wards, theatre, imaging, maternity and every department.' },
};
const LAB = [['inhouse', 'Own lab'], ['outsourced', 'Send tests out'], ['both', 'Both'], ['none', 'No lab']];
const IMG = [['inhouse', 'Own imaging'], ['outsourced', 'Send out for scans'], ['none', 'None']];

export function Seg({ value, options, onChange }) {
  return <div className="seg">{options.map(([v, l]) => <button type="button" key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
export function TypeCards({ value, onPick }) {
  return <div className="grid g3">{Object.entries(TYPE_ART).map(([k, a]) =>
    <button key={k} type="button" className={'choice typecard' + (value === k ? ' on' : '')} onClick={() => onPick(k)} style={value === k ? { borderColor: a.color } : null}>
      <div className="ill" style={{ background: a.bg, color: a.color }}><Icon name={a.icon} size={34} /></div>
      <b>{k[0].toUpperCase() + k.slice(1)}</b><span className="muted small">{a.text}</span>
    </button>)}</div>;
}
// Module switches for a facility type (used in onboarding, new branch and settings)
export function ModuleOptions({ type, o, set }) {
  return <div className="stack">
    <div className="row"><span className="small muted" style={{ width: 150 }}>Laboratory</span><Seg value={o.lab} options={LAB} onChange={v => set('lab', v)} /></div>
    <div className="row"><span className="small muted" style={{ width: 150 }}>Scans and X-rays</span><Seg value={o.imaging} options={IMG} onChange={v => set('imaging', v)} /></div>
    <div className="row" style={{ gap: 18 }}>
      <label className="check"><input type="checkbox" checked={o.consultation !== false} onChange={e => set('consultation', e.target.checked)} />Consultations and triage</label>
      <label className="check"><input type="checkbox" checked={!!o.procedures} onChange={e => set('procedures', e.target.checked)} />Minor procedures (e.g. circumcision, dressing)</label>
      {type !== 'pharmacy' && <label className="check"><input type="checkbox" checked={!!o.maternity} onChange={e => set('maternity', e.target.checked)} />Maternity (ANC, delivery, PNC)</label>}
      {type !== 'pharmacy' && <label className="check"><input type="checkbox" checked={!!o.admissions} onChange={e => set('admissions', e.target.checked)} />Admissions</label>}
      {type === 'hospital' && <label className="check"><input type="checkbox" checked={!!o.theatre} onChange={e => set('theatre', e.target.checked)} />Theatre</label>}
    </div>
    {o.admissions && type !== 'pharmacy' && <div className="row"><span className="small muted" style={{ width: 150 }}>Number of beds</span><input type="number" min="1" max="500" value={o.beds || 20} onChange={e => set('beds', Number(e.target.value))} style={{ width: 110 }} /></div>}
    <div className="row"><span className="small muted" style={{ width: 150 }}>Billing</span><Seg value={o.billing_mode} options={[['auto', 'Automatic'], ['manual', 'Manual']]} onChange={v => set('billing_mode', v)} />
      <span className="faint small">{o.billing_mode === 'auto' ? 'Charges post as services are given.' : 'The cashier builds each bill.'}</span></div>
  </div>;
}

export default function Onboard({ types, first, asSuper, onDone, onCancel }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState(null);
  const [o, setO] = useState({});
  const [d, setD] = useState({ location: 'Nairobi' });
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const setOpt = (k, v) => setO(x => ({ ...x, [k]: v }));
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  const pickType = t => { setType(t); setO({ ...types[t].defaults }); setStep(1); };
  const detailsOk = d.facility_name && d.owner_name && d.phone && /^\d{4,8}$/.test(d.admin_pin || '') && d.admin_pin === d.pin2;
  const create = async () => {
    setBusy(true);
    try {
      const r = await act(() => api.post('/onboard', { ...d, type, sample, options: { ...o, tagline: types[type].defaults.tagline } }), 'Facility created');
      onDone(r);
    } finally { setBusy(false); }
  };
  const art = type && TYPE_ART[type];
  return (
    <div className="setup" style={art ? { '--brand': art.color } : null}>
      <div className="box">
        <div className="row" style={{ marginBottom: 18 }}><Logo size={20} /><div><h1>{first ? 'Welcome to Pentarch MediCore' : 'Set up a new facility'}</h1>
          <span className="muted">Four short steps. Everything can be changed later in Settings.</span></div>
          {onCancel && <button className="right" onClick={onCancel}>Cancel</button>}</div>
        <div className="steps">{[0, 1, 2, 3].map(i => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
        <div className="card stack">
          {step === 0 && <>
            <h2>What type of establishment is it?</h2>
            <TypeCards value={type} onPick={pickType} />
          </>}
          {step === 1 && <>
            <h2>Which services do you offer?</h2>
            <p className="muted">Pre-filled from our sample <b>{types[type].sample}</b>. Untick anything you don't offer.</p>
            <ModuleOptions type={type} o={o} set={setOpt} />
            <div className="row mt"><button onClick={() => setStep(0)}>Back</button><button className="primary" onClick={() => setStep(2)}>Continue</button></div>
          </>}
          {step === 2 && <>
            <h2>{asSuper ? 'Facility and owner details' : 'Your details'}</h2>
            <div className="fields">
              <Field label="Facility name *"><input value={d.facility_name || ''} onChange={e => set('facility_name', e.target.value)} placeholder={type === 'pharmacy' ? 'e.g. Afya Bora Pharmacy' : 'e.g. Neema Medical Clinic'} autoFocus /></Field>
              <Field label="Owner / manager name *"><input value={d.owner_name || ''} onChange={e => set('owner_name', e.target.value)} /></Field>
              <Field label="Phone *"><input value={d.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="07XX XXX XXX" /></Field>
              <Field label="Email"><input type="email" value={d.email || ''} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Town / location"><input value={d.location || ''} onChange={e => set('location', e.target.value)} /></Field>
            </div>
            <h3 className="mt">Administrator sign-in</h3>
            <div className="fields">
              <Field label="Username" hint="Leave blank to use the facility name"><input value={d.admin_username || ''} onChange={e => set('admin_username', e.target.value.toLowerCase().replace(/\s/g, ''))} autoCapitalize="none" /></Field>
              <Field label="PIN (4–8 digits) *"><input type="password" inputMode="numeric" value={d.admin_pin || ''} onChange={e => set('admin_pin', e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Repeat PIN *"><input type="password" inputMode="numeric" value={d.pin2 || ''} onChange={e => set('pin2', e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            {d.pin2 && d.admin_pin !== d.pin2 && <div className="alert warn small">The PINs do not match.</div>}
            <div className="row mt"><button onClick={() => setStep(1)}>Back</button><button className="primary" disabled={!detailsOk} onClick={() => setStep(3)}>Continue</button></div>
          </>}
          {step === 3 && <>
            <h2>How do you want to start?</h2>
            <div className="grid g2">
              <button className={'choice' + (sample ? ' on' : '')} onClick={() => setSample(true)}><b>With sample data</b>
                <span className="muted small">40+ patients, stock, lab results, sales and staff accounts (PIN 1234). Best for demos and staff training. Remove it any time in Settings → Data.</span></button>
              <button className={'choice' + (!sample ? ' on' : '')} onClick={() => setSample(false)}><b>Empty, ready for real use</b>
                <span className="muted small">The full medicine catalogue, lab menu and price list are loaded with zero stock. You add patients and receive stock.</span></button>
            </div>
            <div className="row mt"><button onClick={() => setStep(2)}>Back</button><button className="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create facility'}</button></div>
          </>}
        </div>
      </div>
    </div>
  );
}
