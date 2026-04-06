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

  const validateToken = async (tokenToValidate) => {
    const t = (tokenToValidate ?? token).trim();
    if (!t) {
      setStatusMsg("Please enter / paste the QR token or scan with camera.");
      return;
    }

    setLoading(true);
    setStatusMsg("Validating...");
    setReservation(null);
    setCameraError("");

    try {
      const res = await fetch(`${API_BASE}/gate/scan/${encodeURIComponent(t)}`);
      const data = await res.json();

      if (!data.ok) {
        setStatusMsg(`❌ ${data.error || "Invalid QR"}`);
        setLoading(false);
        return;
      }

      setToken(t);
      setReservation(data.reservation);
      setStatusMsg("✅ Valid reservation. You can open the gate.");
    } catch (e) {
      setStatusMsg(`❌ ${e.message || "Cannot reach server"}`);
    } finally {
      setLoading(false);
    }
  };

  const openGate = async () => {
    if (!reservation?.qr_token) return;

    setLoading(true);
    setStatusMsg("Opening gate...");

    try {
      const res = await fetch(`${API_BASE}/gate/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: reservation.qr_token }),
      });

      const data = await res.json();

      if (!data.ok) {
        setStatusMsg(`❌ ${data.error || "Failed to open gate"}`);
        setLoading(false);
        return;
      }

      setStatusMsg(`✅ ${data.message} (Slot ${data.slotNo})`);
      setReservation(null);
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
          qrbox: { width: 260, height: 260 },
        },
        (decodedText) => {
          if (loading) return;
          html5QrCode.stop().then(() => {
            scannerRef.current = null;
            setCameraActive(false);
            setToken(decodedText);
            validateToken(decodedText);
          }).catch(() => {
            scannerRef.current = null;
            setCameraActive(false);
            setToken(decodedText);
            validateToken(decodedText);
          });
        },
        () => {}
      );
      setStatusMsg("Point the camera at the customer's QR code.");
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
          <h2>Scan QR with camera</h2>
          <p className="gatekeeper-hint">Open the camera and point it at the customer's reservation QR code.</p>

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
              <h3>Reservation details</h3>
              <p><b>Slot:</b> {reservation.slot_no}</p>
              <p><b>Status:</b> {reservation.status}</p>
              <p><b>Start:</b> {new Date(reservation.start_time).toLocaleString()}</p>
              <p><b>End:</b> {new Date(reservation.end_time).toLocaleString()}</p>
              <div className="gatekeeper-reservation-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={openGate}
                  disabled={loading}
                >
                  Open gate
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <h2>Or enter token manually</h2>
          <div className="gatekeeper-manual-row">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste QR token here..."
              className="gatekeeper-token-input"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => validateToken()}
              disabled={loading}
            >
              {loading ? "..." : "Validate"}
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
