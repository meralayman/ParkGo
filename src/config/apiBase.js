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
