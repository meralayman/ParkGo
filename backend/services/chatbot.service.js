const { parseIntent } = require("../utils/intentParser");
const { parseUserId } = require("../rbac");

const MS_PER_HOUR = 60 * 60 * 1000;

function isCustomerRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "user" || r === "admin";
}

function defaultQuickReplies() {
  return ["Check parking", "My bookings", "Book now", "Parking prediction"];
}

function levelToGuidance(level) {
  const L = String(level || "").toLowerCase();
  if (L === "high") {
    return "Demand is expected to be High. The lot may be nearly full — book a spot as soon as you can.";
  }
  if (L === "medium") {
    return "Demand looks Medium right now. Booking soon is wise if you need a guaranteed space.";
  }
  if (L === "low") {
    return "Demand is Low — plenty of capacity is expected. You can book with more flexibility.";
  }
  return "I could not read the exact demand level. Check the booking page or try again in a moment.";
}

function formatSlotsGuidance(available, total, reserved) {
  if (total <= 0) {
    return "Live slot data is not available right now. Please try again shortly.";
  }
  const a = Math.max(0, Number(available) || 0);
  const t = Math.max(0, Number(total) || 0);
  if (a === 0) {
    return `Right now there are no open bays (${reserved} reserved or occupied out of ${t}). I strongly recommend booking as soon as one frees up, or pick another arrival time if the map shows availability.`;
  }
  if (a <= 3) {
    return `Parking is tight: only ${a} open bay${a === 1 ? "" : "s"} out of ${t}. I recommend booking now before those spots are taken.`;
  }
  return `There are ${a} open bays out of ${t}. Availability looks healthier — still reserve early at peak times.`;
}

/**
 * @param {Date} now
 * @param {{ hour24: number, minute: number }} clock
 * @param {number} durationHours
 */
function buildBookingWindow(now, clock, durationHours) {
  const start = new Date(now);
  start.setHours(clock.hour24, clock.minute, 0, 0);
  if (start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 1);
  }
  const dh = Math.min(48, Math.max(0.25, durationHours || 1));
  const end = new Date(start.getTime() + dh * MS_PER_HOUR);
  return { start, end };
}

function dayTypeFromDate(d) {
  const day = d.getDay();
  return day === 0 || day === 6 ? 1 : 0;
}

async function fetchJsonSafe(url, init = {}) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: res.status, data: null };
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function getForecastSlice(internalBase) {
  const r = await fetchJsonSafe(`${internalBase}/api/forecast`);
  if (!r.ok || !Array.isArray(r.data) || r.data.length === 0) return null;
  const nowRow = r.data[0];
  const future =
    r.data.find((row) => Number(row.offset_hours) === 2) ||
    r.data.find((row) => Number(row.offset_hours) > 0) ||
    r.data[Math.min(2, r.data.length - 1)];
  return { nowRow, futureRow: future, all: r.data };
}

