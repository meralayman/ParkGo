/**
 * Tiered tariff (mirrors backend/parkingPricing.js). Same rate peak and off-peak.
 */

const firstHourEgp = () =>
  Number(process.env.REACT_APP_PARKING_FIRST_HOUR_EGP) || 20;
const extraPerHour = () =>
  Number(process.env.REACT_APP_PARKING_EXTRA_PER_HOUR_EGP) || 5;

/** Kept for API parity — always same as env first hour (peak label ignored). */
export function firstHourEgpForPeakLevel(_peakLevel) {
  return firstHourEgp();
}

export function firstHourChargeEgp() {
  return firstHourEgp();
}

function billableHoursFromDurationHours(durationHours) {
  if (!Number.isFinite(durationHours) || durationHours <= 0) return 1;
  return Math.max(1, Math.ceil(durationHours));
}

/**
 * @param {number} durationHours
 * @param {Date} [_atStart] — ignored (pricing does not vary by Cairo peak bucket).
 */
export function tieredBookingTotalEgp(durationHours, _atStart) {
  const first = firstHourEgp();
  const n = billableHoursFromDurationHours(durationHours);
  return Math.round((first + Math.max(0, n - 1) * extraPerHour()) * 100) / 100;
}

export function extraHourChargeEgp() {
  return extraPerHour();
}
