import React, { useContext, useState } from 'react';
import { api } from '../api';
import { ConfigContext } from '../App';
import { useData, Modal, Field, StatusBadge, Badge, act, fmtDT, Empty } from '../ui';

export default function Imaging() {
  const c = useContext(ConfigContext);
  const [list, reload] = useData('/imaging/orders');
  const [open, setOpen] = useState(null);
  const [rep, setRep] = useState('');
  const save = async () => { await act(() => api.post(`/imaging/orders/${open.id}/report`, { report: rep }), 'Report saved'); setOpen(null); setRep(''); reload(); };
  return (
    <div className="page">
      <div className="pagehead"><div><h1>Imaging</h1><p className="sub">{c.imaging === 'outsourced' ? 'Scans and X-rays are done at partner centres; type in the report the patient brings back.' : 'In-house imaging worklist and reports.'}</p></div></div>
      <div className="tablewrap"><table className="table">
        <thead><tr><th>Requested</th><th>Patient</th><th>Study</th><th>Where</th><th>Status</th><th>Report</th><th /></tr></thead>
        <tbody>{(list || []).map(o => <tr key={o.id}><td className="small">{fmtDT(o.created_at)}</td><td><b>{o.pname}</b> <span className="faint small">{o.mrn}</span></td><td>{o.name}</td>
          <td>{o.mode === 'outsourced' ? <Badge tone="info">{o.partner}</Badge> : 'In-house'}</td><td><StatusBadge s={o.status} /></td>
          <td className="small" style={{ maxWidth: 320 }}>{o.report}</td>
          <td>{o.status !== 'reported' && <button className="sm primary" onClick={() => { setOpen(o); setRep(''); }}>Enter report</button>}</td></tr>)}</tbody>
      </table>{list && !list.length && <Empty>No imaging requests yet. Request one from a visit's Orders tab.</Empty>}</div>
      {open && <Modal title={`${open.name} · ${open.pname}`} onClose={() => setOpen(null)} footer={<><button onClick={() => setOpen(null)}>Cancel</button><button className="primary" disabled={!rep} onClick={save}>Save report</button></>}>
        {open.report && <p className="small muted" style={{ marginBottom: 10 }}>{open.report}</p>}
        <Field label="Findings and impression"><textarea style={{ minHeight: 160 }} value={rep} onChange={e => setRep(e.target.value)} placeholder="e.g. Single live intrauterine fetus, cephalic presentation, gestation by biometry 28 weeks…" /></Field>
      </Modal>}
    </div>
  );
}
