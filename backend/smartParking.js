/**
 * Smart parking: nearest ranking, availability-aware suggestions,
 * peak-hour detection (Africa/Cairo), dynamic hourly pricing.
 */

const BASE_RATE = () => Number(process.env.PARKING_HOURLY_RATE) || 5;

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

async function countLiveSlots(executor) {
  const r = await executor.query(
    `SELECT state::text AS state, COUNT(*)::int AS n FROM parking_slots GROUP BY state`
  );
  let free = 0;
  let reservedOrBusy = 0;
  for (const row of r.rows) {
    const st = Number(row.state);
    const n = Number(row.n) || 0;
    if (st === 0) free += n;
    else reservedOrBusy += n;
  }
  const total = free + reservedOrBusy;
  return { free, total: total || 1 };
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
  let score = availRatio * 55;
  if (distanceKmVal != null) {
    score += 45 / (1 + distanceKmVal);
  } else {
    score += 22;
  }

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
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ lat?: number|string, lng?: number|string }} query
 */
async function getParkingSuggestions(executor, query) {
  const lat = query.lat != null ? Number(query.lat) : null;
  const lng = query.lng != null ? Number(query.lng) : null;
  const at = new Date();
  const enriched = await Promise.all(
    PARKING_LOTS.map((lot) => enrichLot(executor, lot, lat, lng, at))
  );
  enriched.sort((a, b) => b.sortScore - a.sortScore);
  const live = enriched.find((x) => x.dataSource === "live");
  const peak = peakInfo(at);
  return {
    generatedAt: at.toISOString(),
    timezone: "Africa/Cairo",
    peak: {
      level: peak.peakLevel,
      label: peak.label,
    },
    suggestions: enriched,
    primaryLotId: live?.id || "anu",
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
  const totalEgp = Math.round(hours * dyn.hourlyRate * 100) / 100;
  const peak = peakInfo(start);
  return {
    hours: Math.round(hours * 1000) / 1000,
    hourlyRateEgp: dyn.hourlyRate,
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
