/**
 * Signed booking QR codes (JWT).
 * - New: { bookingId } signed with JWT_SECRET, expiresIn 1h (no DB jti).
 * - Legacy: typ=booking_qr, bid, uid, jti, exp; qr_token in DB = jti.
 */

const jwt = require("jsonwebtoken");

/** Primary secret for new reservation QR tokens (matches user requirements). */
function reservationQrSecret() {
  const s = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!s) {
    console.warn(
      "[ParkGo] JWT_SECRET (or JWT_ACCESS_SECRET) not set — using insecure dev default for reservation QR. Set JWT_SECRET in production."
    );
    return "parkgo-dev-jwt-secret-change-me";
  }
  return s;
}

function signReservationQrJwt(bookingId) {
  return jwt.sign({ bookingId }, reservationQrSecret(), { expiresIn: "1h" });
}

function qrSecret() {
  const s = process.env.QR_JWT_SECRET || process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!s) {
    console.warn(
      "[ParkGo] QR_JWT_SECRET (or JWT_ACCESS_SECRET) not set — using insecure dev default. Set QR_JWT_SECRET in production."
    );
    return "parkgo-dev-qr-secret-change-me";
  }
  return s;
}

/** Default: QR valid until this many hours after scheduled end (check-out window). */
function qrExpireHoursAfterEnd() {
  const n = Number(process.env.QR_EXPIRE_HOURS_AFTER_END);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * @param {string|Date} endTime - reservation end_time
 * @returns {Date}
 */
function computeQrExpiresAt(endTime) {
  const t = new Date(endTime).getTime();
  if (Number.isNaN(t)) {
    return new Date(Date.now() + qrExpireHoursAfterEnd() * 60 * 60 * 1000);
  }
  return new Date(t + qrExpireHoursAfterEnd() * 60 * 60 * 1000);
}

/**
 * Effective QR wall-clock expiry for a reservation row.
 * Prefers `qr_expires_at` when set; otherwise `end_time + QR_EXPIRE_HOURS_AFTER_END` (default 3h).
 * @param {object} row
 * @returns {Date | null} null only if `end_time` is unusable
 */
function resolveQrExpiresAt(row) {
  if (!row) return null;
  if (row.qr_expires_at != null) {
    const d = new Date(row.qr_expires_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (row.end_time != null) {
    return computeQrExpiresAt(row.end_time);
  }
  return null;
}

/**
 * @param {{ bookingId: string, userId: string, jti: string, expiresAt: Date | string }}
 */
function signBookingQr({ bookingId, userId, jti, expiresAt }) {
  const expSec = Math.floor(new Date(expiresAt).getTime() / 1000);
  return jwt.sign(
    {
      typ: "booking_qr",
      bid: String(bookingId),
      uid: String(userId),
      jti: String(jti),
      exp: expSec,
    },
    qrSecret(),
    { noTimestamp: true, algorithm: "HS256" }
  );
}

/**
 * Mint display JWT: new format `{ bookingId }` with 1h exp, or legacy when qr_token is set.
 * @param {object} row - reservations row
 * @returns {string | null}
 */
function buildBookingQrJwtForRow(row) {
  if (!row) return null;
  if (["closed", "cancelled", "no_show"].includes(String(row.status || ""))) return null;
  if (row.qr_token) {
    const expiresAt = resolveQrExpiresAt(row);
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) return null;
    if (expiresAt.getTime() < Date.now()) return null;
    return signBookingQr({
      bookingId: String(row.id),
      userId: String(row.user_id),
      jti: String(row.qr_token),
      expiresAt,
    });
  }
  return signReservationQrJwt(row.id);
}

/**
 * @returns {{ bookingId: string, userId: string, jti: string } | null}
 */
function verifyBookingQrPayload(token) {
  const r = verifyBookingQrDetailed(token);
  if (!r.ok) return null;
  return r.payload;
}

/**
 * @returns {{ ok: true, payload: { bookingId, userId, jti, isSimpleReservationQr } } | { ok: false, code, error }}
 */
function verifyBookingQrDetailed(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, code: "MISSING", error: "QR code is missing or empty" };
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, code: "MISSING", error: "QR code is missing or empty" };
  }

  const fromPayload = (p) => {
    if (p && p.typ === "booking_qr" && p.bid && p.uid && p.jti) {
      return {
        ok: true,
        payload: {
          bookingId: String(p.bid),
          userId: String(p.uid),
          jti: String(p.jti),
          isSimpleReservationQr: false,
        },
      };
    }
    if (p && p.bookingId != null) {
      return {
        ok: true,
        payload: {
          bookingId: String(p.bookingId),
          userId: null,
          jti: null,
          isSimpleReservationQr: true,
        },
      };
    }
    return null;
  };

  const secrets = [...new Set([reservationQrSecret(), qrSecret()])];
  for (const secret of secrets) {
    try {
      const p = jwt.verify(trimmed, secret);
      const out = fromPayload(p);
      if (out) return out;
    } catch (e) {
      if (e && e.name === "TokenExpiredError") {
        return { ok: false, code: "EXPIRED", error: "This QR code has expired" };
      }
    }
  }
  return { ok: false, code: "INVALID", error: "Invalid QR code or signature" };
}

function isLikelyBookingQrJwt(raw) {
  if (!raw || typeof raw !== "string") return false;
  const s = raw.trim();
  const parts = s.split(".");
  return parts.length === 3 && parts[0].length > 0 && parts[1].length > 0;
}

async function ensureBookingQrColumns(pool) {
  await pool.query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ`);
  try {
    const hours = qrExpireHoursAfterEnd();
    await pool.query(
      `
      UPDATE reservations
      SET qr_expires_at = end_time + ($1 * interval '1 hour')
      WHERE qr_expires_at IS NULL
        AND end_time IS NOT NULL
    `,
      [hours]
    );
  } catch (e) {
    console.warn("[ParkGo] qr_expires_at backfill:", e?.message || e);
  }
}

module.exports = {
  signBookingQr,
  signReservationQrJwt,
  buildBookingQrJwtForRow,
  verifyBookingQrPayload,
  verifyBookingQrDetailed,
  computeQrExpiresAt,
  resolveQrExpiresAt,
  isLikelyBookingQrJwt,
  qrSecret,
  reservationQrSecret,
  ensureBookingQrColumns,
  qrExpireHoursAfterEnd,
};
