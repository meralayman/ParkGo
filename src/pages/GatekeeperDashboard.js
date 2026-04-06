import React, { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import "./Dashboard.css";

const API_BASE = "http://localhost:5000";
const QR_READER_ID = "gatekeeper-qr-reader";

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

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (scanner && typeof scanner.stop === "function") {
        scanner.stop().catch(() => {});
      }
    };
  }, []);

  const parseBookingId = (raw) => {
    const t = String(raw ?? "").trim();
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : n;
  };

  const loadBooking = async (rawInput) => {
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
  };

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
        `✅ ${data.message} (slot ${data.slotNo}) — total $${Number(data.totalAmount).toFixed(2)}`
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

  const startCamera = async () => {
    setCameraError("");
    setStatusMsg("");
    if (scannerRef.current) return;

    setCameraActive(true);

    try {
      const html5QrCode = new Html5Qrcode(QR_READER_ID);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 300, height: 300 },
          aspectRatio: 1,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        },
        (decodedText) => {
          if (loading) return;
          const trimmed = decodedText.trim();
          html5QrCode.stop().then(() => {
            scannerRef.current = null;
            setCameraActive(false);
            setToken(trimmed);
            loadBooking(trimmed);
          }).catch(() => {
            scannerRef.current = null;
            setCameraActive(false);
            setToken(trimmed);
            loadBooking(trimmed);
          });
        },
        () => {}
      );
      setStatusMsg("Point the camera at the customer's booking QR (booking ID).");
    } catch (err) {
      setCameraError(err?.message || "Could not start camera. Check permissions.");
      setCameraActive(false);
      scannerRef.current = null;
      setStatusMsg("");
    }
  };

  const stopCamera = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
      setCameraActive(false);
      setStatusMsg("");
    } catch (e) {}
    scannerRef.current = null;
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
          <p className="gatekeeper-hint">QR contains the booking ID only. First scan = entry (check-in), second = exit (check-out).</p>

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
