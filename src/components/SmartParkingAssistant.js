import React, { useEffect, useMemo, useState } from 'react';
import DemandGuidanceBanner from './DemandGuidanceBanner';
import { fetchForecastArray } from '../config/apiBase';
import { fetchParkingDemandInsight } from '../utils/parkingDemandHint';
import { buildForecastTrendLine } from '../utils/forecastTrend';
import './SmartParkingAssistant.css';

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
 * @param {{ schedulingReady?: boolean, reservationDate?: string, reservationTime?: string }} props
 * Parent should mount this only after date + time are set; if `schedulingReady` is false, renders nothing.
 */
export default function SmartParkingAssistant({
  schedulingReady = false,
  reservationDate = '',
  reservationTime = '',
}) {
  const [forecastItems, setForecastItems] = useState([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState(null);

  const [arrivalInsight, setArrivalInsight] = useState(null);
  const [arrivalInsightLoading, setArrivalInsightLoading] = useState(false);

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
            ' Confirm the Node (Express) API on port 5000 and Flask demand on 5001.';
        }
        if (status === 503) {
          msg += ' Start Flask (python app.py) so forecast can load.';
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

  /** Demand model for the user's chosen arrival (same API as booking flow). */
  useEffect(() => {
    if (!schedulingReady || !reservationDate || !reservationTime) {
      setArrivalInsight(null);
      setArrivalInsightLoading(false);
      return;
    }

    const startTime = new Date(`${reservationDate}T${reservationTime}`);
    if (Number.isNaN(startTime.getTime())) {
      setArrivalInsight(null);
      return;
    }

    let cancelled = false;
    setArrivalInsightLoading(true);
    const t = setTimeout(async () => {
      try {
        const insight = await fetchParkingDemandInsight(startTime);
        if (cancelled) return;
        setArrivalInsight(insight || null);
      } finally {
        if (!cancelled) setArrivalInsightLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [schedulingReady, reservationDate, reservationTime]);

  const current = forecastItems[0];
  const forecastTrendLine = useMemo(() => buildForecastTrendLine(forecastItems), [forecastItems]);

  const arrivalLabel = useMemo(() => {
    if (!schedulingReady || !reservationDate || !reservationTime) return '';
    try {
      const d = new Date(`${reservationDate}T${reservationTime}`);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }, [schedulingReady, reservationDate, reservationTime]);

  const arrivalTimeOnly = useMemo(() => {
    if (!schedulingReady || !reservationDate || !reservationTime) return '';
    const d = new Date(`${reservationDate}T${reservationTime}`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, [schedulingReady, reservationDate, reservationTime]);

  const demandWord = () => {
    if (arrivalInsightLoading) return 'Analyzing…';
    const lv = arrivalInsight?.level;
    if (lv === 'High') return 'High';
    if (lv === 'Medium') return 'Moderate';
    if (lv === 'Low') return 'Low';
    return '—';
  };

  const arrivalLevelVerb = () => {
    if (arrivalInsightLoading) return 'Checking modeled demand…';
    const lv = arrivalInsight?.level;
    if (lv === 'High') return 'Demand at this time appears high — consider an off-peak window if you can.';
    if (lv === 'Medium') return 'Moderate traffic — booking now is reasonable.';
    if (lv === 'Low') return 'Typically calmer demand — good time to reserve.';
    return 'Tune your arrival above to refresh insight.';
  };

  const recommendedLine = () => {
    const lv = arrivalInsight?.level;
    if (!lv) return '—';
    if (lv === 'Low') return 'Recommended: Good time to book.';
    if (lv === 'Medium') return 'Recommended: Acceptable window — compare the forecast strip below.';
    if (lv === 'High') return 'Recommended: Shift earlier/later if your schedule allows.';
    return 'See detail below.';
  };

  if (!schedulingReady) {
    return null;
  }

  return (
    <section
      className="dashboard-section smart-parking-assistant smart-parking-assistant--revealed spa-premium-shell smart-parking-assistant-reveal-mount"
      aria-labelledby="smart-parking-assistant-title"
    >
      <header className="smart-parking-assistant__header spa-premium-head">
        <div>
          <h2 id="smart-parking-assistant-title" className="smart-parking-assistant__title">
            Smart Parking Assistant
          </h2>
          <p className="smart-parking-assistant__tagline">
            Personalized for your arrival{arrivalLabel ? ` · ${arrivalLabel}` : ''}
          </p>
        </div>
      </header>

      <div className="spa-arrival-banner" role="region" aria-labelledby="spa-arrival-demand-label">
        <div className="spa-arrival-banner__label" id="spa-arrival-demand-label">
          Your arrival window
        </div>
        <p className="spa-arrival-banner__hero-line">
          {arrivalInsightLoading ? (
            <span>Analyzing demand for this time slot…</span>
          ) : (
            <>
              <span className="spa-arrival-banner__prefix">Demand at </span>
              <strong>{arrivalTimeOnly || arrivalLabel || 'your time'}</strong>
              <span className="spa-arrival-banner__suffix">: </span>
              <span>{demandWord()}</span>
            </>
          )}
        </p>
        <p className="spa-arrival-banner__recommended">{recommendedLine()}</p>
      </div>

      <div className="smart-parking-assistant__block">
        <h3 className="smart-parking-assistant__heading">Live lot forecast · now onwards</h3>
        <p className="smart-parking-assistant__hint">
          Six-hour modeled outlook from the model clock (helps you compare trends with your chosen arrival above).
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
          <p className="empty-state">No forecast data available.</p>
        )}
      </div>

      <div className="smart-parking-assistant__block">
        <h3 className="smart-parking-assistant__heading">Next 6 Hours Forecast</h3>
        <p className="smart-parking-assistant__hint">
          Horizon from model “now”: five steps after current hour — use with your arrival insight above.
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
                <p className="spa-booking-advice-intro__kicker">Decision support · your selected time</p>
              </div>
            </div>
            <p
              className={`spa-booking-advice-intro__live ${arrivalInsightLoading ? 'spa-booking-advice-intro__live--pulse' : ''}`}
              role="status"
              aria-live="polite"
            >
              {arrivalLevelVerb()}
            </p>
          </div>
        </div>

        {arrivalInsightLoading && (
          <p className="parkgo-demand-loading" role="status">
            Checking modeled demand at your arrival…
          </p>
        )}

        {!arrivalInsightLoading && arrivalInsight && <DemandGuidanceBanner insight={arrivalInsight} />}
      </div>
    </section>
  );
}
