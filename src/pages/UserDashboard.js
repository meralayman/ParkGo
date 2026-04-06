import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import AlexandriaParkingGrid from '../components/AlexandriaParkingGrid';
import { LOT_NAME } from '../constants/alexandriaLot';
import { PARKGO_PENDING_SLOT_KEY } from '../constants/pendingSlot';
import './Dashboard.css';
import { QRCodeCanvas } from "qrcode.react";

const API_BASE = 'http://localhost:5000';

/** Match backend PARKING_HOURLY_RATE (extend button) */
const HOURLY_RATE = 5;
/** Match backend OVERSTAY_HOURLY_RATE — shown for past-end-time text; set REACT_APP_OVERSTAY_HOURLY_RATE if you override it */
const OVERSTAY_RATE_DISPLAY =
  Number(process.env.REACT_APP_OVERSTAY_HOURLY_RATE) || HOURLY_RATE;

const UserDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [reservations, setReservations] = useState([]);
  const [history, setHistory] = useState([]);

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState('');

  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showExitQRModal, setShowExitQRModal] = useState(false);
  const [exitQRReservation, setExitQRReservation] = useState(null);
  const [reservationData, setReservationData] = useState({
    date: '',
    time: '',
    duration: '1',
    vehicleType: 'car',
    paymentMethod: 'cash'
  });

  /** Slot chosen on the public map or here; kept in localStorage across login */
  const [pendingSlotNo, setPendingSlotNo] = useState(null);

  const clearPendingSlot = () => {
    setPendingSlotNo(null);
    try {
      localStorage.removeItem(PARKGO_PENDING_SLOT_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PARKGO_PENDING_SLOT_KEY);
      if (saved) setPendingSlotNo(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadReservationsAndHistory();
    }
  }, [user?.id]);

  /** Drop pending selection if that slot is gone or no longer free */
  useEffect(() => {
    if (!pendingSlotNo || !slots.length) return;
    const row = slots.find((s) => s.slot_no === pendingSlotNo);
    if (!row || Number(row.state) !== 0) {
      clearPendingSlot();
    }
  }, [slots, pendingSlotNo]);

  const loadSlots = async () => {
    setSlotsLoading(true);
    setSlotsError('');
    try {
      const res = await fetch(`${API_BASE}/slots`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.slots)) {
        setSlots(data.slots);
      } else {
        setSlotsError(data.error || 'Failed to load slots');
      }
    } catch (err) {
      setSlotsError(err.message || 'Cannot reach server');
    } finally {
      setSlotsLoading(false);
    }
  };

  const mapApiReservationToUI = (r) => {
    const start = new Date(r.start_time);
    const end = new Date(r.end_time);
    const durationHours = Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));

    return {
      id: r.id,
      parkingSpot: r.slot_no,
      date: r.start_time,
      endTime: r.end_time,
      time: start.toTimeString().slice(0, 5),
      duration: durationHours,
      vehicleType: r.vehicle_type || '-',
      totalAmount: Number(r.total_amount) || 0,
      status: r.status,
      createdAt: r.created_at,
      qrToken: r.qr_token,
      checkInTime: r.check_in_time,
      checkOutTime: r.check_out_time,
      paymentMethod: r.payment_method || 'cash',
    };
  };

  const loadReservationsAndHistory = async () => {
    if (!user?.id) return;

    try {
      const res = await fetch(`${API_BASE}/reservations/user/${user.id}`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.reservations)) {
        const mapped = data.reservations.map(mapApiReservationToUI);

        const active = mapped.filter((r) => ['confirmed', 'checked_in'].includes(r.status));
        setReservations(active);

        const hist = mapped
          .filter((r) => !['confirmed', 'checked_in'].includes(r.status))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setHistory(hist);
      }
    } catch (err) {
      console.error('Failed to load reservations/history', err);
    }
  };

  const handleReservationChange = (e) => {
    setReservationData({
      ...reservationData,
      [e.target.name]: e.target.value
    });
  };

  const handleCreateReservation = async () => {
    if (!reservationData.date || !reservationData.time || !reservationData.duration) {
      alert('Please fill in date, time, and duration');
      return;
    }

    const duration = parseFloat(reservationData.duration) || 1;
    const totalAmount = duration * 5;

    const startTime = new Date(`${reservationData.date}T${reservationData.time}`);
    const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);

    const isCard = reservationData.paymentMethod === 'card';

    if (isCard) {
      setShowReservationModal(false);
      setReservationData({
        date: '',
        time: '',
        duration: '1',
        vehicleType: 'car',
        paymentMethod: 'cash'
      });
      navigate('/payment', {
        state: {
          pendingReservation: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            totalAmount,
            slotNo: pendingSlotNo || undefined,
          },
        },
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          totalAmount,
          paymentMethod: 'cash',
          slotNo: pendingSlotNo || undefined,
        })
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to create reservation');
        return;
      }

      await loadReservationsAndHistory();
      await loadSlots();

      clearPendingSlot();
      setShowReservationModal(false);
      setReservationData({
        date: '',
        time: '',
        duration: '1',
        vehicleType: 'car',
        paymentMethod: 'cash'
      });

      alert(
        `Reservation created ✅\nSlot: ${data.reservation.slot_no}\nBooking ID: ${data.reservation.id}\nThe QR encodes PARKGO|V1|${data.reservation.id} for the gate scanner.`
      );
    } catch (err) {
      alert(err.message || 'Cannot reach server');
    }
  };

  const overdueReservations = useMemo(() => {
    const now = Date.now();
    return reservations.filter(
      (r) =>
        ['confirmed', 'checked_in'].includes(r.status) &&
        r.endTime &&
        new Date(r.endTime).getTime() < now
    );
  }, [reservations]);

  const [overstayActionLoading, setOverstayActionLoading] = useState(false);

  const handleOverstayExtend = async (reservationId) => {
    if (!user?.id) return;
    setOverstayActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reservations/${reservationId}/overstay-extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Could not extend reservation');
        return;
      }
      await loadReservationsAndHistory();
      await loadSlots();
      alert(data.message || 'Reservation extended by 1 hour.');
    } catch (err) {
      alert(err.message || 'Cannot reach server');
    } finally {
      setOverstayActionLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return undefined;
    const t = setInterval(() => {
      loadReservationsAndHistory();
    }, 45000);
    return () => clearInterval(t);
  }, [user?.id]);

  const handleCancelReservation = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;

    try {
      const res = await fetch(`${API_BASE}/reservations/${id}/cancel`, { method: 'PATCH' });
      const data = await res.json();

      if (!data.ok) {
        alert(data.error || 'Failed to cancel reservation');
        return;
      }

      await loadReservationsAndHistory();
      await loadSlots();
    } catch (err) {
      alert(err.message || 'Cannot reach server');
    }
  };

  return (
    <div className="dashboard">
      <Navbar />
      <header className="dashboard-header">
        <div>
          <h1>User Dashboard</h1>
          <p>Welcome, {user?.first_name || user?.firstName} {user?.last_name || user?.lastName}</p>
        </div>
      </header>

      <div className="dashboard-content">
        {overdueReservations.length > 0 && (
          <div className="overstay-panel" role="region" aria-label="Parking time ended">
            {overdueReservations.map((ov) => (
              <div key={ov.id} className="overstay-card">
                <h3 className="overstay-title">Parking time ended</h3>
                <p className="overstay-text">
                  Spot <strong>{ov.parkingSpot}</strong> — your booking ended at{' '}
                  <strong>{new Date(ov.endTime).toLocaleString()}</strong>. Add another hour below if you need more time.
                  If you leave without extending, extra fees apply: <strong>${OVERSTAY_RATE_DISPLAY.toFixed(2)} per hour</strong> for each full hour past your end time (rounded up), added when you scan out at the gate.
                </p>
                <div className="overstay-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={overstayActionLoading}
                    onClick={() => handleOverstayExtend(ov.id)}
                  >
                    {`Add 1 more hour (+$${HOURLY_RATE.toFixed(2)})`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dashboard-actions">
          <button
            onClick={() => setShowReservationModal(true)}
            className="btn btn-primary"
          >
            + Make Reservation
          </button>
          <button
            onClick={() => { loadReservationsAndHistory(); loadSlots(); }}
            className="btn btn-secondary"
            style={{ marginLeft: 10 }}
          >
            Refresh
          </button>
        </div>

        <div className="dashboard-sections">
          <div className="dashboard-section parking-overview-dashboard">
            <h2>Parking Overview</h2>
            <p className="parking-overview-hint">
              {LOT_NAME} — same map as on the booking page.{' '}
              {pendingSlotNo
                ? <>Selected spot: <strong>{pendingSlotNo}</strong> (used when you confirm a reservation).</>
                : <>Tap a green slot to choose it, then open <strong>Make Reservation</strong>.</>}
            </p>

            {slotsLoading ? (
              <p className="empty-state">Loading slots...</p>
            ) : slotsError ? (
              <p className="empty-state slots-error">{slotsError}</p>
            ) : slots.length === 0 ? (
              <p className="empty-state">No slots available</p>
            ) : (
              <AlexandriaParkingGrid
                slots={slots}
                selectedSlotNo={pendingSlotNo}
                onSlotClick={(slotNo) => {
                  setPendingSlotNo(slotNo);
                  try {
                    localStorage.setItem(PARKGO_PENDING_SLOT_KEY, slotNo);
                  } catch {
                    /* ignore */
                  }
                }}
                showLegend
              />
            )}
          </div>

          <div className="dashboard-section">
            <h2>Current bookings</h2>
            <p className="parking-overview-hint" style={{ marginBottom: '0.75rem' }}>
              QR codes contain your <strong>booking ID</strong> only — show at entry (check-in) and exit (check-out).
            </p>
            <div className="table-container">
              {reservations.length === 0 ? (
                <p className="empty-state">No current bookings</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Parking Spot</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Duration (hours)</th>
                      <th>Est. amount</th>
                      <th>Booking QR</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation) => (
                      <tr key={reservation.id}>
                        <td>{reservation.id}</td>
                        <td>{reservation.parkingSpot}</td>
                        <td>
                          <span className={`status-badge status-${reservation.status}`}>
                            {reservation.status}
                          </span>
                        </td>
                        <td>{new Date(reservation.date).toLocaleDateString()}</td>
                        <td>{reservation.time}</td>
                        <td>{reservation.duration}</td>
                        <td>${reservation.totalAmount?.toFixed(2) || '0.00'}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                            <QRCodeCanvas value={String(reservation.id)} size={90} />
                            <small>ID: {reservation.id}</small>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setExitQRReservation(reservation);
                                setShowExitQRModal(true);
                              }}
                            >
                              Larger QR
                            </button>
                          </div>
                        </td>

                        <td>
                          {reservation.status === 'confirmed' ? (
                            <button
                              onClick={() => handleCancelReservation(reservation.id)}
                              className="btn btn-sm btn-delete"
                            >
                              Cancel
                            </button>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 12 }}>Checked in</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="dashboard-section">
            <h2>Reservation History</h2>
            <div className="table-container">
              {history.length === 0 ? (
                <p className="empty-state">No reservation history</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parking Spot</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Duration</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id}>
                        <td>{item.parkingSpot}</td>
                        <td>{new Date(item.date).toLocaleDateString()}</td>
                        <td>{item.time}</td>
                        <td>{item.duration} hours</td>
                        <td>${item.totalAmount?.toFixed(2) || '0.00'}</td>
                        <td>
                          <span className={`status-badge status-${item.status}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>

      {showExitQRModal && exitQRReservation && (
        <div className="modal-overlay" onClick={() => setShowExitQRModal(false)}>
          <div className="modal-content exit-qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pay cash &amp; show booking QR</h2>
            <p className="exit-qr-instruction">
              Pay <strong>${exitQRReservation.totalAmount?.toFixed(2) || '0.00'}</strong> cash to the gatekeeper. Show this QR for <strong>check-out</strong> — final amount is calculated at exit.
            </p>
            <div className="exit-qr-code-wrap">
              <QRCodeCanvas value={String(exitQRReservation.id)} size={220} />
              <p className="exit-qr-instruction" style={{ marginTop: 12 }}>Booking ID: {exitQRReservation.id}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowExitQRModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showReservationModal && (
        <div className="modal-overlay" onClick={() => setShowReservationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Make a Reservation</h2>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleCreateReservation();
            }}>
              <p className="form-hint">
                {pendingSlotNo
                  ? `You are reserving spot ${pendingSlotNo}. Change it by tapping another green slot on the map above.`
                  : 'Choose a green slot on the map above, or we will assign the first available spot when you confirm.'}
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={reservationData.date}
                    onChange={handleReservationChange}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Time *</label>
                  <input
                    type="time"
                    name="time"
                    value={reservationData.time}
                    onChange={handleReservationChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Duration (hours) *</label>
                  <input
                    type="number"
                    name="duration"
                    value={reservationData.duration}
                    onChange={handleReservationChange}
                    min="1"
                    max="24"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Vehicle Type *</label>
                  <select
                    name="vehicleType"
                    value={reservationData.vehicleType}
                    onChange={handleReservationChange}
                    required
                  >
                    <option value="car">Car</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="truck">Truck</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    name="paymentMethod"
                    value={reservationData.paymentMethod}
                    onChange={handleReservationChange}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Total Amount</label>
                  <input
                    type="text"
                    value={`$${(parseFloat(reservationData.duration) * 5).toFixed(2)}`}
                    disabled
                    style={{ background: '#f5f5f5' }}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  Confirm Reservation
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowReservationModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;
