const { verifyAccessTokenResult } = require("../authTokens");
const { parseUserId } = require("../rbac");

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? String(m[1]).trim() : null;
}

/**
 * Sets req.authUserId / req.authRole when a valid Bearer token is present.
 * Invalid or missing token leaves both null (treat as logged out).
 */
function optionalAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    req.authUserId = null;
    req.authRole = null;
    return next();
  }
  const result = verifyAccessTokenResult(token);
  if (result.kind === "ok" && parseUserId(result.userId)) {
    req.authUserId = result.userId;
    req.authRole = String(result.role || "");
  } else {
    req.authUserId = null;
    req.authRole = null;
  }
  next();
}

module.exports = { optionalAuth, getBearerToken };
