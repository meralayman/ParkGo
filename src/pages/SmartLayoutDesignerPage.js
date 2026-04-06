import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ParkingLotMockup3D from '../components/ParkingLotMockup3D';
import './SmartLayoutDesignerPage.css';

const STEPS = [
  { id: 1, label: 'Site & settings' },
  { id: 2, label: '3D layout' },
];

/** Per-bay size ranges (width × length / depth); grid uses midpoints for density */
const BAY_WIDTH_MIN_M = 2.4;
const BAY_WIDTH_MAX_M = 2.7;
const BAY_LENGTH_MIN_M = 4.8;
const BAY_LENGTH_MAX_M = 5.5;
const BAY_WIDTH_TYP_M = (BAY_WIDTH_MIN_M + BAY_WIDTH_MAX_M) / 2;
const BAY_DEPTH_TYP_M = (BAY_LENGTH_MIN_M + BAY_LENGTH_MAX_M) / 2;
const BAY_DIMS_RANGE_LABEL = `${BAY_WIDTH_MIN_M}–${BAY_WIDTH_MAX_M} m × ${BAY_LENGTH_MIN_M}–${BAY_LENGTH_MAX_M} m`;

const LANE_WIDTH_M = 3;
const CIRCULATION_TWO_LANE_M = 2 * LANE_WIDTH_M;
const ENTRANCE_RESERVE_M = 5;
const INTER_STALL_GAP_M = 0.35;

