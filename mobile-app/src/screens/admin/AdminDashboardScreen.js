import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { formatEgp } from '../../utils/formatEgp';
import { getApiBaseUrl } from '../../utils/config';
import { LandingBackground } from '../../components/LandingBackground';
import { useAuth } from '../../store/AuthContext';
import {
  adminAnalytics,
  adminCreateSlot,
  adminCreateUser,
  adminDeleteUser,
  adminIncidents,
  adminLogs,
  adminReservations,
  adminSecurityAlerts,
  adminUpdateSlotState,
  adminUpdateUser,
  adminUserHistory,
  adminUsers,
  getSlots,
} from '../../services/parkgo.service';

const SECTIONS = [
  { key: 'analytics', label: 'Analytics' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'slots', label: 'Slots' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'security-logs', label: 'Security logs' },
];

const STORAGE_ALERT_INIT = 'parkgo_security_alerts_inited';
const STORAGE_ALERT_MAX = 'parkgo_security_alert_max_id';

function errMsg(e) {
  const d = e?.response?.data;
  if (d && typeof d.error === 'string') return d.error;
  if (d && typeof d.message === 'string') return d.message;
  return e?.message || 'Something went wrong';
}

function formatTs(value) {
  if (value == null) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function slotLabel(state) {
  const n = Number(state);
  if (n === 1) return 'Occupied';
  if (n === 2) return 'Reserved';
  return 'Available';
}

const inputStyle = {
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: Colors.text,
  backgroundColor: Colors.elevated,
};

export function AdminDashboardScreen() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('analytics');
  const [refreshing, setRefreshing] = useState(false);

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [reservations, setReservations] = useState([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);

  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);

  const [securityLogs, setSecurityLogs] = useState([]);
  const [securityLogsLoading, setSecurityLogsLoading] = useState(false);
  const [securityLogsError, setSecurityLogsError] = useState('');
  const [filterLogUserId, setFilterLogUserId] = useState('');
  const [filterLogAction, setFilterLogAction] = useState('');
  const filterLogUserIdRef = useRef(filterLogUserId);
  const filterLogActionRef = useRef(filterLogAction);

  useEffect(() => {
    filterLogUserIdRef.current = filterLogUserId;
  }, [filterLogUserId]);
  useEffect(() => {
    filterLogActionRef.current = filterLogAction;
  }, [filterLogAction]);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [newSlotNo, setNewSlotNo] = useState('');
  const [slotSaving, setSlotSaving] = useState(false);

  const [historyUserId, setHistoryUserId] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    nationalId: '',
    username: '',
    gmail: '',
    password: '',
    role: 'user',
  });

  const loadAnalytics = useCallback(async () => {
    setAnalyticsError('');
    setAnalyticsLoading(true);
    try {
      const a = await adminAnalytics();
      setAnalytics(a);
    } catch (e) {
      setAnalytics(null);
      setAnalyticsError(errMsg(e));
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const u = await adminUsers();
      setAccounts(Array.isArray(u) ? u : []);
    } catch {
      setAccounts([]);
      Alert.alert('Error', 'Failed to load accounts.');
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const s = await getSlots();
      setSlots(Array.isArray(s) ? s : []);
    } catch {
      setSlots([]);
      Alert.alert('Error', 'Failed to load slots.');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const loadReservations = useCallback(async () => {
    setReservationsLoading(true);
    try {
      const r = await adminReservations();
      setReservations(Array.isArray(r) ? r : []);
    } catch {
      setReservations([]);
      Alert.alert('Error', 'Failed to load reservations.');
    } finally {
      setReservationsLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    try {
      const i = await adminIncidents();
      setIncidents(Array.isArray(i) ? i : []);
    } catch {
      setIncidents([]);
      Alert.alert('Error', 'Failed to load incidents.');
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  const loadSecurityLogs = useCallback(async () => {
    setSecurityLogsError('');
    setSecurityLogsLoading(true);
    try {
      const uid = String(filterLogUserIdRef.current || '').trim();
      const act = String(filterLogActionRef.current || '').trim();
      const params = {};
      if (uid) params.user_id = uid;
      if (act) params.action = act;
      const logs = await adminLogs(params);
      setSecurityLogs(logs);
    } catch (e) {
      setSecurityLogs([]);
      setSecurityLogsError(errMsg(e));
    } finally {
      setSecurityLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'analytics') loadAnalytics();
    else if (activeSection === 'accounts') loadAccounts();
    else if (activeSection === 'slots') loadSlots();
    else if (activeSection === 'reservations') loadReservations();
    else if (activeSection === 'incidents') loadIncidents();
    else if (activeSection === 'security-logs') loadSecurityLogs();
  }, [
    activeSection,
    loadAnalytics,
    loadAccounts,
    loadSlots,
    loadReservations,
    loadIncidents,
    loadSecurityLogs,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function pollSecurity() {
      if (!user?.id || user?.role !== 'admin') return;
      try {
        const rawAfter = await AsyncStorage.getItem(STORAGE_ALERT_MAX);
        const afterId = Math.max(0, parseInt(rawAfter || '0', 10) || 0);
        const alerts = await adminSecurityAlerts({ userId: user.id, afterId });
        if (cancelled || !Array.isArray(alerts) || alerts.length === 0) return;
        const max = Math.max(...alerts.map((a) => a.id));
        const inited = await AsyncStorage.getItem(STORAGE_ALERT_INIT);
        if (!inited) {
          await AsyncStorage.setItem(STORAGE_ALERT_INIT, '1');
          await AsyncStorage.setItem(STORAGE_ALERT_MAX, String(max));
          return;
        }
        await AsyncStorage.setItem(STORAGE_ALERT_MAX, String(max));
        if (alerts.length === 1) {
          Alert.alert('Security', alerts[0].message || 'New alert');
        } else {
          const latest = alerts[alerts.length - 1];
          Alert.alert('Security', `${alerts.length} new alert(s). Latest: ${latest?.message || ''}`);
        }
      } catch {
        /* non-fatal */
      }
    }
    pollSecurity();
    const t = setInterval(pollSecurity, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!historyUserId) {
      setHistoryData(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryData(null);
    adminUserHistory(historyUserId)
      .then((d) => {
        if (!cancelled) setHistoryData(d);
      })
      .catch(() => {
        if (!cancelled) setHistoryData(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeSection === 'analytics') await loadAnalytics();
      else if (activeSection === 'accounts') await loadAccounts();
      else if (activeSection === 'slots') await loadSlots();
      else if (activeSection === 'reservations') await loadReservations();
      else if (activeSection === 'incidents') await loadIncidents();
      else if (activeSection === 'security-logs') await loadSecurityLogs();
    } finally {
      setRefreshing(false);
    }
  }, [
    activeSection,
    loadAnalytics,
    loadAccounts,
    loadSlots,
    loadReservations,
    loadIncidents,
    loadSecurityLogs,
  ]);

  const paymentSummaryAll = useMemo(() => {
    return reservations.reduce(
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
  }, [reservations]);

  const incidentPhotoSrc = (filename) => {
    if (!filename) return null;
    const base = getApiBaseUrl();
    return `${base}/uploads/incidents/${encodeURIComponent(filename)}`;
  };

  const resetAccountForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      nationalId: '',
      username: '',
      gmail: '',
      password: '',
      role: 'user',
    });
    setEditingAccount(null);
  };

  const openAddAccount = () => {
    resetAccountForm();
    setAccountModalOpen(true);
  };

  const openEditAccount = (account) => {
    setEditingAccount(account);
    setFormData({
      firstName: account.first_name || '',
      lastName: account.last_name || '',
      phoneNumber: account.phone_number || '',
      nationalId: account.national_id || '',
      username: account.username || '',
      gmail: account.email || '',
      password: '',
      role: account.role || 'user',
    });
    setAccountModalOpen(true);
  };

  const toApiUserCreate = () => ({
    first_name: formData.firstName.trim(),
    last_name: formData.lastName.trim(),
    phone_number: formData.phoneNumber.trim() || null,
    national_id: formData.nationalId.trim() || null,
    username: formData.username.trim(),
    email: formData.gmail.trim(),
    password: formData.password,
    role: formData.role,
  });

  const saveAccount = async () => {
    setFormSaving(true);
    try {
      if (!editingAccount) {
        if (!formData.password.trim()) {
          Alert.alert('Validation', 'Password is required for new accounts.');
          return;
        }
        await adminCreateUser(toApiUserCreate());
        await loadAccounts();
        resetAccountForm();
        setAccountModalOpen(false);
        Alert.alert('Done', 'Account created.');
        return;
      }
      const body = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        phone_number: formData.phoneNumber.trim() || null,
        national_id: formData.nationalId.trim() || null,
        role: formData.role,
      };
      if (formData.password.trim()) body.password = formData.password;
      await adminUpdateUser(editingAccount.id, body);
      await loadAccounts();
      resetAccountForm();
      setAccountModalOpen(false);
      Alert.alert('Done', 'Account updated.');
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    } finally {
      setFormSaving(false);
    }
  };

  const confirmDeleteUser = (id, name) => {
    Alert.alert('Delete user?', `Remove ${name || 'this user'}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteUser(id);
            await loadAccounts();
            Alert.alert('Done', 'User deleted.');
          } catch (e) {
            Alert.alert('Error', errMsg(e));
          }
        },
      },
    ]);
  };

  const addSlot = async () => {
    const name = newSlotNo.trim();
    if (!name) {
      Alert.alert('Validation', 'Enter a slot name or number.');
      return;
    }
    setSlotSaving(true);
    try {
      await adminCreateSlot(name);
      setNewSlotNo('');
      setSlotModalOpen(false);
      await loadSlots();
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    } finally {
      setSlotSaving(false);
    }
  };

  const changeSlotState = async (slotNo, state) => {
    try {
      await adminUpdateSlotState(slotNo, state);
      await loadSlots();
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    }
  };

  const openHistory = (userId) => {
    setHistoryUserId(userId);
    setHistoryModalOpen(true);
  };

  const closeHistory = () => {
    setHistoryModalOpen(false);
    setHistoryUserId(null);
    setHistoryData(null);
  };

  const roleOptionsCreate = ['user', 'gatekeeper'];
  const roleOptionsEdit = ['user', 'gatekeeper', 'admin'];

  return (
    <LandingBackground>
      <Screen
        transparent
        contentContainerStyle={{ gap: 12, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.logoBlueLight} />
        }
      >
        <Card style={{ paddingVertical: 14 }}>
          <Text style={{ color: Colors.logoBlueLight, fontWeight: '800', fontSize: 12 }}>Admin</Text>
          <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 }}>Admin dashboard</Text>
          <Text style={{ color: Colors.muted, marginTop: 6 }}>
            Welcome, {user?.first_name || ''} {user?.last_name || ''}
            {user?.username ? ` (@${user.username})` : ''}
          </Text>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {SECTIONS.map((s) => {
            const active = activeSection === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setActiveSection(s.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: active ? Colors.logoBlue : Colors.card,
                  borderWidth: 1,
                  borderColor: active ? Colors.logoBlue : Colors.border,
                }}
              >
                <Text style={{ color: active ? '#fff' : Colors.text, fontWeight: '800', fontSize: 13 }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeSection === 'analytics' && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Analytics</Text>
              <Pressable onPress={loadAnalytics} disabled={analyticsLoading}>
                <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>
                  {analyticsLoading ? 'Refreshing…' : 'Refresh'}
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: Colors.muted, marginTop: 6, fontSize: 13 }}>
              Booking counts, peak hours, popular spots, and lot usage.
            </Text>
            <Banner tone="danger" text={analyticsError} />
            {analyticsLoading && !analytics ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : analytics ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                  {[
                    { t: 'Total bookings', v: String(analytics.totalBookings) },
                    { t: 'Last 7 days', v: String(analytics.bookingsLast7Days) },
                    { t: 'Last 30 days', v: String(analytics.bookingsLast30Days) },
                    {
                      t: 'Avg stay (closed)',
                      v: analytics.avgBookingDurationHours != null ? `${analytics.avgBookingDurationHours} h` : '—',
                    },
                    { t: 'Revenue (closed)', v: formatEgp(analytics.totalRevenueClosed || 0) },
                  ].map((k) => (
                    <View
                      key={k.t}
                      style={{
                        flexGrow: 1,
                        minWidth: '45%',
                        backgroundColor: Colors.elevated,
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: Colors.border,
                      }}
                    >
                      <Text style={{ color: Colors.muted, fontSize: 12 }}>{k.t}</Text>
                      <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 18, marginTop: 4 }}>{k.v}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ color: Colors.text, fontWeight: '900', marginTop: 16 }}>Parking usage</Text>
                <Text style={{ color: Colors.muted }}>
                  Total {analytics.parkingSlots?.total} · Occupied {analytics.parkingSlots?.occupied} · Reserved{' '}
                  {analytics.parkingSlots?.reserved} · Available {analytics.parkingSlots?.available}
                </Text>
                <Text style={{ color: Colors.muted }}>Utilization {analytics.parkingSlots?.utilizationPercent}%</Text>

                <Text style={{ color: Colors.text, fontWeight: '900', marginTop: 16 }}>Bookings by status</Text>
                {Object.entries(analytics.bookingsByStatus || {}).map(([st, c]) => (
                  <Text key={st} style={{ color: Colors.muted }}>
                    {st}: <Text style={{ color: Colors.text, fontWeight: '700' }}>{c}</Text>
                  </Text>
                ))}

                <Text style={{ color: Colors.text, fontWeight: '900', marginTop: 16 }}>Peak hours (top 5)</Text>
                {(analytics.peakHourTop5 || []).map((row) => (
                  <Text key={row.hour} style={{ color: Colors.muted }}>
                    {String(row.hour).padStart(2, '0')}:00 — <Text style={{ color: Colors.text }}>{row.count}</Text>
                  </Text>
                ))}

                <Text style={{ color: Colors.text, fontWeight: '900', marginTop: 16 }}>Most booked spots</Text>
                {(analytics.mostUsedSpots || []).slice(0, 10).map((row) => (
                  <Text key={row.slot_no} style={{ color: Colors.muted }}>
                    Spot {row.slot_no}:{' '}
                    <Text style={{ color: Colors.text, fontWeight: '700' }}>{row.booking_count}</Text>
                  </Text>
                ))}
              </>
            ) : (
              <Text style={{ color: Colors.muted }}>No analytics yet.</Text>
            )}
          </Card>
        )}

        {activeSection === 'accounts' && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Accounts</Text>
              <Pressable onPress={openAddAccount}>
                <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Add account</Text>
              </Pressable>
            </View>
            {accountsLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : accounts.length === 0 ? (
              <Text style={{ color: Colors.muted, marginTop: 8 }}>No users loaded.</Text>
            ) : (
              accounts.map((acc) => (
                <View
                  key={acc.id}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    backgroundColor: Colors.elevated,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.text, fontWeight: '900' }}>
                    {acc.first_name} {acc.last_name}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>
                    @{acc.username} · {acc.email}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>
                    Role: <Text style={{ color: Colors.text }}>{acc.role}</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => openEditAccount(acc)} style={{ paddingVertical: 6 }}>
                      <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => openHistory(acc.id)} style={{ paddingVertical: 6 }}>
                      <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>History</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteUser(acc.id, `${acc.first_name} ${acc.last_name}`)}
                      style={{ paddingVertical: 6 }}
                    >
                      <Text style={{ color: Colors.danger, fontWeight: '800' }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </Card>
        )}

        {activeSection === 'slots' && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Manage slots</Text>
              <Pressable onPress={() => setSlotModalOpen(true)}>
                <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Add slot</Text>
              </Pressable>
            </View>
            {slotsLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                {slots.map((s) => (
                  <View
                    key={s.slot_no}
                    style={{
                      width: '47%',
                      minWidth: 140,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: Colors.elevated,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: Colors.text, fontWeight: '900' }}>{s.slot_no}</Text>
                    <Text style={{ color: Colors.muted, fontSize: 12 }}>{slotLabel(s.state)}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        [0, 'Free'],
                        [1, 'Occ'],
                        [2, 'Res'],
                      ].map(([st, lbl]) => (
                        <Pressable
                          key={st}
                          onPress={() => changeSlotState(s.slot_no, st)}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              Number(s.state) === st ? Colors.logoBlue : Colors.bg,
                          }}
                        >
                          <Text
                            style={{
                              color: Number(s.state) === st ? '#fff' : Colors.muted,
                              fontSize: 11,
                              fontWeight: '800',
                            }}
                          >
                            {lbl}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {activeSection === 'reservations' && (
          <Card>
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Reservations & payments</Text>
            <Text style={{ color: Colors.muted, marginTop: 8 }}>
              {paymentSummaryAll.count} record(s) · Total {formatEgp(paymentSummaryAll.totalRevenue)}
            </Text>
            {Object.keys(paymentSummaryAll.byMethod).length > 0 && (
              <Text style={{ color: Colors.muted, marginTop: 4 }}>
                By method:{' '}
                {Object.entries(paymentSummaryAll.byMethod)
                  .map(([m, amt]) => `${m} ${formatEgp(amt)}`)
                  .join(' · ')}
              </Text>
            )}
            {reservationsLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : reservations.length === 0 ? (
              <Text style={{ color: Colors.muted, marginTop: 12 }}>No reservations.</Text>
            ) : (
              reservations.slice(0, 80).map((r) => (
                <View
                  key={r.id}
                  style={{
                    marginTop: 10,
                    padding: 12,
                    backgroundColor: Colors.elevated,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.text, fontWeight: '800' }}>
                    {r.slot_no} · {r.status}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    {(r.first_name || '') + ' ' + (r.last_name || '')} · {r.email || ''}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    {formatTs(r.start_time)} → {formatTs(r.end_time)}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    Pay: {(r.payment_method || '—') + ' · '}
                    <Text style={{ color: Colors.text }}>{formatEgp(r.total_amount)}</Text>
                  </Text>
                </View>
              ))
            )}
          </Card>
        )}

        {activeSection === 'incidents' && (
          <Card>
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Incident reports</Text>
            {incidentsLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : incidents.length === 0 ? (
              <Text style={{ color: Colors.muted, marginTop: 8 }}>No incidents.</Text>
            ) : (
              incidents.map((ir) => {
                const uri = incidentPhotoSrc(ir.photo_filename);
                return (
                  <View
                    key={ir.id}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: Colors.elevated,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <Text style={{ color: Colors.text, fontWeight: '900' }}>
                      {ir.reporter_type === 'gatekeeper' ? 'Gatekeeper' : 'User'} · {formatTs(ir.created_at)}
                    </Text>
                    <Text style={{ color: Colors.muted }}>{ir.full_name}</Text>
                    <Text style={{ color: Colors.muted }}>{ir.description}</Text>
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={{ marginTop: 10, width: '100%', height: 180, borderRadius: 12 }}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </Card>
        )}

        {activeSection === 'security-logs' && (
          <Card>
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Security logs</Text>
            <TextInput
              style={[inputStyle, { marginTop: 8 }]}
              placeholder="Filter by user UUID"
              placeholderTextColor={Colors.muted}
              value={filterLogUserId}
              onChangeText={setFilterLogUserId}
              autoCapitalize="none"
            />
            <TextInput
              style={[inputStyle, { marginTop: 8 }]}
              placeholder="Filter action (contains)"
              placeholderTextColor={Colors.muted}
              value={filterLogAction}
              onChangeText={setFilterLogAction}
            />
            <View style={{ marginTop: 10 }}>
              <Button title="Apply filters" onPress={loadSecurityLogs} tone="secondary" />
            </View>
            <Banner tone="danger" text={securityLogsError} />
            {securityLogsLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={Colors.logoBlueLight} />
            ) : securityLogs.length === 0 ? (
              <Text style={{ color: Colors.muted, marginTop: 8 }}>No log rows.</Text>
            ) : (
              securityLogs.map((log) => (
                <View
                  key={log.id}
                  style={{
                    marginTop: 10,
                    padding: 10,
                    backgroundColor: Colors.elevated,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    {formatTs(log.timestamp || log.log_ts)}
                  </Text>
                  <Text style={{ color: Colors.text }}>{log.action}</Text>
                  <Text style={{ color: Colors.muted, fontSize: 12 }} selectable>
                    user {log.user_id || '—'} · ip {log.ip_address || '—'}
                  </Text>
                </View>
              ))
            )}
          </Card>
        )}
      </Screen>

      <Modal visible={accountModalOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.bg, padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' }}>
            <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 18 }}>
              {editingAccount ? 'Edit account' : 'Add account'}
            </Text>
            <ScrollView style={{ marginTop: 14 }} keyboardShouldPersistTaps="handled">
              {['firstName', 'lastName', 'phoneNumber', 'nationalId', 'username', 'gmail'].map((field) => {
                const labels = {
                  firstName: 'First name',
                  lastName: 'Last name',
                  phoneNumber: 'Phone',
                  nationalId: 'National ID',
                  username: 'Username',
                  gmail: 'Email',
                };
                const disabledEditEmail = !!editingAccount && (field === 'username' || field === 'gmail');
                return (
                  <View key={field} style={{ marginBottom: 10 }}>
                    <Text style={{ color: Colors.muted, marginBottom: 4 }}>{labels[field]}</Text>
                    <TextInput
                      style={inputStyle}
                      value={formData[field]}
                      onChangeText={(t) => setFormData({ ...formData, [field]: t })}
                      placeholderTextColor={Colors.muted}
                      autoCapitalize={field === 'gmail' || field === 'username' ? 'none' : 'words'}
                      editable={!disabledEditEmail}
                    />
                  </View>
                );
              })}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: Colors.muted, marginBottom: 4 }}>
                  Password {editingAccount ? '(leave blank to keep)' : ''}
                </Text>
                <TextInput
                  style={inputStyle}
                  value={formData.password}
                  onChangeText={(t) => setFormData({ ...formData, password: t })}
                  placeholderTextColor={Colors.muted}
                  secureTextEntry
                />
              </View>
              <Text style={{ color: Colors.muted, marginBottom: 6 }}>Role</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {(editingAccount ? roleOptionsEdit : roleOptionsCreate).map((r) => {
                  const sel = formData.role === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setFormData({ ...formData, role: r })}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: sel ? Colors.logoBlue : Colors.elevated,
                        borderWidth: 1,
                        borderColor: sel ? Colors.logoBlue : Colors.border,
                      }}
                    >
                      <Text style={{ color: sel ? '#fff' : Colors.text, fontWeight: '800', textTransform: 'capitalize' }}>
                        {r}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    resetAccountForm();
                    setAccountModalOpen(false);
                  }}
                  tone="secondary"
                  disabled={formSaving}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Save" onPress={saveAccount} loading={formSaving} disabled={formSaving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={slotModalOpen} animationType="fade" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.card, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 18 }}>Add parking slot</Text>
            <TextInput
              style={[inputStyle, { marginTop: 14 }]}
              value={newSlotNo}
              onChangeText={setNewSlotNo}
              placeholder="Slot name / number"
              placeholderTextColor={Colors.muted}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" onPress={() => setSlotModalOpen(false)} tone="secondary" disabled={slotSaving} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Add" onPress={addSlot} loading={slotSaving} disabled={slotSaving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={historyModalOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.bg, padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' }}>
            <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 18 }}>Booking history</Text>
            <Pressable onPress={closeHistory} style={{ position: 'absolute', right: 18, top: 18 }}>
              <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Close</Text>
            </Pressable>
            {historyLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={Colors.logoBlueLight} />
            ) : historyData?.user ? (
              <ScrollView style={{ marginTop: 44 }}>
                <Text style={{ color: Colors.text }}>
                  {historyData.user.first_name} {historyData.user.last_name}
                </Text>
                <Text style={{ color: Colors.muted }}>{historyData.user.email}</Text>
                <Text style={{ color: Colors.muted, marginTop: 10 }}>
                  Spent: {formatEgp(historyData.paymentSummary?.totalSpent)}{' '}
                  · Bookings {historyData.paymentSummary?.reservationCount}
                </Text>
                {(historyData.reservations || []).map((r) => (
                  <View
                    key={r.id}
                    style={{
                      marginTop: 10,
                      padding: 12,
                      backgroundColor: Colors.elevated,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <Text style={{ color: Colors.text, fontWeight: '800' }}>
                      {r.slot_no} · {r.status}
                    </Text>
                    <Text style={{ color: Colors.muted, fontSize: 12 }}>{formatTs(r.start_time)}</Text>
                    <Text style={{ color: Colors.muted, fontSize: 12 }}>
                      {formatEgp(r.total_amount)} · {r.payment_method || '—'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: Colors.muted, marginTop: 40 }}>Unable to load history.</Text>
            )}
          </View>
        </View>
      </Modal>
    </LandingBackground>
  );
}
