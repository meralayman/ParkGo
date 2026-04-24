/**
 * API origin only (no auth helpers) — avoids circular imports between apiBase and authFetch.
 *
 * When you open the app from a phone via http://192.168.x.x:3000, API calls must use the same
 * host (e.g. http://192.168.x.x:5000), not http://127.0.0.1:5000 — on the phone, localhost is the phone.
 *
 * When you open via HTTPS (e.g. ngrok), never use http://same-host:5000 — tunnels usually forward
 * one port only, and HTTPS pages cannot call plain http:// APIs (mixed content).
 */

function envPointsToLocalDevApi(u) {
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(u || "").trim()) ||
    String(u || "").trim() === ""
  );
}

function isNgrokStyleHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return h.includes("ngrok") || h.endsWith(".trycloudflare.com") || h.includes("localhost.run");
}

function getApiBase() {
  const raw = process.env.REACT_APP_API_BASE_URL;
  const fromEnv = raw != null && String(raw).trim() !== "";
  let u = fromEnv ? String(raw).trim().replace(/\/$/, "") : "";

  if (fromEnv && process.env.NODE_ENV === "development" && /:(3000|3001)(\/|$)/.test(u)) {
    u = "http://127.0.0.1:5000";
  }

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const h = window.location.hostname;
    const isHttpsPage = window.location.protocol === "https:";
    const skipLanHttpOverride = isHttpsPage || isNgrokStyleHost(h);
    const pageIsLocalhost = h === "localhost" || h === "127.0.0.1";

    // On local frontend dev (http://localhost:3000), prefer local backend even if
    // .env still contains an old public tunnel URL from a previous session.
    if (pageIsLocalhost && /^https?:\/\//i.test(u) && !envPointsToLocalDevApi(u)) {
      return "http://127.0.0.1:5000";
    }

    if (h && h !== "localhost" && h !== "127.0.0.1" && !skipLanHttpOverride) {
      const allowLanOverride = !fromEnv || envPointsToLocalDevApi(u);
      if (allowLanOverride) {
        return `http://${h}:5000`;
      }
    }
  }

  if (fromEnv && u) return u;
  return "http://127.0.0.1:5000";
}

export const API_BASE = getApiBase();

/**
 * User-facing hint when fetch fails (login, etc.).
 * HTTPS frontends (ngrok) cannot use http://localhost:5000 — mixed content.
 */
export function unreachableBackendHint() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const base = API_BASE || "";
    if (/^http:\/\/(localhost|127\.0\.0\.1)/i.test(base)) {
      return (
        "This page is HTTPS but the API is set to http://localhost — browsers block that (mixed content). " +
        "Run ngrok (or similar) on port 5000 for the backend, then set REACT_APP_API_BASE_URL to that https URL " +
        "in .env and restart npm start."
      );
    }
    if (/^http:\/\//i.test(base)) {
      return (
        "HTTPS pages cannot call an http:// API (mixed content). Use an HTTPS URL for " +
        "REACT_APP_API_BASE_URL (second tunnel to port 5000), restart npm start."
      );
    }
    return (
      "Cannot reach the API. Check that the backend tunnel is running and REACT_APP_API_BASE_URL matches it."
    );
  }
  const localFallback = "http://127.0.0.1:5000";
  const target = API_BASE || localFallback;
  return (
    `Cannot reach the server. Make sure the backend is running on ${target}. ` +
    "Start it with: cd backend && npm install && node server.js"
  );
}
