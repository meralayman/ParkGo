require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { requireAdmin } = require("./middleware/auth");
const { bookingRateLimiter, qrRateLimiter } = require("./middleware/rateLimits");
const {
  buildBookingQrJwtForRow,
  computeQrExpiresAt,
  resolveQrExpiresAt,
  signReservationQrJwt,
  verifyBookingQrDetailed,
  ensureBookingQrColumns,
} = require("./qrJwt");
const { computeQuote, ensureDynamicHourlyRateColumn } = require("./smartParking");
const { logAudit, ensureAuditLogsTable, clientIp } = require("./auditLog");

const app = express();
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}
app.use(cors());
app.use(express.json());

const incidentUploadDir = path.join(__dirname, "uploads", "incidents");
if (!fs.existsSync(incidentUploadDir)) {
  fs.mkdirSync(incidentUploadDir, { recursive: true });
}
app.use("/uploads/incidents", express.static(incidentUploadDir));

const incidentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, incidentUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const uploadIncidentPhoto = multer({
  storage: incidentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only JPEG, PNG, GIF, or WebP images are allowed."), ok);
  },
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// -------------------- Login lockout (password) — 4 wrong attempts → 5 min block ---------
const MAX_PASSWORD_FAILS = 4;
const PASSWORD_LOCKOUT_MS = 5 * 60 * 1000;
/** @type {Map<string, { failures: number, lockedUntil: number }>} */
const passwordLoginState = new Map();

function normalizeLoginKey(identifier) {
  return String(identifier || "")
    .trim()
    .toLowerCase();
}

function lockoutSecondsRemainingForKey(key) {
  const s = passwordLoginState.get(key);
  if (!s || !s.lockedUntil) return 0;
  if (Date.now() >= s.lockedUntil) {
    passwordLoginState.delete(key);
    return 0;
  }
  return Math.ceil((s.lockedUntil - Date.now()) / 1000);
}

function isPasswordLoginLocked(key) {
  return lockoutSecondsRemainingForKey(key) > 0;
}

function clearPasswordLoginState(key) {
  passwordLoginState.delete(key);
}

/**
 * Record a failed password for this identifier. On the 4th fail, start 5 min lockout.
 * Returns the updated state; if locked, caller should respond 429.
 */
function recordFailedPasswordLogin(key) {
  let s = passwordLoginState.get(key);
  if (s && s.lockedUntil && Date.now() >= s.lockedUntil) {
    s = { failures: 0, lockedUntil: 0 };
  } else if (!s) {
    s = { failures: 0, lockedUntil: 0 };
  }
  s.failures += 1;
  if (s.failures >= MAX_PASSWORD_FAILS) {
    s.lockedUntil = Date.now() + PASSWORD_LOCKOUT_MS;
    s.failures = 0;
  }
  passwordLoginState.set(key, s);
  return s;
}

// -------------------- PAYMOB (Visa/Mastercard) --------------------
// Safe to register even if env isn't set; frontend will detect via /paymob/config
try {
  const { registerPaymobRoutes } = require("./paymobRoutes");
  registerPaymobRoutes(app);
} catch (e) {
  console.warn("Paymob routes not loaded:", e?.message || e);
}

/** Flask ML demand service (train_model `app.py`). Default port 5001 — keep Express PORT separate. */
const DEMAND_ML_URL = (
  process.env.FLASK_DEMAND_URL ||
  process.env.DEMAND_ML_URL ||
  "http://127.0.0.1:5001"
).replace(/\/$/, "");

app.post("/api/predict-demand", async (req, res) => {
  try {
    const upstream = await fetch(`${DEMAND_ML_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[ParkGo] /api/predict-demand → Flask:", err?.message || err);
    res.status(503).json({
      ok: false,
      error: "Demand prediction service unavailable. Start the Flask app (app.py).",
    });
  }
});

app.get("/api/forecast", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const url = qs ? `${DEMAND_ML_URL}/forecast?${qs}` : `${DEMAND_ML_URL}/forecast`;
    const upstream = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await upstream.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      console.error("[ParkGo] /api/forecast: ML service returned non-JSON from", url);
      return res.status(503).json({
        ok: false,
        error:
          "Demand forecast response was not JSON. Check that Flask (app.py) is running on " +
          DEMAND_ML_URL +
          " and exposes GET /forecast.",
      });
    }
    if (!upstream.ok) {
      if (upstream.status === 404) {
        return res.status(503).json({
          ok: false,
          error:
            `No forecast route at ${url}. Verify FLASK_DEMAND_URL / DEMAND_ML_URL and that ParkGo app.py is running (GET /forecast).`,
        });
      }
      return res.status(upstream.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("[ParkGo] /api/forecast → Flask:", err?.message || err);
    res.status(503).json({
      ok: false,
      error: "Demand forecast service unavailable. Start the Flask app (app.py).",
    });
  }
});

app.post("/api/intrusion-detect", async (req, res) => {
  try {
    const upstream = await fetch(`${DEMAND_ML_URL}/intrusion/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("[ParkGo] /api/intrusion-detect → Flask:", err?.message || err);
    res.status(503).json({
      ok: false,
      error: "Intrusion detection service unavailable. Start the Flask app (app.py).",
    });
  }
});

/** EGP per hour — new bookings and voluntary “add 1 hour” */
const PARKING_HOURLY_RATE = Number(process.env.PARKING_HOURLY_RATE) || 5;
/** EGP per hour for staying past end_time without extending — legacy fallback if `dynamic_hourly_rate` is not stored on the booking. */
const OVERSTAY_HOURLY_RATE = Number(process.env.OVERSTAY_HOURLY_RATE) || PARKING_HOURLY_RATE;

const MS_PER_HOUR = 60 * 60 * 1000;

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function storedDynamicHourly(row) {
  if (!row) return null;
  const v = row.dynamic_hourly_rate != null ? Number(row.dynamic_hourly_rate) : NaN;
  if (Number.isFinite(v) && v > 0) return v;
  return null;
}

/** In-session rate: `dynamic_hourly_rate` from booking, else `PARKING_HOURLY_RATE`. */
function baseParkingHourlyRate(row) {
  return storedDynamicHourly(row) ?? PARKING_HOURLY_RATE;
}

/** After scheduled end: `dynamic_hourly_rate` when stored, else `OVERSTAY_HOURLY_RATE` (penalty / legacy). */
function lateOverstayHourlyRate(row) {
  return storedDynamicHourly(row) ?? OVERSTAY_HOURLY_RATE;
}

/**
 * On checkout: base bill for time from check-in to min(check-out, scheduled end) only;
 * late fee for time after scheduled end (separate, no double-counting).
 * @returns {{ baseAmount: number, baseHours: number, lateFeeAmount: number, lateHours: number, lateFeeApplied: boolean, totalAmount: number, dynamicHourlyRate: number | null, baseHourlyRate: number, lateHourlyRate: number }}
 */
function computeCheckoutAmounts(row, checkOutAt) {
  const ci = new Date(row.check_in_time);
  const end = new Date(row.end_time);
  const co = new Date(checkOutAt);
  const baseHr = baseParkingHourlyRate(row);
  const lateHr = lateOverstayHourlyRate(row);
  const dyn = storedDynamicHourly(row);

  const endBoundaryMs = Math.min(co.getTime(), end.getTime());
  const spanMs = Math.max(0, endBoundaryMs - ci.getTime());
  const baseHours = Math.max(1, Math.ceil(spanMs / MS_PER_HOUR));
  const baseAmount = roundMoney(baseHours * baseHr);

  let lateHours = 0;
  let lateFeeAmount = 0;
  if (co.getTime() > end.getTime()) {
    const lateMs = co.getTime() - end.getTime();
    lateHours = Math.ceil(lateMs / MS_PER_HOUR);
    lateFeeAmount = roundMoney(lateHours * lateHr);
  }

  return {
    baseAmount,
    baseHours,
    lateFeeAmount,
    lateHours,
    lateFeeApplied: lateFeeAmount > 0,
    totalAmount: roundMoney(baseAmount + lateFeeAmount),
    dynamicHourlyRate: dyn,
    baseHourlyRate: baseHr,
    lateHourlyRate: lateHr,
  };
}

async function ensureLateFeeColumns(pool) {
  await pool.query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_applied BOOLEAN DEFAULT FALSE`);
  await pool.query(
    `ALTER TABLE reservations ADD COLUMN IF NOT EXISTS late_fee_amount DECIMAL(12,2) DEFAULT 0`
  );
}
/** Earliest check-in before scheduled start_time */
const EARLY_CHECKIN_MINUTES = Number(process.env.EARLY_CHECKIN_MINUTES) || 60;
/**
 * After scheduled start_time + this many minutes, if the gatekeeper has not scanned QR for check-in,
 * the reservation is cancelled and the slot is freed (same as user cancel).
 * Set ARRIVAL_WINDOW_MINUTES in backend/.env to override (default 20).
 */
const ARRIVAL_WINDOW_MINUTES = Number(process.env.ARRIVAL_WINDOW_MINUTES) || 20;

/** Parse user id from API (PostgreSQL uuid text). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseUserId(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().replace(/^\{|\}$/g, "");
  if (s === "") return null;
  return UUID_RE.test(s) ? s : null;
}

/** Booking id — must match reservations.id (UUID in current schema). */
function parseReservationId(raw) {
  const s = String(raw ?? "").trim().replace(/^\{|\}$/g, "");
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

/** Mark missed check-ins as cancelled and free slots (call inside a transaction). */
async function sweepNoShows(client) {
  const swept = await client.query(
    `UPDATE reservations
     SET status = 'cancelled'
     WHERE status = 'confirmed'
       AND NOW() > start_time + ($1 * INTERVAL '1 minute')
     RETURNING slot_no`,
    [ARRIVAL_WINDOW_MINUTES]
  );
  for (const row of swept.rows) {
    await client.query(
      `UPDATE parking_slots SET state = 0, updated_at = NOW() WHERE slot_no = $1`,
      [row.slot_no]
    );
  }
}

/** Run sweep outside an existing transaction (e.g. GET handlers, timers). */
async function runSweepNoShows() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await sweepNoShows(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[ParkGo] sweep missed check-ins:", err);
  } finally {
    client.release();
  }
}

/**
 * Align `reservations.status` CHECK with server.js (confirmed | checked_in | closed | cancelled | no_show).
 * Older DBs often still constrain e.g. active/pending/completed, which makes INSERT ... 'confirmed' fail.
 */
async function ensureReservationsStatusConstraint() {
  const client = await pool.connect();
  try {
    const ex = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'reservations'
    `);
    if (ex.rowCount === 0) return;

    await client.query("BEGIN");
    await client.query(`ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check`);
    await client.query(
      `UPDATE reservations SET status = 'confirmed' WHERE LOWER(TRIM(status)) IN ('active', 'pending')`
    );
    await client.query(
      `UPDATE reservations SET status = 'closed' WHERE LOWER(TRIM(status)) IN ('completed', 'used')`
    );
    await client.query(
      `UPDATE reservations SET status = 'checked_in' WHERE LOWER(TRIM(status)) IN ('check_in', 'checked-in')`
    );
    await client.query(
      `UPDATE reservations SET status = 'cancelled' WHERE LOWER(TRIM(status)) IN ('expired', 'canceled')`
    );
    await client.query(`
      UPDATE reservations SET status = 'confirmed'
      WHERE status IS NULL
         OR TRIM(status) = ''
         OR LOWER(TRIM(status)) NOT IN ('confirmed', 'checked_in', 'closed', 'cancelled', 'no_show')
    `);
    await client.query(`
      ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('confirmed', 'checked_in', 'closed', 'cancelled', 'no_show'))
    `);
    await client.query("COMMIT");
    console.log("[ParkGo] reservations.status CHECK constraint is aligned with the API.");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.warn(
      "[ParkGo] Could not auto-align reservations_status_check. Run as DB owner: backend/scripts/init-db.sql (status block).",
      err?.message || err
    );
  } finally {
    client.release();
  }
}