async function getPredictionForStart(internalBase, start) {
  const hour = start.getHours();
  const day_type = dayTypeFromDate(start);
  const r = await fetchJsonSafe(`${internalBase}/api/predict-demand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour, day_type }),
  });
  if (!r.ok || !r.data || typeof r.data.final_demand_level !== "string") {
    return null;
  }
  return {
    level: r.data.final_demand_level,
    reason: typeof r.data.reason === "string" ? r.data.reason : "",
  };
}

/**
 * @param {object} opts
 * @param {import("pg").Pool} opts.pool
 * @param {string | null} opts.userId
 * @param {string | null} opts.role
 * @param {string} opts.message
 * @param {object} opts.clientContext
 * @param {string | null} opts.authorizationHeader
 * @param {string} opts.internalApiBase
 * @param {(pool: any, entry: any) => void} opts.logAudit
 * @param {string | null} [opts.clientIp]
 */
async function processChatMessage(opts) {
  const {
    pool,
    userId,
    role,
    message,
    clientContext = {},
    authorizationHeader,
    internalApiBase,
    logAudit,
    clientIp: auditIp,
  } = opts;

  const parsed = parseIntent(message, clientContext);
  const intent = parsed.intent;

  const audit = (actionSuffix) => {
    if (!userId || !logAudit) return;
    logAudit(pool, {
      userId,
      action: `CHATBOT: User ${userId} ${actionSuffix}`,
      ip: auditIp != null && String(auditIp).length ? String(auditIp) : null,
    });
  };

  const loginReply = () => ({
    reply: "Please log in first.",
    quickReplies: defaultQuickReplies(),
    context: { lastIntent: intent },
  });

  const customerOnly = () =>
    !userId || !isCustomerRole(role)
      ? {
          reply:
            role === "gatekeeper"
              ? "Gatekeeper accounts cannot create user bookings here. Please use the gatekeeper dashboard for entry and exit."
              : "Please log in first.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: intent },
        }
      : null;

  switch (intent) {
    case "greeting": {
      audit("sent a greeting");
      return {
        reply:
          "Hi — I'm the ParkGo assistant. I can check live availability, explain demand, help you book or cancel, preview your QR, or point you to report an issue. What would you like to do?",
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "greeting" },
      };
    }
    case "help": {
      audit("requested help");
      return {
        reply:
          "Here's what I can do:\n• Check parking — live open bays\n• Parking prediction — Low / Medium / High demand\n• Book now — suggest a time and create a booking\n• My bookings — list your reservations\n• Cancel — cancel your next confirmed booking\n• QR — paste your booking QR string to validate\n• Report issue — I'll send you to the incident form\n\nTip: say something like “park at 6 PM” to start booking.",
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "help" },
      };
    }
    case "report_issue": {
      if (userId) audit("asked about reporting an issue");
      return {
        reply:
          "To report an issue with photos and details, open Report incident from your user menu (or go to `/user/report-incident`). That form keeps your account linked securely.",
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "report_issue" },
      };
    }
    case "parking_prediction": {
      if (userId) audit("asked for prediction");
      const fc = await getForecastSlice(internalApiBase);
      if (fc && fc.nowRow) {
        const cur = String(fc.nowRow.final_demand_level || "").trim() || "—";
        const fut = fc.futureRow
          ? String(fc.futureRow.final_demand_level || "").trim()
          : null;
        const off = fc.futureRow != null ? Number(fc.futureRow.offset_hours) : null;
        const curMsg = levelToGuidance(cur);
        let tail =
          fut && off != null && Number.isFinite(off)
            ? ` In about ${off} hour${off === 1 ? "" : "s"}, demand may move to ${fut}.`
            : "";
        const rec =
          String(fut || cur).toLowerCase() === "high" ||
          String(cur).toLowerCase() === "high"
            ? " Given that outlook, booking early is the safest move."
            : " If you're unsure, check open bays or book your slot.";
        return {
          reply: `Current outlook: ${cur}.${tail}${rec}\n\n${curMsg}`,
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "parking_prediction" },
        };
      }
      const slotQ = await pool.query(
        `SELECT COUNT(*)::int AS c FROM parking_slots WHERE state = 0`
      );
      const avail = slotQ.rows[0] && slotQ.rows[0].c;
      const fallback =
        typeof avail === "number" && avail <= 3
          ? "Forecast data is offline, but live bays look tight. I recommend booking now."
          : "Forecast data is temporarily unavailable. Use Check parking for live counts, or try again after the demand service is running.";
      return {
        reply: fallback,
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "parking_prediction" },
      };
    }
    case "check_availability": {
      if (userId) audit("checked availability");
      const r = await pool.query(
        `SELECT state FROM parking_slots`
      );
      let available = 0;
      let reserved = 0;
      let occupied = 0;
      for (const row of r.rows) {
        const st = Number(row.state);
        if (st === 0) available += 1;
        else if (st === 2) reserved += 1;
        else if (st === 1) occupied += 1;
      }
      const total = r.rowCount;
      const body = formatSlotsGuidance(available, total, reserved + occupied);
      let extra = "";
      const fc = await getForecastSlice(internalApiBase);
      if (fc && fc.nowRow && fc.nowRow.final_demand_level) {
        const lvl = String(fc.nowRow.final_demand_level);
        extra = ` Demand indicator: ${lvl} — ${levelToGuidance(lvl)}`;
      }
      return {
        reply: `${body}${extra}`,
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "check_availability" },
      };
    }
    case "view_bookings": {
      const denied = customerOnly();
      if (denied) return denied;
      audit("listed bookings via chatbot");
      const r = await pool.query(
        `SELECT id, slot_no, start_time, end_time, status, created_at
         FROM reservations
         WHERE user_id = $1
         ORDER BY start_time DESC
         LIMIT 15`,
        [userId]
      );
      if (r.rowCount === 0) {
        return {
          reply:
            "You have no reservations yet. Say Book now or choose a time like “park at 6 PM” to create one.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "view_bookings" },
        };
      }
      const lines = r.rows.map((row, i) => {
        const st = String(row.status);
        const start = new Date(row.start_time).toLocaleString();
        const end = new Date(row.end_time).toLocaleString();
        return `${i + 1}. Slot ${row.slot_no} — ${start} → ${end} (${st})`;
      });
      return {
        reply: `Here are your recent bookings:\n${lines.join("\n")}\n\nNeed to cancel? Say cancel my booking (next confirmed trip).`,
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "view_bookings" },
      };
    }
    case "cancel_booking": {
      const denied = customerOnly();
      if (denied) return denied;
      let targetId = parsed.entities.reservationId || null;
      if (targetId && !parseUserId(targetId)) targetId = null;

      if (!targetId) {
        const next = await pool.query(
          `SELECT id FROM reservations
           WHERE user_id = $1 AND status = 'confirmed'
           ORDER BY start_time ASC
           LIMIT 1`,
          [userId]
        );
        if (next.rowCount === 0) {
          return {
            reply:
              "You have no confirmed bookings to cancel (only checked-in or past trips may remain). Open My bookings on the dashboard if you need details.",
            quickReplies: defaultQuickReplies(),
            context: { lastIntent: "cancel_booking" },
          };
        }
        targetId = next.rows[0].id;
      }

      const own = await pool.query(
        `SELECT id FROM reservations WHERE id = $1 AND user_id = $2 AND status = 'confirmed'`,
        [targetId, userId]
      );
      if (own.rowCount === 0) {
        return {
          reply:
            "That booking can't be cancelled from your account, or it's no longer in confirmed status.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "cancel_booking" },
        };
      }

      const patch = await fetchJsonSafe(
        `${internalApiBase}/reservations/${targetId}/cancel`,
        { method: "PATCH", headers: { Accept: "application/json" } }
      );
      if (!patch.ok) {
        return {
          reply: "Something went wrong cancelling that booking. Please try again from your dashboard.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "cancel_booking" },
        };
      }
      audit(`cancelled booking ${targetId} via chatbot`);
      return {
        reply:
          "Your booking was cancelled and the bay was released. You can book again anytime.",
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "cancel_booking", reservationUpdated: true },
      };
    }
    case "validate_qr": {
      const denied = customerOnly();
      if (denied) return denied;
      const raw = String(parsed.entities.qrRaw || "").trim();
      if (!raw || raw.length < 20) {
        return {
          reply:
            "Paste your booking QR token (the long code from your QR) so I can validate it for gate entry.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "validate_qr" },
        };
      }
      audit("validated QR via chatbot");
      const pr = await fetchJsonSafe(`${internalApiBase}/gate/qr/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
        },
        body: JSON.stringify({ qr: raw.slice(0, 8000) }),
      });
      if (!pr.ok || !pr.data) {
        return {
          reply:
            "The gate could not validate that QR (expired, wrong token, or service busy). Open your dashboard QR or try again.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "validate_qr" },
        };
      }
      if (pr.data.ok && pr.data.reservation) {
        const rs = pr.data.reservation;
        const safeSlot = String(rs.slot_no || "");
        const nextAction = pr.data.nextAction || "—";
        return {
          reply: `QR checks out for slot ${safeSlot}. Next gate step: ${nextAction}. Have your code ready for the gatekeeper.`,
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "validate_qr" },
        };
      }
      const err =
        pr.data && typeof pr.data.error === "string"
          ? pr.data.error
          : "Invalid or expired QR.";
      return {
        reply: `${err} If you're checked in, use the dashboard for exit QR.`,
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "validate_qr" },
      };
    }
    case "create_booking": {
      const denied = customerOnly();
      if (denied) return denied;
      const clock = parsed.entities.clock;
      const durationHours = parsed.entities.durationHours ?? 1;
      if (!clock) {
        audit("started booking flow without time");
        return {
          reply:
            "What time should I reserve? For example: “today 6:30 PM” or “park at 18:00”. You can add duration: “for 2 hours”.",
          quickReplies: defaultQuickReplies(),
          context: { lastIntent: "book", pendingBook: clientContext.pendingBook || null },
        };
      }
      const now = new Date();
      const { start, end } = buildBookingWindow(now, clock, durationHours);
      const pred = await getPredictionForStart(internalApiBase, start);
      const slotLine =
        parsed.entities.slotHint != null
          ? ` I'll request slot ${String(parsed.entities.slotHint).toUpperCase()} if it's free.`
          : "";

      let demandLine = "";
      if (pred) {
        const L = String(pred.level).toLowerCase();
        const trend =
          L === "high"
            ? "Demand is expected High near that time — only a few spots may remain. I recommend confirming quickly."
            : L === "medium"
              ? "Demand looks Medium. Booking now is still wise before it climbs."
              : "Demand looks Low — good window to reserve calmly.";
        demandLine = ` ${trend}`;
        if (pred.reason) demandLine += ` (${pred.reason})`;
      } else {
        demandLine =
          " I couldn't load the ML demand signal — I'll still use live slot availability when booking.";
      }

      audit("requested booking preview via chatbot");
      return {
        reply:
          `For ${start.toLocaleString()} → ${end.toLocaleString()} (${durationHours} h):${demandLine}${slotLine}\n\nReply yes to create this booking, or no to cancel.`,
        quickReplies: ["Yes", "No"],
        context: {
          lastIntent: "book",
          pendingBook: {
            startIso: start.toISOString(),
            endIso: end.toISOString(),
            slotNo: parsed.entities.slotHint
              ? String(parsed.entities.slotHint).trim().toUpperCase()
              : null,
          },
        },
      };
    }
    case "confirm_booking": {
      const denied = customerOnly();
      if (denied) return denied;
      const pending = clientContext.pendingBook;
      if (!pending || !pending.startIso || !pending.endIso) {
        return {
          reply:
            "I don't have a pending reservation to confirm. Tell me a time like “book at 7 PM” first.",
          quickReplies: defaultQuickReplies(),
          context: {},
        };
      }
      const start = new Date(pending.startIso);
      const end = new Date(pending.endIso);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        return {
          reply: "Those times don't look valid anymore. Please ask for a new booking window.",
          quickReplies: defaultQuickReplies(),
          context: {},
        };
      }

      const body = {
        userId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        paymentMethod: "cash",
      };
      if (pending.slotNo) {
        body.slotNo = pending.slotNo;
      }

      const res = await fetchJsonSafe(`${internalApiBase}/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.data || !res.data.ok) {
        const errMsg =
          res.data && typeof res.data.error === "string"
            ? res.data.error
            : "Booking failed";
        return {
          reply: `Could not complete booking: ${errMsg}. Say a different time or try the booking page.`,
          quickReplies: defaultQuickReplies(),
          context: {},
        };
      }

      audit("requested booking via chatbot");
      return {
        reply:
          "Booking created successfully. Open your dashboard to show the QR at the gate. If you need to change plans, say cancel my booking (confirmed trips only).",
        quickReplies: defaultQuickReplies(),
        context: {
          lastIntent: "confirm_booking",
          pendingBook: null,
          reservationUpdated: true,
        },
      };
    }
    case "reject_booking": {
      if (userId) audit("declined pending chatbot booking");
      return {
        reply: "Okay — I didn't create a booking. Ask anytime with a new time.",
        quickReplies: defaultQuickReplies(),
        context: { pendingBook: null, lastIntent: null },
      };
    }
    default: {
      return {
        reply:
          "I'm not sure how to help with that. Try Check parking, Parking prediction, Book now, or type help for commands.",
        quickReplies: defaultQuickReplies(),
        context: { lastIntent: "unknown" },
      };
    }
  }
}

module.exports = {
  processChatMessage,
  defaultQuickReplies,
};
