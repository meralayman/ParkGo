/**
 * Role-Based Access Control — roles are stored on `users.role` and embedded in JWT access tokens.
 *
 * Roles: user (customer), admin, gatekeeper.
 * - Customer APIs (bookings, Paymob, user incidents): user + admin only.
 * - Admin APIs: admin only.
 * - Gate APIs + gatekeeper incidents: gatekeeper only.
 * - Profile (/auth/me): any authenticated role.
 */

const { verifyAccessTokenResult } = require("./authTokens");

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? String(m[1]).trim() : null;
}

function sendAuth401(res, message) {
  return res.status(401).json({ ok: false, message, error: message });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUserId(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().replace(/^\{|\}$/g, "");
  if (s === "") return null;
  return UUID_RE.test(s) ? s : null;
}

const ROLES = {
  USER: "user",
  ADMIN: "admin",
  GATEKEEPER: "gatekeeper",
};

/**
 * @param {...string} allowedRoles — one or more of ROLES.* (caller passes ROLES.USER, etc.)
 */
function authorize(...allowedRoles) {
  const allowed = allowedRoles.map((r) => String(r).toLowerCase());
  return function rbacMiddleware(req, res, next) {
    const token = getBearerToken(req);
    if (token == null) {
      return sendAuth401(res, "Access token required");
    }
    const result = verifyAccessTokenResult(token);
    if (result.kind === "expired") {
      return sendAuth401(res, "Token expired");
    }
    if (result.kind !== "ok" || !parseUserId(result.userId)) {
      return sendAuth401(res, "Invalid token");
    }
    const role = String(result.role || "").toLowerCase();
    if (!allowed.includes(role)) {
      const msg = "You do not have permission to access this resource";
      return res.status(403).json({ ok: false, message: msg, error: msg });
    }
    req.authUserId = result.userId;
    req.authRole = result.role;
    next();
  };
}

/** Any valid JWT (user, admin, or gatekeeper). */
const requireAnyAuth = authorize(ROLES.USER, ROLES.ADMIN, ROLES.GATEKEEPER);

/** Customer-facing APIs — not gatekeeper. */
const requireCustomer = authorize(ROLES.USER, ROLES.ADMIN);

const requireAdmin = authorize(ROLES.ADMIN);

const requireGatekeeper = authorize(ROLES.GATEKEEPER);

/** Same as `requireAnyAuth` — any valid access JWT (verifies token only, all roles). */
const requireJwt = requireAnyAuth;

module.exports = {
  ROLES,
  parseUserId,
  authorize,
  requireAnyAuth,
  requireJwt,
  requireCustomer,
  requireAdmin,
  requireGatekeeper,
};
