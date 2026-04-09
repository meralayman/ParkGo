import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifier } from '../context/NotifierContext';
import Navbar from '../components/Navbar';
import './Dashboard.css';
import { formatEgp } from '../utils/formatEgp';

import { API_BASE, safeFetchJson } from '../config/apiBase';

const SLOT_STATES = { 0: 'Available', 1: 'Occupied', 2: 'Reserved' };

const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('analytics');
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [userHistoryUserId, setUserHistoryUserId] = useState(null);
  const [userHistoryData, setUserHistoryData] = useState(null);
  const [userHistoryLoading, setUserHistoryLoading] = useState(false);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [newSlotNo, setNewSlotNo] = useState('');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    nationalId: '',
    username: '',
    gmail: '',
    password: '',
    role: 'user'
  });

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const result = await safeFetchJson('/admin/analytics');
      if (result.error) {
        setAnalytics(null);
        setAnalyticsError(result.error);
        return;
      }
      const data = result.data;
      if (data && data.ok && data.analytics) {
        setAnalytics(data.analytics);
      } else {
        setAnalytics(null);
        setAnalyticsError((data && data.error) || 'Failed to load analytics');
      }
    } catch (err) {
      setAnalytics(null);
      setAnalyticsError(err.message || 'Cannot reach server');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'analytics') loadAnalytics();
  }, [activeSection, loadAnalytics]);

  useEffect(() => {
    if (activeSection === 'accounts') loadUsers();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'slots') loadSlots();
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'reservations') loadReservations();
  }, [activeSection]);

  useEffect(() => {
    if (userHistoryUserId) {
      setUserHistoryLoading(true);
      setUserHistoryData(null);
      fetch(`${API_BASE}/admin/users/${userHistoryUserId}/history`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) setUserHistoryData(data);
          else setUserHistoryData(null);
        })
        .catch(() => setUserHistoryData(null))
        .finally(() => setUserHistoryLoading(false));
    } else {
      setUserHistoryData(null);
    }
  }, [userHistoryUserId]);

  const loadUsers = async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`);
      const data = await res.json();
      if (data.ok) setAccounts(data.users || []);
      else setAccounts([]);
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  };

  const loadSlots = async () => {
    setSlotsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/slots`);
      const data = await res.json();
      if (data.ok) setSlots(data.slots || []);
      else setSlots([]);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const loadReservations = async () => {
    setReservationsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/reservations`);
      const data = await res.json();
      if (data.ok) setReservations(data.reservations || []);
      else setReservations([]);
    } catch {
      setReservations([]);
    } finally {
      setReservationsLoading(false);
    }
  };

  const updateSlotState = async (slotNo, newState) => {
    try {
      const res = await fetch(`${API_BASE}/admin/slots/${encodeURIComponent(slotNo)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json();
      if (data.ok) loadSlots();
      else toast(data.error || 'Failed to update slot', { variant: 'error' });
    } catch (e) {
      toast('Network error. Is the backend running?', { variant: 'error' });
    }
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    const name = newSlotNo.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API_BASE}/admin/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_no: name }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewSlotNo('');
        setShowAddSlotModal(false);
        loadSlots();
      } else {
        toast(data.error || 'Failed to add slot', { variant: 'error' });
      }
    } catch {
      toast('Network error. Is the backend running?', { variant: 'error' });
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const toApiUser = () => ({
    first_name: formData.firstName,
    last_name: formData.lastName,
    phone_number: formData.phoneNumber || null,
    national_id: formData.nationalId || null,
    username: formData.username,
    email: formData.gmail,
    password: formData.password || undefined,
    role: formData.role,
  });

  const handleAddAccount = async () => {
    const body = toApiUser();
    if (!body.password) {
      toast('Password is required', { variant: 'error' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        loadUsers();
        resetForm();
        setShowAddModal(false);
      } else {
        toast(data.error || 'Failed to create user', { variant: 'error' });
      }
    } catch {
      toast('Network error. Is the backend running?', { variant: 'error' });
    }
  };

  const handleUpdateAccount = async () => {
    const body = toApiUser();
    delete body.email;
    delete body.username;
    if (!body.password) delete body.password;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        loadUsers();
        resetForm();
        setEditingAccount(null);
        setShowAddModal(false);
      } else {
        toast(data.error || 'Failed to update user', { variant: 'error' });
      }
    } catch {
      toast('Network error. Is the backend running?', { variant: 'error' });
    }
  };

  const handleDeleteAccount = async (id) => {
    const ok = await confirm({
      title: 'Delete user?',
      message: 'Are you sure you want to delete this user? This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        loadUsers();
        toast('User deleted.', { variant: 'success' });
      } else toast(data.error || 'Failed to delete user', { variant: 'error' });
    } catch {
      toast('Network error. Is the backend running?', { variant: 'error' });
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      firstName: account.first_name || '',
      lastName: account.last_name || '',
      phoneNumber: account.phone_number || '',
      nationalId: account.national_id || '',
      username: account.username || '',
      gmail: account.email || '',
      password: '',
      role: account.role || 'user'
    });
    setShowAddModal(true);
  };

  const openUserHistory = (userId) => setUserHistoryUserId(userId);
  const closeUserHistory = () => setUserHistoryUserId(null);

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      nationalId: '',
      username: '',
      gmail: '',
      password: '',
      role: 'user'
    });
    setEditingAccount(null);
  };

  const paymentSummary = reservations.reduce(
    (acc, r) => {
      const amount = Number(r.total_amount) || 0;
      acc.totalRevenue += amount;
      acc.count += 1;
      const method = (r.payment_method || 'other').toLowerCase();
      acc.byMethod[method] = (acc.byMethod[method] || 0) + amount;
      return acc;
    },
    { totalRevenue: 0, count: 0, byMethod: {} }
  );

  return (
    <div className="dashboard">
      <Navbar />
      <header className="dashboard-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Welcome, {user?.firstName} {user?.lastName}</p>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="admin-tabs">
          <button
            type="button"
            className={`admin-tab ${activeSection === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveSection('analytics')}
          >
            Analytics &amp; Dashboard
          </button>
          <button
            type="button"
            className={`admin-tab ${activeSection === 'accounts' ? 'active' : ''}`}
            onClick={() => setActiveSection('accounts')}
          >
            Accounts
          </button>
          <button
            type="button"
            className={`admin-tab ${activeSection === 'slots' ? 'active' : ''}`}
            onClick={() => setActiveSection('slots')}
          >
            Manage Slots
          </button>
          <button
            type="button"
            className={`admin-tab ${activeSection === 'reservations' ? 'active' : ''}`}
            onClick={() => setActiveSection('reservations')}
          >
            Reservation History & Payments
          </button>
        </div>

        {activeSection === 'analytics' && (
          <div className="dashboard-section admin-analytics-wrap">
            <div className="admin-analytics-header">
              <h2>Analytics &amp; Dashboard</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadAnalytics} disabled={analyticsLoading}>
                {analyticsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <p className="parking-overview-hint admin-analytics-intro">
              Booking counts, peak demand hours (by scheduled start time), most-booked spots, and live lot usage.
            </p>

            {analyticsLoading && !analytics ? (
              <p className="empty-state">Loading analytics…</p>
            ) : analyticsError ? (
              <p className="empty-state slots-error">{analyticsError}</p>
            ) : analytics ? (
              <>
                <div className="stats-container admin-analytics-kpis">
                  <div className="stat-card">
                    <h3>Total bookings</h3>
                    <p className="stat-value">{analytics.totalBookings}</p>
                    <p className="admin-analytics-kpi-sub">All-time reservation records</p>
                  </div>
                  <div className="stat-card">
                    <h3>Last 7 days</h3>
                    <p className="stat-value">{analytics.bookingsLast7Days}</p>
                    <p className="admin-analytics-kpi-sub">New bookings created</p>
                  </div>
                  <div className="stat-card">
                    <h3>Last 30 days</h3>
                    <p className="stat-value">{analytics.bookingsLast30Days}</p>
                    <p className="admin-analytics-kpi-sub">New bookings created</p>
                  </div>
                  <div className="stat-card">
                    <h3>Avg. stay (completed)</h3>
                    <p className="stat-value">
                      {analytics.avgBookingDurationHours != null
                        ? `${analytics.avgBookingDurationHours} h`
                        : '—'}
                    </p>
                    <p className="admin-analytics-kpi-sub">Closed bookings only</p>
                  </div>
                  <div className="stat-card">
                    <h3>Revenue (closed)</h3>
                    <p className="stat-value">{formatEgp(analytics.totalRevenueClosed || 0)}</p>
                    <p className="admin-analytics-kpi-sub">Sum of recorded totals</p>
                  </div>
                </div>

                <div className="admin-analytics-two-col">
                  <div className="admin-analytics-panel">
                    <h3 className="admin-analytics-panel-title">Parking usage (live)</h3>
                    <div className="admin-usage-grid">
                      <div>
                        <span className="admin-usage-label">Total spots</span>
                        <strong className="admin-usage-num">{analytics.parkingSlots.total}</strong>
                      </div>
                      <div>
                        <span className="admin-usage-label">Occupied</span>
                        <strong className="admin-usage-num admin-usage-occupied">{analytics.parkingSlots.occupied}</strong>
                      </div>
                      <div>
                        <span className="admin-usage-label">Available</span>
                        <strong className="admin-usage-num admin-usage-available">{analytics.parkingSlots.available}</strong>
                      </div>
                      <div>
                        <span className="admin-usage-label">Reserved</span>
                        <strong className="admin-usage-num">{analytics.parkingSlots.reserved}</strong>
                      </div>
                      <div className="admin-usage-span">
                        <span className="admin-usage-label">Occupancy rate</span>
                        <strong className="admin-usage-num">{analytics.parkingSlots.utilizationPercent}%</strong>
                        <span className="admin-usage-hint">Share of spots currently occupied</span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-analytics-panel">
                    <h3 className="admin-analytics-panel-title">Bookings by status</h3>
                    <ul className="admin-status-list">
                      {Object.entries(analytics.bookingsByStatus || {}).length === 0 ? (
                        <li className="admin-status-empty">No data</li>
                      ) : (
                        Object.entries(analytics.bookingsByStatus)
                          .sort((a, b) => b[1] - a[1])
                          .map(([status, count]) => (
                            <li key={status}>
                              <span className={`status-badge status-${status}`}>{status}</span>
                              <span className="admin-status-count">{count}</span>
                            </li>
                          ))
                      )}
                    </ul>
                  </div>
                </div>

                <div className="admin-analytics-panel admin-analytics-panel--wide">
                  <h3 className="admin-analytics-panel-title">Peak hours</h3>
                  <p className="admin-analytics-panel-hint">
                    Bookings by hour of <strong>scheduled start</strong> (24h clock, server timezone).
                  </p>
                  {(() => {
                    const peak = analytics.peakHours || [];
                    const maxC = Math.max(1, ...peak.map((p) => p.count));
                    return (
                      <div className="peak-hours-chart">
                        {peak.map(({ hour, count }) => (
                          <div key={hour} className="peak-hour-row">
                            <span className="peak-hour-label">
                              {String(hour).padStart(2, '0')}:00
                            </span>
                            <div className="peak-hour-bar-wrap">
                              <div
                                className="peak-hour-bar"
                                style={{ width: `${(count / maxC) * 100}%` }}
                              />
                            </div>
                            <span className="peak-hour-count">{count}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {analytics.peakHourTop5 && analytics.peakHourTop5.length > 0 && (
                    <p className="admin-peak-top">
                      <strong>Busiest hours:</strong>{' '}
                      {analytics.peakHourTop5
                        .map((p) => `${String(p.hour).padStart(2, '0')}:00 (${p.count})`)
                        .join(' · ')}
                    </p>
                  )}
                </div>

                <div className="admin-analytics-panel">
                  <h3 className="admin-analytics-panel-title">Most used spots</h3>
                  <p className="admin-analytics-panel-hint">Ranked by number of bookings (all time).</p>
                  <div className="table-container admin-analytics-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Spot</th>
                          <th>Bookings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.mostUsedSpots || []).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="empty-state">No bookings yet</td>
                          </tr>
                        ) : (
                          analytics.mostUsedSpots.map((row, idx) => (
                            <tr key={row.slot_no}>
                              <td>{idx + 1}</td>
                              <td><strong>{row.slot_no}</strong></td>
                              <td>{row.booking_count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {activeSection === 'accounts' && (
          <>
            <div className="dashboard-actions">
              <button 
                onClick={() => {
                  resetForm();
                  setShowAddModal(true);
                }} 
                className="btn btn-primary"
              >
                + Add New Account
              </button>
            </div>

            {accountsLoading ? (
              <p className="empty-state">Loading users...</p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Email</th>
                      <th>Username</th>
                      <th>Phone</th>
                      <th>National ID</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>
                          No users found
                        </td>
                      </tr>
                    ) : (
                      accounts.map((account) => (
                        <tr key={account.id}>
                          <td>{account.first_name}</td>
                          <td>{account.last_name}</td>
                          <td>{account.email}</td>
                          <td>{account.username}</td>
                          <td>{account.phone_number || '—'}</td>
                          <td>{account.national_id || '—'}</td>
                          <td>
                            <span className={`role-badge role-${account.role}`}>
                              {account.role}
                            </span>
                          </td>
                          <td>{account.created_at ? new Date(account.created_at).toLocaleDateString() : '—'}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                onClick={() => openUserHistory(account.id)}
                                className="btn btn-sm btn-secondary"
                              >
                                View history
                              </button>
                              <button 
                                onClick={() => handleEdit(account)}
                                className="btn btn-sm btn-edit"
                              >
                                Update
                              </button>
                              <button 
                                onClick={() => handleDeleteAccount(account.id)}
                                className="btn btn-sm btn-delete"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeSection === 'slots' && (
          <div className="dashboard-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Parking Overview</h2>
              <button type="button" className="btn btn-primary" onClick={() => setShowAddSlotModal(true)}>
                + Add Slot
              </button>
            </div>
            {slotsLoading ? (
              <p className="empty-state">Loading slots...</p>
            ) : slots.length === 0 ? (
              <p className="empty-state">No slots found. Add one with the button above or check that the database has parking_slots.</p>
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
                <div className="slots-grid parking-overview-grid admin-slots-grid">
                  {slots.map((slot, idx) => (
                    <div key={slot.slot_no} className={`slot-card slot-card-visual slot-card-admin slot-state-${['available', 'occupied', 'reserved'][Number(slot.state)] || 'available'}`}>
                      <div className={`slot-car-icon ${Number(slot.state) === 0 ? 'slot-car-empty' : `slot-car-filled slot-car-${['blue', 'purple', 'teal', 'blue-light', 'indigo'][idx % 5]}`}`}>
                        <svg viewBox="0 0 24 24" className="slot-car-svg" fill="currentColor">
                          <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                        </svg>
                      </div>
                      <span className="slot-label">Slot {slot.slot_no}</span>
                      <select
                        className="slot-state-select"
                        value={slot.state}
                        onChange={(e) => updateSlotState(slot.slot_no, parseInt(e.target.value, 10))}
                      >
                        <option value={0}>Available</option>
                        <option value={1}>Occupied</option>
                        <option value={2}>Reserved</option>
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeSection === 'reservations' && (
          <div className="dashboard-section">
            <h2>Reservation History & Payment Details</h2>
            <div className="stats-container">
              <div className="stat-card">
                <h3>Total Reservations</h3>
                <p className="stat-value">{paymentSummary.count}</p>
              </div>
              <div className="stat-card">
                <h3>Total Revenue</h3>
                <p className="stat-value">{formatEgp(paymentSummary.totalRevenue)}</p>
              </div>
              {Object.entries(paymentSummary.byMethod).length > 0 && (
                <div className="stat-card">
                  <h3>By payment method</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: 14 }}>
                    {Object.entries(paymentSummary.byMethod).map(([method, amount]) => (
                      <li key={method}>{method}: {formatEgp(amount)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {reservationsLoading ? (
              <p className="empty-state">Loading reservations...</p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User</th>
                      <th>Slot</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Status</th>
                      <th>Payment method</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>No reservations yet</td>
                      </tr>
                    ) : (
                      reservations.map((r) => (
                        <tr key={r.id}>
                          <td>{r.id}</td>
                          <td>{r.first_name} {r.last_name} ({r.email})</td>
                          <td>{r.slot_no}</td>
                          <td>{new Date(r.start_time).toLocaleString()}</td>
                          <td>{new Date(r.end_time).toLocaleString()}</td>
                          <td>
                            <span className={`status-badge status-${r.status}`}>{r.status}</span>
                          </td>
                          <td>{r.payment_method || '—'}</td>
                          <td>{r.total_amount != null ? formatEgp(r.total_amount) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => {
          setShowAddModal(false);
          resetForm();
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingAccount ? 'Update Account' : 'Add New Account'}</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              editingAccount ? handleUpdateAccount() : handleAddAccount();
            }}>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="gmail"
                  value={formData.gmail}
                  onChange={handleInputChange}
                  required
                  readOnly={!!editingAccount}
                />
              </div>

              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  readOnly={!!editingAccount}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>National ID *</label>
                  <input
                    type="text"
                    name="nationalId"
                    value={formData.nationalId}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Role *</label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  required
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="gatekeeper">Gatekeeper</option>
                </select>
              </div>

              <div className="form-group">
                <label>Password {editingAccount ? '(leave blank to keep current)' : '*'}</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required={!editingAccount}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {editingAccount ? 'Update' : 'Add'} Account
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userHistoryUserId && (
        <div className="modal-overlay" onClick={closeUserHistory}>
          <div className="modal-content modal-content-wide" onClick={(e) => e.stopPropagation()}>
            <h2>User history</h2>
            {userHistoryLoading ? (
              <p className="empty-state">Loading...</p>
            ) : userHistoryData && userHistoryData.user ? (
              <>
                <div className="user-history-info">
                  <p><strong>{userHistoryData.user.first_name} {userHistoryData.user.last_name}</strong></p>
                  <p>Email: {userHistoryData.user.email}</p>
                  <p>Username: {userHistoryData.user.username}</p>
                  <p>Phone: {userHistoryData.user.phone_number || '—'}</p>
                  <p>Role: <span className={`role-badge role-${userHistoryData.user.role}`}>{userHistoryData.user.role}</span></p>
                </div>
                {userHistoryData.paymentSummary && (
                  <div className="stats-container" style={{ marginBottom: 20 }}>
                    <div className="stat-card">
                      <h3>Reservations</h3>
                      <p className="stat-value">{userHistoryData.paymentSummary.reservationCount}</p>
                    </div>
                    <div className="stat-card">
                      <h3>Total spent</h3>
                      <p className="stat-value">{formatEgp(userHistoryData.paymentSummary.totalSpent)}</p>
                    </div>
                    {Object.keys(userHistoryData.paymentSummary.byMethod || {}).length > 0 && (
                      <div className="stat-card">
                        <h3>By payment method</h3>
                        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: 14 }}>
                          {Object.entries(userHistoryData.paymentSummary.byMethod).map(([method, amount]) => (
                            <li key={method}>{method}: {formatEgp(amount)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <h3 style={{ marginTop: 20, marginBottom: 12 }}>Reservation history</h3>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Slot</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!userHistoryData.reservations || userHistoryData.reservations.length === 0) ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '16px' }}>No reservations</td>
                        </tr>
                      ) : (
                        userHistoryData.reservations.map((r) => (
                          <tr key={r.id}>
                            <td>{r.id}</td>
                            <td>{r.slot_no}</td>
                            <td>{new Date(r.start_time).toLocaleString()}</td>
                            <td>{new Date(r.end_time).toLocaleString()}</td>
                            <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                            <td>{r.payment_method || '—'}</td>
                            <td>{r.total_amount != null ? formatEgp(r.total_amount) : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="modal-actions" style={{ marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={closeUserHistory}>Close</button>
                </div>
              </>
            ) : (
              <p className="empty-state">Failed to load user history.</p>
            )}
          </div>
        </div>
      )}

      {showAddSlotModal && (
        <div className="modal-overlay" onClick={() => { setShowAddSlotModal(false); setNewSlotNo(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Slot</h2>
            <form onSubmit={handleAddSlot}>
              <div className="form-group">
                <label>Slot number / name *</label>
                <input
                  type="text"
                  value={newSlotNo}
                  onChange={(e) => setNewSlotNo(e.target.value)}
                  placeholder="e.g. A-106 or B-301"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Add Slot</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddSlotModal(false); setNewSlotNo(''); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
