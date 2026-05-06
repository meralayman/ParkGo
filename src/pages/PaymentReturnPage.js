import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./AuthPages.css";
import { PARKGO_PENDING_SLOT_KEY } from "../constants/pendingSlot";

import { API_BASE } from "../config/apiBase";
import { fetchWithAuth } from "../utils/authFetch";
import { PARKGO_PAYMENT_SUCCESS_TOAST_KEY } from "../constants/paymentToast";

const STORAGE_KEY = "parkgo_pay_pending";

/** Decode Paymob transaction redirect query params into a readable line */
function paymobFailureHint(params) {
  const txn = params.get("txn_response_code");
  const dataMsg = params.get("data.message");
  const topMsg = params.get("message") || "";
  const acq = params.get("acq_response_code") || "";
  const parts = [txn || "", dataMsg || topMsg || "", acq && acq !== "00" ? `acq=${acq}` : ""].filter(Boolean);
  const s = parts.join(" — ").trim();
  return s || null;
}

export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Finalizing your booking…");
  /** pending: working; success: payment + booking saved; failed: show error/retry */
  const [completed, setCompleted] = useState("pending");
  const [canRetry, setCanRetry] = useState(false);
  const ran = useRef(false);
  const successNavTimer = useRef(null);

  const navigateToDashboardWithSuccessToast = () => {
    try {
      sessionStorage.setItem(PARKGO_PAYMENT_SUCCESS_TOAST_KEY, "1");
    } catch {
      /* ignore */
    }
    navigate("/user", { replace: true });
  };

  useEffect(() => {
    return () => {
      if (successNavTimer.current != null) {
        clearTimeout(successNavTimer.current);
        successNavTimer.current = null;
      }
    };
  }, []);

  const finalize = async () => {
    setCompleted("pending");
    setCanRetry(false);
    setMsg("Finalizing your booking…");
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setCompleted("failed");
      setMsg("No pending payment session. Start again from the dashboard.");
      setCanRetry(false);
      return;
    }
    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      setCompleted("failed");
      setMsg("Invalid payment session.");
      setCanRetry(false);
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/reservations`, {
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
        setCompleted("failed");
        setMsg(data.error || "Could not create reservation after payment.");
        setCanRetry(true);
        return;
      }
      setCompleted("success");
      setMsg("Payment completed successfully. Your reservation is confirmed.");
      successNavTimer.current = window.setTimeout(() => {
        successNavTimer.current = null;
        navigateToDashboardWithSuccessToast();
      }, 2500);
    } catch (e) {
      setCompleted("failed");
      setMsg(e.message || "Cannot reach server");
      setCanRetry(true);
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Paymob redirects with success=true|false (transaction response callback).
    const successRaw = params.get("success");
    const failed =
      successRaw === "false" ||
      successRaw === "False" ||
      params.get("error_occured") === "true" ||
      params.get("error_occured") === "True";
    if (failed) {
      setCompleted("failed");
      sessionStorage.removeItem(STORAGE_KEY);
      const hint = paymobFailureHint(params);
      setMsg(
        hint
          ? `Payment did not complete. ${hint} Try again from the dashboard, or use Paymob test cards if you are in test mode.`
          : "Payment failed or was cancelled (Paymob reported success=false). Try again from the dashboard; in test mode use Paymob-approved test cards from your Accept dashboard."
      );
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
          {completed === "success" ? (
            <div className="success-message" role="status">
              <strong>{msg}</strong>
              <p className="auth-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
                Taking you to your dashboard in a moment…
              </p>
            </div>
          ) : (
            <p className="auth-subtitle">{msg}</p>
          )}
          {canRetry && (
            <button type="button" className="auth-button" onClick={finalize}>
              Try finalize again
            </button>
          )}
          {completed === "success" && (
            <button
              type="button"
              className="auth-button mt-2"
              onClick={() => {
                if (successNavTimer.current != null) {
                  clearTimeout(successNavTimer.current);
                  successNavTimer.current = null;
                }
                navigateToDashboardWithSuccessToast();
              }}
            >
              Go to dashboard now
            </button>
          )}
          {(completed !== "success" || canRetry) && (
            <button
              type="button"
              className={canRetry ? "btn btn-secondary mt-3 w-100" : "auth-button"}
              onClick={() => navigate("/user")}
              disabled={completed === "pending" && !canRetry}
            >
              Back to dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