/** Hide raw PostgreSQL errors from API clients; log full error on the server. */
function apiError(err) {
  const msg = err && err.message ? String(err.message) : "Something went wrong";
  console.error("[ParkGo API]", err);
  if (
    /password authentication failed|SASL|ECONNREFUSED|connection refused|connect ECONNREFUSED|timeout expired|database .* does not exist|could not connect to server/i.test(
      msg
    )
  ) {
    return "Cannot connect to the database. Check that PostgreSQL is running and backend/.env DATABASE_URL matches your PostgreSQL user and password.";
  }
  return msg;
}

const { registerAuthRoutes } = require("./routes/authRoutes");
registerAuthRoutes(app, { pool, apiError, logAudit });

/* -------------------- ROOT -------------------- */
app.get("/", (req, res) => {
  res.json({
    name: "ParkGo API",
    message: "Backend is running. Use the frontend app to sign up or log in.",
    health: "/health",
    auth: {
      register: "POST /auth/register",
      signup: "POST /auth/signup",
      login: "POST /auth/login",
      refresh: "POST /auth/refresh",
      logout: "POST /auth/logout",
      me: "GET /auth/me (Authorization: Bearer access token)",
      google: "POST /auth/google",
    },
    demandMl: {
      predict: "POST /api/predict-demand → Flask /predict",
      forecast: "GET /api/forecast → Flask /forecast",
      intrusion: "POST /api/intrusion-detect → Flask /intrusion/detect",
    },
  });
});

