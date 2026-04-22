import React, { useEffect, useMemo, useState } from 'react';
import DemandGuidanceBanner from './DemandGuidanceBanner';
import { fetchForecastArray } from '../config/apiBase';
import { fetchParkingDemandInsight } from '../utils/parkingDemandHint';
import { buildForecastTrendLine } from '../utils/forecastTrend';
import './SmartParkingAssistant.css';

function defaultAdviceDateTime() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:00` };
}

function badgeClass(labelColor) {
  const c = String(labelColor || '').toLowerCase();
  if (c === 'green') return 'spa-badge spa-badge--green';
  if (c === 'yellow') return 'spa-badge spa-badge--yellow';
  if (c === 'red') return 'spa-badge spa-badge--red';
  return 'spa-badge spa-badge--muted';
}

function formatHourSlot(row) {
  const at = row.at || '';
  return at.length >= 16 ? at.slice(11, 16) : `${String(row.hour).padStart(2, '0')}:00`;
}

function ForecastCard({ row, variant = 'default' }) {
  const offset = row.offset_hours ?? 0;
  const level = row.final_demand_level ?? '—';
  const isHero = variant === 'hero';
  const isHigh = String(level).toLowerCase() === 'high';

  return (
    <article
      className={`spa-forecast-card${isHero ? ' spa-forecast-card--hero' : ''}${isHero && isHigh ? ' spa-forecast-card--hero-high' : ''}`}
    >
      <div className="spa-forecast-card__top">
        <div className={isHero ? 'spa-forecast-card__lead' : ''}>
          <div>
            <div className="spa-forecast-card__hour">{formatHourSlot(row)}</div>
            <div className="spa-forecast-card__offset">{offset === 0 ? 'Now' : `+${offset} h`}</div>
          </div>
        </div>
        <span className={badgeClass(row.label_color)}>{level}</span>
      </div>
      <div className="spa-forecast-card__body">{row.message || ''}</div>
      <div className="spa-forecast-card__reason">
        <strong>Reason</strong>
        <span>{row.reason || '—'}</span>
      </div>
    </article>
  );
}

/**
 * Official dashboard block: current demand, 6-hour forecast, booking advice preview.
 */
export default function SmartParkingAssistant() {
  const [forecastItems, setForecastItems] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState(null);

  const [adviceForm, setAdviceForm] = useState(() => defaultAdviceDateTime());
  const [adviceInsight, setAdviceInsight] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      setForecastLoading(true);
      setForecastError(null);
      try {
        const data = await fetchForecastArray();
        if (!cancelled) setForecastItems(data);
      } catch (e) {
        const status = /** @type {{ status?: number }} */ (e).status;
        let msg = e instanceof Error ? e.message : 'Failed to load forecast';
        if (status === 404) {
          msg +=
            ' If this keeps happening, confirm the Node (Express) API runs on port 5000 and the Flask demand service runs on port 5001. In the project root .env file, set REACT_APP_API_BASE_URL=http://127.0.0.1:5000 (never point this at Flask on port 5001), then restart the frontend dev server with npm start.';
        }
        if (status === 503) {
          msg +=
            ' Start the Flask service with python app.py (default port 5001) so Express can proxy forecast requests.';
        }
        if (!cancelled) setForecastError(msg);
      } finally {
        if (!cancelled) setForecastLoading(false);
      }
    }

    loadForecast();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const { date, time } = adviceForm;
    if (!date || !time) {
      setAdviceInsight(null);
      setAdviceLoading(false);
      return;
    }

    const startTime = new Date(`${date}T${time}`);
    if (Number.isNaN(startTime.getTime())) {
      setAdviceInsight(null);
      return;
    }

    let cancelled = false;
    setAdviceLoading(true);
    const t = setTimeout(async () => {
      try {
        const insight = await fetchParkingDemandInsight(startTime);
        if (cancelled) return;
        setAdviceInsight(insight || null);
      } finally {
        if (!cancelled) setAdviceLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [adviceForm.date, adviceForm.time]);

  const current = forecastItems[0];
  const forecastTrendLine = useMemo(
    () => buildForecastTrendLine(forecastItems),
    [forecastItems]
  );

  const handleAdviceChange = (e) => {
    const { name, value } = e.target;
    setAdviceForm((prev) => ({ ...prev, [name]: value }));
  };

  const bookingAdviceLiveLine = () => {
    if (adviceLoading) return 'Running a live demand check for your arrival…';
    if (!adviceForm.date || !adviceForm.time) return 'Select when you plan to arrive — guidance updates automatically.';
    const lv = adviceInsight?.level;
    if (lv === 'High') return 'High pressure window — follow the actions below.';
    if (lv === 'Medium') return 'Mixed traffic — booking soon is still a solid option.';
    if (lv === 'Low') return 'Great window — plenty of capacity expected.';
    return 'Same intelligence as Make Reservation — tweak date or time to refresh.';
  };

  return (
    <section
      className="dashboard-section smart-parking-assistant"
      aria-labelledby="smart-parking-assistant-title"
    >
      <header className="smart-parking-assistant__header">
        <h2 id="smart-parking-assistant-title" className="smart-parking-assistant__title">
          Smart Parking Assistant
        </h2>
        <p className="smart-parking-assistant__tagline">AI-powered demand prediction</p>
      </header>

      <div className="smart-parking-assistant__block">
        <h3 className="smart-parking-assistant__heading">Current Demand</h3>
        <p className="smart-parking-assistant__hint">
          How busy the parking is expected to be right now.
        </p>

        {forecastLoading && (
          <div className="spa-loading" role="status">
            Loading current demand…
          </div>
        )}

        {!forecastLoading && forecastError && (
          <div className="spa-alert" role="alert">
            {forecastError}
          </div>
        )}

        {!forecastLoading && !forecastError && current && (
          <div className="smart-parking-assistant__current-wrap">
            <div className="smart-parking-assistant__current-label">Starting from this hour</div>
            <ForecastCard row={current} variant="hero" />
            {forecastTrendLine && (
              <p className="spa-forecast-trend" role="status">
                {forecastTrendLine}
              </p>
            )}
          </div>
        )}

        {!forecastLoading && !forecastError && !current && (
          <p className="empty-state">No demand data available.</p>
        )}
      </div>

      <div className="smart-parking-assistant__block">
        <h3 className="smart-parking-assistant__heading">Next 6 Hours Forecast</h3>
        <p className="smart-parking-assistant__hint">
          Six-hour window from now: the following five hours after the current hour (see Current Demand above).
        </p>

        {!forecastLoading && !forecastError && forecastItems.length > 1 && (
          <div className="smart-parking-assistant__forecast-grid spa-five-cols">
            {forecastItems.slice(1).map((row) => (
              <ForecastCard key={`${row.at}-${row.offset_hours}`} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className="smart-parking-assistant__block" id="spa-booking-advice">
        <div className="spa-booking-advice-intro">
          <div className="spa-booking-advice-intro__accent" aria-hidden="true" />
          <div className="spa-booking-advice-intro__inner">
            <div className="spa-booking-advice-intro__top">
              <div>
                <h3 className="spa-booking-advice-intro__title">Booking advice</h3>
                <p className="spa-booking-advice-intro__kicker">Decision support · Live model</p>
              </div>
            </div>
            <p
              className={`spa-booking-advice-intro__live ${adviceLoading ? 'spa-booking-advice-intro__live--pulse' : ''}`}
              role="status"
              aria-live="polite"
            >
              {bookingAdviceLiveLine()}
            </p>
          </div>
        </div>

        <div className="spa-booking-row">
          <div className="form-group">
            <label htmlFor="spa-advice-date">Date</label>
            <input
              id="spa-advice-date"
              type="date"
              name="date"
              value={adviceForm.date}
              onChange={handleAdviceChange}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="form-group">
            <label htmlFor="spa-advice-time">Time</label>
            <input
              id="spa-advice-time"
              type="time"
              name="time"
              value={adviceForm.time}
              onChange={handleAdviceChange}
            />
          </div>
        </div>

        {adviceLoading && (
          <p className="parkgo-demand-loading" role="status">
            Checking typical demand for this time…
          </p>
        )}

        {!adviceLoading && adviceInsight && <DemandGuidanceBanner insight={adviceInsight} />}
      </div>
    </section>
  );
}
