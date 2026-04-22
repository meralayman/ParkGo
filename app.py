"""
Flask API for parking demand predictions (train_model pipeline).
"""
from __future__ import annotations

import os
import traceback
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from train_model import load_inference_bundle, predict_demand, predict_next_6_hours

app = Flask(__name__)
CORS(app)

_MODEL = None
_HOUR_MAP = None
_GLOBAL_FB = None
_LOAD_ERROR: str | None = None


def ensure_bundle():
    """Load demand_model.pkl + hourly stats once (same as train_model.load_inference_bundle)."""
    global _MODEL, _HOUR_MAP, _GLOBAL_FB, _LOAD_ERROR
    if _LOAD_ERROR is not None and _MODEL is None:
        return False
    if _MODEL is not None:
        return True
    try:
        _MODEL, _HOUR_MAP, _GLOBAL_FB = load_inference_bundle()
        _LOAD_ERROR = None
        return True
    except Exception as e:
        _LOAD_ERROR = f"{type(e).__name__}: {e}"
        traceback.print_exc()
        return False


@app.route("/health", methods=["GET"])
def health():
    ok = ensure_bundle()
    body = {"status": "ok" if ok else "degraded", "model_loaded": ok}
    if _LOAD_ERROR:
        body["load_error"] = _LOAD_ERROR
    return jsonify(body), (200 if ok else 503)


@app.route("/predict", methods=["POST"])
def predict():
    if not ensure_bundle():
        return (
            jsonify({"error": "Model not loaded", "detail": _LOAD_ERROR}),
            503,
        )

    try:
        data = request.get_json(force=True, silent=True)
        if data is None or not isinstance(data, dict):
            return jsonify({"error": "Expected JSON object body"}), 400

        if "hour" not in data or "day_type" not in data:
            return jsonify({"error": "Missing required fields: hour, day_type"}), 400

        try:
            hour = int(data["hour"])
            day_type = int(data["day_type"])
        except (TypeError, ValueError):
            return jsonify({"error": "hour and day_type must be integers"}), 400

        result = predict_demand(hour, day_type)
        # Ensure stable JSON keys per contract
        out = {
            "raw_ml_cars_count": result["raw_ml_cars_count"],
            "adjusted_cars_count": result["adjusted_cars_count"],
            "final_demand_level": result["final_demand_level"],
            "reason": result["reason"],
        }
        return jsonify(out), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


@app.route("/forecast", methods=["GET"])
def forecast():
    if not ensure_bundle():
        return (
            jsonify({"error": "Model not loaded", "detail": _LOAD_ERROR}),
            503,
        )

    try:
        start = None
        raw_start = request.args.get("start")
        if raw_start:
            try:
                start = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            except ValueError:
                return jsonify({"error": "Invalid start; use ISO 8601 datetime"}), 400

        rows = predict_next_6_hours(
            _MODEL,
            _HOUR_MAP,
            _GLOBAL_FB,
            start=start,
        )
        return jsonify(rows), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    ensure_bundle()
    ml_port = int(os.environ.get("FLASK_DEMAND_PORT", "5001"))
    app.run(host="0.0.0.0", port=ml_port, debug=False)
