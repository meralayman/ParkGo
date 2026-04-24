const { createAuthController } = require("../controllers/authController");
const { requireAnyAuth } = require("../middleware/auth");
const { loginRateLimiter } = require("../middleware/rateLimits");

/**
 * @param {import("express").Express} app
 * @param {object} deps
 * @param {import("pg").Pool} deps.pool
 * @param {(err: Error) => string} deps.apiError
 * @param {function} [deps.logAudit] — see auditLog.logAudit
 */
function registerAuthRoutes(app, { pool, apiError, logAudit }) {
  const c = createAuthController({ pool, apiError, logAudit });

  app.post("/auth/signup", c.signup);
  app.post("/auth/register", c.register);
  app.post("/auth/login", loginRateLimiter, c.login);
  app.post("/auth/refresh", c.refresh);
  app.post("/auth/logout", requireAnyAuth, c.logout);
  app.get("/auth/me", requireAnyAuth, c.me);
  app.post("/auth/google", c.google);
}

module.exports = { registerAuthRoutes };
