/**
 * Smart parking: nearest ranking, availability-aware suggestions,
 * peak-hour detection (Africa/Cairo), dynamic hourly pricing.
 */

const {
  tieredBookingTotalEgp,
  effectiveAverageHourlyEgp,
  billableHoursFromDurationHours,
  FIRST_HOUR_EGP,
  firstHourEgpForPeakLevel,
} = require("./parkingPricing");

/** Reference base for peak/availability modifiers (aligned with first billed hour EGP). */
const BASE_RATE = () => FIRST_HOUR_EGP();

/** Haversine distance in km */
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function cairoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = Number(map.hour);
  const wd = map.weekday;
  const isWeekend = wd === "Sat" || wd === "Sun";
  return { hour, weekday: wd, isWeekend };
}

/**
 * Peak multiplier: busier windows → higher price factor.
 * @returns {{ peakLevel: 'low'|'normal'|'high', peakFactor: number, label: string }}
 */
function peakInfo(at = new Date()) {
  const { hour, isWeekend } = cairoParts(at);
  if (isWeekend) {
    if (hour >= 11 && hour < 19) {
      return { peakLevel: "normal", peakFactor: 1.08, label: "Weekend busy hours" };
    }
    return { peakLevel: "low", peakFactor: 0.9, label: "Weekend off-peak" };
  }
  if ((hour >= 8 && hour < 10) || (hour >= 17 && hour < 20)) {
    return { peakLevel: "high", peakFactor: 1.22, label: "Rush hour" };
  }
  if (hour >= 12 && hour < 15) {
    return { peakLevel: "normal", peakFactor: 1.1, label: "Lunch peak" };
  }
  if (hour >= 10 && hour < 17) {
    return { peakLevel: "normal", peakFactor: 1.0, label: "Standard hours" };
  }
  return { peakLevel: "low", peakFactor: 0.88, label: "Quiet hours" };
}

/**
 * More occupied lots → slightly higher price; emptier → discount.
 */
function availabilityFactor(available, total) {
  if (!total || total <= 0) return 1;
  const occ = 1 - Math.min(1, Math.max(0, available / total));
  return 0.86 + 0.28 * occ;
}

function clampRate(base, raw) {
  const lo = base * 0.72;
  const hi = base * 1.38;
  return Math.round(Math.min(hi, Math.max(lo, raw)) * 100) / 100;
}

/**
 * @param {{ baseRate?: number, at?: Date, available: number, total: number }}
 */
function computeDynamicHourlyRate({ baseRate = BASE_RATE(), at = new Date(), available, total }) {
  const peak = peakInfo(at);
  const availF = availabilityFactor(available, total);
  const raw = baseRate * peak.peakFactor * availF;
  const hourlyRate = clampRate(baseRate, raw);
  return {
    hourlyRate,
    peakLevel: peak.peakLevel,
    peakFactor: peak.peakFactor,
    peakLabel: peak.label,
    availabilityFactor: availF,
    baseRate,
  };
}

/**
 * Vacant bays use `state = 0` (see server.js). Picks best-effort alphabetical first label.
 * If the simple SQL misses (driver/type quirks), fall back to a full-table scan so UI matches `countLiveSlots`.
 */
async function pickVacantBaySlot(executor, freeCountKnown) {
  const nFree = Number(freeCountKnown);
  if (!Number.isFinite(nFree) || nFree <= 0) return null;

  const tryQueries = [
    async () =>
      executor.query(
        `SELECT slot_no FROM parking_slots WHERE state::integer = 0 ORDER BY slot_no ASC LIMIT 1`
      ),
    async () =>
      executor.query(`SELECT slot_no FROM parking_slots WHERE state = $1 ORDER BY slot_no ASC LIMIT 1`, [0]),
  ];

  for (const run of tryQueries) {
    try {
      const r = await run();
      const slot = r.rows[0]?.slot_no;
      if (slot != null && String(slot).trim() !== "") return String(slot).trim();
    } catch (_e) {
      /* next strategy */
    }
  }

  try {
    const all = await executor.query(
      `SELECT slot_no, state FROM parking_slots ORDER BY slot_no ASC`
    );
    /** @type {{ slot_no?: unknown; state?: unknown }[]} */
    const rows = Array.isArray(all.rows) ? all.rows : [];
    for (const row of rows) {
      const sn = row.slot_no;
      if (row.state == null) continue;
      const st = typeof row.state === "bigint" ? Number(row.state) : Number(row.state);
      if (!Number.isFinite(st) || st !== 0) continue;
      if (sn != null && String(sn).trim() !== "") return String(sn).trim();
    }
  } catch (e) {
    console.warn("[ParkGo] pickVacantBaySlot fallback scan failed:", e?.message || e);
  }

  return null;
}

