"""
ParkGo AI Parking Layout Planner — approximate geometric estimate from aerial/site photos.
Not a substitute for professional survey / engineering.
"""
from __future__ import annotations

import base64
import math
from typing import List, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ParkGo AI Parking Planner", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per-bay size ranges (meters) — width × depth for 90° parking; heuristics use midpoints
BAY_WIDTH_MIN_M = 2.4
BAY_WIDTH_MAX_M = 2.7
BAY_DEPTH_MIN_M = 4.8
BAY_DEPTH_MAX_M = 5.5
BAY_WIDTH_M = (BAY_WIDTH_MIN_M + BAY_WIDTH_MAX_M) / 2
BAY_DEPTH_M = (BAY_DEPTH_MIN_M + BAY_DEPTH_MAX_M) / 2
# Two lanes for inbound / outbound traffic between double rows (each lane ~3 m → 6 m total)
LANE_WIDTH_M = 3.0
CIRCULATION_AISLE_M = 2.0 * LANE_WIDTH_M
AISLE_WIDTH_M = CIRCULATION_AISLE_M  # alias for API / overlays
# Depth reserved along the street/entry edge (queue, taper) — not used for stall depth
ENTRANCE_RESERVE_M = 5.0
EFFICIENCY_FACTOR = 0.52  # aisles + corners + irregular boundary loss (heuristic)
# Module = two facing rows + circulation aisle (space between cars across the aisle = 2 lanes)
MODULE_DEPTH_M = (2 * BAY_DEPTH_M) + CIRCULATION_AISLE_M
SINGLE_SIDE_DEPTH_M = BAY_DEPTH_M + CIRCULATION_AISLE_M
OBSTACLE_BAY_EQUIV_M2 = BAY_WIDTH_M * BAY_DEPTH_M  # ~one bay footprint for obstacle penalty
# Space between adjacent stalls along a row (striping / door swing / enter–exit)
INTER_STALL_GAP_M = 0.35


def decode_image(data: bytes) -> np.ndarray:
    arr = np.asarray(bytearray(data), dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img


def largest_lot_contour(gray: np.ndarray) -> Optional[np.ndarray]:
    """Segment open ground / lot boundary (heuristic for aerial-ish photos)."""
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)
    # Canny + close gives a more stable lot envelope than pure thresholding.
    edges = cv2.Canny(blurred, 45, 130)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    th = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    th = cv2.dilate(th, kernel, iterations=1)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    h, w = gray.shape[:2]
    min_area = (h * w) * 0.05  # ignore tiny blobs
    best = None
    best_area = 0
    for c in contours:
        a = cv2.contourArea(c)
        if a < min_area:
            continue
        if a > best_area:
            best_area = a
            best = c
    if best is None:
        return None
    hull = cv2.convexHull(best)
    if cv2.contourArea(hull) <= 0:
        return best
    solidity = cv2.contourArea(best) / cv2.contourArea(hull)
    if solidity < 0.82:
        # Very jagged edges (trees/cars/shadows) -> use rotated lot envelope.
        rect = cv2.minAreaRect(best)
        box = cv2.boxPoints(rect).astype(np.int32).reshape((-1, 1, 2))
        return box
    return hull


def clamp_angle_180(angle_deg: float) -> float:
    """Normalize angle to [0, 180)."""
    angle = angle_deg % 180.0
    if angle < 0:
        angle += 180.0
    return angle


