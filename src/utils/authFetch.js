import { API_BASE } from '../config/apiOrigin';
import { apiUnreachableMessage } from '../config/apiBase';

/** Primary storage key for the JWT access token (DevTools → Application → Local Storage). */
export const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';
/** Primary storage key for the opaque refresh token. */
export const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';

/** @deprecated use ACCESS_TOKEN_STORAGE_KEY */
export const STORAGE_ACCESS = ACCESS_TOKEN_STORAGE_KEY;
/** @deprecated use REFRESH_TOKEN_STORAGE_KEY */
export const STORAGE_REFRESH = REFRESH_TOKEN_STORAGE_KEY;
export const STORAGE_USER = 'parkgo_user';

const LEGACY_ACCESS = 'parkgo_access_token';
const LEGACY_REFRESH = 'parkgo_refresh_token';

/** ngrok free tier: avoids the browser warning HTML on API requests when using fetch/XHR */
function applyNgrokBypass(headers, url) {
  const h = headers instanceof Headers ? new Headers(headers) : new Headers(headers || {});
  if (/ngrok/i.test(String(url))) {
    h.set('ngrok-skip-browser-warning', '69420');
  }
  return h;
}

/**
 * Unauthenticated fetch (e.g. login, register, public GETs). Does not add Authorization.
 * Same as fetch; adds ngrok bypass when calling *.ngrok* URLs.
 */
export function parkgoFetch(url, init = {}) {
  const headers = applyNgrokBypass(init.headers || {}, url);
  return fetch(url, { ...init, headers });
}

let refreshInFlight = null;

/**
 * @returns {string | null} access token, or null if not logged in
 */
export function getStoredAccessToken() {
  try {
    return (
      localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || localStorage.getItem(LEGACY_ACCESS)
    );
  } catch {
    return null;
  }
}

export function getStoredRefreshToken() {
  try {
    return (
      localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) || localStorage.getItem(LEGACY_REFRESH)
    );
  } catch {
    return null;
  }
}

/**
 * Saves session after login / refresh. Uses keys `accessToken` and `refreshToken`.
 * @param {{ accessToken?: string, refreshToken?: string, user?: object }} param0
 */
export function persistSession({ accessToken, refreshToken, user }) {
  try {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
      try {
        localStorage.removeItem(LEGACY_ACCESS);
      } catch {
        /* ignore */
      }
    }
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
      try {
        localStorage.removeItem(LEGACY_REFRESH);
      } catch {
        /* ignore */
      }
    }
    if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearSessionStorage() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_ACCESS);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_REFRESH);
    localStorage.removeItem(STORAGE_USER);
  } catch {
    /* ignore */
  }
}

async function refreshTokens() {
  const refresh = getStoredRefreshToken();
  if (!refresh) {
    clearSessionStorage();
    return null;
  }
  const refreshUrl = `${API_BASE}/auth/refresh`;
  const res = await parkgoFetch(refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.accessToken || !data.refreshToken) {
    clearSessionStorage();
    return null;
  }
  persistSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  });
  try {
    window.dispatchEvent(new CustomEvent('parkgo-auth-refresh', { detail: data.user }));
  } catch {
    /* ignore */
  }
  return data.accessToken;
}

/**
 * Like fetch, but if `localStorage.accessToken` (or legacy key) is set, sends
 *   Authorization: Bearer <token>
 * and on 401 attempts one refresh, then retries. Omits Authorization when there is no token.
 * Do not use for /auth/login, /auth/signup, /auth/register, or /auth/google — use `parkgoFetch` or plain `fetch` there.
 */
export async function fetchWithAuth(url, init = {}) {
  const { headers: rawHeaders, ...restInit } = init;

  const buildHeaders = (token) => {
    let headers =
      rawHeaders instanceof Headers ? new Headers(rawHeaders) : new Headers(rawHeaders || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers = applyNgrokBypass(headers, url);
    const isFormData = typeof FormData !== 'undefined' && restInit.body instanceof FormData;
    if (
      !isFormData &&
      restInit.body != null &&
      typeof restInit.body === 'string' &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  let access = getStoredAccessToken();
  let res = await fetch(url, { ...restInit, headers: buildHeaders(access) });

  if (res.status === 401) {
    if (!refreshInFlight) {
      refreshInFlight = refreshTokens().finally(() => {
        refreshInFlight = null;
      });
    }
    const newAccess = await refreshInFlight;
    if (newAccess) {
      res = await fetch(url, { ...restInit, headers: buildHeaders(newAccess) });
    }
  }

  return res;
}

/** Alias for teams that name the wrapper `authFetch`. */
export const authFetch = fetchWithAuth;

/**
 * JSON GET like apiBase `safeFetchJson` but with Bearer + refresh. Use for /admin/*.
 * @param {string} pathname e.g. '/admin/analytics'
 */
export async function safeAdminFetchJson(pathname) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetchWithAuth(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `${apiUnreachableMessage()} (${e?.message || 'network error'})`,
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
        'The server returned a webpage instead of JSON. Check that the backend is running and REACT_APP_API_BASE_URL.',
    };
  }
  try {
    const data = JSON.parse(text);
    if (res.status === 401 || res.status === 403) {
      const msg =
        (data && typeof data === 'object' && (data.error || data.message)) ||
        (res.status === 403 ? 'Not allowed' : 'Unauthorized');
      return { ok: false, status: res.status, data, error: String(msg) };
    }
    return { ok: res.ok, status: res.status, data, error: null };
  } catch (e) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `Invalid JSON from API (${res.status}). ${e?.message || 'parse error'}`,
    };
  }
}
