/**
 * Per-IP rate limits (express-rate-limit). Applied only to specific routes; everything else is unchanged.
 */
const rateLimit = require("express-rate-limit");

const json429 = (message) => (req, res) => {
  res.status(429).json({
    ok: false,
    error: message,
    code: "RATE_LIMIT",
  });
};

/** Brute-force protection: login attempts. */
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429(
    "Too many login attempts from this address. Please wait a minute and try again."
  ),
});

/** POST /reservations only — anti-spam (per IP). */
const bookingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429("Too many booking attempts"),
});

/** Core limiter for POST /gate/qr/preview (per IP). */
const _qrRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "test-ip",
  handler: (req, res) => {
    console.log("[ParkGo] qrRateLimiter: limit exceeded (429)", req.ip, req.path);
    json429("Too many QR scan attempts")(req, res);
  },
});

/**
 * POST /gate/qr/preview only — must run before the route handler.
 * [RateLimit] log runs first; then the core limiter uses the same req.ip (via keyGenerator fallback).
 */
const qrRateLimiter = (req, res, next) => {
  console.log("[RateLimit] IP:", req.ip);
  return _qrRateLimit(req, res, next);
};

module.exports = {
  loginRateLimiter,
  bookingRateLimiter,
  qrRateLimiter,
};
