import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors, statusColor } from '../../utils/colors';
import { LandingBackground } from '../../components/LandingBackground';
import { useAuth } from '../../store/AuthContext';
import { getForecast, getSlots, getUserReservations } from '../../services/parkgo.service';

function parkingLevelFromSlots(slots) {
  const total = slots.length || 0;
  if (!total) return { level: 'unknown', available: 0, total: 0, reserved: 0, occupied: 0 };
  const available = slots.filter((s) => Number(s.state) === 0).length;
  const reserved = slots.filter((s) => Number(s.state) === 2).length;
  const occupied = Math.max(0, total - available - reserved);
  const ratio = available / total;
  if (ratio >= 0.6) return { level: 'low', available, total, reserved, occupied };
  if (ratio >= 0.3) return { level: 'medium', available, total, reserved, occupied };
  return { level: 'high', available, total, reserved, occupied };
}

function guidanceMessage(level) {
  if (level === 'low') return 'Plenty of free slots. Head to Booking to reserve one.';
  if (level === 'medium') return 'Moderate availability. Reserve your slot soon.';
  if (level === 'high') return 'Few spots left. Book from the Booking tab.';
  return 'Loading availability…';
}

function formatTs(value) {
  if (value == null) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function forecastSnippet(forecast) {
  if (!forecast || typeof forecast !== 'object') return null;
  if (forecast.error && typeof forecast.error === 'string') return forecast.error;
  if (Array.isArray(forecast.hours)) {
    return `${forecast.hours.length} hourly point(s). Start Flask demand service for full charts.`;
  }
  const keys = Object.keys(forecast).slice(0, 4).join(', ');
  return keys ? `Live data (${keys}…)` : 'Forecast linked.';
}

export function UserDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 560;
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [slots, setSlots] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [activeBookings, setActiveBookings] = useState([]);

  const level = useMemo(() => parkingLevelFromSlots(slots), [slots]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    const problems = [];

    try {
      const s = await getSlots();
      setSlots(Array.isArray(s) ? s : []);
    } catch (e) {
      setSlots([]);
      problems.push(e?.message || 'Could not load the parking map.');
    }

    try {
      const f = await getForecast();
      setForecast(f && typeof f === 'object' ? f : null);
    } catch (e) {
      const msg =
        e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Forecast service unavailable.';
      setForecast({ error: msg });
    }

    try {
      const raw = await getUserReservations(user.id);
      const list = Array.isArray(raw) ? raw : [];
      const active = list.filter((x) => ['confirmed', 'checked_in'].includes(String(x.status || '').trim()));
      setActiveBookings(active);
    } catch (e) {
      setActiveBookings([]);
      problems.push(e?.message || 'Could not load your reservations.');
    }

    setError(problems.length ? problems.join('\n') : '');
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const goBooking = () => navigation.navigate('Book');
  /** Optional: open Booking with a preset slot picked from summaries / future UX. */
  const goBookingWithSlot = (slotNo) =>
    navigation.navigate('Book', { presetSlot: String(slotNo).trim() });

  return (
    <LandingBackground>
      <Screen
        transparent
        contentContainerStyle={{ gap: 16, paddingTop: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.logoBlueLight} />}
      >
        <Card style={{ paddingVertical: 14 }}>
          <Text style={{ color: Colors.logoBlueLight, fontWeight: '800', fontSize: 12 }}>ParkGo</Text>
          <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 }}>
            Hi, {user?.first_name || user?.username || 'there'}
          </Text>
          <Text style={{ color: Colors.muted, marginTop: 6 }}>
            Book a parking slot on the Booking tab, then open My QR when you arrive.
          </Text>
        </Card>

        <Banner tone="danger" text={error} />

        <Card>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Quick actions</Text>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title="Book parking" onPress={goBooking} tone="warning" />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="My QR" onPress={() => navigation.navigate('QR')} tone="secondary" />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Booking history" onPress={() => navigation.navigate('History')} tone="secondary" />
            </View>
          </View>
        </Card>

        <Card>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Lot overview</Text>
          {loading && slots.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 14 }} color={Colors.logoBlueLight} />
          ) : (
            <>
              <Text style={{ color: statusColor(level.level), fontSize: 26, fontWeight: '900', marginTop: 8 }}>
                {String(level.level).toUpperCase()}
              </Text>
              <Text style={{ color: Colors.muted, marginTop: 4 }}>
                Available:{' '}
                <Text style={{ color: Colors.text, fontWeight: '800' }}>{level.available}</Text> /{' '}
                <Text style={{ color: Colors.text, fontWeight: '800' }}>{level.total}</Text>
                {' · '}
                Reserved: <Text style={{ color: Colors.text, fontWeight: '800' }}>{level.reserved}</Text>
                {' · '}
                Occupied: <Text style={{ color: Colors.text, fontWeight: '800' }}>{level.occupied}</Text>
              </Text>
              <Text style={{ color: Colors.text, fontWeight: '600', marginTop: 8 }}>{guidanceMessage(level.level)}</Text>
            </>
          )}
        </Card>

        <Card>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Demand forecast</Text>
          {!forecast ? (
            <Text style={{ color: Colors.muted, marginTop: 8 }}>
              Forecast not available yet. Ensure the Flask demand service is running if you use forecasts on the backend.
            </Text>
          ) : (
            <Text style={{ color: Colors.muted, marginTop: 8 }}>
              {forecastSnippet(forecast) || 'Forecast loaded.'}
            </Text>
          )}
        </Card>

        <Card>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Active bookings</Text>
          {loading && activeBookings.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 14 }} color={Colors.logoBlueLight} />
          ) : activeBookings.length === 0 ? (
            <Text style={{ color: Colors.muted, marginTop: 8 }}>None right now.</Text>
          ) : (
            activeBookings.slice(0, 5).map((b, idx) => (
              <View
                key={String(b.id)}
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: Colors.border,
                }}
              >
                <Text style={{ color: Colors.text, fontWeight: '800' }}>#{b.id} · Slot {b.slot_no}</Text>
                <Text style={{ color: Colors.muted }}>Starts {formatTs(b.start_time)}</Text>
                <Text style={{ color: Colors.muted }}>Status: {String(b.status || '')}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Button title="Open QR tab" tone="secondary" onPress={() => navigation.navigate('QR')} />
                  <Button
                    title={`Re-book ${String(b.slot_no)}`}
                    tone="warning"
                    onPress={() => goBookingWithSlot(b.slot_no)}
                  />
                </View>
              </View>
            ))
          )}
        </Card>

        <Button title="Refresh dashboard" onPress={load} disabled={loading} loading={loading} />
      </Screen>
    </LandingBackground>
  );
}
