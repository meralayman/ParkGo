"""
Feature engineering for parking demand prediction.
Reads cleaned_parking_data.csv, writes parking_demand_ready.csv.

Target columns:
  - demand_level_original: fixed thresholds (Low<=10, Medium 11-25, High>25 on cars_count).
  - demand_level_balanced: equal-frequency tertiles on cars_count (use this for ML training).
"""
from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cleaned_parking_data.csv"
OUTPUT = ROOT / "parking_demand_ready.csv"


def norm_key(s: str) -> str:
    return s.strip().lower().replace(" ", "_")


def parse_ts(s: str) -> datetime | None:
    s = str(s).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            continue
    return None


def demand_level_fixed_thresholds(cars: int) -> int:
    """Original rule: Low <=10, Medium 11–25, High >25."""
    if cars <= 10:
        return 0
    if cars <= 25:
        return 1
    return 2


def demand_levels_balanced_tertiles(cars_counts: list[int]) -> tuple[list[int], tuple[int, int]]:
    """
    Equal-frequency binning: sort rows by cars_count and assign ranks to Low / Medium / High
    (~1/3 each) so no single class dominates when the fixed thresholds skew.
    Returns (per-row demand_level, (low_max, mid_max) cars_count cutoffs from sorted values at split indices).
    """
    n = len(cars_counts)
    if n == 0:
        return [], (0, 0)
    order = sorted(range(n), key=lambda i: cars_counts[i])
    third = n // 3
    two_third = (2 * n) // 3
    levels = [0] * n
    for rank, idx in enumerate(order):
        if rank < third:
            levels[idx] = 0
        elif rank < two_third:
            levels[idx] = 1
        else:
            levels[idx] = 2
    sc = sorted(cars_counts)
    low_max = sc[third - 1] if third > 0 else sc[0]
    mid_max = sc[two_third - 1] if two_third > third else sc[-1]
    return levels, (low_max, mid_max)


def resolve_cars_count(row: dict[str, str], col_index: dict[str, str]) -> tuple[int, str]:
    """
    Returns (cars_count, source_note) describing how it was derived.
    col_index maps normalized header -> actual header key in row.
    """
    nk = col_index

    def get(*aliases: str) -> str | None:
        for a in aliases:
            key = nk.get(norm_key(a))
            if key is not None and row.get(key, "").strip() != "":
                return row[key].strip()
        return None

    # 1) Explicit car count columns
    for alias in (
        "cars_count",
        "car_count",
        "num_cars",
        "number_of_cars",
        "vehicle_count",
        "vehicles_count",
        "parked_cars",
    ):
        key = nk.get(norm_key(alias))
        if key and row.get(key, "").strip() != "":
            try:
                return int(round(float(row[key]))), f"column `{key}`"
            except ValueError:
                pass

    # 2) total_spots - available_spots
    total_raw = get("total_spots", "capacity", "lot_capacity", "parking_capacity", "spots_total")
    avail_raw = get(
        "available_spots",
        "available_spaces",
        "vacant_spots",
        "free_spots",
        "spots_available",
    )
    if total_raw is not None and avail_raw is not None:
        try:
            total = float(total_raw)
            avail = float(avail_raw)
            cc = int(round(max(0.0, total - avail)))
            return cc, "`total_spots`-like minus `available_spots`-like"
        except ValueError:
            pass

    # 3) Proxy: occupancy_rate assumed 0–1 fraction of lot; fixed capacity 50 spots
    capacity = 50
    rate_raw = get("occupancy_rate", "occupancy", "lot_occupancy_rate")
    if rate_raw is not None:
        try:
            rate = float(rate_raw)
            if rate > 1.5:
                rate = rate / 100.0
            rate = max(0.0, min(1.0, rate))
            cars = int(round(rate * capacity))
            cars = max(0, min(capacity, cars))
            return cars, "`occupancy_rate` * 50 (fixed lot capacity 50 spots)"
        except ValueError:
            pass

    # 4) occupancy_status only: occupied=1 else 0 at row level (weak fallback)
    occ_s = get("occupancy_status", "spot_status")
    if occ_s is not None:
        v = occ_s.strip().lower()
        if v in ("occupied", "occ", "1", "true", "yes"):
            return 1, "`occupancy_status` (binary)"
        if v in ("vacant", "empty", "free", "0", "false", "no"):
            return 0, "`occupancy_status` (binary)"

    return 0, "default 0 (no usable occupancy columns)"


