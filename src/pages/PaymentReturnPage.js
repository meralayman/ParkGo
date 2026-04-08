import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./AuthPages.css";
import { PARKGO_PENDING_SLOT_KEY } from "../constants/pendingSlot";

import { API_BASE } from "../config/apiBase";
const STORAGE_KEY = "parkgo_pay_pending";

export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizing your booking…");
  const [canRetry, setCanRetry] = useState(false);
  const ran = useRef(false);

  const finalize = async () => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setMsg("No pending payment session. Start again from the dashboard.");
      setCanRetry(false);
      return;
    }
    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      setMsg("Invalid payment session.");
      setCanRetry(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: pending.userId,
          startTime: pending.startTime,
          endTime: pending.endTime,
          totalAmount: pending.totalAmount,
          paymentMethod: "card",
          slotNo: pending.slotNo,
        }),
      });
      const data = await res.json();
      sessionStorage.removeItem(STORAGE_KEY);
      try {
        localStorage.removeItem(PARKGO_PENDING_SLOT_KEY);
      } catch {
        /* ignore */
      }

      if (!data.ok) {
        setMsg(data.error || "Could not create reservation after payment.");
        setCanRetry(true);
        return;
      }
      navigate("/user", { replace: true });
    } catch (e) {
      setMsg(e.message || "Cannot reach server");
      setCanRetry(true);
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Paymob usually returns success=true/false, but we keep this tolerant.
    const failed = params.get("success") === "false" || params.get("success") === "False";
    if (failed) {
      sessionStorage.removeItem(STORAGE_KEY);
      setMsg("Payment failed or was cancelled. Try again from the dashboard.");
      setCanRetry(false);
      return;
    }
    finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-page-wrap">
      <Navbar />
      <div className="auth-container">
        <div className="auth-card">
          <h2>Payment status</h2>
          <p className="auth-subtitle">{msg}</p>
          {canRetry && (
            <button type="button" className="auth-button" onClick={finalize}>
              Try finalize again
            </button>
          )}
          <button
            type="button"
            className={canRetry ? "btn btn-secondary mt-3 w-100" : "auth-button"}
            onClick={() => navigate("/user")}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

