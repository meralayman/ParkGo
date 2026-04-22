"""
Train Linear Regression on parking_demand_ready.csv to predict cars_count.

Use predict_demand(hour, day_type) for a single API-friendly prediction (loads model
and train-split hourly stats from disk, cached).

Use predict_next_6_hours(..., start=...) for six hourly slots from an optional anchor
(default ``datetime.now()``); each slot uses that moment's calendar day/weekday so
midnight and weekend boundaries are handled correctly.

Features (full model): hour, day_type, avg_cars_by_hour
  - avg_cars_by_hour is computed from the TRAINING SPLIT ONLY (no test leakage):
    mean cars_count per hour on train; test hours missing from train use the
    training-set global mean cars_count.

Target: cars_count (regression).

Predicted cars_count is mapped to demand level with fixed thresholds:
  Low: <= 10, Medium: 11-25, High: > 25

Hybrid layer (after ML cars_count prediction):
  - Peak 8-11, 16-19: + max(20% of raw ML, 3)
  - After 20 (21-23): - max(10% of raw ML, 2)
  - Clamp to [0, 50]
  - Small forecast jitter: uniform in [-2, +2], then clamp again to [0, 50]
  - Map to Low / Medium / High

Saves the 3-feature model to demand_model.pkl
"""
from __future__ import annotations

import pickle
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "parking_demand_ready.csv"
MODEL_PATH = ROOT / "demand_model.pkl"

TARGET_COLUMN = "cars_count"
BASELINE_FEATURES = ["hour", "day_type"]
EXTENDED_FEATURES = ["hour", "day_type", "avg_cars_by_hour"]

# Same rule as demand_level_original on integer cars_count
CAPACITY = 50
# Light variability on top of hybrid adjustment (forecast / API responses)
FORECAST_NOISE_HALF_RANGE = 2.0

# Cached for predict_demand() / API (invalidated via clear_inference_bundle_cache)
_inference_bundle: tuple[LinearRegression, dict[int, float], float] | None = None


def train_split_hour_stats(
    df: pd.DataFrame,
) -> tuple[pd.Series, float, np.ndarray, np.ndarray]:
    """
    80/20 split (random_state=42); mean cars_count per hour on train + global train mean.
    Returns hour means Series, global mean, idx_train, idx_test.
    """
    idx = np.arange(len(df))
    idx_train, idx_test = train_test_split(idx, test_size=0.2, random_state=42)
    df_train = df.iloc[idx_train]
    hour_means_train = df_train.groupby("hour")[TARGET_COLUMN].mean()
    global_mean_train = float(df_train[TARGET_COLUMN].mean())
    return hour_means_train, global_mean_train, idx_train, idx_test


def train_split_hour_map_and_global(df: pd.DataFrame) -> tuple[dict[int, float], float]:
    """Dict hour -> mean and global fallback (same split as ``train_split_hour_stats``)."""
    hour_means_train, global_mean_train, _, _ = train_split_hour_stats(df)
    hour_map = {int(k): float(v) for k, v in hour_means_train.dropna().items()}
    return hour_map, global_mean_train


def load_inference_bundle(
    *,
    model_path: Path | None = None,
    data_path: Path | None = None,
    force_reload: bool = False,
) -> tuple[LinearRegression, dict[int, float], float]:
    """
    Load ``demand_model.pkl`` and build hourly avg map from ``parking_demand_ready.csv``
    using the train-split-only rule (matches training). Result is cached.
    """
    global _inference_bundle
    if force_reload:
        _inference_bundle = None
    if _inference_bundle is not None:
        return _inference_bundle

    mp = model_path or MODEL_PATH
    dp = data_path or DATA_PATH
    if not mp.is_file():
        raise FileNotFoundError(f"Missing model; train first: {mp}")
    if not dp.is_file():
        raise FileNotFoundError(f"Missing dataset: {dp}")

    df = pd.read_csv(dp)
    if "hour" not in df.columns or TARGET_COLUMN not in df.columns:
        raise ValueError(f"{dp} must include 'hour' and '{TARGET_COLUMN}'")

    hour_map, global_fb = train_split_hour_map_and_global(df)
    with mp.open("rb") as f:
        regressor = pickle.load(f)

    _inference_bundle = (regressor, hour_map, global_fb)
    return _inference_bundle


def clear_inference_bundle_cache() -> None:
    """Call after retraining so the next ``predict_demand`` reloads artifacts."""
    global _inference_bundle
    _inference_bundle = None