/* -------------------- HEALTH -------------------- */
app.get("/health", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

async function ensureIncidentReportsTable() {
  try {
    const r = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'incident_reports'
        AND column_name IN ('user_id', 'reservation_id')
    `);
    const types = Object.fromEntries(r.rows.map((row) => [row.column_name, row.data_type]));
    const badUser = types.user_id === 'integer';
    const badRes = types.reservation_id === 'integer';
    if (badUser || badRes) {
      await pool.query(`DROP TABLE IF EXISTS incident_reports CASCADE`);
    }
  } catch (e) {
    console.warn("[ParkGo] incident_reports migration check:", e?.message || e);
  }

  /* Table is often created by superuser migration; ALTERs require owner — never throw to callers. */
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS incident_reports (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        gatekeeper_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reservation_id UUID REFERENCES reservations(id),
        full_name VARCHAR(255) NOT NULL,
        mobile VARCHAR(50),
        email VARCHAR(255),
        description TEXT NOT NULL,
        photo_filename VARCHAR(500),
        reporter_type VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id);
    `);
    await pool.query(`
      ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS gatekeeper_id UUID REFERENCES users(id) ON DELETE SET NULL;
    `);
    await pool.query(`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS email VARCHAR(255);`);
    await pool.query(`ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS reporter_type VARCHAR(20) DEFAULT 'user';`);
    try {
      await pool.query(`ALTER TABLE incident_reports ALTER COLUMN mobile DROP NOT NULL;`);
    } catch {
      /* already nullable */
    }
    try {
      await pool.query(`ALTER TABLE incident_reports ALTER COLUMN reservation_id DROP NOT NULL;`);
    } catch {
      /* already nullable or missing */
    }
  } catch (e) {
    console.warn("[ParkGo] incident_reports ensure (non-fatal):", e?.message || e);
  }
}