def estimate_bay_width_px_from_markings(img_bgr: np.ndarray) -> Optional[float]:
    """
    Estimate bay width in pixels from painted yellow separator lines.
    Returns None if no reliable estimate is found.
    """
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    # Typical yellow paint range.
    yellow_mask = cv2.inRange(hsv, (15, 55, 55), (40, 255, 255))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    yellow_mask = cv2.morphologyEx(yellow_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    yellow_mask = cv2.morphologyEx(yellow_mask, cv2.MORPH_DILATE, kernel, iterations=1)

    lines = cv2.HoughLinesP(
        yellow_mask,
        rho=1,
        theta=np.pi / 180,
        threshold=55,
        minLineLength=max(40, int(0.08 * max(img_bgr.shape[:2]))),
        maxLineGap=12,
    )
    if lines is None or len(lines) < 8:
        return None

    segments = []
    for line in lines[:, 0, :]:
        x1, y1, x2, y2 = [int(v) for v in line]
        length = math.hypot(x2 - x1, y2 - y1)
        if length < 25:
            continue
        angle = clamp_angle_180(math.degrees(math.atan2(y2 - y1, x2 - x1)))
        segments.append((x1, y1, x2, y2, length, angle))
    if len(segments) < 6:
        return None

    # Find dominant line direction via coarse angle histogram.
    hist = np.zeros(36, dtype=np.float32)  # 5° bins
    for _, _, _, _, length, angle in segments:
        hist[int(angle // 5) % 36] += length
    dom_bin = int(np.argmax(hist))
    dom_angle = (dom_bin * 5.0) + 2.5

    aligned = [s for s in segments if abs(((s[5] - dom_angle + 90) % 180) - 90) <= 12]
    if len(aligned) < 5:
        return None

    theta = math.radians(dom_angle)
    # Normal direction to cluster line families.
    nx, ny = -math.sin(theta), math.cos(theta)
    projections: List[float] = []
    for x1, y1, x2, y2, length, _ in aligned:
        if length < 0.12 * max(img_bgr.shape[:2]):
            continue
        mx, my = 0.5 * (x1 + x2), 0.5 * (y1 + y2)
        projections.append(mx * nx + my * ny)

    if len(projections) < 4:
        return None

    projections = sorted(projections)
    clusters = [[projections[0]]]
    merge_thr = 10.0
    for p in projections[1:]:
        if abs(p - np.mean(clusters[-1])) <= merge_thr:
            clusters[-1].append(p)
        else:
            clusters.append([p])

    centers = sorted(float(np.mean(c)) for c in clusters if len(c) >= 1)
    if len(centers) < 3:
        return None
    spacings = [centers[i + 1] - centers[i] for i in range(len(centers) - 1)]
    spacings = [s for s in spacings if 8 <= s <= 220]
    if len(spacings) < 2:
        return None
    return float(np.median(spacings))


def detect_obstacles_inside_lot(
    img_bgr: np.ndarray, lot_contour: np.ndarray
) -> Tuple[List[np.ndarray], float]:
    """
    Detect major obstacles within lot area (parked cars / trees / planters-like blobs).
    Returns (obstacle_contours, blocked_area_px).
    """
    h, w = img_bgr.shape[:2]
    lot_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(lot_mask, [lot_contour], -1, 255, thickness=cv2.FILLED)

    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

    ys, xs = np.where(lot_mask > 0)
    if len(xs) < 50:
        return [], 0.0

    lot_pixels_lab = lab[ys, xs].astype(np.float32)
    mean_lab = np.mean(lot_pixels_lab, axis=0)
    dist = np.linalg.norm(lab.astype(np.float32) - mean_lab, axis=2)
    # Pixels very different from dominant pavement color.
    color_outlier_mask = (dist > np.percentile(dist[lot_mask > 0], 88)).astype(np.uint8) * 255

    # Vegetation-like tones (trees/planters).
    veg_mask = cv2.inRange(hsv, (30, 35, 30), (95, 255, 255))

    obstacle_mask = cv2.bitwise_or(color_outlier_mask, veg_mask)
    obstacle_mask = cv2.bitwise_and(obstacle_mask, lot_mask)

    # Remove thin line markings and noise; keep compact blobs.
    k_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k_big = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    obstacle_mask = cv2.morphologyEx(obstacle_mask, cv2.MORPH_OPEN, k_small, iterations=1)
    obstacle_mask = cv2.morphologyEx(obstacle_mask, cv2.MORPH_CLOSE, k_big, iterations=1)

    contours, _ = cv2.findContours(obstacle_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return [], 0.0

    min_area_px = max(35.0, 0.00022 * h * w)
    max_area_px = 0.08 * h * w
    kept: List[np.ndarray] = []
    blocked_area = 0.0
    for c in contours:
        a = cv2.contourArea(c)
        if a < min_area_px or a > max_area_px:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if bw <= 0 or bh <= 0:
            continue
        ar = max(bw, bh) / max(1.0, min(bw, bh))
        # Skip very long thin blobs (usually painted lines / edges).
        if ar > 7.5:
            continue
        kept.append(c)
        blocked_area += a
    return kept, float(blocked_area)


def reference_length_px(
    contour: np.ndarray,
    img_shape: Tuple[int, int, int],
    ref_x1: Optional[float] = None,
    ref_y1: Optional[float] = None,
    ref_x2: Optional[float] = None,
    ref_y2: Optional[float] = None,
    normalized: bool = True,
) -> float:
    """Pixels length for scale: user line or longest side of min-area rectangle."""
    h, w = img_shape[0], img_shape[1]
    if all(v is not None for v in (ref_x1, ref_y1, ref_x2, ref_y2)):
        x1, y1, x2, y2 = ref_x1, ref_y1, ref_x2, ref_y2
        if normalized:
            x1, x2 = x1 * w, x2 * w
            y1, y2 = y1 * h, y2 * h
        length = math.hypot(x2 - x1, y2 - y1)
        if length < 5:
            raise ValueError("Reference line too short in pixels")
        return float(length)
    rect = cv2.minAreaRect(contour)
    (rw, rh) = rect[1]
    lw, lh = max(rw, rh), min(rw, rh)
    return float(max(lw, lh))


def estimate_bays_from_area(area_m2: float) -> int:
    """Heuristic bay count from total lot area."""
    bay_area = BAY_WIDTH_M * BAY_DEPTH_M
    return max(0, int((area_m2 * EFFICIENCY_FACTOR) / bay_area))


def estimate_bays_from_geometry(
    long_m: float, short_m: float, inferred_bay_width_m: Optional[float] = None
) -> Tuple[int, float, int]:
    """
    Geometric estimate for 90° parking.
    Returns (capacity, bay_width_used_m, module_count).
    """
    bay_width_used = BAY_WIDTH_M
    if inferred_bay_width_m is not None and 1.9 <= inferred_bay_width_m <= 3.2:
        bay_width_used = max(BAY_WIDTH_MIN_M, min(BAY_WIDTH_MAX_M, inferred_bay_width_m))

    stall_pitch_m = bay_width_used + INTER_STALL_GAP_M
    cap_per_row = max(0, int(long_m / stall_pitch_m))
    modules = int(short_m // MODULE_DEPTH_M)
    rem_short = short_m - (modules * MODULE_DEPTH_M)

    # If enough depth remains, allow one extra single row with aisle.
    extra_rows = 1 if rem_short >= SINGLE_SIDE_DEPTH_M else 0
    total_rows = (modules * 2) + extra_rows
    capacity = cap_per_row * total_rows
    return max(0, capacity), bay_width_used, modules


def layout_lines_for_overlay(contour: np.ndarray, cap_per_row: int, row_count: int) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """Generate rotated visual guide lines that follow lot orientation."""
    lines: List[Tuple[Tuple[int, int], Tuple[int, int]]] = []
    if cap_per_row <= 0 or row_count <= 0:
        return lines

    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect).astype(np.float32)
    center = np.mean(box, axis=0)

    edge1 = box[1] - box[0]
    edge2 = box[2] - box[1]
    len1 = float(np.linalg.norm(edge1))
    len2 = float(np.linalg.norm(edge2))
    long_vec = edge1 if len1 >= len2 else edge2
    short_vec = edge2 if len1 >= len2 else edge1

    long_u = long_vec / (np.linalg.norm(long_vec) + 1e-9)
    short_u = short_vec / (np.linalg.norm(short_vec) + 1e-9)
    half_long = max(len1, len2) * 0.5
    half_short = min(len1, len2) * 0.5

    # Row separators across short axis.
    for r in range(row_count + 1):
        t = -half_short + (2 * half_short * r / row_count)
        p1 = center + (long_u * -half_long) + (short_u * t)
        p2 = center + (long_u * half_long) + (short_u * t)
        lines.append(((int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1]))))

    # Bay separators along long axis.
    for c in range(cap_per_row + 1):
        t = -half_long + (2 * half_long * c / cap_per_row)
        p1 = center + (short_u * -half_short) + (long_u * t)
        p2 = center + (short_u * half_short) + (long_u * t)
        lines.append(((int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1]))))
    return lines


