import { API_BASE } from '../config/apiBase';

/**
 * Weekend flag aligned with backend train_model: Sat/Sun → day_type 1.
 * @param {Date} d
 * @returns {0|1}
 */
export function dayTypeFromDate(d) {
  const day = d.getDay();
  return day === 0 || day === 6 ? 1 : 0;
}

/**
 * POST /api/predict-demand for the booking start time.
 * @param {Date} startTime
 * @returns {Promise<{ level: string, reason: string, raw_ml_cars_count?: number, adjusted_cars_count?: number } | null>}
 */
export async function fetchParkingDemandInsight(startTime) {
  try {
    const hour = startTime.getHours();
    const day_type = dayTypeFromDate(startTime);
    const res = await fetch(`${API_BASE}/api/predict-demand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hour, day_type }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || typeof data.final_demand_level !== 'string') {
      return null;
    }
    return {
      level: data.final_demand_level,
      reason: typeof data.reason === 'string' ? data.reason : '',
      raw_ml_cars_count: data.raw_ml_cars_count,
      adjusted_cars_count: data.adjusted_cars_count,
    };
  } catch {
    return null;
  }
}
