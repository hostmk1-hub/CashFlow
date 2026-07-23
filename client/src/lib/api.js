// Thin fetch wrapper. Token + active tenant live in localStorage; every
// request carries the JWT and (when known) an X-Tenant-Id header.
const TOKEN_KEY = 'finance.token';
const TENANT_KEY = 'finance.tenantId';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set token(v) {
    v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY);
  },
  get tenantId() {
    return localStorage.getItem(TENANT_KEY);
  },
  set tenantId(v) {
    v ? localStorage.setItem(TENANT_KEY, v) : localStorage.removeItem(TENANT_KEY);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
  },
};

async function request(method, path, body, isForm = false) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.tenantId) headers['X-Tenant-Id'] = auth.tenantId;
  let payload;
  if (isForm) {
    payload = body; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch (e) {
    // Network-level failure (connection dropped, request too large, timeout).
    const err = new Error(
      isForm
        ? 'Upload failed — the connection dropped or the file is too large. Try again, or use a smaller/clearer photo.'
        : 'Network error — check your connection and try again.',
    );
    err.status = 0;
    err.cause = e;
    throw err;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text?.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

// Authenticated file download → triggers a browser save of the returned blob.
async function download(path, filename) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.tenantId) headers['X-Tenant-Id'] = auth.tenantId;
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Fetch an authenticated file and open it in a new browser tab (for viewing a
// proof/receipt inline instead of forcing a download).
async function openFile(path) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.tenantId) headers['X-Tenant-Id'] = auth.tenantId;
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new Error(`Could not open file (${res.status})`);
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, formData) => request('POST', p, formData, true),
  download,
  openFile,
};
