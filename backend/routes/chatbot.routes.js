const { optionalAuth } = require("../middleware/optionalAuth");
const { chatbotRateLimiter } = require("../middleware/rateLimits");
const { clientIp } = require("../auditLog");
const { processChatMessage } = require("../services/chatbot.service");
const { sanitizeUserText } = require("../utils/intentParser");

/**
 * @param {import("express").Express} app
 * @param {object} deps
 * @param {import("pg").Pool} deps.pool
 * @param {(err: Error) => string} deps.apiError
 * @param {function} deps.logAudit
 */
function registerChatbotRoutes(app, { pool, apiError, logAudit }) {
  const internalApiBase = (
    process.env.CHATBOT_INTERNAL_API_URL ||
    `http://127.0.0.1:${process.env.PORT || 5000}`
  ).replace(/\/$/, "");

  app.post(
    "/api/chatbot/message",
    chatbotRateLimiter,
    optionalAuth,
    async (req, res) => {
      try {
        const raw =
          req.body && typeof req.body.message === "string" ? req.body.message : "";
        const message = sanitizeUserText(raw);
        if (!message) {
          return res.status(400).json({
            ok: false,
            error: "Message is required.",
            code: "EMPTY_MESSAGE",
          });
        }

        let clientContext =
          req.body && typeof req.body.context === "object" && req.body.context !== null
            ? req.body.context
            : {};
        if (typeof clientContext !== "object" || Array.isArray(clientContext)) {
          clientContext = {};
        }

        const authHeader =
          req.headers.authorization &&
          String(req.headers.authorization).startsWith("Bearer ")
            ? req.headers.authorization
            : null;

        const out = await processChatMessage({
          pool,
          userId: req.authUserId || null,
          role: req.authRole || null,
          message,
          clientContext,
          authorizationHeader: authHeader,
          internalApiBase,
          logAudit,
          clientIp: clientIp(req),
        });

        return res.json({
          ok: true,
          reply: out.reply,
          quickReplies: out.quickReplies || [],
          context: out.context || {},
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: apiError(err) });
      }
    }
  );
}

module.exports = { registerChatbotRoutes };