async function ensureSecurityAlertsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        alert_type VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        details JSONB
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_security_alerts_created ON security_alerts(created_at DESC);`
    );
  } catch (e) {
    console.warn("[ParkGo] security_alerts ensure (non-fatal):", e?.message || e);
  }
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || "";
}

/**
 * A non-admin successfully authenticated (password or Google) but used an "admin" sign-in flow.
 * Records DB alert and logs — real admins are notified in the dashboard via GET /admin/security-alerts.
 */
async function recordNonAdminAdminLoginAttempt(req, user) {
  const ip = getClientIp(req);
  const ua = req.get ? req.get("user-agent") : req.headers["user-agent"] || "";
  const role = user.role != null ? user.role : "unknown";
  const unregistered = user.id == null;
  const message = unregistered
    ? `Unregistered Google account attempted admin sign-in: ${user.email || "unknown"}. ` +
        `IP: ${ip || "unknown"}.`
    : `Non-admin attempted admin sign-in: @${user.username} (${user.email}) — ` +
        `account role: ${role}. IP: ${ip || "unknown"}.`;
  const details = {
    userId: user.id != null ? user.id : null,
    username: user.username,
    email: user.email,
    accountRole: role,
    clientIp: ip,
    userAgent: ua,
  };
  try {
    await ensureSecurityAlertsTable();
    await pool.query(
      `INSERT INTO security_alerts (alert_type, message, details) VALUES ($1, $2, $3::jsonb)`,
      ["admin_access_attempt", message, JSON.stringify(details)]
    );
    console.warn(`[Security] ${message}`);
  } catch (e) {
    console.error("[Security] failed to store alert:", e?.message || e);
  }
}

async function assertRequestingUserIsAdmin(userId) {
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    return null;
  }
  const r = await pool.query("SELECT id, role FROM users WHERE id = $1", [userId]);
  if (r.rowCount === 0) return null;
  if (r.rows[0].role !== "admin") return null;
  return r.rows[0];
}

/**
 * User-submitted incident reports (multipart: fullName, mobile, reservationId, description, optional photo, optional userId).
 */
app.post("/incidents", (req, res, next) => {
  uploadIncidentPhoto.single("photo")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ ok: false, error: "Photo must be 5 MB or smaller." });
    }
    return res.status(400).json({ ok: false, error: err.message || "Invalid file upload." });
  });
}, async (req, res) => {
  try {
    await ensureIncidentReportsTable();

    const fullName = String(req.body.fullName || "").trim();
    const mobile = String(req.body.mobile || "").trim();
    const description = String(req.body.description || "").trim();
    const rawReservationId = String(req.body.reservationId || "").trim();
    const rawUserId = req.body.userId;
    const userId = parseUserId(rawUserId);

    if (!fullName || !mobile || !description) {
      return res.status(400).json({
        ok: false,
        error: "Full name, mobile number, and description are required.",
      });
    }

    if (!rawReservationId) {
      return res.status(400).json({ ok: false, error: "Reservation ID is required." });
    }

    const reservationId = parseReservationId(rawReservationId);
    if (reservationId === null) {
      return res.status(400).json({
        ok: false,
        error: "Reservation ID must be your booking UUID (same as on your dashboard or QR).",
      });
    }

    if (userId === null) {
      return res.status(400).json({
        ok: false,
        error: "Please log in again, then submit your report.",
      });
    }

    const uCheck = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (uCheck.rowCount === 0) {
      return res.status(400).json({
        ok: false,
        error: "Your session is out of date. Please log out and log in again, then try submitting.",
      });
    }

    const resCheck = await pool.query("SELECT id, user_id FROM reservations WHERE id = $1", [reservationId]);
    if (resCheck.rowCount === 0) {
      return res.status(400).json({
        ok: false,
        error: "Reservation not found. Check your booking ID on the dashboard or QR.",
      });
    }
    const bookingOwnerId = resCheck.rows[0].user_id;
    if (userId !== null && String(bookingOwnerId) !== String(userId)) {
      return res.status(403).json({
        ok: false,
        error: "This reservation does not belong to your account. Use the booking ID from your own reservation list.",
      });
    }

    const photoFilename = req.file ? req.file.filename : null;

    await pool.query(
      `INSERT INTO incident_reports (user_id, gatekeeper_id, reservation_id, full_name, mobile, email, description, photo_filename, reporter_type)
       VALUES ($1, NULL, $2, $3, $4, NULL, $5, $6, 'user')`,
      [userId, reservationId, fullName, mobile, description, photoFilename]
    );

    res.json({ ok: true, message: "Incident report submitted." });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/**
 * Gatekeeper-submitted incident reports (multipart: fullName, email, description, optional photo, gatekeeperUserId).
 */
app.post("/incidents/gatekeeper", (req, res, next) => {
  uploadIncidentPhoto.single("photo")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ ok: false, error: "Photo must be 5 MB or smaller." });
    }
    return res.status(400).json({ ok: false, error: err.message || "Invalid file upload." });
  });
}, async (req, res) => {
  try {
    await ensureIncidentReportsTable();

    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim();
    const description = String(req.body.description || "").trim();
    const gatekeeperId = parseUserId(req.body.gatekeeperUserId);

    if (!fullName || !email || !description) {
      return res.status(400).json({
        ok: false,
        error: "Full name, email, and description are required.",
      });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
    }

    if (gatekeeperId === null) {
      return res.status(400).json({ ok: false, error: "Gatekeeper session is required." });
    }

    const gk = await pool.query("SELECT id, role FROM users WHERE id = $1", [gatekeeperId]);
    if (gk.rowCount === 0) {
      return res.status(403).json({ ok: false, error: "Only gatekeeper accounts can submit this form." });
    }
    const role = String(gk.rows[0].role || "").toLowerCase();
    if (role !== "gatekeeper") {
      return res.status(403).json({ ok: false, error: "Only gatekeeper accounts can submit this form." });
    }

    const photoFilename = req.file ? req.file.filename : null;

    await pool.query(
      `INSERT INTO incident_reports (user_id, gatekeeper_id, reservation_id, full_name, mobile, email, description, photo_filename, reporter_type)
       VALUES (NULL, $1, NULL, $2, NULL, $3, $4, $5, 'gatekeeper')`,
      [gatekeeperId, fullName, email, description, photoFilename]
    );

    res.json({ ok: true, message: "Incident report submitted." });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- AUTH -------------------- */
app.post("/auth/signup", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      nationalId,
      username,
      email,
      password,
      role,
    } = req.body;

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const userRole = (role || "user").toLowerCase();
    if (userRole === "admin") {
      return res.status(400).json({ ok: false, error: "Admin accounts cannot be created via signup" });
    }
    if (!["user", "gatekeeper"].includes(userRole)) {
      return res.status(400).json({ ok: false, error: "Invalid role. Choose User or Gatekeeper." });
    }

    const exists = await pool.query(
      "SELECT 1 FROM users WHERE email=$1 OR username=$2",
      [email, username]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Email or username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insert = await pool.query(
      `INSERT INTO users (first_name, last_name, phone_number, national_id, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, first_name, last_name, username, email, role, created_at`,
      [firstName, lastName, phoneNumber || null, nationalId || null, username, email, passwordHash, userRole]
    );

    res.json({ ok: true, user: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, usernameOrEmail, password, intendedRole: rawIntended } = req.body;
    const wantAdmin = String(rawIntended || "").toLowerCase() === "admin";
    const identifier = usernameOrEmail || email;
    if (!identifier || !password) {
      return res.status(400).json({ ok: false, error: "Username/email and password are required" });
    }

    const key = normalizeLoginKey(identifier);
    if (isPasswordLoginLocked(key)) {
      return res.status(429).json({
        ok: false,
        locked: true,
        error: "Too many failed login attempts. Try again in 5 minutes.",
        lockoutSeconds: lockoutSecondsRemainingForKey(key),
      });
    }

    const r = await pool.query(
      "SELECT id, first_name, last_name, username, email, phone_number, role, password_hash FROM users WHERE email=$1 OR username=$1",
      [identifier]
    );

    if (r.rowCount === 0) {
      const st = recordFailedPasswordLogin(key);
      if (st.lockedUntil && Date.now() < st.lockedUntil) {
        return res.status(429).json({
          ok: false,
          locked: true,
          error:
            "Too many failed login attempts. Your account is temporarily locked. Try again in 5 minutes.",
          lockoutSeconds: lockoutSecondsRemainingForKey(key),
        });
      }
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const user = r.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const st = recordFailedPasswordLogin(key);
      if (st.lockedUntil && Date.now() < st.lockedUntil) {
        return res.status(429).json({
          ok: false,
          locked: true,
          error:
            "Too many failed login attempts. Your account is temporarily locked. Try again in 5 minutes.",
          lockoutSeconds: lockoutSecondsRemainingForKey(key),
        });
      }
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    clearPasswordLoginState(key);
    delete user.password_hash;
    if (wantAdmin && user.role !== "admin") {
      await recordNonAdminAdminLoginAttempt(req, user);
      return res.status(403).json({
        ok: false,
        code: "NOT_ADMIN",
        error:
          "This account is not an administrator. If you are a user or gatekeeper, use the standard login (not the admin sign-in).",
      });
    }
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    const { accessToken, intendedRole: rawIntended } = req.body;
    const wantAdmin = String(rawIntended || "").toLowerCase() === "admin";
    if (!accessToken) {
      return res.status(400).json({ ok: false, error: "Google access token is required" });
    }
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const tokenData = await userInfoRes.json();
    if (tokenData.error) {
      return res.status(401).json({ ok: false, error: "Invalid Google credential" });
    }
    const { email, given_name, family_name } = tokenData;
    let r = await pool.query(
      "SELECT id, first_name, last_name, username, email, role FROM users WHERE email=$1",
      [email]
    );
    if (r.rowCount > 0) {
      const user = r.rows[0];
      if (wantAdmin && user.role !== "admin") {
        await recordNonAdminAdminLoginAttempt(req, user);
        return res.status(403).json({
          ok: false,
          code: "NOT_ADMIN",
          error:
            "This account is not an administrator. If you are a user or gatekeeper, use the standard login (not the admin sign-in).",
        });
      }
      return res.json({ ok: true, user });
    }
    if (wantAdmin) {
      const baseU = (email.split("@")[0] || "user").replace(/\W/g, "").slice(0, 20);
      await recordNonAdminAdminLoginAttempt(req, {
        id: null,
        username: baseU,
        email,
        role: "unregistered",
      });
      return res.status(403).json({
        ok: false,
        code: "NOT_ADMIN",
        error:
          "This account is not an administrator. If you are a user or gatekeeper, use the standard login (not the admin sign-in).",
      });
    }
    const baseUsername = (email.split("@")[0] || "user").replace(/\W/g, "").slice(0, 20);
    let username = baseUsername;
    let suffix = 0;
    while (true) {
      const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
      if (exists.rowCount === 0) break;
      username = `${baseUsername}${++suffix}`;
    }
    const passwordHash = await bcrypt.hash(require("crypto").randomBytes(32).toString("hex"), 10);
    const insert = await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'user')
       RETURNING id, first_name, last_name, username, email, role`,
      [given_name || "User", family_name || "", username, email, passwordHash]
    );
    return res.json({ ok: true, user: insert.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- SLOTS (parking_slots) -------------------- */
app.get("/slots", async (req, res) => {
  try {
    await runSweepNoShows();
    const r = await pool.query(
      `SELECT slot_no, state
       FROM parking_slots
       ORDER BY slot_no ASC`
    );
    res.json({ ok: true, slots: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- RESERVATIONS (parking_slots) -------------------- */
/**
 * Create reservation:
 * - optional slotNo / slot_no: reserve that spot if available (state = 0)
 * - else: first available slot (state = 0)
 * - insert into reservations, set slot state to 2 (reserved)
 */
app.post("/reservations", bookingRateLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, startTime, endTime, totalAmount, paymentMethod, slotNo: bodySlotNo, slot_no } = req.body;
    const requestedSlot = (bodySlotNo || slot_no || "").toString().trim();

    if (!userId || !startTime || !endTime) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    await client.query("BEGIN");
    await sweepNoShows(client);

    let slotRes;
    if (requestedSlot) {
      slotRes = await client.query(
        `SELECT slot_no
         FROM parking_slots
         WHERE slot_no = $1 AND state = 0
         FOR UPDATE`,
        [requestedSlot]
      );
      if (slotRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "That slot is no longer available. Pick another or refresh the map.",
        });
      }
    } else {
      slotRes = await client.query(
        `SELECT slot_no
         FROM parking_slots
         WHERE state = 0
         ORDER BY slot_no ASC
         LIMIT 1
         FOR UPDATE`
      );

      if (slotRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "No available parking slots" });
      }
    }

    const reservedSlotNo = slotRes.rows[0].slot_no;
    const qrExpiresAt = computeQrExpiresAt(endTime);

    let dynamicHourly = null;
    try {
      const quote = await computeQuote(client, startTime, endTime);
      if (quote && Number.isFinite(quote.hourlyRateEgp)) {
        dynamicHourly = roundMoney(quote.hourlyRateEgp);
      }
    } catch {
      /* best-effort pricing */
    }

    const ins = await client.query(
      `INSERT INTO reservations
        (user_id, slot_no, start_time, end_time, status, payment_method, total_amount, qr_token, qr_expires_at, dynamic_hourly_rate)
       VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        reservedSlotNo,
        startTime,
        endTime,
        paymentMethod || null,
        totalAmount || 0,
        null,
        qrExpiresAt,
        dynamicHourly,
      ]
    );

    const row = ins.rows[0];

    // mark slot reserved (2)
    await client.query(
      `UPDATE parking_slots
       SET state = 2, updated_at = NOW()
       WHERE slot_no = $1`,
      [reservedSlotNo]
    );

    await client.query("COMMIT");
    const reservationOut = { ...row };
    const qrJwt = signReservationQrJwt(reservationOut.id);
    delete reservationOut.qr_token;
    reservationOut.qrJwt = qrJwt;
    logAudit(pool, {
      userId,
      action: `BOOKING: Booking ${reservationOut.id} created by user ${userId}`,
      ip: clientIp(req),
    });
    return res.json({ ok: true, reservation: reservationOut, qrJwt });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: apiError(err) });
  } finally {
    client.release();
  }
});

app.get("/reservations/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    await runSweepNoShows();

    const r = await pool.query(
      `SELECT r.*
       FROM reservations r
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const reservations = r.rows.map((row) => {
      const o = { ...row };
      const q = buildBookingQrJwtForRow(o);
      if (q) o.qrJwt = q;
      delete o.qr_token;
      return o;
    });

    res.json({ ok: true, reservations });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: list users -------------------- */
app.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, first_name, last_name, email, username, phone_number, national_id, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ ok: true, users: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

app.get("/admin/security-alerts", async (req, res) => {
  try {
    const admin = await assertRequestingUserIsAdmin(req.query.userId);
    if (!admin) {
      return res.status(403).json({ ok: false, error: "Admin access only" });
    }
    const afterId = Math.max(0, parseInt(String(req.query.afterId || "0"), 10) || 0);
    await ensureSecurityAlertsTable();
    const r = await pool.query(
      `SELECT id, created_at, alert_type, message, details
       FROM security_alerts
       WHERE id > $1
       ORDER BY id ASC
       LIMIT 100`,
      [afterId]
    );
    return res.json({ ok: true, alerts: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: single user detailed history -------------------- */
app.get("/admin/users/:id/history", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await pool.query(
      `SELECT id, first_name, last_name, email, username, phone_number, national_id, role, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (userRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    const reservationsRes = await pool.query(
      `SELECT id, slot_no, start_time, end_time, status, payment_method, total_amount, created_at
       FROM reservations WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    const reservations = reservationsRes.rows;
    const paymentSummary = reservations.reduce(
      (acc, r) => {
        const amount = Number(r.total_amount) || 0;
        acc.totalSpent += amount;
        acc.reservationCount += 1;
        const method = (r.payment_method || "other").toLowerCase();
        acc.byMethod[method] = (acc.byMethod[method] || 0) + amount;
        return acc;
      },
      { totalSpent: 0, reservationCount: 0, byMethod: {} }
    );
    res.json({
      ok: true,
      user: userRes.rows[0],
      reservations,
      paymentSummary,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: update user -------------------- */
app.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone_number, national_id, role, password } = req.body;
    const updates = [];
    const values = [];
    let pos = 1;
    if (first_name !== undefined) { updates.push(`first_name = $${pos++}`); values.push(first_name); }
    if (last_name !== undefined) { updates.push(`last_name = $${pos++}`); values.push(last_name); }
    if (phone_number !== undefined) { updates.push(`phone_number = $${pos++}`); values.push(phone_number); }
    if (national_id !== undefined) { updates.push(`national_id = $${pos++}`); values.push(national_id); }
    if (role !== undefined) {
      const r = (role || "user").toLowerCase();
      if (!["user", "gatekeeper", "admin"].includes(r)) {
        return res.status(400).json({ ok: false, error: "Invalid role" });
      }
      updates.push(`role = $${pos++}`);
      values.push(r);
    }
    if (password !== undefined && password !== "") {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${pos++}`);
      values.push(passwordHash);
    }
    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: "No fields to update" });
    }
    values.push(id);
    const r = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${pos} RETURNING id, first_name, last_name, email, username, role, created_at`,
      values
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: create user -------------------- */
app.post("/admin/users", requireAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, username, password, phone_number, national_id, role } = req.body;
    if (!first_name || !last_name || !email || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }
    const userRole = (role || "user").toLowerCase();
    if (userRole === "admin") {
      return res.status(400).json({ ok: false, error: "Cannot create admin via this endpoint" });
    }
    if (!["user", "gatekeeper"].includes(userRole)) {
      return res.status(400).json({ ok: false, error: "Invalid role" });
    }
    const exists = await pool.query(
      "SELECT 1 FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Email or username already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      `INSERT INTO users (first_name, last_name, phone_number, national_id, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, username, email, role, created_at`,
      [first_name, last_name, phone_number || null, national_id || null, username, email, passwordHash, userRole]
    );
    res.status(201).json({ ok: true, user: ins.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: delete user -------------------- */
app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({ ok: false, error: "Cannot delete user with existing reservations" });
    }
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: all reservations + payment details -------------------- */
app.get("/admin/reservations", requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.user_id, r.slot_no, r.start_time, r.end_time, r.status,
              r.payment_method, r.total_amount, r.qr_token, r.created_at,
              u.first_name, u.last_name, u.email
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`
    );
    res.json({ ok: true, reservations: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/** Audit trail (admin only). Query: ?user_id=<uuid>&action=<partial> */
app.get("/admin/logs", requireAdmin, async (req, res) => {
  try {
    const rawUser = req.query.user_id != null ? String(req.query.user_id).trim() : "";
    const rawAction = req.query.action != null ? String(req.query.action).trim() : "";

    const conds = [];
    const params = [];
    let p = 1;

    if (rawUser) {
      if (!UUID_RE.test(rawUser)) {
        return res.status(400).json({ ok: false, error: "user_id must be a valid UUID when provided" });
      }
      conds.push(`user_id = $${p++}`);
      params.push(rawUser);
    }
    if (rawAction) {
      conds.push(`action ILIKE $${p++}`);
      params.push(`%${rawAction}%`);
    }

    const whereSql = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    params.push(100);
    const limitIdx = p;

    const r = await pool.query(
      `SELECT id, user_id, action, "timestamp" AS log_ts, ip_address
       FROM logs
       ${whereSql}
       ORDER BY "timestamp" DESC
       LIMIT $${limitIdx}`,
      params
    );

    const logs = r.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      timestamp: row.log_ts,
      ip_address: row.ip_address,
    }));

    return res.json({ ok: true, logs, limit: 100 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: all incident reports (users + gatekeepers) -------------------- */
app.get("/admin/incidents", requireAdmin, async (req, res) => {
  try {
    await ensureIncidentReportsTable();
    const r = await pool.query(
      `SELECT ir.id,
              ir.created_at,
              COALESCE(ir.reporter_type, 'user') AS reporter_type,
              ir.full_name,
              ir.mobile,
              ir.email,
              ir.description,
              ir.photo_filename,
              ir.reservation_id,
              ir.user_id,
              ir.gatekeeper_id,
              u.first_name AS reporter_account_first_name,
              u.last_name AS reporter_account_last_name,
              u.email AS reporter_account_email,
              gk.first_name AS gatekeeper_first_name,
              gk.last_name AS gatekeeper_last_name,
              gk.email AS gatekeeper_account_email
       FROM incident_reports ir
       LEFT JOIN users u ON ir.user_id = u.id
       LEFT JOIN users gk ON ir.gatekeeper_id = gk.id
       ORDER BY ir.created_at DESC`
    );
    res.json({ ok: true, incidents: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/** Aggregated booking analytics: counts, peak hours, popular spots, usage. */
app.get("/admin/analytics", requireAdmin, async (req, res) => {
  try {
    const totalR = await pool.query("SELECT COUNT(*)::int AS c FROM reservations");
    const totalBookings = totalR.rows[0].c;

    const byStatusR = await pool.query(
      `SELECT status, COUNT(*)::int AS c FROM reservations GROUP BY status`
    );
    const bookingsByStatus = {};
    for (const row of byStatusR.rows) {
      bookingsByStatus[row.status] = row.c;
    }

    const peakR = await pool.query(
      `SELECT EXTRACT(HOUR FROM start_time)::int AS hour, COUNT(*)::int AS cnt
       FROM reservations
       GROUP BY EXTRACT(HOUR FROM start_time)
       ORDER BY hour ASC`
    );
    const hourMap = new Map(peakR.rows.map((r) => [Number(r.hour), r.cnt]));
    const peakHours = [];
    for (let h = 0; h < 24; h++) {
      peakHours.push({ hour: h, count: hourMap.get(h) || 0 });
    }
    const peakHoursSorted = [...peakHours].sort((a, b) => b.count - a.count);

    const topSlotsR = await pool.query(
      `SELECT slot_no, COUNT(*)::int AS booking_count
       FROM reservations
       GROUP BY slot_no
       ORDER BY booking_count DESC
       LIMIT 20`
    );

    const slotsR = await pool.query("SELECT state FROM parking_slots");
    const totalSlots = slotsR.rowCount;
    let occupied = 0;
    let available = 0;
    let reserved = 0;
    for (const s of slotsR.rows) {
      const st = Number(s.state);
      if (st === 1) occupied += 1;
      else if (st === 2) reserved += 1;
      else available += 1;
    }

    const durationR = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)::float AS avg_hours
       FROM reservations
       WHERE status = 'closed' AND end_time IS NOT NULL AND start_time IS NOT NULL`
    );
    const avgBookingDurationHours = durationR.rows[0].avg_hours;

    const last7R = await pool.query(
      `SELECT COUNT(*)::int AS c FROM reservations WHERE created_at >= NOW() - INTERVAL '7 days'`
    );
    const last30R = await pool.query(
      `SELECT COUNT(*)::int AS c FROM reservations WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    const revenueR = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS total
       FROM reservations WHERE status = 'closed' AND total_amount IS NOT NULL`
    );

    const utilizationPercent =
      totalSlots > 0 ? Math.round((occupied / totalSlots) * 1000) / 10 : 0;

    res.json({
      ok: true,
      analytics: {
        totalBookings,
        bookingsByStatus,
        peakHours,
        peakHourTop5: peakHoursSorted.slice(0, 5).filter((x) => x.count > 0),
        mostUsedSpots: topSlotsR.rows,
        parkingSlots: {
          total: totalSlots,
          occupied,
          available,
          reserved,
          utilizationPercent,
        },
        avgBookingDurationHours:
          avgBookingDurationHours != null ? Math.round(avgBookingDurationHours * 100) / 100 : null,
        bookingsLast7Days: last7R.rows[0].c,
        bookingsLast30Days: last30R.rows[0].c,
        totalRevenueClosed: revenueR.rows[0].total,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: add slot -------------------- */
app.post("/admin/slots", requireAdmin, async (req, res) => {
  try {
    const { slot_no } = req.body;
    if (!slot_no || String(slot_no).trim() === "") {
      return res.status(400).json({ ok: false, error: "slot_no is required" });
    }
    const name = String(slot_no).trim();
    const exists = await pool.query("SELECT 1 FROM parking_slots WHERE slot_no = $1", [name]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ ok: false, error: "Slot already exists" });
    }
    const r = await pool.query(
      `INSERT INTO parking_slots (slot_no, state, updated_at) VALUES ($1, 0, NOW()) RETURNING slot_no, state`,
      [name]
    );
    res.status(201).json({ ok: true, slot: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/* -------------------- ADMIN: update slot state -------------------- */
app.patch("/admin/slots/:slotNo", requireAdmin, async (req, res) => {
  try {
    const { slotNo } = req.params;
    const { state } = req.body;
    const stateNum = parseInt(state, 10);
    if (![0, 1, 2].includes(stateNum)) {
      return res.status(400).json({ ok: false, error: "state must be 0 (available), 1 (occupied), or 2 (reserved)" });
    }
    const r = await pool.query(
      `UPDATE parking_slots SET state = $1, updated_at = NOW() WHERE slot_no = $2 RETURNING slot_no, state`,
      [stateNum, slotNo]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Slot not found" });
    }
    res.json({ ok: true, slot: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/**
 * Cancel reservation:
 * - set reservation status = cancelled
 * - free the slot back to empty (0)
 */
app.patch("/reservations/:id/cancel", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const r = await client.query(
      "SELECT id, slot_no, status FROM reservations WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Reservation not found" });
    }

    const row = r.rows[0];

    if (row.status !== "confirmed") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Only confirmed (not yet checked in) reservations can be cancelled",
      });
    }

    await client.query(
      "UPDATE reservations SET status = 'cancelled' WHERE id = $1",
      [id]
    );

    await client.query(
      `UPDATE parking_slots
       SET state = 0, updated_at = NOW()
       WHERE slot_no = $1`,
      [row.slot_no]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: apiError(err) });
  } finally {
    client.release();
  }
});

/**
 * Overstay: scheduled end_time has passed but reservation is still active.
 * Option 1 — extend by 1 hour and add hourly rate to total_amount.
 */
app.post("/reservations/:id/overstay-extend", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId is required" });
    }

    await client.query("BEGIN");

    const r = await client.query(
      `SELECT id, user_id, end_time, status, total_amount
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Reservation not found" });
    }

    const row = r.rows[0];
    if (Number(row.user_id) !== Number(userId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (!["confirmed", "checked_in"].includes(row.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Cannot extend this reservation" });
    }

    const now = new Date();
    if (now <= new Date(row.end_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Extension is only available after your scheduled end time has passed.",
      });
    }

    const up = await client.query(
      `UPDATE reservations
       SET end_time = end_time + interval '1 hour',
           total_amount = COALESCE(total_amount, 0) + $1
       WHERE id = $2
       RETURNING *`,
      [PARKING_HOURLY_RATE, id]
    );

    await client.query("COMMIT");
    return res.json({
      ok: true,
      reservation: up.rows[0],
      addedAmount: PARKING_HOURLY_RATE,
      message: `Added 1 hour. +${PARKING_HOURLY_RATE.toFixed(2)} EGP to your total.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: apiError(err) });
  } finally {
    client.release();
  }
});

// -------------------- GATEKEEPER (QR = signed JWT or legacy numeric booking id) --------------------

function bookingNextAction(status) {
  if (status === "confirmed") return "check-in";
  if (status === "checked_in") return "check-out";
  return null;
}

/**
 * Verify signed booking QR (JWT) and return same shape as GET /gate/booking/:id.
 * POST { "qr": "<jwt>" }
 */
app.post("/gate/qr/preview", qrRateLimiter, async (req, res) => {
  console.log("[IP CHECK]", req.ip);
  const raw = req.body && req.body.qr;
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return res.status(400).json({ ok: false, error: "Field \"qr\" with the scanned token is required" });
  }

  const v = verifyBookingQrDetailed(raw.trim());
  if (!v.ok) {
    const code = v.code || "INVALID";
    const status = code === "EXPIRED" ? 401 : 400;
    return res.status(status).json({ ok: false, error: v.error, code });
  }

  const { bookingId, userId, jti, isSimpleReservationQr } = v.payload;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await sweepNoShows(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
  client.release();

  try {
    const r = await pool.query(
      `SELECT id, user_id, slot_no, start_time, end_time, status, payment_method, total_amount,
              check_in_time, check_out_time, qr_token, created_at, qr_expires_at
       FROM reservations WHERE id = $1`,
      [bookingId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Booking not found", code: "NOT_FOUND" });
    }

    const reservation = r.rows[0];
    if (!isSimpleReservationQr) {
      if (String(reservation.user_id) !== String(userId)) {
        return res.status(400).json({ ok: false, error: "Invalid QR code (user mismatch)", code: "MISMATCH" });
      }
      if (reservation.qr_token == null || String(reservation.qr_token) !== jti) {
        return res.status(400).json({
          ok: false,
          error: "This QR code is no longer valid (already used or revoked)",
          code: "USED_OR_REVOKED",
        });
      }
      const effectiveExp = resolveQrExpiresAt(reservation);
      if (!effectiveExp) {
        return res.status(400).json({
          ok: false,
          error: "Booking has no valid QR expiration (missing end time)",
          code: "NO_EXPIRY",
        });
      }
      if (effectiveExp.getTime() < Date.now()) {
        return res.status(401).json({ ok: false, error: "This QR code has expired", code: "EXPIRED" });
      }
    }

    if (["closed", "cancelled", "no_show"].includes(reservation.status)) {
      return res.status(400).json({
        ok: false,
        error: `This booking is ${reservation.status}. Further scans are not allowed.`,
        code: "INACTIVE",
      });
    }

    const nextAction = bookingNextAction(reservation.status);
    const safe = { ...reservation };
    delete safe.qr_token;
    logAudit(pool, {
      userId: String(reservation.user_id),
      action: `QR_SCAN: QR scanned for booking ${reservation.id} (user ${reservation.user_id})`,
      ip: clientIp(req),
    });
    return res.json({ ok: true, reservation: safe, nextAction });
  } catch (err) {
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/** Preview booking by numeric id (legacy manual entry) or scan of old QRs. */
app.get("/gate/booking/:bookingId", async (req, res) => {
  const bookingId = parseInt(req.params.bookingId, 10);
  if (Number.isNaN(bookingId)) {
    return res.status(400).json({ ok: false, error: "Invalid booking ID" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await sweepNoShows(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
  client.release();

  try {
    const r = await pool.query(
      `SELECT id, user_id, slot_no, start_time, end_time, status, payment_method, total_amount,
              check_in_time, check_out_time, qr_token, created_at, qr_expires_at
       FROM reservations WHERE id = $1`,
      [bookingId]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const reservation = r.rows[0];

    if (["closed", "cancelled", "no_show"].includes(reservation.status)) {
      return res.status(400).json({
        ok: false,
        error: `This booking is ${reservation.status}. Further scans are not allowed.`,
      });
    }

    const nextAction = bookingNextAction(reservation.status);
    const safe = { ...reservation };
    delete safe.qr_token;
    return res.json({ ok: true, reservation: safe, nextAction });
  } catch (err) {
    return res.status(500).json({ ok: false, error: apiError(err) });
  }
});

/** Entry: confirmed → checked_in, record check-in time, slot occupied */
app.post("/gate/check-in", async (req, res) => {
  const client = await pool.connect();
  try {
    const bookingId = parseInt(req.body.bookingId, 10);
    if (Number.isNaN(bookingId)) {
      return res.status(400).json({ ok: false, error: "bookingId is required" });
    }

    await client.query("BEGIN");
    await sweepNoShows(client);

    const r = await client.query(
      `SELECT id, user_id, slot_no, status, start_time, end_time, check_in_time
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const row = r.rows[0];

    if (row.status === "checked_in") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Already checked in — use check-out for exit." });
    }

    if (row.status !== "confirmed") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: `Check-in not allowed (status: ${row.status})`,
      });
    }

    const now = new Date();
    const start = new Date(row.start_time);
    const earliest = new Date(start.getTime() - EARLY_CHECKIN_MINUTES * 60 * 1000);
    const latest = new Date(start.getTime() + ARRIVAL_WINDOW_MINUTES * 60 * 1000);

    if (now < earliest) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: `Too early for check-in. Earliest: ${earliest.toISOString()}`,
      });
    }
    if (now > latest) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: `Check-in window ended (${ARRIVAL_WINDOW_MINUTES} min after your scheduled start). The reservation may have been cancelled and the slot released.`,
      });
    }

    await client.query(
      `UPDATE reservations
       SET status = 'checked_in', check_in_time = NOW()
       WHERE id = $1`,
      [bookingId]
    );

    await client.query(
      `UPDATE parking_slots SET state = 1, updated_at = NOW() WHERE slot_no = $1`,
      [row.slot_no]
    );

    await client.query("COMMIT");

    logAudit(pool, {
      userId: row.user_id != null ? String(row.user_id) : null,
      action: `GATE: User ${row.user_id ?? "unknown"} checked in for booking ${bookingId}`,
      ip: clientIp(req),
    });

    return res.json({
      ok: true,
      message: "Checked in — gate may open for entry",
      bookingId,
      slotNo: row.slot_no,
      checkInTime: new Date().toISOString(),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: apiError(err) });
  } finally {
    client.release();
  }
});

/** Exit: checked_in → closed, record check-out, price from duration + optional overstay */
app.post("/gate/check-out", async (req, res) => {
  const client = await pool.connect();
  try {
    const bookingId = parseInt(req.body.bookingId, 10);
    if (Number.isNaN(bookingId)) {
      return res.status(400).json({ ok: false, error: "bookingId is required" });
    }

    await client.query("BEGIN");
    await sweepNoShows(client);

    const r = await client.query(
      `SELECT id, user_id, slot_no, status, start_time, end_time, check_in_time, check_out_time, total_amount, dynamic_hourly_rate
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );

    if (r.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Booking not found" });
    }

    const row = r.rows[0];

    if (row.status === "closed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Booking already closed. Scan rejected." });
    }

    if (row.status !== "checked_in") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Check-out only after check-in. Current status: " + row.status,
      });
    }

    if (!row.check_in_time) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Missing check-in time" });
    }

    const co = new Date();
    const {
      baseAmount,
      baseHours,
      lateFeeAmount,
      lateHours,
      lateFeeApplied,
      totalAmount,
      dynamicHourlyRate,
      baseHourlyRate,
      lateHourlyRate,
    } = computeCheckoutAmounts(row, co);

    await client.query(
      `UPDATE reservations
       SET status = 'closed',
           check_out_time = NOW(),
           total_amount = $1,
           late_fee_applied = $2,
           late_fee_amount = $3,
           qr_token = NULL
       WHERE id = $4`,
      [totalAmount, lateFeeApplied, lateFeeAmount, bookingId]
    );

    await client.query(
      `UPDATE parking_slots SET state = 0, updated_at = NOW() WHERE slot_no = $1`,
      [row.slot_no]
    );

    await client.query("COMMIT");

    logAudit(pool, {
      userId: row.user_id != null ? String(row.user_id) : null,
      action: `GATE: User ${row.user_id ?? "unknown"} checked out for booking ${bookingId}`,
      ip: clientIp(req),
    });

    return res.json({
      ok: true,
      message: "Checked out — booking closed (paid total calculated)",
      bookingId,
      slotNo: row.slot_no,
      checkOutTime: co.toISOString(),
      baseAmount,
      parkingHoursBilled: baseHours,
      lateFeeAmount,
      lateHours,
      lateFeeApplied,
      dynamicHourlyRateEgp: dynamicHourlyRate,
      baseHourlyRateEgp: baseHourlyRate,
      lateFeeHourlyRateEgp: lateHourlyRate,
      totalAmount,
      paid: true,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: apiError(err) });
  } finally {
    client.release();
  }
});

/* -------------------- ENSURE ADMIN IN DB -------------------- */
async function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn("ADMIN_EMAIL and ADMIN_PASSWORD not set — no admin user will be created.");
    return;
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    if (existing.rowCount > 0) return;

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')`,
      ["Admin", "User", adminUsername, adminEmail, passwordHash]
    );
    console.log("Admin user created in database.");
  } catch (err) {
    console.error("Failed to ensure admin user:", err.message);
  }
}

/** Optional default gatekeeper (scan QR at /gatekeeper). Same pattern as ensureAdmin. */
async function ensureGatekeeper() {
  const gkEmail = process.env.GATEKEEPER_EMAIL;
  const gkUsername = process.env.GATEKEEPER_USERNAME || "gatekeeper";
  const gkPassword = process.env.GATEKEEPER_PASSWORD;

  if (!gkEmail || !gkPassword) {
    console.warn("GATEKEEPER_EMAIL and GATEKEEPER_PASSWORD not set — no default gatekeeper user will be created.");
    return;
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [gkEmail]);
    if (existing.rowCount > 0) return;

    const passwordHash = await bcrypt.hash(gkPassword, 10);
    await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'gatekeeper')`,
      ["Gate", "Keeper", gkUsername, gkEmail, passwordHash]
    );
    console.log("Gatekeeper user created in database.");
  } catch (err) {
    console.error("Failed to ensure gatekeeper user:", err.message);
  }
}

const PORT = process.env.PORT || 5000;
/** How often to cancel confirmed bookings that missed the check-in window (frees slots without waiting for HTTP traffic). */
const MISSED_CHECKIN_SWEEP_MS = Number(process.env.MISSED_CHECKIN_SWEEP_MS) || 60_000;

app.listen(PORT, async () => {
  try {
    await ensureReservationsStatusConstraint();
  } catch (e) {
    console.error("[ParkGo] reservations status constraint:", e?.message || e);
  }
  try {
    await ensureIncidentReportsTable();
  } catch (e) {
    console.error("[ParkGo] incident_reports table:", e?.message || e);
  }
  try {
    await ensureSecurityAlertsTable();
  } catch (e) {
    console.error("[ParkGo] security_alerts table:", e?.message || e);
  }
  try {
    const { ensureAuthSchema } = require("./ensureAuthSchema");
    await ensureAuthSchema(pool);
  } catch (e) {
    console.error("[ParkGo] auth schema:", e?.message || e);
  }
  try {
    await ensureBookingQrColumns(pool);
  } catch (e) {
    console.error("[ParkGo] booking QR columns:", e?.message || e);
  }
  try {
    await ensureDynamicHourlyRateColumn(pool);
  } catch (e) {
    console.error("[ParkGo] dynamic_hourly_rate column:", e?.message || e);
  }
  try {
    await ensureLateFeeColumns(pool);
  } catch (e) {
    console.error("[ParkGo] late fee columns:", e?.message || e);
  }
  try {
    await ensureAuditLogsTable(pool);
  } catch (e) {
    console.error("[ParkGo] audit logs table:", e?.message || e);
  }
  await ensureAdmin();
  await ensureGatekeeper();
  await runSweepNoShows();
  setInterval(() => {
    runSweepNoShows();
  }, MISSED_CHECKIN_SWEEP_MS);
  console.log(
    `API running on http://localhost:${PORT} (check-in deadline after start: ${ARRIVAL_WINDOW_MINUTES} min, sweep every ${MISSED_CHECKIN_SWEEP_MS / 1000}s)`
  );
});
