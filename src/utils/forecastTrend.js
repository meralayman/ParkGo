/** Match train_model CAPACITY for rough occupancy bar */
const CAPACITY = 50;

function levelRank(level) {
  const x = String(level || '').toLowerCase();
  if (x === 'high') return 3;
  if (x === 'medium') return 2;
  if (x === 'low') return 1;
  return 0;
}

/**
 * One-line link between "now" and the next hours from GET /api/forecast rows.
 * @param {Array<{ final_demand_level?: string, offset_hours?: number }>} rows
 * @returns {string | null}
 */
export function buildForecastTrendLine(rows) {
  if (!rows || rows.length < 2) return null;
  const cur = rows[0].final_demand_level;
  if (!cur) return null;
  const curNorm = String(cur).toLowerCase();
  const curR = levelRank(cur);
  if (!curR) return null;

  for (let i = 1; i < rows.length; i++) {
    const lv = rows[i].final_demand_level;
    if (String(lv).toLowerCase() === 'high' && curNorm !== 'high') {
      const h = rows[i].offset_hours ?? i;
      return `Currently ${cur}, but demand is expected to reach High in ${h} hour${h === 1 ? '' : 's'}.`;
    }
  }

  if (curNorm === 'high') {
    for (let i = 1; i < rows.length; i++) {
      const lv = rows[i].final_demand_level;
      if (levelRank(lv) < 3) {
        const h = rows[i].offset_hours ?? i;
        return `Currently High; demand may ease toward ${lv} in about ${h} hour${h === 1 ? '' : 's'}.`;
      }
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const lv = rows[i].final_demand_level;
    const r = levelRank(lv);
    if (r > curR) {
      const h = rows[i].offset_hours ?? i;
      return `Currently ${cur}, with demand trending toward ${lv} in about ${h} hour${h === 1 ? '' : 's'}.`;
    }
  }

  return null;
}

/**
 * 0–100 for progress bar: use adjusted cars when present, else level-based simulation.
 */
export function occupancyPercent(level, adjustedCars) {
  if (typeof adjustedCars === 'number' && !Number.isNaN(adjustedCars)) {
    return Math.min(100, Math.max(0, Math.round((adjustedCars / CAPACITY) * 100)));
  }
  const L = String(level || '').toLowerCase();
  if (L === 'high') return 88;
  if (L === 'medium') return 52;
  if (L === 'low') return 24;
  return 45;
}
