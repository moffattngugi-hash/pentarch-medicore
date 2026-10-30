// Small fetch wrapper for the MediCore local server
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('mc_user') || 'null'); } catch { currentUser = null; }

export function getUser() { return currentUser; }
export function setUser(u) {
  currentUser = u;
  try { u ? localStorage.setItem('mc_user', JSON.stringify(u)) : localStorage.removeItem('mc_user'); } catch {}
}

async function call(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user': currentUser?.name || 'system',
      'x-role': currentUser?.role || ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: url => call('GET', url),
  post: (url, body) => call('POST', url, body || {}),
  put: (url, body) => call('PUT', url, body || {}),
  del: (url, body) => call('DELETE', url, body || {})
};
