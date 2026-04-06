import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import './AuthPages.css';
import './Dashboard.css';

const API_BASE = 'http://localhost:5000';

const PaymentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const pending = location.state?.pendingReservation;

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handlePay = async (e) => {
    e.preventDefault();
    setError('');
    if (!cardNumber.trim() || !expiry.trim() || !cvc.trim() || !cardName.trim()) {
      setError('Please fill in all card details');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          startTime: pending.startTime,
          endTime: pending.endTime,
          totalAmount: pending.totalAmount,
          paymentMethod: 'card',
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Payment failed');
        setLoading(false);
        return;
      }

      navigate('/user', { replace: true });
    } catch (err) {
      setError(err.message || 'Cannot reach server');
    } finally {
      setLoading(false);
    }
  };

  const amount = pending?.totalAmount ?? 0;

  return (
    <div className="auth-page-wrap">
      <Navbar />
      <div className="auth-container">
      <div className="auth-card payment-card">
        <h2>Pay with card</h2>
        <p className="auth-subtitle">Amount due: <strong>${amount.toFixed(2)}</strong></p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handlePay} className="auth-form">
          <div className="form-group">
            <label>Cardholder name *</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Name on card"
              required
            />
          </div>
          <div className="form-group">
            <label>Card number *</label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
              placeholder="4242 4242 4242 4242"
              maxLength={16}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Expiry (MM/YY) *</label>
              <input
                type="text"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="MMYY"
                maxLength={4}
                required
              />
            </div>
            <div className="form-group">
              <label>CVC *</label>
              <input
                type="text"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="123"
                maxLength={4}
                required
              />
            </div>
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
          </button>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-100"
            onClick={() => navigate('/user')}
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
    </div>
  );
};

export default PaymentPage;
