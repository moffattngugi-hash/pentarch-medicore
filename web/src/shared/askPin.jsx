import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, Field } from '../ui';

// Ask for a supervisor (administrator) PIN in a proper dialog. Resolves with the PIN, or null if cancelled.
// Administrators approve their own actions, so they are not asked.
export function askSupervisor(user, why) {
  if (user && ['admin', 'superadmin'].includes(user.role)) return Promise.resolve('');
  return new Promise(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = v => { root.unmount(); host.remove(); resolve(v); };
    function Ask() {
      const [pin, setPin] = useState('');
      return <Modal title="Supervisor approval" onClose={() => done(null)} footer={<><button onClick={() => done(null)}>Cancel</button><button className="primary" disabled={pin.length < 4} onClick={() => done(pin)}>Approve</button></>}>
        <p className="muted">{why}. A supervisor (administrator) types their PIN to approve. It is recorded in the audit trail.</p>
        <Field label="Supervisor PIN"><input type="password" inputMode="numeric" autoFocus value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && pin.length >= 4 && done(pin)} /></Field>
      </Modal>;
    }
    root.render(<Ask />);
  });
}
