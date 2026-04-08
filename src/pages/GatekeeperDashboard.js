import React, { useState, useRef, useEffect, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import "./Dashboard.css";
import { formatEgp } from "../utils/formatEgp";

import { API_BASE } from "../config/apiBase";
import { CHECK_IN_DEADLINE_MINUTES } from "../constants/checkInDeadline";

const QR_READER_ID = "gatekeeper-qr-reader";

/** html5-qrcode throws if stop() runs when the scanner was never started or already stopped. */
function safeStopHtml5Qrcode(scanner) {
  if (!scanner || typeof scanner.stop !== "function") return;
  try {
    if (!scanner.isScanning) return;
    const out = scanner.stop();
    if (out && typeof out.then === "function") {
      out.catch(() => {});
    }
  } catch {
    /* sync throw from stop() */
  }
}

const GatekeeperDashboard = () => {
  const { user } = useAuth();

  const [token, setToken] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [reservation, setReservation] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);
  const loadBookingRef = useRef(async () => {});

  const parseBookingId = (raw) => {
    const t = String(raw ?? "").trim();
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };

  const loadBooking = useCallback(async (rawInput) => {
    const bookingId = parseBookingId(rawInput);
    if (bookingId == null) {
      setStatusMsg("Please enter a valid booking ID (number from the QR).");
      return;
    }

    setLoading(true);
    setStatusMsg("Validating...");
    setReservation(null);
    setNextAction(null);
    setCameraError("");

    try {
      const res = await fetch(`${API_BASE}/gate/booking/${bookingId}`);
      const data = await res.json();

      if (!data.ok) {
        setStatusMsg(`❌ ${data.error || "Invalid booking"}`);
        setLoading(false);
        return;
      }

      setToken(String(bookingId));
      setReservation(data.reservation);
      setNextAction(data.nextAction);
      setStatusMsg(
        data.nextAction === "check-in"
          ? "✅ Booking confirmed — you can check in (entry)."
          : data.nextAction === "check-out"
            ? "✅ Customer checked in — you can check out (exit)."
            : "✅ Loaded booking."
      );
    } catch (e) {
      setStatusMsg(`❌ ${e.message || "Cannot reach server"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  loadBookingRef.current = loadBooking;

  const doCheckIn = async () => {
    const bookingId = parseBookingId(token);
    if (bookingId == null) return;

    setLoading(true);
    setStatusMsg("Checking in...");
    try {
      const res = await fetch(`${API_BASE}/gate/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatusMsg(`❌ ${data.error || "Check-in failed"}`);
        setLoading(false);
        return;
      }
      setStatusMsg(`✅ ${data.message} (slot ${data.slotNo})`);
      setReservation(null);
      setNextAction(null);
      setToken("");
    } catch (e) {
      setStatusMsg(`❌ ${e.message || "Cannot reach server"}`);
    } finally {
      setLoading(false);
    }
  };

  const doCheckOut = async () => {
    const bookingId = parseBookingId(token);
    if (bookingId == null) return;

    setLoading(true);
    setStatusMsg("Checking out...");
    try {
      const res = await fetch(`${API_BASE}/gate/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatusMsg(`❌ ${data.error || "Check-out failed"}`);
        setLoading(false);
        return;
      }
      setStatusMsg(
        `✅ ${data.message} (slot ${data.slotNo}) — total ${formatEgp(data.totalAmount)}`
      );
      setReservation(null);
      setNextAction(null);
      setToken("");
    } catch (e) {
      setStatusMsg(`❌ ${e.message || "Cannot reach server"}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Start camera after React has painted the reader div (initializing Html5Qrcode while the node was still
   * display:none caused failures). Falls back to the first listed camera if "environment" is unavailable.
   */
  useEffect(() => {
    if (!cameraActive) return undefined;

    let cancelled = false;
    let instance = null;

    const scanConfig = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight);
        const s = Math.max(120, Math.min(280, Math.floor(edge * 0.65)));
        return { width: s, height: s };
      },
      aspectRatio: 1,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    };

    const startScanner = async () => {
      await new Promise((r) => {
        requestAnimationFrame(() => requestAnimationFrame(r));
      });
      if (cancelled) return;

      if (!document.getElementById(QR_READER_ID)) {
        setCameraError("Scanner area not ready. Try again.");
        setCameraActive(false);
        return;
      }

      try {
        instance = new Html5Qrcode(QR_READER_ID);

        const onScanSuccess = (decodedText) => {
          const trimmed = String(decodedText ?? "").trim();
          const finish = () => {
            setCameraActive(false);
            setToken(trimmed);
            loadBookingRef.current(trimmed);
          };
          const current = instance;
          if (current?.isScanning) {
            try {
              const p = current.stop();
              if (p && typeof p.then === "function") {
                p.then(finish).catch(finish);
              } else {
                finish();
              }
            } catch {
              finish();
            }
          } else {
            finish();
          }
        };

        const startWithDevice = async (cameraIdOrConfig) => {
          await instance.start(cameraIdOrConfig, scanConfig, onScanSuccess, () => {});
        };

        try {
          await startWithDevice({ facingMode: "environment" });
        } catch {
          if (cancelled) return;
          try {
            if (typeof instance.clear === "function") instance.clear();
          } catch {
            /* ignore */
          }
          instance = new Html5Qrcode(QR_READER_ID);
          const devices = await Html5Qrcode.getCameras();
          if (!devices?.length) {
            throw new Error("No camera found. Connect a webcam or allow camera access.");
          }
          await instance.start(devices[0].id, scanConfig, onScanSuccess, () => {});
        }

        if (cancelled) {
          safeStopHtml5Qrcode(instance);
          return;
        }
        scannerRef.current = instance;
        setStatusMsg("Point the camera at the customer's booking QR (booking ID).");
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err?.message ||
              "Could not start camera. Allow camera access and use HTTPS or localhost."
          );
          setCameraActive(false);
        }
        scannerRef.current = null;
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      safeStopHtml5Qrcode(s);
      safeStopHtml5Qrcode(instance);
    };
  }, [cameraActive]);

  const startCamera = () => {
    if (cameraActive) return;
    setCameraError("");
    setStatusMsg("");
    setCameraActive(true);
  };

  const stopCamera = () => {
    setCameraActive(false);
    setStatusMsg("");
  };

  const clearAll = () => {
    setToken("");
    setReservation(null);
    setNextAction(null);
    setStatusMsg("");
    setCameraError("");
  };

  return (
    <div className="dashboard">
      <Navbar />
      <header className="dashboard-header">
        <div>
          <h1>Gatekeeper Dashboard</h1>
          <p>Welcome, {user?.first_name || user?.firstName}</p>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <h2>Scan booking QR</h2>
          <p className="gatekeeper-hint">
            QR contains the booking ID only. First scan = entry (check-in), second = exit (check-out). Check-in must
            happen within {CHECK_IN_DEADLINE_MINUTES} minutes after the booking start time, or the reservation is
            cancelled and the slot is freed automatically.
          </p>

          <div className="gatekeeper-scanner-actions">
            {!cameraActive ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={startCamera}
                disabled={loading}
              >
                Open camera &amp; scan QR
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={stopCamera}
              >
                Stop camera
              </button>
            )}
          </div>

          {cameraError && (
            <div className="gatekeeper-camera-error">{cameraError}</div>
          )}

          <div
            id={QR_READER_ID}
            className="gatekeeper-qr-reader"
            style={{ display: cameraActive ? "block" : "none" }}
          />

          {statusMsg && <p className="gatekeeper-status">{statusMsg}</p>}

          {reservation && (
            <div className="gatekeeper-reservation-card">
              <h3>Booking details</h3>
              <p><b>Booking ID:</b> {reservation.id}</p>
              <p><b>Slot:</b> {reservation.slot_no}</p>
              <p><b>Status:</b> {reservation.status}</p>
              <p><b>Start:</b> {new Date(reservation.start_time).toLocaleString()}</p>
              <p><b>End:</b> {new Date(reservation.end_time).toLocaleString()}</p>
              {reservation.check_in_time && (
                <p><b>Check-in:</b> {new Date(reservation.check_in_time).toLocaleString()}</p>
              )}
              <div className="gatekeeper-reservation-actions">
                {nextAction === "check-in" && (
                  <button type="button" className="btn btn-primary" onClick={doCheckIn} disabled={loading}>
                    Check-in (entry)
                  </button>
                )}
                {nextAction === "check-out" && (
                  <button type="button" className="btn btn-primary" onClick={doCheckOut} disabled={loading}>
                    Check-out (exit)
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Or enter booking ID manually</h2>
          <div className="gatekeeper-manual-row">
            <input
              type="text"
              inputMode="numeric"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Booking ID (number)..."
              className="gatekeeper-token-input"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => loadBooking(token)}
              disabled={loading}
            >
              {loading ? "..." : "Load"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatekeeperDashboard;
