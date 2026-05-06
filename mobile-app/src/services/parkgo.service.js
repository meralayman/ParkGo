import { api } from './apiClient';

export async function getSlots() {
  const res = await api.get('/slots');
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load slots');
  return res.data.slots || [];
}

export async function getUserReservations(userId) {
  const res = await api.get(`/reservations/user/${encodeURIComponent(userId)}`);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load reservations');
  return res.data.reservations || [];
}

export async function createReservation(payload) {
  const res = await api.post('/reservations', payload);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to create reservation');
  return res.data;
}

export async function cancelReservation(id) {
  const res = await api.patch(`/reservations/${encodeURIComponent(id)}/cancel`);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to cancel reservation');
  return res.data;
}

export async function overstayExtend(id, userId) {
  const res = await api.post(`/reservations/${encodeURIComponent(id)}/overstay-extend`, { userId });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to extend reservation');
  return res.data;
}

export async function predictDemand({ hour, day_type }) {
  const res = await api.post('/api/predict-demand', { hour, day_type });
  if (!res?.data) return null;
  const level = res.data.final_demand_level;
  if (typeof level !== 'string') return null;
  return {
    level,
    reason: typeof res.data.reason === 'string' ? res.data.reason : '',
    raw_ml_cars_count: res.data.raw_ml_cars_count,
    adjusted_cars_count: res.data.adjusted_cars_count,
  };
}

export async function getForecast(params) {
  const res = await api.get('/api/forecast', { params: params || undefined });
  return res?.data || null;
}

export async function gatePreviewQr(qr) {
  const res = await api.post('/gate/qr/preview', { qr });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Invalid QR');
  return res.data;
}

export async function gateCheckIn(bookingId) {
  const res = await api.post('/gate/check-in', { bookingId });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Check-in failed');
  return res.data;
}

export async function gateCheckOut(bookingId) {
  const res = await api.post('/gate/check-out', { bookingId });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Check-out failed');
  return res.data;
}

export async function adminAnalytics() {
  const res = await api.get('/admin/analytics');
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load analytics');
  return res.data.analytics;
}

export async function adminLogs(params) {
  const res = await api.get('/admin/logs', { params: params || undefined });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load logs');
  return res.data.logs || [];
}

export async function adminUsers() {
  const res = await api.get('/admin/users');
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load users');
  return res.data.users || [];
}

export async function adminCreateUser(body) {
  const res = await api.post('/admin/users', body);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to create user');
  return res.data.user;
}

export async function adminUpdateUser(userId, body) {
  const res = await api.patch(`/admin/users/${encodeURIComponent(userId)}`, body);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to update user');
  return res.data.user;
}

export async function adminDeleteUser(userId) {
  const res = await api.delete(`/admin/users/${encodeURIComponent(userId)}`);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to delete user');
}

export async function adminUserHistory(userId) {
  const res = await api.get(`/admin/users/${encodeURIComponent(userId)}/history`);
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load history');
  return res.data;
}

export async function adminReservations() {
  const res = await api.get('/admin/reservations');
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load reservations');
  return res.data.reservations || [];
}

export async function adminIncidents() {
  const res = await api.get('/admin/incidents');
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to load incidents');
  return res.data.incidents || [];
}

export async function adminCreateSlot(slotNo) {
  const res = await api.post('/admin/slots', { slot_no: slotNo });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to add slot');
  return res.data.slot;
}

export async function adminUpdateSlotState(slotNo, state) {
  const res = await api.patch(`/admin/slots/${encodeURIComponent(slotNo)}`, { state });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Failed to update slot');
  return res.data.slot;
}

/** Security alerts polled like the web dashboard (expects admin `userId` query). */
export async function adminSecurityAlerts({ userId, afterId = 0 }) {
  const res = await api.get('/admin/security-alerts', {
    params: { userId, afterId },
  });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Alerts unavailable');
  return res.data.alerts || [];
}