def hybrid_adjust_cars_count(raw_ml: float, hour: int) -> float:
    """
    Apply rule-based adjustments to ML cars_count prediction, then clamp to [0, CAPACITY].

    Peak hours (8-11, 16-19): increase by max(20% of raw_ml, 3).
    Hours after 20 (21-23): decrease by max(10% of raw_ml, 2).
    """
    h = int(hour) % 24
    x = float(raw_ml)
    pct_peak = x * 0.20
    bump = max(pct_peak, 3.0)
    pct_late = x * 0.10
    cut = max(pct_late, 2.0)

    if (8 <= h <= 11) or (16 <= h <= 19):
        x += bump
    if h > 20:
        x -= cut
    return float(np.clip(x, 0.0, float(CAPACITY)))


def hybrid_rule_reason(hour: int) -> str:
    """
    Short explanation for which hybrid hour rule applies (matches hybrid_adjust_cars_count).
    """
    h = int(hour) % 24
    if (8 <= h <= 11) or (16 <= h <= 19):
        return "Busy hours — many people arrive at this time."
    if h > 20:
        return "Quieter hours — fewer people are expected."
    return "Typical traffic for this time of day."


def demand_level_from_cars(cars: float) -> str:
    """Low / Medium / High from a cars_count value (uses rounded clamped integer)."""
    c = int(round(np.clip(cars, 0, CAPACITY)))
    if c <= 10:
        return "Low"
    if c <= 25:
        return "Medium"
    return "High"


def cars_count_to_demand_level(cars: float) -> str:
    """Alias for demand_level_from_cars (backward-compatible name)."""
    return demand_level_from_cars(cars)


def predict_with_hybrid(
    regressor: LinearRegression,
    hour: int,
    day_type: int,
    avg_cars_by_hour: float,
) -> dict[str, float | str]:
    """
    Run ML prediction + hybrid rules, then small random jitter on the adjusted count.

    ``raw_ml_cars_count`` is deterministic; ``adjusted_cars_count`` adds
    ``random.uniform(-FORECAST_NOISE_HALF_RANGE, +FORECAST_NOISE_HALF_RANGE)``
    after hybrid logic and reclamps to [0, CAPACITY]. ``final_demand_level`` uses
    that final adjusted value.

    ``reason`` describes the hour-based hybrid rule (peak / late / normal), not jitter.
    """
    X = pd.DataFrame(
        [[hour, day_type, avg_cars_by_hour]],
        columns=EXTENDED_FEATURES,
    )
    raw = float(regressor.predict(X)[0])
    adjusted = hybrid_adjust_cars_count(raw, hour)
    adjusted += random.uniform(-FORECAST_NOISE_HALF_RANGE, FORECAST_NOISE_HALF_RANGE)
    adjusted = float(np.clip(adjusted, 0.0, float(CAPACITY)))
    return {
        "raw_ml_cars_count": raw,
        "adjusted_cars_count": adjusted,
        "final_demand_level": demand_level_from_cars(adjusted),
        "reason": hybrid_rule_reason(hour),
    }


def predict_demand(
    hour: int,
    day_type: int,
    *,
    regressor: LinearRegression | None = None,
    avg_cars_by_hour_map: dict[int, float] | None = None,
    global_mean_fallback: float | None = None,
) -> dict[str, float | str]:
    """
    Single-step parking demand prediction for API use.

    Computes ``avg_cars_by_hour`` from the training pipeline (train-split hourly means
    from ``parking_demand_ready.csv``), runs ``predict_with_hybrid``, and returns:

        raw_ml_cars_count, adjusted_cars_count, final_demand_level, reason

    Optional kwargs override the cached model / maps (e.g. tests). After retraining,
    call ``clear_inference_bundle_cache()`` or pass ``force_reload`` via
    ``load_inference_bundle(force_reload=True)`` before predicting.
    """
    default_reg, default_map, default_fb = load_inference_bundle()
    reg = regressor if regressor is not None else default_reg
    hour_map = avg_cars_by_hour_map if avg_cars_by_hour_map is not None else default_map
    fb = global_mean_fallback if global_mean_fallback is not None else default_fb

    h = int(hour) % 24
    dt = int(day_type)
    if dt not in (0, 1):
        raise ValueError("day_type must be 0 (weekday) or 1 (weekend)")

    avg_ch = float(hour_map.get(h, fb))
    return predict_with_hybrid(reg, h, dt, avg_ch)


def demand_level_ui_fields(final_demand_level: str) -> dict[str, str]:
    """UI extras for forecast rows: color label and short message."""
    table: dict[str, tuple[str, str]] = {
        "Low": ("green", "Parking is likely available"),
        "Medium": ("yellow", "Moderate demand expected"),
        "High": ("red", "Parking may be crowded"),
    }
    color, msg = table.get(
        final_demand_level,
        ("gray", "Demand level unknown"),
    )
    return {"label_color": color, "message": msg}