def draw_overlay(
    img_bgr: np.ndarray,
    contour: np.ndarray,
    bays_estimate: int,
    cap_per_row: int,
    row_count: int,
    obstacle_contours: List[np.ndarray],
) -> np.ndarray:
    out = img_bgr.copy()
    shade = out.copy()
    cv2.fillPoly(shade, [contour], (16, 90, 45))
    out = cv2.addWeighted(shade, 0.28, out, 0.72, 0)
    cv2.drawContours(out, [contour], -1, (0, 230, 130), 3)
    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect).astype(np.int32)
    cv2.polylines(out, [box], isClosed=True, color=(255, 196, 0), thickness=2)

    for p1, p2 in layout_lines_for_overlay(contour, max(1, cap_per_row), max(1, row_count)):
        cv2.line(out, p1, p2, (70, 170, 255), 1, cv2.LINE_AA)

    if obstacle_contours:
        cv2.drawContours(out, obstacle_contours, -1, (35, 35, 235), 2)
        for c in obstacle_contours:
            x, y, bw, bh = cv2.boundingRect(c)
            cv2.rectangle(out, (x, y), (x + bw, y + bh), (45, 45, 210), 1)

    x, y, _, _ = cv2.boundingRect(box.reshape((-1, 1, 2)))
    cv2.putText(
        out,
        f"~{bays_estimate} bays (est.) | 90 deg layout",
        (x, max(y - 10, 20)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.62,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return out


@app.get("/health")
def health():
    return {"ok": True, "service": "ai-planner"}


@app.post("/api/plan")
async def plan_parking_layout(
    image: UploadFile = File(...),
    reference_meters: float = Form(..., description="Known real length (m) for reference edge or line"),
    ref_x1: Optional[float] = Form(None),
    ref_y1: Optional[float] = Form(None),
    ref_x2: Optional[float] = Form(None),
    ref_y2: Optional[float] = Form(None),
    normalized_coords: bool = Form(True),
):
    """
    Upload a site/aerial image and one known distance in meters.
    Optional ref_x1..ref_y2 in 0-1 normalized image coords for a reference segment.
    """
    if reference_meters <= 0 or reference_meters > 5000:
        raise HTTPException(400, "reference_meters must be between 0 and 5000")

    raw = await image.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 15MB)")

    try:
        bgr = decode_image(raw)
    except ValueError as e:
        raise HTTPException(400, str(e))

    h0, w0 = bgr.shape[:2]
    max_side = 1400
    scale_down = min(1.0, max_side / max(h0, w0))
    if scale_down < 1.0:
        bgr = cv2.resize(bgr, (int(w0 * scale_down), int(h0 * scale_down)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    contour = largest_lot_contour(gray)
    if contour is None:
        raise HTTPException(
            422,
            "Could not detect a clear lot boundary. Try a clearer top-down photo or higher contrast.",
        )

    try:
        ref_px = reference_length_px(
            contour,
            bgr.shape,
            ref_x1,
            ref_y1,
            ref_x2,
            ref_y2,
            normalized_coords,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    bay_width_px = estimate_bay_width_px_from_markings(bgr)
    has_explicit_ref_line = all(v is not None for v in (ref_x1, ref_y1, ref_x2, ref_y2))
    m_per_px_ref = reference_meters / ref_px
    m_per_px = m_per_px_ref
    scale_source = "reference_line_or_longest_side"
    if bay_width_px is not None and not has_explicit_ref_line:
        # If user did not click a reference line, auto-calibrate from bay spacing.
        # This avoids severe under/over-estimates on simple top-down marked lots.
        m_per_px_auto = BAY_WIDTH_M / bay_width_px
        m_per_px = (0.8 * m_per_px_auto) + (0.2 * m_per_px_ref)
        scale_source = "auto_from_markings_blended_with_reference"

    area_px = cv2.contourArea(contour)
    area_m2 = float(area_px * (m_per_px**2))

    rect = cv2.minAreaRect(contour)
    rw, rh = rect[1]
    long_m = max(rw, rh) * m_per_px
    short_m = min(rw, rh) * m_per_px
    # Conservative: entrance/approach uses part of the shallow dimension
    short_m_eff = max(0.0, short_m - ENTRANCE_RESERVE_M)

    inferred_bay_width_m = bay_width_px * m_per_px if bay_width_px is not None else None
    obstacle_contours, obstacle_area_px = detect_obstacles_inside_lot(bgr, contour)
    obstacle_area_m2 = obstacle_area_px * (m_per_px**2)

    bays_geom, bay_width_used_m, modules = estimate_bays_from_geometry(
        long_m, short_m_eff, inferred_bay_width_m
    )
    bays_area = estimate_bays_from_area(area_m2)
    # Blend geometric and area heuristics: geometry dominates for simple lot photos.
    bays_base = max(0, int(round((0.75 * bays_geom) + (0.25 * bays_area))))
    obstacle_equivalent_bays = int(round(obstacle_area_m2 / OBSTACLE_BAY_EQUIV_M2))
    bays = max(0, bays_base - obstacle_equivalent_bays)
    stall_pitch_m = bay_width_used_m + INTER_STALL_GAP_M
    cap_per_row = max(1, int(long_m / stall_pitch_m)) if stall_pitch_m > 0 else 1
    rem_for_rows = short_m_eff - (modules * MODULE_DEPTH_M)
    row_count = max(1, (modules * 2) + (1 if rem_for_rows >= SINGLE_SIDE_DEPTH_M else 0))

    overlay = draw_overlay(bgr, contour, bays, cap_per_row, row_count, obstacle_contours)
    _, buf = cv2.imencode(".png", overlay)
    preview_b64 = base64.b64encode(buf.tobytes()).decode("ascii")

    return {
        "ok": True,
        "disclaimer": "Approximate planning aid only — not a substitute for professional survey or engineering.",
        "total_parking_area_m2": round(area_m2, 2),
        "recommended_layout": "90_degree_parking",
        "estimated_capacity": bays,
        "estimated_capacity_before_obstacles": bays_base,
        "obstacle_count": len(obstacle_contours),
        "obstacle_area_m2": round(obstacle_area_m2, 2),
        "obstacle_capacity_penalty": obstacle_equivalent_bays,
        "effective_parkable_area_m2": round(max(0.0, area_m2 - obstacle_area_m2), 2),
        "bay_width_m": BAY_WIDTH_M,
        "bay_depth_m": BAY_DEPTH_M,
        "aisle_width_m": AISLE_WIDTH_M,
        "lane_width_m": LANE_WIDTH_M,
        "circulation_two_lane_m": CIRCULATION_AISLE_M,
        "entrance_reserve_m": ENTRANCE_RESERVE_M,
        "inter_stall_gap_m": INTER_STALL_GAP_M,
        "module_depth_m": MODULE_DEPTH_M,
        "rows_used": row_count,
        "bay_width_inferred_m": round(inferred_bay_width_m, 3) if inferred_bay_width_m is not None else None,
        "scale_source": scale_source,
        "scale_m_per_pixel": round(m_per_px, 6),
        "reference_used_pixels": round(ref_px, 2),
        "preview_image_base64": preview_b64,
        "preview_mime": "image/png",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
