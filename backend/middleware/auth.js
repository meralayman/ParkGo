/**
 * JWT and role guards — re-exported for a single import path in route modules.
 * Implementation lives in rbac.js (Bearer access token, role allow-list).
 */
const rbac = require("../rbac");

module.exports = {
  requireJwt: rbac.requireJwt,
  requireAnyAuth: rbac.requireAnyAuth,
  requireCustomer: rbac.requireCustomer,
  requireAdmin: rbac.requireAdmin,
  requireGatekeeper: rbac.requireGatekeeper,
  authorize: rbac.authorize,
  ROLES: rbac.ROLES,
  parseUserId: rbac.parseUserId,
};
