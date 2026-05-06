import axios from 'axios';
import { getApiBaseUrl } from '../utils/config';
import { tokenStorage } from './tokenStorage';

const baseURL = getApiBaseUrl();

const plain = axios.create({ baseURL, timeout: 20000 });

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

let refreshInFlight = null;

async function refreshTokenPair() {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  const res = await plain.post('/auth/refresh', { refreshToken });
  if (!res?.data?.ok) return null;
  const next = {
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken,
    user: res.data.user || null,
  };
  if (!next.accessToken || !next.refreshToken) return null;
  await tokenStorage.setSession(next);
  return next;
}

api.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Friendly network errors for UI (timeouts / offline / DNS)
    if (error?.code === 'ECONNABORTED') {
      const e = new Error(
        `Request timed out. Check API base URL in mobile-app/.env.\n\nCurrent: ${baseURL}\n\nIf you're on a real phone, use your PC LAN IP (e.g. http://192.168.x.x:5000), not 10.0.2.2.`
      );
      e.code = 'NETWORK_TIMEOUT';
      throw e;
    }
    if (!error?.response) {
      const e = new Error(
        `Cannot reach the server.\n\nCurrent API: ${baseURL}\n\nMake sure backend is running and the phone/emulator can reach it.`
      );
      e.code = 'NETWORK_ERROR';
      throw e;
    }

    const original = error?.config;
    const status = error?.response?.status;
    const reqUrl = String(original?.url || '');

    /**
     * Gate preview returns HTTP 401 when the *booking* JWT is expired or invalid.
     * That must not trigger access-token refresh (wrong flow; hides the real message).
     */
    if (status === 401 && reqUrl.includes('/gate/qr/preview')) {
      const data = error?.response?.data;
      const msg =
        data?.error ||
        data?.message ||
        'Booking QR was rejected. It may be expired — open My QR and refresh, or book again.';
      const e = new Error(msg);
      if (data?.code) e.code = data.code;
      e.status = 401;
      throw e;
    }

    // Rate limit: bubble up cleanly for UI
    if (status === 429) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Too many requests. Please wait and try again.';
      const e = new Error(msg);
      e.code = 'RATE_LIMIT';
      e.status = 429;
      throw e;
    }

    if (status !== 401 || !original || original._retry) {
      throw error;
    }

    // Avoid trying to refresh when refresh itself failed
    if (String(original.url || '').includes('/auth/refresh')) {
      throw error;
    }

    original._retry = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshTokenPair().finally(() => {
          refreshInFlight = null;
        });
      }
      const next = await refreshInFlight;
      if (!next?.accessToken) {
        const e = new Error('Session expired. Please log in again.');
        e.code = 'AUTH_EXPIRED';
        e.status = 401;
        throw e;
      }
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${next.accessToken}`;
      return await api.request(original);
    } catch (e) {
      throw e;
    }
  }
);

