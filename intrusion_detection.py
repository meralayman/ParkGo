"""
Simple intrusion detection utilities.

This module exposes a lightweight, explainable risk engine that flags suspicious
security events and returns:
  - risk_score (0..1)
  - is_intrusion (bool)
  - severity (low/medium/high/critical)
  - reasons (human-readable explanation list)

Input event schema (all optional, defaults to 0):
  - failed_logins
  - requests_per_minute
  - unique_ips
  - payload_size_kb
  - sensitive_path_accesses
  - geo_velocity_kmh
"""
from __future__ import annotations

from typing import Any


FEATURE_DEFAULTS: dict[str, float] = {
    "failed_logins": 0.0,
    "requests_per_minute": 0.0,
    "unique_ips": 0.0,
    "payload_size_kb": 0.0,
    "sensitive_path_accesses": 0.0,
    "geo_velocity_kmh": 0.0,
}


def _to_non_negative_float(value: Any, field_name: str) -> float:
    try:
        x = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be numeric") from exc
    if x < 0:
        raise ValueError(f"{field_name} must be >= 0")
    return x


def _normalize_event(event: dict[str, Any] | None) -> dict[str, float]:
    if event is None:
        event = {}
    if not isinstance(event, dict):
        raise ValueError("event must be a JSON object")

    out: dict[str, float] = {}
    for field, default_value in FEATURE_DEFAULTS.items():
        out[field] = _to_non_negative_float(event.get(field, default_value), field)
    return out


def detect_intrusion_event(event: dict[str, Any] | None) -> dict[str, Any]:
    """
    Score one event and return an explainable intrusion decision.
    """
    x = _normalize_event(event)

    # Soft risk contributions (0..1), weighted to produce an interpretable score.
    failed_logins_risk = min(x["failed_logins"] / 15.0, 1.0)
    rpm_risk = min(x["requests_per_minute"] / 300.0, 1.0)
    unique_ips_risk = min(x["unique_ips"] / 40.0, 1.0)
    payload_risk = min(x["payload_size_kb"] / 1024.0, 1.0)
    sensitive_paths_risk = min(x["sensitive_path_accesses"] / 20.0, 1.0)
    geo_velocity_risk = min(x["geo_velocity_kmh"] / 900.0, 1.0)

    weighted_score = (
        0.28 * failed_logins_risk
        + 0.22 * rpm_risk
        + 0.12 * unique_ips_risk
        + 0.10 * payload_risk
        + 0.20 * sensitive_paths_risk
        + 0.08 * geo_velocity_risk
    )

    hard_triggers: list[str] = []
    if x["failed_logins"] >= 25:
        hard_triggers.append("Very high failed login attempts")
    if x["requests_per_minute"] >= 500:
        hard_triggers.append("Potential request flood")
    if x["sensitive_path_accesses"] >= 30:
        hard_triggers.append("Heavy access to sensitive paths")
    if x["geo_velocity_kmh"] >= 1200:
        hard_triggers.append("Impossible travel velocity detected")

    # One count per *dimension* (failed logins, RPM, …) so a mixed attack
    # is flagged even if the blend score is just under the main threshold.
    soft_signal_count = 0
    if x["failed_logins"] >= 8:
        soft_signal_count += 1
    if x["requests_per_minute"] >= 180:
        soft_signal_count += 1
    if x["unique_ips"] >= 20:
        soft_signal_count += 1
    if x["payload_size_kb"] >= 512:
        soft_signal_count += 1
    if x["sensitive_path_accesses"] >= 10:
        soft_signal_count += 1
    if x["geo_velocity_kmh"] >= 700:
        soft_signal_count += 1

    reasons: list[str] = []
    if x["failed_logins"] >= 8:
        reasons.append("Repeated login failures")
    if x["requests_per_minute"] >= 180:
        reasons.append("Traffic spike")
    if x["unique_ips"] >= 20:
        reasons.append("Many source IPs in short time")
    if x["payload_size_kb"] >= 512:
        reasons.append("Unusually large payloads")
    if x["sensitive_path_accesses"] >= 10:
        reasons.append("Frequent sensitive endpoint access")
    if x["geo_velocity_kmh"] >= 700:
        reasons.append("Suspicious geo-location jump")
    reasons.extend(hard_triggers)
    if soft_signal_count >= 3:
        reasons.append("Multiple concurrent attack signals")

    score = min(max(weighted_score, 0.0), 1.0)
    # High blend score, any hard rule, or several independent red flags at once.
    is_intrusion = bool(
        score >= 0.6
        or bool(hard_triggers)
        or soft_signal_count >= 3
    )

    multi_vector = soft_signal_count >= 3
    if score >= 0.9 or len(hard_triggers) >= 2:
        severity = "critical"
    elif score >= 0.75 or len(hard_triggers) >= 1 or multi_vector:
        severity = "high"
    elif score >= 0.5:
        severity = "medium"
    else:
        severity = "low"

    if not reasons:
        reasons = ["No strong malicious indicators detected"]

    return {
        "input": x,
        "risk_score": round(score, 4),
        "is_intrusion": is_intrusion,
        "severity": severity,
        "reasons": reasons,
    }


if __name__ == "__main__":
    # Demo scenarios (run: python intrusion_detection.py)
    _tests = [
        ("Normal User", {"failed_logins": 1, "requests_per_minute": 40}),
        ("Brute Force", {"failed_logins": 30}),
        ("Request Flood", {"requests_per_minute": 600, "unique_ips": 45}),
        ("Sensitive Paths", {"sensitive_path_accesses": 35}),
        ("Geo Velocity", {"geo_velocity_kmh": 1500}),
        (
            "Mixed Attack",
            {
                "failed_logins": 10,
                "requests_per_minute": 250,
                "unique_ips": 25,
                "sensitive_path_accesses": 15,
            },
        ),
    ]
    for _name, _event in _tests:
        print("\n==============================")
        print(_name)
        print("==============================")
        _result = detect_intrusion_event(_event)
        print("Risk Score:", _result["risk_score"])
        print("Is Intrusion:", _result["is_intrusion"])
        print("Severity:", _result["severity"])
        print("Reasons:", ", ".join(_result["reasons"]))
