import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import './Dashboard.css';
import { QRCodeCanvas } from "qrcode.react";

const API_BASE = 'http://localhost:5000';

// State mapping for UI
const stateLabel = (s) => {
  if (s === 0) return 'Empty';
  if (s === 1) return 'Occupied';
  if (s === 2) return 'Reserved';
  return String(s);
};

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

  useEffect(() => {
    loadSlots();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadReservationsAndHistory();
    }
  }, [user?.id]);

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
      time: start.toTimeString().slice(0, 5),
      duration: durationHours,
      vehicleType: r.vehicle_type || '-',
      totalAmount: Number(r.total_amount) || 0,
      status: r.status,
      createdAt: r.created_at,
      qrToken: r.qr_token,
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

        const active = mapped.filter(r => r.status === 'active');
        setReservations(active);

        const sortedHistory = mapped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setHistory(sortedHistory);
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
          paymentMethod: 'cash'
        })
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to create reservation');
        return;
      }

      await loadReservationsAndHistory();
      await loadSlots();

      setShowReservationModal(false);
      setReservationData({
        date: '',
        time: '',
        duration: '1',
        vehicleType: 'car',
        paymentMethod: 'cash'
      });

      alert(`Reservation created ✅\nSlot: ${data.reservation.slot_no}\nPay cash when leaving and get your exit QR from this dashboard.`);
    } catch (err) {
      alert(err.message || 'Cannot reach server');
    }
  };

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
          <div className="dashboard-section">
            <h2>Parking Overview</h2>

            {slotsLoading ? (
              <p className="empty-state">Loading slots...</p>
            ) : slotsError ? (
              <p className="empty-state slots-error">{slotsError}</p>
            ) : slots.length === 0 ? (
              <p className="empty-state">No slots available</p>
            ) : (
              <>
                <div className="slots-stats-row">
                  <div className="slots-stat-card">
                    <div className="slots-stat-circle slots-stat-total">{slots.length}</div>
                    <span>{slots.length} Total spots</span>
                  </div>
                  <div className="slots-stat-card">
                    <div className="slots-stat-circle slots-stat-occupied">
                      {slots.filter(s => Number(s.state) === 1).length}
                    </div>
                    <span>{slots.filter(s => Number(s.state) === 1).length} Occupied</span>
                  </div>
                  <div className="slots-stat-card">
                    <div className="slots-stat-circle slots-stat-available">
                      {slots.filter(s => Number(s.state) === 0).length}
                    </div>
                    <span>{slots.filter(s => Number(s.state) === 0).length} Available</span>
                  </div>
                </div>
                <div className="slots-grid parking-overview-grid">
                  {slots.map((slot, idx) => (
                    <div key={slot.slot_no} className={`slot-card slot-card-visual slot-state-${slot.state}`} title={`Slot ${slot.slot_no} - ${stateLabel(slot.state)}`}>
                      <div className={`slot-car-icon ${Number(slot.state) === 0 ? 'slot-car-empty' : `slot-car-filled slot-car-${['blue', 'purple', 'teal', 'blue-light', 'indigo'][idx % 5]}`}`}>
                        <svg viewBox="0 0 24 24" className="slot-car-svg" fill="currentColor">
                          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                        </svg>
                      </div>
                      <span className="slot-label">Slot {slot.slot_no}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="dashboard-section">
            <h2>Active Reservations</h2>
            <div className="table-container">
              {reservations.length === 0 ? (
                <p className="empty-state">No active reservations</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parking Spot</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Duration (hours)</th>
                      <th>Amount</th>
                      <th>QR</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation) => (
                      <tr key={reservation.id}>
                        <td>{reservation.parkingSpot}</td>
                        <td>{new Date(reservation.date).toLocaleDateString()}</td>
                        <td>{reservation.time}</td>
                        <td>{reservation.duration}</td>
                        <td>${reservation.totalAmount?.toFixed(2) || '0.00'}</td>
                        <td>
                          {reservation.paymentMethod === 'cash' ? (
                            reservation.qrToken ? (
                              <div className="exit-qr-cell">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => {
                                    setExitQRReservation(reservation);
                                    setShowExitQRModal(true);
                                  }}
                                >
                                  Leaving? Get exit QR
                                </button>
                                <small className="text-muted d-block mt-1">Pay cash at exit, then show QR</small>
                              </div>
                            ) : (
                              '-'
                            )
                          ) : reservation.qrToken ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                              <QRCodeCanvas value={reservation.qrToken} size={90} />
                              <small style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {reservation.qrToken}
                              </small>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>

                        <td>
                          <button
                            onClick={() => handleCancelReservation(reservation.id)}
                            className="btn btn-sm btn-delete"
                          >
                            Cancel
                          </button>
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
            <h2>Pay cash &amp; show exit QR</h2>
            <p className="exit-qr-instruction">
              Pay <strong>${exitQRReservation.totalAmount?.toFixed(2) || '0.00'}</strong> cash to the gatekeeper. After paying, show this QR for them to scan to open the gate.
            </p>
            <div className="exit-qr-code-wrap">
              <QRCodeCanvas value={exitQRReservation.qrToken} size={220} />
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
                A parking slot will be assigned automatically from available slots.
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
