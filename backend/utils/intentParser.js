/**
 * Lightweight keyword + regex intent detection for the ParkGo chatbot.
 * No external NLP dependencies — predictable for production.
 */

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const JWT_LIKE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeUserText(raw) {
  if (raw == null) return "";
  let s = String(raw).replace(/\u0000/g, "").trim();
  if (s.length > 2000) s = s.slice(0, 2000);
  return s;
}

/**
 * Parse a clock from user text. Prefer 12-hour (am/pm) before bare HH:MM so
 * "6:30 PM" becomes 18:30, not 06:30.
 * @param {string} lower
 * @returns {{ hour24: number, minute: number } | null}
 */
function extractClock(lower) {
  let m = lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = String(m[3]).toLowerCase();
    if (min < 0 || min > 59 || h < 1 || h > 12) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hour24: h, minute: min };
  }

  m = lower.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m) {
    let h = Number(m[1]);
    const ap = String(m[2]).toLowerCase();
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return { hour24: h, minute: 0 };
  }

  const m24 = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { hour24: h, minute: min };
  }

  m = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = String(m[3]).toLowerCase();
    if (min < 0 || min > 59) return null;
    if (h >= 1 && h <= 12) {
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
    }
    if (h >= 0 && h <= 23) return { hour24: h, minute: min };
  }

  m = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { hour24: h, minute: min };
  }

  return null;
}

/**
 * @param {string} lower
 * @returns {number | null}
 */
function extractDurationHours(lower) {
  let m = lower.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  if (!m) m = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  if (!m) {
    m = lower.match(/\bfor\s+(\d+(?:\.\d+)?)\s*h\b/);
    if (!m) m = lower.match(/\b(\d+(?:\.\d+)?)\s*h\b/);
  }
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 48) return null;
  return Math.round(n * 4) / 4;
}

/**
 * @param {string} text
 * @param {{ pendingBook?: { startIso: string, endIso: string }, lastIntent?: string }} [ctx]
 */
function parseIntent(text, ctx = {}) {
  const sanitized = sanitizeUserText(text);
  const lower = sanitized.toLowerCase();

  const uuidMatch = sanitized.match(UUID_RE);
  const maybeJwt =
    sanitized.split(/\s+/).find((w) => JWT_LIKE_RE.test(w.trim())) || "";
  const qrCandidate = maybeJwt.length > 80 ? maybeJwt.trim() : "";

  const yes =
    /^(yes|yeah|yep|sure|ok|okay|please do|go ahead|book it|confirm|reserve)\b/i.test(
      lower.trim()
    ) || lower.trim() === "y";
  const no =
    /^(no|nope|nah|don'?t|cancel that|stop)\b/i.test(lower.trim()) ||
    lower.trim() === "n";

  if (ctx && ctx.pendingBook && (yes || no)) {
    if (yes) return { intent: "confirm_booking", entities: {}, sanitized };
    if (no) return { intent: "reject_booking", entities: {}, sanitized };
  }

  if (
    yes &&
    ctx &&
    (ctx.lastIntent === "book" || ctx.lastIntent === "check_availability")
  ) {
    return { intent: "confirm_booking", entities: {}, sanitized };
  }

  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(lower) ||
    lower === "hi" ||
    lower === "hello"
  ) {
    return { intent: "greeting", entities: {}, sanitized };
  }

  if (
    /\b(help|what can you do|commands|how does this work|assist)\b/.test(lower)
  ) {
    return { intent: "help", entities: {}, sanitized };
  }

  if (
    /\b(report|issue|problem|incident|complaint|something wrong)\b/.test(lower)
  ) {
    return { intent: "report_issue", entities: {}, sanitized };
  }

  if (
    /\b(predict|prediction|forecast|demand|busy|full|quiet|traffic)\b/.test(
      lower
    )
  ) {
    return { intent: "parking_prediction", entities: {}, sanitized };
  }

  if (
    /\b(my bookings|my reservation|my reservations|upcoming booking|list bookings)\b/.test(
      lower
    )
  ) {
    return { intent: "view_bookings", entities: {}, sanitized };
  }

  if (
    /\b(availability|available|free spots|empty slots|spaces left|how many slots|any space)\b/.test(
      lower
    ) ||
    /\bis there (room|space)\b/.test(lower)
  ) {
    return { intent: "check_availability", entities: {}, sanitized };
  }

  if (/\b(cancel|delete)\b/.test(lower) && /\b(booking|reservation)\b/.test(lower)) {
    return { intent: "cancel_booking", entities: {}, sanitized };
  }
  if (
    /^\s*cancel\s*$/i.test(sanitized.trim()) ||
    /\bcancel my (booking|reservation)\b/.test(lower)
  ) {
    return { intent: "cancel_booking", entities: {}, sanitized };
  }

  const clock = extractClock(lower);
  const dur = extractDurationHours(lower);

  const hasBookingKeyword =
    /\b(book|reserve|booking|reservation)\b/.test(lower) ||
    /\b(park|parking)\b/.test(lower) ||
    /\b(schedule|slot for)\b/.test(lower);

  /** e.g. "today 6:30 PM for 1 hour" — no "book"/"park" but clear time + day/duration */
  const hasTimeFirstBooking =
    clock &&
    (hasBookingKeyword ||
      /\b(today|tomorrow|tonight|this evening|this morning)\b/.test(lower) ||
      dur !== null);

  if (hasBookingKeyword || hasTimeFirstBooking) {
    return {
      intent: "create_booking",
      entities: {
        clock,
        durationHours: dur,
        slotHint: /\bslot\s*([A-Za-z]?\d+)/i.exec(sanitized)?.[1] || null,
      },
      sanitized,
    };
  }

  if (
    qrCandidate ||
    /\b(qr|scan|gate code|validate)\b/.test(lower) ||
    (maybeJwt && JWT_LIKE_RE.test(maybeJwt.trim()))
  ) {
    return {
      intent: "validate_qr",
      entities: { qrRaw: qrCandidate || maybeJwt.trim() },
      sanitized,
    };
  }

  if (uuidMatch && /\b(cancel|booking)\b/.test(lower)) {
    return { intent: "cancel_booking", entities: { reservationId: uuidMatch[0] }, sanitized };
  }

  return { intent: "unknown", entities: {}, sanitized };
}

module.exports = {
  sanitizeUserText,
  parseIntent,
  extractClock,
};
