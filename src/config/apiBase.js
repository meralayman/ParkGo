/**
 * API origin for fetch calls.
 * - Set REACT_APP_API_BASE_URL in .env for production or custom backends (no trailing slash).
 * - In development, defaults to '' so requests are same-origin and CRA's package.json "proxy"
 *   forwards them to the backend (avoids CORS and some localhost IPv4/IPv6 issues).
 */
function getApiBase() {
  const v = process.env.REACT_APP_API_BASE_URL;
  if (v != null && String(v).trim() !== '') {
    return String(v).replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return '';
  }
  return 'http://127.0.0.1:5000';
}

export const API_BASE = getApiBase();

/** User-facing hint when fetch fails (connection refused, DNS, etc.) */
export function apiUnreachableMessage() {
  if (API_BASE) {
    return `Cannot reach the API at ${API_BASE}. Start the backend or fix REACT_APP_API_BASE_URL.`;
  }
  return 'Cannot reach the API. Start the backend on port 5000 (CRA dev proxy forwards requests to it).';
}

/** Shown when API_BASE is relative (dev) but we need to mention where the server should be */
export function apiBaseForErrors() {
  return API_BASE || 'http://127.0.0.1:5000 (dev proxy)';
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
