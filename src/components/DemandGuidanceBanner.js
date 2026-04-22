import React from 'react';
import { occupancyPercent } from '../utils/forecastTrend';

const CONFIG = {
  High: {
    main: 'Parking is nearly full. Consider another time or location.',
    className: 'parkgo-demand-banner--warning',
    role: 'alert',
  },
  Low: {
    main: 'Perfect time to park. Spots are widely available.',
    className: 'parkgo-demand-banner--success',
    role: 'status',
  },
  Medium: {
    main: 'Moderate traffic. Booking now is recommended.',
    className: 'parkgo-demand-banner--medium',
    role: 'status',
  },
};

/**
 * Action-oriented demand guidance + optional model reason + occupancy bar + explainability line.
 * @param {{ level: string, reason?: string, adjusted_cars_count?: number }} insight
 */
function normalizeLevel(level) {
  const L = String(level || '').toLowerCase();
  if (L === 'high') return 'High';
  if (L === 'medium') return 'Medium';
  if (L === 'low') return 'Low';
  return null;
}

export default function DemandGuidanceBanner({ insight }) {
  const key = normalizeLevel(insight?.level);
  if (!insight || !key || !CONFIG[key]) return null;

  const cfg = CONFIG[key];
  const pct = occupancyPercent(key, insight.adjusted_cars_count);
  const reason = typeof insight.reason === 'string' ? insight.reason.trim() : '';

  return (
    <div
      className={`parkgo-demand-banner ${cfg.className} parkgo-demand-banner--rich`}
      role={cfg.role}
    >
      <div className="parkgo-demand-banner__copy parkgo-demand-banner__copy--with-lead">
        <span
          className={`parkgo-demand-banner__level-dot parkgo-demand-banner__level-dot--${key.toLowerCase()}`}
          aria-hidden="true"
        />
        <div className="parkgo-demand-banner__body-col">
          <p className="parkgo-demand-banner__main">{cfg.main}</p>
          {reason ? <p className="parkgo-demand-banner__reason-context">{reason}</p> : null}
        </div>
      </div>

      <div className="parkgo-demand-bar" aria-hidden="true">
        <div className="parkgo-demand-bar__fill" style={{ width: `${pct}%` }} />
      </div>

      <p className="parkgo-demand-banner__meta">
        Demand level: {key} · Estimated occupancy ~{pct}%
      </p>

      <p className="parkgo-demand-banner__explain">Based on peak hours and historical trends</p>
    </div>
  );
}
