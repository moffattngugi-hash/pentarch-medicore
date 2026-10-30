// Fetch wrapper for the MediCore local server: carries the session token and the selected branch
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let session = store.get('mc_session'); // { token, user, org, branches }
let branchId = store.get('mc_branch');
let onExpired = () => {};

export const getSession = () => session;
export const getBranchId = () => branchId;
export function setSession(s) { session = s; store.set('mc_session', s); if (!s) setBranch(null); }
export function setBranch(id) { branchId = id; store.set('mc_branch', id); }
export function onSessionExpired(fn) { onExpired = fn; }

async function call(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-token': session?.token || '', 'x-branch': branchId || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session && url !== '/login') { setSession(null); onExpired(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export const api = {
  get: url => call('GET', url),
  post: (url, body) => call('POST', url, body || {}),
  put: (url, body) => call('PUT', url, body || {}),
  del: (url, body) => call('DELETE', url, body || {}),
};