/**
 * Free/total use the same predicate as vacancy picks (`state = 0`), so UI never shows
 * "full capacity free" without a suggested bay.
 */
async function countLiveSlots(executor) {
  const r = await executor.query(`
    SELECT
      COUNT(*) FILTER (WHERE state = 0)::int AS free,
      COUNT(*)::int AS total
    FROM parking_slots
  `);
  const row = r.rows?.[0];
  const free = Math.max(0, Number(row?.free) || 0);
  const totalRaw = Number(row?.total) || 0;
  const total = totalRaw > 0 ? totalRaw : Math.max(free, 1);
  return { free, total };
}

const PARKING_LOTS = [
  {
    id: "anu",
    name: "Alexandria National University Parking",
    path: "/book-parking/alexandria-national-university",
    lat: 31.2006,
    lng: 29.9187,
    dataSource: "live",
  },
  {
    id: "smouha",
    name: "Smouha City Center Garage",
    path: "/book-parking/alexandria-national-university",
    lat: 31.2167,
    lng: 29.95,
    dataSource: "synthetic",
    synthetic: { free: 7, total: 44 },
  },
  {
    id: "stanley",
    name: "Stanley Waterfront Parking",
    path: "/book-parking/alexandria-national-university",
    lat: 31.2394,
    lng: 29.9639,
    dataSource: "synthetic",
    synthetic: { free: 18, total: 52 },
  },
];

async function enrichLot(executor, lot, userLat, userLng, at) {
  let available;
  let total;
  if (lot.dataSource === "live") {
    const c = await countLiveSlots(executor);
    available = c.free;
    total = c.total;
  } else {
    available = lot.synthetic.free;
    total = lot.synthetic.total;
  }

  const dyn = computeDynamicHourlyRate({ at, available, total });
  let distanceKmVal = null;
  if (
    userLat != null &&
    userLng != null &&
    Number.isFinite(Number(userLat)) &&
    Number.isFinite(Number(userLng))
  ) {
    distanceKmVal = distanceKm(Number(userLat), Number(userLng), lot.lat, lot.lng);
  }

  const availRatio = total > 0 ? available / total : 0;
  /** Higher = better. Proximity dominates when coords given; availability weights spare capacity. */
  const availabilityPoints = availRatio * 55;
  const proximityPoints =
    distanceKmVal != null ? 45 / (1 + distanceKmVal) : 22;

  let score = availabilityPoints + proximityPoints;

  return {
    id: lot.id,
    name: lot.name,
    path: lot.path,
    lat: lot.lat,
    lng: lot.lng,
    dataSource: lot.dataSource,
    availableSpots: available,
    totalSpots: total,
    availabilityRatio: Math.round(availRatio * 1000) / 1000,
    distanceKm: distanceKmVal != null ? Math.round(distanceKmVal * 100) / 100 : null,
    peakLevel: dyn.peakLevel,
    peakLabel: dyn.peakLabel,
    hourlyRateEgp: dyn.hourlyRate,
    baseRateEgp: dyn.baseRate,
    factors: {
      peakFactor: dyn.peakFactor,
      availabilityFactor: dyn.availabilityFactor,
    },
    sortScore: Math.round(score * 100) / 100,
    scoreParts: {
      availabilityPoints: Math.round(availabilityPoints * 100) / 100,
      proximityPoints: Math.round(proximityPoints * 100) / 100,
      hasUserCoordinates: Boolean(distanceKmVal != null),
    },
  };
}

