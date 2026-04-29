/**
 * Tiered parking tariff: first billed hour = first-hour EGP (same peak and off-peak),
 * each additional billed hour adds `EXTRA_PER_HOUR_EGP`.
 */

const FIRST_HOUR_EGP = () => Number(process.env.PARKING_FIRST_HOUR_EGP) || 20;
const EXTRA_PER_HOUR_EGP = () => Number(process.env.PARKING_EXTRA_PER_HOUR_EGP) || 5;

/**
 * Resolved first billed-hour amount (peak vs off-peak use the same default; callers may still vary via env overrides).
 * @returns {number}
 */
function firstHourEgpForPeakLevel(_peakLevel) {
  return FIRST_HOUR_EGP();
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Whole-hour billing: at least 1 hour; any fractional part rounds up. */
function billableHoursFromDurationHours(durationHours) {
  if (!Number.isFinite(durationHours) || durationHours <= 0) return 1;
  return Math.max(1, Math.ceil(durationHours));
}

/**
 * Total EGP for a booking of `durationHours` (from start to end).
 * Optional explicit `firstHourEgp`; otherwise defaults to PARKING_FIRST_HOUR_EGP (20).
 * Examples: 1h → 20, 2h → 25, 3h → 30.
 * @param {number} [firstHourEgp]
 */
function tieredBookingTotalEgp(durationHours, firstHourEgp) {
  const n = billableHoursFromDurationHours(durationHours);
  const first =
    typeof firstHourEgp === "number" && Number.isFinite(firstHourEgp)
      ? Number(firstHourEgp)
      : FIRST_HOUR_EGP();
  return roundMoney(first + Math.max(0, n - 1) * EXTRA_PER_HOUR_EGP());
}

/**
 * Average EGP per billed hour (for display / stored dynamic column).
 * @param {number} [firstHourEgp]
 */
function effectiveAverageHourlyEgp(durationHours, firstHourEgp) {
  const n = billableHoursFromDurationHours(durationHours);
  const total = tieredBookingTotalEgp(durationHours, firstHourEgp);
  return n > 0 ? roundMoney(total / n) : EXTRA_PER_HOUR_EGP();
}

module.exports = {
  FIRST_HOUR_EGP,
  EXTRA_PER_HOUR_EGP,
  firstHourEgpForPeakLevel,
  billableHoursFromDurationHours,
  tieredBookingTotalEgp,
  effectiveAverageHourlyEgp,
  roundMoney,
};