def predict_next_6_hours(
    regressor: LinearRegression,
    avg_cars_by_hour_map: dict[int, float],
    global_mean_fallback: float,
    *,
    start: datetime | None = None,
) -> list[dict[str, Any]]:
    """
    Forecast parking demand for six consecutive **wall-clock** hours:
    ``start``, ``start + 1h``, … ``start + 5h``.

    Parameters
    ----------
    start : datetime | None
        Anchor time for the **first** slot (offset 0). If omitted, uses
        ``datetime.now()``. Must be a :class:`datetime.datetime` (naive or
        timezone-aware). Each slot advances with :class:`~datetime.timedelta`,
        so **crossing midnight** updates the calendar date; **weekday vs weekend**
        uses each slot's actual calendar day — ``weekday()`` Monday=0 … Sunday=6,
        with ``day_type`` 1 for Saturday/Sunday only.

    For every slot: ML ``cars_count``, hybrid adjustment, demand level, ``reason``
    (peak / late / normal rule), plus ``label_color`` and ``message`` for UI.

    ``avg_cars_by_hour_map`` should match training-hour means (one float per hour 0-23);
    missing keys use ``global_mean_fallback`` (typically training global mean cars_count).
    """
    base = datetime.now() if start is None else start
    if not isinstance(base, datetime):
        raise TypeError("start must be a datetime.datetime instance or None")

    predictions: list[dict[str, Any]] = []
    for offset in range(6):
        # Wall-clock step: midnight and Mon→Sun transitions follow real calendar rules
        slot = base + timedelta(hours=offset)
        hour = slot.hour
        weekday = slot.weekday()
        day_type = 1 if weekday >= 5 else 0
        avg_ch = float(
            avg_cars_by_hour_map.get(hour, global_mean_fallback)
        )
        ph = predict_with_hybrid(regressor, hour, day_type, avg_ch)
        ui = demand_level_ui_fields(str(ph["final_demand_level"]))
        predictions.append(
            {
                "offset_hours": offset,
                "at": slot.isoformat(timespec="seconds"),
                "hour": hour,
                "weekday": weekday,
                "day_type": day_type,
                "avg_cars_by_hour_feature": avg_ch,
                **ph,
                **ui,
            }
        )
    return predictions


def eval_regression(name: str, y_true, y_pred) -> dict:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = r2_score(y_true, y_pred)
    return {"name": name, "mae": mae, "rmse": rmse, "r2": r2}


