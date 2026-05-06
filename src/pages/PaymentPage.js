import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import './AuthPages.css';
import './Dashboard.css';
import { formatEgp } from '../utils/formatEgp';
import { API_BASE, apiUnreachableMessage, apiBaseForErrors } from '../config/apiBase';
import { fetchWithAuth } from '../utils/authFetch';

const PAY_PENDING_KEY = 'parkgo_pay_pending';

function redirectLockKey(paymentAttempt) {
  return `parkgo_paymob_redirect_${paymentAttempt}`;
}

function friendlyFetchError(err) {
  const msg = err && err.message ? String(err.message) : '';
  if (
    /failed to fetch|fetch failed|networkerror|load failed|network request failed|econnrefused|when attempting to fetch resource/i.test(
      msg
    )
  ) {
    return apiUnreachableMessage();
  }
  return msg || 'Request failed';
}

const PaymentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const pending = location.state?.pendingReservation;

  const [error, setError] = useState('');
  const [paymobEnabled, setPaymobEnabled] = useState(null);
  /** True when backend has PAYMOB_MOCK_CHECKOUT (no iframe, simulated approval) */
  const [checkoutMock, setCheckoutMock] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | redirecting | error
  const [showStuckHint, setShowStuckHint] = useState(false);

  const attemptRef = useRef(null);

  const paymentAttempt = pending?.paymentAttempt ?? null;

  const billingPayload = useCallback(
    () => ({
      first_name: user?.first_name || user?.firstName || 'Customer',
      last_name: user?.last_name || user?.lastName || 'ParkGo',
      email: user?.email || 'user@example.com',
      phone_number: user?.phone_number || user?.phoneNumber || '+201000000000',
    }),
    [user]
  );

  const redirectToPaymob = useCallback(async () => {
    if (!pending || !user?.id) return;
    const attempt = pending.paymentAttempt;
    if (attempt == null) {
      setError('Missing payment attempt id. Go back and choose Card (Paymob) again.');
      setPhase('error');
      return;
    }

    const lk = redirectLockKey(attempt);
    if (sessionStorage.getItem(lk) === '1') {
      setPhase('idle');
      return;
    }
    sessionStorage.setItem(lk, '1');
    setShowStuckHint(false);
    setError('');
    setPhase('redirecting');
    try {
      sessionStorage.setItem(
        PAY_PENDING_KEY,
        JSON.stringify({
          userId: user.id,
          startTime: pending.startTime,
          endTime: pending.endTime,
          totalAmount: pending.totalAmount,
          slotNo: pending.slotNo,
        })
      );

      const res = await fetchWithAuth(`${API_BASE}/paymob/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: pending.totalAmount,
          billing: billingPayload(),
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        sessionStorage.removeItem(lk);
        setError(
          `The server did not return JSON (${res.status}). Check that the backend is running at ${apiBaseForErrors()}.`
        );
        setPhase('error');
        return;
      }

      if (!res.ok || !data.ok) {
        sessionStorage.removeItem(lk);
        setError(data.error || `Could not start Paymob (${res.status})`);
        setPhase('error');
        return;
      }

      if (data.mock) {
        sessionStorage.removeItem(lk);
        const q = new URLSearchParams({
          success: 'true',
          txn_response_code: 'APPROVED',
          'data.message': 'Approved (PAYMOB_MOCK_CHECKOUT — no Paymob iframe)',
          error_occured: 'false',
          parkgo_mock: '1',
        });
        navigate({ pathname: '/payment/return', search: q.toString() }, { replace: true });
        return;
      }

      if (!data.iframeUrl) {
        sessionStorage.removeItem(lk);
        setError('Paymob did not return a checkout URL.');
        setPhase('error');
        return;
      }

      window.location.assign(data.iframeUrl);
    } catch (err) {
      sessionStorage.removeItem(lk);
      setError(friendlyFetchError(err));
      setPhase('error');
    }
  }, [pending, user, billingPayload, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/paymob/config`);
        let d;
        try {
          d = await res.json();
        } catch {
          if (!cancelled) {
            setPaymobEnabled(false);
            setError(`Cannot read API response. Is the backend running at ${apiBaseForErrors()}?`);
            setPhase('error');
          }
          return;
        }
        if (cancelled) return;
        if (d && d.ok) {
          setCheckoutMock(Boolean(d.mock));
          setPaymobEnabled(Boolean(d.enabled));
        } else setPaymobEnabled(false);
      } catch (err) {
        if (!cancelled) {
          setPaymobEnabled(false);
          setError(friendlyFetchError(err));
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pending || !user?.id) return;
    if (paymobEnabled !== true) return;
    if (paymentAttempt == null) return;
    if (attemptRef.current === paymentAttempt) return;
    attemptRef.current = paymentAttempt;
    redirectToPaymob();
  }, [pending, user?.id, paymobEnabled, paymentAttempt, redirectToPaymob]);

  useEffect(() => {
    if (paymobEnabled !== true || phase !== 'idle' || error) return;
    const t = setTimeout(() => setShowStuckHint(true), 2500);
    return () => clearTimeout(t);
  }, [paymobEnabled, phase, error]);

  const retry = () => {
    if (paymentAttempt != null) {
      sessionStorage.removeItem(redirectLockKey(paymentAttempt));
    }
    attemptRef.current = null;
    setShowStuckHint(false);
    setPhase('idle');
    setError('');
    redirectToPaymob();
  };

  if (!pending || !user?.id) {
    return (
      <div className="auth-page-wrap">
        <Navbar />
        <div className="auth-container">
          <div className="auth-card">
            <h2>Invalid session</h2>
            <p className="auth-subtitle">No pending payment. Start from a new reservation.</p>
            <button type="button" className="auth-button" onClick={() => navigate('/user')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const amount = pending?.totalAmount ?? 0;

  return (
    <div className="auth-page-wrap">
      <Navbar />
      <div className="auth-container">
        <div className="auth-card payment-card">
          <h2>{checkoutMock ? 'Pay (simulated checkout)' : 'Pay with Paymob'}</h2>
          <p className="auth-subtitle">
            Amount due: <strong>{formatEgp(amount)}</strong>
          </p>
          {checkoutMock && (
            <p className="auth-subtitle" style={{ fontSize: 13 }}>
              <code>PAYMOB_MOCK_CHECKOUT</code> is on: no card page — payment is marked approved locally
              for testing only.
            </p>
          )}

          {error && <div className="error-message">{error}</div>}

          {paymobEnabled === null && phase !== 'error' && (
            <p className="auth-subtitle">Connecting to payment…</p>
          )}

          {paymobEnabled === false && !error && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              Card payment uses Paymob only. Add <code>PAYMOB_API_KEY</code>,{' '}
              <code>PAYMOB_INTEGRATION_ID</code>, and               <code>PAYMOB_IFRAME_ID</code> to <code>backend/.env</code>, or enable{' '}
              <code>PAYMOB_MOCK_CHECKOUT=true</code> for local simulated approval without Paymob — then restart
              the API server.
            </div>
          )}

          {paymobEnabled === true && phase === 'redirecting' && !error && !checkoutMock && (
            <p className="auth-subtitle">Redirecting you to Paymob secure checkout…</p>
          )}
          {paymobEnabled === true && phase === 'redirecting' && !error && checkoutMock && (
            <p className="auth-subtitle">Completing simulated payment…</p>
          )}

          {(phase === 'error' || showStuckHint) && paymobEnabled === true && (
            <button type="button" className="auth-button" onClick={retry}>
              Try Paymob again
            </button>
          )}

          {showStuckHint && phase === 'idle' && !error && paymobEnabled === true && (
            <p className="auth-subtitle" style={{ fontSize: 13, marginTop: 8 }}>
              If nothing happens, tap <strong>Try Paymob again</strong> (this clears a stuck payment lock).
            </p>
          )}

          <button
            type="button"
            className="btn btn-secondary mt-3 w-100"
            onClick={() => navigate('/user')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
