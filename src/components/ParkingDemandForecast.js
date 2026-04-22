import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config/apiBase';
import './ParkingDemandForecast.css';

function badgeClass(labelColor) {
  const c = String(labelColor || '').toLowerCase();
  if (c === 'green') return 'parking-demand-forecast__badge parking-demand-forecast__badge--green';
  if (c === 'yellow') return 'parking-demand-forecast__badge parking-demand-forecast__badge--yellow';
  if (c === 'red') return 'parking-demand-forecast__badge parking-demand-forecast__badge--red';
  return 'parking-demand-forecast__badge parking-demand-forecast__badge--muted';
}

function formatHourSlot(row) {
  const at = row.at || '';
  const short = at.length >= 16 ? at.slice(11, 16) : `${String(row.hour).padStart(2, '0')}:00`;
  return short;
}

function ForecastCard({ row }) {
  const offset = row.offset_hours ?? 0;
  const level = row.final_demand_level ?? '—';

  return (
    <article className="parking-demand-forecast__card">
      <div className="parking-demand-forecast__card-meta">
        <div>
          <div className="parking-demand-forecast__hour-label">{formatHourSlot(row)}</div>
          <div className="small text-muted">Hour {row.hour}</div>
          <span className="parking-demand-forecast__offset">
            {offset === 0 ? 'Now' : `+${offset} h`}
          </span>
        </div>
        <span className={badgeClass(row.label_color)}>{level}</span>
      </div>
      <div className="parking-demand-forecast__body">
        <div>{row.message || ''}</div>
        <div className="parking-demand-forecast__body-row">
          <strong>Reason</strong>
          <span>{row.reason || '—'}</span>
        </div>
      </div>
    </article>
  );
}

/**
 * Loads GET /api/forecast (proxied to Flask). Shows current slot + full 6-hour horizon.
 */
export default function ParkingDemandForecast() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/forecast`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            data && typeof data.error === 'string'
              ? data.error
              : `Forecast unavailable (${res.status})`;
          throw new Error(msg);
        }

        if (!Array.isArray(data)) {
          throw new Error('Unexpected forecast response');
        }

        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load forecast');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = items[0];
  const upcoming = items.slice(1);

  return (
    <section className="parking-demand-forecast" aria-labelledby="parking-demand-forecast-heading">
      <h2 id="parking-demand-forecast-heading" className="parking-demand-forecast__title">
        Parking Demand Forecast
      </h2>

      {loading && (
        <div className="parking-demand-forecast__loading" role="status">
          Loading forecast…
        </div>
      )}

      {!loading && error && (
        <div className="parking-demand-forecast__alert" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-muted">No forecast data returned.</p>
      )}

      {!loading && !error && current && (
        <>
          <h3 className="parking-demand-forecast__subtitle">Current demand</h3>
          <div className="parking-demand-forecast__current">
            <div className="parking-demand-forecast__current-label">Starting from this hour</div>
            <ForecastCard row={current} />
          </div>

          <h3 className="parking-demand-forecast__subtitle">Next 6 hours</h3>
          <p className="small text-muted mb-2 mb-md-3">
            Six-step outlook: current hour plus the following five slots (hourly).
          </p>
          <div className="parking-demand-forecast__grid">
            {upcoming.map((row) => (
              <ForecastCard key={`${row.at}-${row.offset_hours}`} row={row} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