def main() -> None:
    if not DATA_PATH.is_file():
        raise SystemExit(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    if "hour" not in df.columns or TARGET_COLUMN not in df.columns:
        raise SystemExit("CSV must include 'hour' and 'cars_count'")

    df = df.copy()
    y = df[TARGET_COLUMN].astype(float)

    hour_means_train, global_mean_train, idx_train, idx_test = train_split_hour_stats(df)
    df_train = df.iloc[idx_train]
    df_test = df.iloc[idx_test]

    # avg_cars_by_hour from TRAINING ONLY; map to train + test

    df.loc[idx_train, "avg_cars_by_hour"] = (
        df_train["hour"].map(hour_means_train).fillna(global_mean_train).values
    )
    df.loc[idx_test, "avg_cars_by_hour"] = (
        df_test["hour"].map(hour_means_train).fillna(global_mean_train).values
    )

    print(
        "IMPORTANT: avg_cars_by_hour uses TRAINING DATA ONLY "
        "(hourly means from the train split; missing hours use training global mean cars_count)."
    )
    print()

    X_baseline = df[BASELINE_FEATURES].astype(float)
    X_extended = df[EXTENDED_FEATURES].astype(float)

    Xb_tr = X_baseline.iloc[idx_train]
    Xb_te = X_baseline.iloc[idx_test]
    Xe_tr = X_extended.iloc[idx_train]
    Xe_te = X_extended.iloc[idx_test]
    y_tr = y.iloc[idx_train]
    y_te = y.iloc[idx_test]

    reg_base = LinearRegression()
    reg_base.fit(Xb_tr, y_tr)
    pred_base = reg_base.predict(Xb_te)

    reg_ext = LinearRegression()
    reg_ext.fit(Xe_tr, y_tr)
    pred_ext = reg_ext.predict(Xe_te)

    m_base = eval_regression("hour, day_type", y_te, pred_base)
    m_ext = eval_regression("hour, day_type, avg_cars_by_hour (train-safe)", y_te, pred_ext)

    print("=== Per-hour mean cars_count (TRAINING SET ONLY) - defines avg_cars_by_hour mapping ===")
    by_h = hour_means_train.reindex(range(24))
    for h in range(24):
        v = by_h.loc[h]
        if pd.isna(v):
            print(f"  hour {h:2d}: (no train rows)")
        else:
            print(f"  hour {h:2d}: {v:.4f}")
    print(f"  Training global mean cars_count (fallback): {global_mean_train:.4f}")
    print()

    print("=== Comparison: test set (same 20% holdout, random_state=42) ===")
    print(f"{'Model':<55} {'MAE':>10} {'RMSE':>10} {'R^2':>10}")
    for m in (m_base, m_ext):
        print(f"{m['name']:<55} {m['mae']:>10.4f} {m['rmse']:>10.4f} {m['r2']:>10.4f}")
    print()

    print("=== Extended model (train-safe avg_cars_by_hour): test metrics ===")
    print(f"MAE:  {m_ext['mae']:.4f}")
    print(f"RMSE: {m_ext['rmse']:.4f}")
    print(f"R^2:  {m_ext['r2']:.4f}")
    print()

    hours_te = Xe_te["hour"].values.astype(int)
    adjusted_cars = np.array(
        [hybrid_adjust_cars_count(float(p), int(h)) for p, h in zip(pred_ext, hours_te)]
    )
    mae_hybrid = mean_absolute_error(y_te, adjusted_cars)

    print("=== Hybrid prediction layer (rules applied after ML cars_count) ===")
    print(
        f"  Peak (hour 8-11 or 16-19): + max(20% of raw ML, 3), then clamp 0-{CAPACITY}."
    )
    print(
        f"  After hour 20 (hours 21-23): - max(10% of raw ML, 2), then clamp 0-{CAPACITY}."
    )
    print(f"  Demand level from adjusted cars_count: <=10 Low, 11-25 Medium, >25 High")
    print(
        f"  Forecast/API paths also add uniform jitter +/- {FORECAST_NOISE_HALF_RANGE} "
        f"after hybrid (see predict_with_hybrid); metrics above use hybrid rules only (no jitter)."
    )
    print(f"  Test MAE vs actual cars_count (hybrid adjusted): {mae_hybrid:.4f}")
    print(f"  Test MAE vs actual cars_count (raw ML only):          {m_ext['mae']:.4f}")
    print()

    preview = pd.DataFrame(
        {
            "hour": Xe_te["hour"].values,
            "day_type": Xe_te["day_type"].values,
            "avg_cars_by_hour": np.round(Xe_te["avg_cars_by_hour"].values, 4),
            "actual_cars_count": y_te.values,
            "raw_ml_cars_count": np.round(pred_ext, 4),
            "adjusted_cars_count": np.round(adjusted_cars, 4),
            "final_demand_level": [
                demand_level_from_cars(ac) for ac in adjusted_cars
            ],
        }
    )

    print(
        "=== Sample: raw ML, adjusted cars_count, final demand level "
        "(test set, first 15 rows) ==="
    )
    print(preview.head(15).to_string(index=False))
    print()
    print(f"(Showing 15 of {len(preview)} test rows.)")
    print()

    print("=== Demand level distribution - raw ML only (no hybrid rules) ===")
    levels_raw = pd.Series([demand_level_from_cars(p) for p in pred_ext]).value_counts()
    for lab in ["Low", "Medium", "High"]:
        print(f"  {lab}: {levels_raw.get(lab, 0)}")
    print()

    print("=== Demand level distribution - hybrid (adjusted cars_count) ===")
    levels_hybrid = preview["final_demand_level"].value_counts()
    for lab in ["Low", "Medium", "High"]:
        print(f"  {lab}: {levels_hybrid.get(lab, 0)}")
    print()

    baseline_levels = pd.Series([cars_count_to_demand_level(p) for p in pred_base]).value_counts()
    print("=== Demand level distribution - baseline model predictions (full test set) ===")
    for lab in ["Low", "Medium", "High"]:
        print(f"  {lab}: {baseline_levels.get(lab, 0)}")
    print()

    with MODEL_PATH.open("wb") as f:
        pickle.dump(reg_ext, f)
    clear_inference_bundle_cache()
    print(f"Saved extended model (3 features) to {MODEL_PATH}")
    print()

    hour_map_for_inference = {
        int(k): float(v) for k, v in hour_means_train.dropna().items()
    }
    forecast = predict_next_6_hours(
        reg_ext,
        hour_map_for_inference,
        global_mean_train,
        start=datetime.now(),
    )
    print("=== Next 6 hours (current time start) - forecast sample ===")
    for row in forecast:
        print(
            f"  +{row['offset_hours']}h  hour={row['hour']:2d}  "
            f"raw={row['raw_ml_cars_count']:6.2f}  adj={row['adjusted_cars_count']:6.2f}  "
            f"demand={row['final_demand_level']:<6} color={row['label_color']:<8} "
            f"{row['message']}"
        )
        print(f"       reason: {row['reason']}")
    print()


if __name__ == "__main__":
    main()
