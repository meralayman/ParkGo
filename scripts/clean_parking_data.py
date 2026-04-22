"""
Clean IIoT_Smart_Parking_Management.csv -> cleaned_parking_data.csv
Uses Python stdlib only (no pandas).
"""
from __future__ import annotations

import csv
import math
import re
import statistics
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "IIoT_Smart_Parking_Management.csv"
OUTPUT = ROOT / "cleaned_parking_data.csv"


def to_snake_case(name: str) -> str:
    s = str(name).strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    s = s.replace("-", "_")
    s = re.sub(r"_+", "_", s)
    return s.lower()


def is_missing(raw) -> bool:
    if raw is None:
        return True
    if isinstance(raw, float) and math.isnan(raw):
        return True
    s = str(raw).strip()
    return s == "" or s.lower() in ("nan", "none", "null", "na")


def try_parse_number(raw):
    if is_missing(raw):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def try_parse_ts(raw):
    if is_missing(raw):
        return None
    s = str(raw).strip()
    if "." in s:
        parts = s.split(".")
        base = parts[0] + "." + (parts[1][:6] if len(parts[1]) >= 6 else parts[1].ljust(6, "0"))
        try:
            return datetime.strptime(base[:26], "%Y-%m-%d %H:%M:%S.%f")
        except ValueError:
            pass
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s[:26], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def fmt_ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")


def infer_kind(col: str, values: list) -> str:
    if col == "timestamp":
        return "timestamp"
    non_missing = [v for v in values if not is_missing(v)]
    if not non_missing:
        return "text"
    num_ok = sum(1 for v in non_missing if try_parse_number(v) is not None)
    if num_ok / len(non_missing) >= 0.95:
        return "numeric"
    return "text"


def mode_value(values: list[str]) -> str:
    clean = [str(v).strip() for v in values if not is_missing(v)]
    if not clean:
        return "unknown"
    return Counter(clean).most_common(1)[0][0]


def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Source not found: {SOURCE}")

    with SOURCE.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        raw_header = next(reader)
        cols = [to_snake_case(h) for h in raw_header]
        rows_raw = list(reader)

    rows_before = len(rows_raw)

    rows: list[dict[str, str]] = []
    for r in rows_raw:
        d = {}
        for i, c in enumerate(cols):
            cell = r[i] if i < len(r) else ""
            if isinstance(cell, str):
                cell = cell.strip()
            d[c] = "" if is_missing(cell) else cell
        rows.append(d)

    total_missing_cells = sum(1 for row in rows for c in cols if is_missing(row.get(c)))

    kinds = {c: infer_kind(c, [row[c] for row in rows]) for c in cols}

    # --- remove duplicate rows (identical across all columns) ---
    def row_tuple(row: dict) -> tuple:
        return tuple(row.get(c, "") for c in cols)

    seen: set[tuple] = set()
    deduped: list[dict[str, str]] = []
    for row in rows:
        t = row_tuple(row)
        if t in seen:
            continue
        seen.add(t)
        deduped.append(row)
    rows = deduped
    rows_after_dedupe = len(rows)
    duplicates_removed = rows_before - rows_after_dedupe

    filled_counts: dict[str, int] = {c: 0 for c in cols}

    # --- numeric: median imputation ---
    for c in cols:
        if kinds[c] != "numeric":
            continue
        nums = []
        for row in rows:
            n = try_parse_number(row.get(c))
            if n is not None:
                nums.append(n)
        med = statistics.median(nums) if nums else 0.0
        for row in rows:
            if is_missing(row.get(c)) or try_parse_number(row.get(c)) is None:
                row[c] = str(float(med))
                filled_counts[c] += 1

    # --- timestamp: ordered ffill / bfill; drop rows still without time ---
    ts_col = "timestamp"
    if ts_col in cols:
        dt_list: list[datetime | None] = []
        for row in rows:
            dt_list.append(try_parse_ts(row.get(ts_col)))

        last = None
        for i in range(len(rows)):
            if dt_list[i] is not None:
                last = dt_list[i]
            elif last is not None:
                rows[i][ts_col] = fmt_ts(last)
                dt_list[i] = last
                filled_counts[ts_col] += 1

        nxt = None
        for i in range(len(rows) - 1, -1, -1):
            if dt_list[i] is not None:
                nxt = dt_list[i]
            elif nxt is not None:
                rows[i][ts_col] = fmt_ts(nxt)
                dt_list[i] = nxt
                filled_counts[ts_col] += 1

        kept: list[dict[str, str]] = []
        dropped_no_ts = 0
        for i, row in enumerate(rows):
            if try_parse_ts(row.get(ts_col)) is None:
                dropped_no_ts += 1
                continue
            kept.append(row)
        rows = kept
        if dropped_no_ts:
            print(f"Rows dropped (no valid timestamp after imputation): {dropped_no_ts}")

    # --- text columns: mode imputation ---
    for c in cols:
        if kinds[c] != "text":
            continue
        m = mode_value([row[c] for row in rows])
        for row in rows:
            if is_missing(row.get(c)):
                row[c] = m
                filled_counts[c] += 1

    rows_after = len(rows)

    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)

    filled_total = sum(filled_counts.values())

    print("=== Parking data cleaning summary ===")
    print(f"Rows before cleaning:        {rows_before}")
    print(f"Duplicate rows removed:    {duplicates_removed}")
    print(f"Rows after deduplication:    {rows_after_dedupe}")
    print(f"Rows after cleaning:         {rows_after}")
    print(f"Missing cells (raw file):  {total_missing_cells}")
    print("Missing values handled (cells imputed or filled by column):")
    any_fill = False
    for c in cols:
        n = filled_counts.get(c, 0)
        if n > 0:
            print(f"  {c}: {n}")
            any_fill = True
    if not any_fill:
        print("  (none - no missing values required filling)")
    print(f"Total fill operations:     {filled_total}")
    print(f"Output: {OUTPUT}")


if __name__ == "__main__":
    main()