const ENTRANCE_OPTIONS = [
  { id: 'left', label: 'Left side' },
  { id: 'right', label: 'Right side' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

const OPPOSITE_SIDE = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

function fmtM(n, decimals = 2) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const s = v.toFixed(decimals);
  return s.replace(/\.?0+$/, '') || '0';
}

function computeManualParkingLayout(lotWidthM, lotHeightM, entranceSide, gateMode) {
  const moduleDepthM = 2 * BAY_DEPTH_TYP_M + CIRCULATION_TWO_LANE_M;
  const singleSideDepthM = BAY_DEPTH_TYP_M + CIRCULATION_TWO_LANE_M;
  const stallPitchAlongRow = BAY_WIDTH_TYP_M + INTER_STALL_GAP_M;

  const lotW = Math.max(5, Math.min(5000, Number(lotWidthM) || 50));
  const lotH = Math.max(5, Math.min(5000, Number(lotHeightM) || 30));
  const dualGates = gateMode === 'dual';

  const entranceDenom = entranceSide === 'left' || entranceSide === 'right' ? lotW : lotH;
  const strips = dualGates ? 2 : 1;
  const entrancePct = Math.min(48, Math.max(2.5, ((ENTRANCE_RESERVE_M * strips) / entranceDenom) * 100));
  const mainAisleDenom = entranceSide === 'top' || entranceSide === 'bottom' ? lotW : lotH;
  const mainAislePct = Math.min(38, Math.max(5, (CIRCULATION_TWO_LANE_M / mainAisleDenom) * 100));

  let W = lotW;
  let H = lotH;
  if (dualGates) {
    if (entranceSide === 'left' || entranceSide === 'right') {
      W = Math.max(0, W - 2 * ENTRANCE_RESERVE_M);
    } else {
      H = Math.max(0, H - 2 * ENTRANCE_RESERVE_M);
    }
  } else if (entranceSide === 'left' || entranceSide === 'right') {
    W = Math.max(0, W - ENTRANCE_RESERVE_M);
  } else {
    H = Math.max(0, H - ENTRANCE_RESERVE_M);
  }

  const long_m = Math.max(W, H);
  const short_m = Math.min(W, H);

  const capPerRow = Math.max(0, Math.floor(long_m / stallPitchAlongRow));
  const modules = Math.floor(short_m / moduleDepthM);
  const remShort = short_m - modules * moduleDepthM;
  const extraRows = remShort >= singleSideDepthM ? 1 : 0;
  const totalRows = modules * 2 + extraRows;
  const bayCount = capPerRow * totalRows;

  /** Scale grid with lot size (was capped at 24×20 so large sites never gained lanes in 3D) */
  const colsCap = Math.min(200, Math.max(8, Math.ceil(long_m / stallPitchAlongRow) + 4));
  const rowsCap = Math.min(120, Math.max(6, totalRows + 6));
  const displayCols = Math.min(colsCap, Math.max(4, capPerRow || 4));
  const displayRowsTotal = Math.min(rowsCap, Math.max(2, totalRows || 2));
  const rowsTop = Math.ceil(displayRowsTotal / 2);
  const rowsBottom = Math.floor(displayRowsTotal / 2);

  return {
    cols: displayCols,
    rowsTop,
    rowsBottom,
    bayCount: Math.max(0, bayCount),
    capPerRow,
    totalRows,
    moduleDepthM,
    circulationM: CIRCULATION_TWO_LANE_M,
    laneWidthM: LANE_WIDTH_M,
    entranceReserveM: ENTRANCE_RESERVE_M,
    interStallGapM: INTER_STALL_GAP_M,
    stallPitchAlongRow,
    entrancePct,
    mainAislePct,
    lotWidthM: lotW,
    lotHeightM: lotH,
    dualGates,
    entranceStripsM: ENTRANCE_RESERVE_M * strips,
  };
}

const SmartLayoutDesignerPage = () => {
  const [step, setStep] = useState(1);
  const [parkingName, setParkingName] = useState('Faculty Parking');
  const [lotShape, setLotShape] = useState('irregular');
  const [lotWidthM, setLotWidthM] = useState(50);
  const [lotHeightM, setLotHeightM] = useState(30);
  const [entranceSide, setEntranceSide] = useState('left');
  const [gateMode, setGateMode] = useState('single');

  const manualGrid = useMemo(
    () => computeManualParkingLayout(lotWidthM, lotHeightM, entranceSide, gateMode),
    [lotWidthM, lotHeightM, entranceSide, gateMode]
  );

  const entranceLabel = useMemo(
    () => ENTRANCE_OPTIONS.find((o) => o.id === entranceSide)?.label || entranceSide,
    [entranceSide]
  );

  const exitSideId = OPPOSITE_SIDE[entranceSide];
  const exitLabel = useMemo(
    () => ENTRANCE_OPTIONS.find((o) => o.id === exitSideId)?.label || exitSideId,
    [exitSideId]
  );

  const spaceEfficiency = useMemo(() => {
    const base = lotShape === 'irregular' ? 78 : 84;
    return Math.max(52, Math.min(95, Math.round(base)));
  }, [lotShape]);

  const optimizationTip = useMemo(() => {
    if (lotShape === 'irregular') return 'Angle spots for better fit along curved edges.';
    return 'Consider one-way aisles to reduce conflict points.';
  }, [lotShape]);

  const canNext = useMemo(
    () => lotWidthM > 0 && lotWidthM <= 5000 && lotHeightM > 0 && lotHeightM <= 5000,
    [lotWidthM, lotHeightM]
  );

  const goNext = () => {
    if (!canNext) return;
    setStep((s) => Math.min(2, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const tryNewLayout = () => {
    setStep(1);
  };

  const handleSave = () => {
    try {
      const payload = {
        parkingName,
        lotShape,
        lotWidthM,
        lotHeightM,
        entranceSide,
        gateMode,
        lotShape,
        exitSide: gateMode === 'dual' ? exitSideId : entranceSide,
        bayCount: manualGrid.bayCount,
      };
      localStorage.setItem('parkgo_lot_draft', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="smart-layout-page smart-layout-page--wireframe">
      <Navbar showAuthLinks />
      <div className="spl-shell">
        <header className="spl-topbar">
          <Link to="/" className="spl-topbar-home">
            ← Home
          </Link>
          <h1 className="spl-title">Smart Parking Layout</h1>
          <div className="spl-window-dots" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </header>

        <div className="spl-mode-row spl-mode-row--single">
          <p className="spl-mode-lead">Dimension-driven 3D preview — no photo required.</p>
          <nav className="spl-stepper" aria-label="Steps">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`spl-step-pill ${step === s.id ? 'active' : ''} ${step > s.id ? 'done' : ''}`}
                onClick={() => setStep(s.id)}
              >
                <span className="spl-step-num">{s.id}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="spl-three-col">
          <aside className="spl-col spl-col--left">
            <h2 className="spl-col-heading">Parking settings</h2>

            <label className="spl-field">
              <span>Parking name</span>
              <input type="text" value={parkingName} onChange={(e) => setParkingName(e.target.value)} placeholder="Faculty Parking" />
            </label>

            <fieldset className="spl-fieldset">
              <legend>Shape</legend>
              <div className="spl-radio-row">
                <label className="spl-radio">
                  <input type="radio" name="lotShape" checked={lotShape === 'rectangle'} onChange={() => setLotShape('rectangle')} />
                  Rectangle
                </label>
                <label className="spl-radio">
                  <input type="radio" name="lotShape" checked={lotShape === 'irregular'} onChange={() => setLotShape('irregular')} />
                  Irregular
                </label>
              </div>
            </fieldset>

            <div className="spl-dim-row">
              <label className="spl-field spl-field--inline">
                <span>Width (m)</span>
                <input type="number" min={1} max={5000} step={1} value={lotWidthM} onChange={(e) => setLotWidthM(Number(e.target.value))} />
              </label>
              <label className="spl-field spl-field--inline">
                <span>Height (m)</span>
                <input type="number" min={1} max={5000} step={1} value={lotHeightM} onChange={(e) => setLotHeightM(Number(e.target.value))} />
              </label>
            </div>

            <label className="spl-field">
              <span>Entrance location</span>
              <select value={entranceSide} onChange={(e) => setEntranceSide(e.target.value)}>
                {ENTRANCE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="spl-fieldset">
              <legend>Vehicle access</legend>
              <div className="spl-radio-row spl-radio-row--stack">
                <label className="spl-radio">
                  <input
                    type="radio"
                    name="gateMode"
                    checked={gateMode === 'single'}
                    onChange={() => setGateMode('single')}
                  />
                  One gate (enter &amp; exit same place)
                </label>
                <label className="spl-radio">
                  <input
                    type="radio"
                    name="gateMode"
                    checked={gateMode === 'dual'}
                    onChange={() => setGateMode('dual')}
                  />
                  Separate entrance &amp; exit gates (opposite sides)
                </label>
              </div>
              {gateMode === 'dual' && (
                <p className="spl-hint spl-hint--tight">
                  Entrance: <strong>{entranceLabel}</strong> · Exit: <strong>{exitLabel}</strong> ({ENTRANCE_RESERVE_M} m strip each)
                </p>
              )}
            </fieldset>

            {step === 1 && (
              <p className="spl-hint spl-hint--after-form">
                Set the lot size in metres (plan view). Continue to open the interactive 3D mockup with stalls, aisle, perimeter fence, and entrance to scale.
                {lotShape === 'irregular' && (
                  <> <strong>Irregular</strong> uses a chamfered slab in 3D; the stall grid still packs inside the same width × height.</>
                )}
              </p>
            )}
          </aside>

          <main className="spl-col spl-col--center">
            <div className="spl-canvas-header">
              <span className="spl-canvas-label">{step === 2 ? '3D mockup' : 'Preview'}</span>
            </div>

            <div className="smart-layout-map spl-map smart-layout-map--3d-host">
              {step === 2 ? (
                <ParkingLotMockup3D
                  lotWidthM={manualGrid.lotWidthM}
                  lotHeightM={manualGrid.lotHeightM}
                  entranceSide={entranceSide}
                  gateMode={gateMode}
                  lotShape={lotShape}
                  cols={manualGrid.cols}
                  rowsTop={manualGrid.rowsTop}
                  rowsBottom={manualGrid.rowsBottom}
                  entranceM={ENTRANCE_RESERVE_M}
                  aisleM={CIRCULATION_TWO_LANE_M}
                />
              ) : (
                <div className="spl-map-placeholder">
                  <p className="spl-map-placeholder-title">Metre-based layout</p>
                  <p className="spl-map-placeholder-text">
                    {lotWidthM} m × {lotHeightM} m · {lotShape === 'irregular' ? 'irregular (chamfered in 3D)' : 'rectangle'} · entrance: {entranceLabel}
                    {gateMode === 'dual' ? ` · exit: ${exitLabel}` : ''} · open air
                  </p>
                  <p className="spl-map-placeholder-sub">Continue to generate the 3D parking model.</p>
                </div>
              )}
            </div>
          </main>

          <aside className="spl-col spl-col--right">
            <h2 className="spl-col-heading">Layout details</h2>
            {step < 2 ? (
              <div className="spl-layout-spec">
                <p className="spl-layout-spec-note">After continuing, the 3D view uses these nominal dimensions (metres):</p>
                <ul className="spl-layout-spec-list spl-layout-spec-list--muted">
                  <li>
                    <strong>Each slot (width × depth)</strong>: {BAY_DIMS_RANGE_LABEL}
                  </li>
                  <li>
                    <strong>Between adjacent bays (along a row)</strong>: {INTER_STALL_GAP_M} m
                  </li>
                  <li>
                    <strong>Each traffic lane</strong>: {LANE_WIDTH_M} m; <strong>two-lane main aisle (total)</strong>: {CIRCULATION_TWO_LANE_M} m
                  </li>
                  <li>
                    <strong>Entrance / queue reserve</strong>: {gateMode === 'dual' ? `${2 * ENTRANCE_RESERVE_M} m total` : `${ENTRANCE_RESERVE_M} m`}{' '}
                    {gateMode === 'dual' ? `(${entranceLabel} + ${exitLabel})` : `(along ${entranceLabel})`}
                  </li>
                  <li>
                    <strong>Perimeter</strong>: chain-style fence in 3D with automatic gaps at gates
                  </li>
                </ul>
              </div>
            ) : (
              <div className="spl-layout-spec">
                <p className="spl-layout-spec-note">
                  Physical dimensions in <strong>metres</strong> for the 3D mockup. Confirm with a survey before construction.
                </p>
                <ul className="spl-layout-spec-list">
                  <li>
                    <strong>Each parking slot (width × depth)</strong>: {BAY_WIDTH_MIN_M}–{BAY_WIDTH_MAX_M} m × {BAY_LENGTH_MIN_M}–
                    {BAY_LENGTH_MAX_M} m (design range). Typical marking: <strong>~{fmtM(BAY_WIDTH_TYP_M)} m × ~{fmtM(BAY_DEPTH_TYP_M)} m</strong> per
                    bay.
                  </li>
                  <li>
                    <strong>Slots available (estimate)</strong>: <strong>{manualGrid.bayCount}</strong>
                  </li>
                  <li>
                    <strong>Lot size</strong>: {lotWidthM} m × {lotHeightM} m
                  </li>
                  <li>
                    <strong>3D model</strong>: metre scale, perimeter fence, parked cars (~80% bays), secured gates, curbs, striping, wheel stops, site lighting
                    &amp; outdoor ambience.
                  </li>
                  <li>
                    <strong>Gates</strong>:{' '}
                    {manualGrid.dualGates ? (
                      <>
                        separate <strong>entrance</strong> ({entranceLabel}) and <strong>exit</strong> ({exitLabel}), {manualGrid.entranceStripsM} m total approach
                      </>
                    ) : (
                      <>single <strong>in/out</strong> gate at {entranceLabel}</>
                    )}
                  </li>
                  <li>
                    <strong>Approach strips</strong>: {manualGrid.entranceStripsM} m reserved (~{manualGrid.entrancePct.toFixed(1)}% of controlling edge)
                  </li>
                  <li>
                    <strong>Main aisle width</strong>: {manualGrid.circulationM} m (~{manualGrid.mainAislePct.toFixed(1)}% of lot edge)
                  </li>
                  <li>
                    <strong>Stall pitch (centre-to-centre along a row)</strong>: ~{fmtM(manualGrid.stallPitchAlongRow)} m
                  </li>
                  <li>
                    <strong>Each traffic lane</strong>: {manualGrid.laneWidthM} m; <strong>two-lane main aisle (total)</strong>: {manualGrid.circulationM} m
                  </li>
                  <li>
                    <strong>Module depth (two stall rows + aisle)</strong>: ~{fmtM(manualGrid.moduleDepthM)} m
                  </li>
                </ul>
                <ul className="spl-stats spl-stats--after-spec">
                  <li>
                    <strong>Space efficiency (illustrative)</strong>: ~{spaceEfficiency}%
                  </li>
                  <li className="spl-stat-tip">
                    <em>Optimization tip:</em> {optimizationTip}
                  </li>
                </ul>
              </div>
            )}

            <div className="spl-right-actions">
              <button type="button" className="spl-btn-secondary" onClick={tryNewLayout}>
                Try new layout
              </button>
              <button type="button" className="spl-btn-dark" onClick={handleSave}>
                Save
              </button>
            </div>
          </aside>
        </div>

        <footer className="spl-footer">
          <div className="spl-footer-actions">
            <button type="button" className="smart-layout-btn smart-layout-btn-ghost" onClick={goBack} disabled={step <= 1}>
              Back
            </button>
            {step < 2 ? (
              <button type="button" className="smart-layout-btn smart-layout-btn-primary" onClick={goNext} disabled={!canNext}>
                Continue to 3D layout
              </button>
            ) : (
              <button type="button" className="smart-layout-btn smart-layout-btn-primary" onClick={() => window.print()}>
                Export / Print
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default SmartLayoutDesignerPage;