/**
 * Prefer client-provided time (planned arrival); default now. Used for Cairo peak-band pricing cues.
 */
function resolveSuggestionEvaluateAt(query) {
  if (!query || query.at === undefined || query.at === null || query.at === "") {
    return new Date();
  }
  const parsed = new Date(query.at);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Among lots with at least one free bay and a known distance to the user, pick the geographically closest.
 * @returns {string | null} lot id
 */
function nearestAvailableLotId(lotsWithDistance) {
  const candidates = lotsWithDistance.filter(
    (l) => Number(l.availableSpots) > 0 && l.distanceKm != null && Number.isFinite(Number(l.distanceKm))
  );
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) {
    if (Number(c.distanceKm) < Number(best.distanceKm)) best = c;
  }
  return best.id ? String(best.id) : null;
}

/**
 * @param {Awaited<ReturnType<typeof enrichLot>>[]} sortedLots
 */
function annotateRecommendations(sortedLots, peak, nearestAvailLotId_, hasCoordinates) {
  return sortedLots.map((lot, index) => {
    const pct = Math.round((lot.availabilityRatio || 0) * 100);
    const highlights = [];
    if (index === 0) {
      highlights.push("Highest combined suitability (availability + proximity to you when location is shared).");
    }
    if (nearestAvailLotId_ && String(lot.id) === nearestAvailLotId_) {
      highlights.push("Closest lot to your coordinates among options that still report spare capacity.");
    }
    highlights.push(`${peak.label} — indicative hourly rate reflects this Cairo time band.`);
    highlights.push(`${lot.availableSpots} / ${lot.totalSpots} spots free (${pct}%).`);

    const reasons = [];
    reasons.push({
      criterion: "availability",
      detail: `${pct}% of bays reported free; higher spare capacity boosts the suitability score.`,
    });
    if (hasCoordinates && lot.distanceKm != null) {
      reasons.push({
        criterion: "proximity",
        detail: `About ${lot.distanceKm} km from your coordinates haversine (lower is better after availability weighting).`,
      });
    } else if (!hasCoordinates) {
      reasons.push({
        criterion: "proximity",
        detail: "No lat/lng provided — proximity uses a neutral midpoint score so rankings still prioritize availability.",
      });
    }
    reasons.push({
      criterion: "time_of_day",
      detail:
        `${peak.peakFactor.toFixed(2)} × peak factor on reference rate — indicative EGP/hour ${lot.hourlyRateEgp}.`,
    });

    return {
      rank: index + 1,
      lotId: lot.id,
      name: lot.name,
      path: lot.path,
      sortScore: lot.sortScore,
      scoreParts: lot.scoreParts,
      distanceKm: lot.distanceKm,
      availableSpots: lot.availableSpots,
      totalSpots: lot.totalSpots,
      availabilityRatio: lot.availabilityRatio,
      hourlyRateEgp: lot.hourlyRateEgp,
      peakLevel: lot.peakLevel,
      peakLabel: peak.label,
      dataSource: lot.dataSource,
      isNearestAmongAvailableLots: Boolean(nearestAvailLotId_ && String(lot.id) === nearestAvailLotId_),
      isTopRecommendation: index === 0,
      highlights,
      reasons,
    };
  });
}

/**
 * Rank lots for smart parking guidance (availability + proximity + peak-aware indicative pricing).
 *
 * @param {*} executor - pg Pool or PoolClient (`query(sql, params)`)
 * @param {{ lat?: number|string, lng?: number|string, at?: string }} query
 */
