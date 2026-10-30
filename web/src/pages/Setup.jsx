import React, { useState } from 'react';
import { api } from '../api';
import { Field, Logo, act } from '../ui';

const TYPES = [
  ['pharmacy', 'Pharmacy', 'Retail pharmacy, optional lab, tests and minor procedures'],
  ['clinic', 'Clinic', 'Outpatient care, optional maternity and a small number of beds'],
  ['hospital', 'Hospital', 'Full inpatient care, wards, theatre, imaging']
];
const LAB = [['inhouse', 'In-house lab'], ['outsourced', 'Outsourced lab'], ['both', 'Both'], ['none', 'No lab']];
const IMG = [['inhouse', 'In-house imaging'], ['outsourced', 'Outsourced imaging'], ['none', 'No imaging']];

export default function Setup({ presets, current, onDone }) {
  const [preset, setPreset] = useState(current?.preset || 'spensa');
  const [c, setC] = useState({ ...(presets[current?.preset || 'spensa']), ...(current || {}) });
  const [busy, setBusy] = useState(false);
  const pick = k => { setPreset(k); setC({ ...presets[k] }); };
  const set = (k, v) => setC(x => ({ ...x, [k]: v }));
  const setType = t => setC(x => ({
    ...x, type: t,
    admissions: t === 'hospital' ? true : t === 'pharmacy' ? false : x.admissions,
    maternity: t === 'pharmacy' ? false : x.maternity,
    theatre: t === 'hospital' ? x.theatre : false
  }));
  const save = async () => {
    setBusy(true);
    try { await act(() => api.post('/setup', { preset, overrides: c }), 'Facility created with demo data'); onDone(); }
    finally { setBusy(false); }
  };
  const Opt = ({ k, opts }) => <div className="row">{opts.map(([v, l]) =>
    <button key={v} type="button" className={'choice' + (c[k] === v ? ' on' : '')} style={{ width: 'auto', padding: '8px 12px' }} onClick={() => set(k, v)}>{l}</button>)}</div>;

  return (
    <div className="setup">
      <div className="box">
        <div className="row" style={{ marginBottom: 18 }}><Logo size={20} /><div><h1>Pentarch MediCore setup</h1><span className="muted">Choose a demo facility, adjust it, and the system configures itself.</span></div></div>
        <div className="card stack">
          <h3>1. Start from a demo facility</h3>
          <div className="grid g3">
            {[['spensa', 'SPENSA Pharmacy', 'Pharmacy with lab, outsourced tests and scans, minor procedures'],
              ['topcare', 'TopCare Clinic', 'Maternity-focused clinic, in-house lab, 30 beds'],
              ['hospital', 'General hospital', 'All modules switched on, 60 beds']].map(([k, n, d]) =>
              <button key={k} className={'choice' + (preset === k ? ' on' : '')} onClick={() => pick(k)}><b>{n}</b><span className="muted small">{d}</span></button>)}
          </div>
          <h3 className="mt">2. Facility details</h3>
          <div className="fields">
            <Field label="Facility name"><input value={c.facility_name || ''} onChange={e => set('facility_name', e.target.value)} /></Field>
            <Field label="Tagline"><input value={c.tagline || ''} onChange={e => set('tagline', e.target.value)} /></Field>
            <Field label="Phone"><input value={c.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
            <Field label="Location"><input value={c.location || ''} onChange={e => set('location', e.target.value)} /></Field>
            <Field label="Brand colour"><input type="color" value={c.color || '#0f766e'} onChange={e => set('color', e.target.value)} style={{ height: 38, padding: 3 }} /></Field>
          </div>
          <h3 className="mt">3. Type of establishment</h3>
          <div className="grid g3">{TYPES.map(([k, n, d]) =>
            <button key={k} className={'choice' + (c.type === k ? ' on' : '')} onClick={() => setType(k)}><b>{n}</b><span className="muted small">{d}</span></button>)}</div>
          <h3 className="mt">4. Services</h3>
          <div className="stack">
            <div><div className="small muted" style={{ marginBottom: 6 }}>Laboratory</div><Opt k="lab" opts={LAB} /></div>
            <div><div className="small muted" style={{ marginBottom: 6 }}>Imaging (scans, X-ray)</div><Opt k="imaging" opts={IMG} /></div>
            <div className="row" style={{ gap: 20 }}>
              <label className="check"><input type="checkbox" checked={!!c.consultation} onChange={e => set('consultation', e.target.checked)} />Consultations</label>
              <label className="check"><input type="checkbox" checked={!!c.procedures} onChange={e => set('procedures', e.target.checked)} />Minor procedures</label>
              {c.type !== 'pharmacy' && <label className="check"><input type="checkbox" checked={!!c.maternity} onChange={e => set('maternity', e.target.checked)} />Maternity (ANC, delivery, PNC)</label>}
              {c.type !== 'pharmacy' && <label className="check"><input type="checkbox" checked={!!c.admissions} onChange={e => set('admissions', e.target.checked)} />Admissions</label>}
              {c.type === 'hospital' && <label className="check"><input type="checkbox" checked={!!c.theatre} onChange={e => set('theatre', e.target.checked)} />Theatre</label>}
            </div>
            {c.admissions && <Field label="Number of beds"><input type="number" min="1" max="500" value={c.beds || 30} onChange={e => set('beds', Number(e.target.value))} style={{ maxWidth: 140 }} /></Field>}
          </div>
          <h3 className="mt">5. Billing</h3>
          <Opt k="billing_mode" opts={[['auto', 'Automatic: charges post as services are given'], ['manual', 'Manual: cashier builds each bill']]} />
          <label className="check"><input type="checkbox" checked={!!c.auto_checkout} onChange={e => set('auto_checkout', e.target.checked)} />Automatic checkout: close the visit as soon as the bill is fully paid</label>
          {current && <div className="alert warn">Applying setup resets the demo database and reloads fresh sample data.</div>}
          <div className="row"><button className="primary" disabled={busy} onClick={save}>{busy ? 'Setting up…' : 'Create facility'}</button>
            {current && <a href="#/">Cancel</a>}</div>
        </div>
      </div>
    </div>
  );
}
