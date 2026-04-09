/**
 * API origin for fetch calls.
 * - Set REACT_APP_API_BASE_URL in .env for production or custom backends (no trailing slash).
 * - In development, defaults to http://127.0.0.1:5000 so requests hit Express directly.
 *   (CRA's package.json "proxy" does not reliably forward multipart POST / FormData; that produced
 *   "Cannot POST /incidents" from the dev server. Backend uses cors() so the browser is allowed.)
 */
function getApiBase() {
  const v = process.env.REACT_APP_API_BASE_URL;
  if (v != null && String(v).trim() !== '') {
    let u = String(v).replace(/\/$/, '');
    // Misconfiguration: pointing the API at the CRA dev server causes "Cannot POST /incidents" (HTML error).
    if (process.env.NODE_ENV === 'development' && /:(3000|3001)(\/|$)/.test(u)) {
      u = 'http://127.0.0.1:5000';
    }
    return u;
  }
  return 'http://127.0.0.1:5000';
}

export const API_BASE = getApiBase();

/**
 * Absolute URL for an API path. Use for multipart (FormData) POSTs so they always reach Express
 * on port 5000 in local dev, even if API_BASE were mis-resolved.
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = String(API_BASE || '').replace(/\/$/, '');
  if (base && /^https?:\/\//i.test(base)) {
    return `${base}${p}`;
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      return `http://127.0.0.1:5000${p}`;
    }
  }
  return `http://127.0.0.1:5000${p}`;
}

/** User-facing hint when fetch fails (connection refused, DNS, etc.) */
export function apiUnreachableMessage() {
  if (API_BASE) {
    return `Cannot reach the API at ${API_BASE}. Start the backend or fix REACT_APP_API_BASE_URL.`;
  }
  return 'Cannot reach the API at http://127.0.0.1:5000. Start the backend (node server.js in /backend).';
}

/** Shown when API_BASE is empty in .env but we need to mention where the server should be */
export function apiBaseForErrors() {
  return API_BASE || 'http://127.0.0.1:5000';
}

/**
 * Fetch and parse JSON safely. Avoids "Unexpected token '<'" when the server returns HTML
 * (SPA index.html, Express 404 page, or proxy error page).
 * @param {string} pathname e.g. '/admin/analytics'
 */
export async function safeFetchJson(pathname) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `${apiUnreachableMessage()} (${e.message || 'network error'})`,
    };
  }
  const text = await res.text();
  if (!text || !text.trim()) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Empty response from API (${res.status}). ${apiUnreachableMessage()}`,
    };
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error:
        'The server returned a webpage instead of JSON. Usually this means the ParkGo backend is not running, is an old version without this API route, or the app is not pointed at the API. Start the backend (port 5000), restart it after updating, or set REACT_APP_API_BASE_URL in the frontend .env to your API base URL.',
    };
  }
  try {
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data, error: null };
  } catch (e) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Invalid JSON from API (${res.status}). ${e.message || 'parse error'}`,
    };
  }
}