async function getParkingSuggestions(executor, query) {
  const lat =
    query && query.lat !== undefined && query.lat !== null && query.lat !== "" ? Number(query.lat) : null;
  const lng =
    query && query.lng !== undefined && query.lng !== null && query.lng !== "" ? Number(query.lng) : null;
  const hasCoordinates =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  const at = resolveSuggestionEvaluateAt(query);

  const enriched = await Promise.all(
    PARKING_LOTS.map((lot) => enrichLot(executor, lot, lat, lng, at))
  );

  enriched.sort((a, b) => b.sortScore - a.sortScore);
  const live = enriched.find((x) => x.dataSource === "live");
  const peak = peakInfo(at);

  const nearestAvail = nearestAvailableLotId(enriched);
  const recommendations = annotateRecommendations(enriched, peak, nearestAvail, hasCoordinates);
  const anyAvailable = enriched.some((l) => Number(l.availableSpots) > 0);

  const liveAvail = await countLiveSlots(executor);
  let suggestedSlotNo = await pickVacantBaySlot(executor, liveAvail.free).catch(() => null);

  return {
    generatedAt: new Date().toISOString(),
    evaluationTime: at.toISOString(),
    timezone: "Africa/Cairo",
    peak: {
      level: peak.peakLevel,
      factor: peak.peakFactor,
      label: peak.label,
    },
    criteria: [
      {
        key: "availability",
        weight: "~55% spare-capacity fraction (lots with more empty bays rank higher when demand is tighter).",
      },
      {
        key: "proximity",
        weight:
          "~45% distance decay 45/(1+d km) when lat/lng are provided; neutral midpoint fixed score otherwise.",
      },
      {
        key: "peak_hours",
        weight:
          "Indicative EGP/hour uses Cairo weekday/weekend buckets (rush/lunch/off-peak) combined with occupancy-based factor.",
      },
    ],
    query: {
      lat: hasCoordinates ? Number(lat) : null,
      lng: hasCoordinates ? Number(lng) : null,
      hasCoordinates,
    },
    nearestAvailableLotId: nearestAvail,
    globalAvailabilitySummary: {
      lotsEvaluated: enriched.length,
      anyLotHasFreeSpaces: anyAvailable,
    },
    methodology:
      "Sort score = spare-capacity share × 55 + proximity term (45/(1+d)) or neutral 22 points without coords; indicative pricing layers Cairo peak multiplier on FIRST_HOUR_EGP reference.",

    primaryLotId: live?.id || "anu",
    /** Next free numbered bay on the live grid (ordering by slot label), null if none. */
    suggestedSlotNo,
    recommendations,
    suggestions: enriched,
  };
}

/**
 * Booking-window pricing: uses peak at start time and current live availability (best-effort).
 */
async function computeQuote(executor, startTimeIso, endTimeIso) {
  const start = new Date(startTimeIso);
  const end = new Date(endTimeIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  const { free, total } = await countLiveSlots(executor);
  const dyn = computeDynamicHourlyRate({ at: start, available: free, total });
  const peak = peakInfo(start);
  const firstHrEgp = firstHourEgpForPeakLevel(peak.peakLevel);
  const totalEgp = tieredBookingTotalEgp(hours, firstHrEgp);
  const billedHours = billableHoursFromDurationHours(hours);
  return {
    hours: Math.round(hours * 1000) / 1000,
    billedHours,
    hourlyRateEgp: effectiveAverageHourlyEgp(hours, firstHrEgp),
    totalEstimateEgp: totalEgp,
    baseRateEgp: dyn.baseRate,
    peakLevel: peak.peakLevel,
    peakLabel: peak.label,
    liveAvailability: { availableSpots: free, totalSpots: total },
    factors: {
      peakFactor: dyn.peakFactor,
      availabilityFactor: dyn.availabilityFactor,
    },
  };
}

async function ensureDynamicHourlyRateColumn(pool) {
  await pool.query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS dynamic_hourly_rate DECIMAL(12,4)`);
}

module.exports = {
  peakInfo,
  computeDynamicHourlyRate,
  getParkingSuggestions,
  computeQuote,
  countLiveSlots,
  ensureDynamicHourlyRateColumn,
  distanceKm,
  PARKING_LOTS,
};