def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Missing {SOURCE}")

    with SOURCE.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    col_index = {norm_key(h): h for h in fieldnames}

    ts_col = col_index.get("timestamp")
    staged: list[tuple[dict, int, int, int, str]] = []
    for row in rows:
        ts_raw = row.get(ts_col, "") if ts_col else ""
        dt = parse_ts(ts_raw)
        if dt is None:
            hour = 0
            day_type = 0
        else:
            hour = dt.hour
            # Monday=0 … Sunday=6 → weekend Sat/Sun
            day_type = 1 if dt.weekday() >= 5 else 0

        cars_count, src = resolve_cars_count(row, col_index)
        staged.append((row, hour, day_type, cars_count, src))

    cars_list = [s[3] for s in staged]
    dist_before = Counter(demand_level_fixed_thresholds(c) for c in cars_list)
    # Rebalance with equal-frequency tertiles on cars_count (no rescaling of cars_count)
    demand_levels_balanced, (low_max, mid_max) = demand_levels_balanced_tertiles(cars_list)
    dist_after = Counter(demand_levels_balanced)

    methods = [s[4] for s in staged]
    out_rows: list[dict[str, str]] = []
    for i, (row, hour, day_type, cars_count, _src) in enumerate(staged):
        new_row = dict(row)
        new_row["hour"] = str(hour)
        new_row["day_type"] = str(day_type)
        new_row["cars_count"] = str(cars_count)
        new_row["demand_level_original"] = str(demand_level_fixed_thresholds(cars_count))
        new_row["demand_level_balanced"] = str(demand_levels_balanced[i])
        out_rows.append(new_row)

    new_fields = fieldnames + [
        "hour",
        "day_type",
        "cars_count",
        "demand_level_original",
        "demand_level_balanced",
    ]
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=new_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)

    # Console summary
    print("cars_count derivation (row counts by method):")
    for m, n in Counter(methods).most_common():
        print(f"  {n:5}  {m}")
    print()
    n_total = len(out_rows)
    print("demand_level_original (fixed thresholds: Low<=10, 11-25 Medium, High>25):")
    for lab, k in [("Low (0)", 0), ("Medium (1)", 1), ("High (2)", 2)]:
        c = dist_before[k]
        print(f"  {lab}: {c:5} ({100.0 * c / n_total:.1f}%)")
    print()
    print(
        "demand_level_balanced (for ML training): equal-frequency tertiles on cars_count "
        f"(approx cutoffs: Low <= {low_max}, Medium <= {mid_max}, High > {mid_max})"
    )
    print("distribution:")
    for lab, k in [("Low (0)", 0), ("Medium (1)", 1), ("High (2)", 2)]:
        c = dist_after[k]
        print(f"  {lab}: {c:5} ({100.0 * c / n_total:.1f}%)")
    print()
    print(f"Wrote {OUTPUT} ({len(out_rows)} rows)")
    print()
    print(
        "Preview (hour, day_type, cars_count, demand_level_original, demand_level_balanced) "
        "- first 12 rows:"
    )
    print(
        f"{'hour':>5} {'day_type':>9} {'cars_count':>11} "
        f"{'orig':>6} {'bal':>6}"
    )
    for r in out_rows[:12]:
        print(
            f"{int(r['hour']):>5} {int(r['day_type']):>9} {int(r['cars_count']):>11} "
            f"{int(r['demand_level_original']):>6} {int(r['demand_level_balanced']):>6}"
        )


if __name__ == "__main__":
    main()
