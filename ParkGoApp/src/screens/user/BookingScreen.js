import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRoute } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { SlotGrid } from '../../components/SlotGrid';
import { useAuth } from '../../store/AuthContext';
import { createReservation, getSlots } from '../../services/parkgo.service';
import { bookingStorage } from '../../services/bookingStorage';
import { PARKGO_PENDING_SLOT_KEY } from '../../constants/pendingSlot';

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function isTimeHm(s) {
  return /^\d{2}:\d{2}$/.test(String(s || '').trim());
}

/** iOS/Safari mishandles `new Date("YYYY-MM-DDTHH:mm")`; use local calendar fields. */
function parseLocalStart(dateStr, timeStr) {
  const d = String(dateStr || '').trim();
  const t = String(timeStr || '').trim();
  if (!isIsoDate(d) || !isTimeHm(t)) return null;
  const [y, mo, da] = d.split('-').map((x) => parseInt(x, 10));
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  if (![y, mo, da, hh, mm].every((n) => Number.isFinite(n))) return null;
  const dt = new Date(y, mo - 1, da, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function localIsoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextWholeHourHm(d = new Date()) {
  const x = new Date(d.getTime());
  x.setMinutes(0, 0, 0);
  x.setHours(x.getHours() + 1);
  const hh = String(x.getHours()).padStart(2, '0');
  return `${hh}:00`;
}

export function BookingScreen({ navigation }) {
  const route = useRoute();
  const { user } = useAuth();
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const selectedSlotRef = useRef(null);
  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  const [date, setDate] = useState(() => localIsoDate());
  const [time, setTime] = useState(() => nextWholeHourHm());
  const [durationHours, setDurationHours] = useState('1');
  const [paymentMethod] = useState('cash');

  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const availability = useMemo(() => {
    const total = slots.length || 0;
    const available = slots.filter((s) => Number(s.state) === 0).length;
    const reserved = slots.filter((s) => Number(s.state) === 2).length;
    const occupied = Math.max(0, total - available - reserved);
    return { total, available, reserved, occupied };
  }, [slots]);

  // Stable callback: selecting a slot must NOT change this identity — otherwise useFocusEffect
  // refetches immediately on every tap and can race/clear selection.
  const loadSlots = useCallback(async () => {
    setError('');
    setLoadingSlots(true);
    try {
      const s = await getSlots();
      setSlots(Array.isArray(s) ? s : []);
      const sel = selectedSlotRef.current;
      if (sel) {
        const row = (Array.isArray(s) ? s : []).find((x) => String(x.slot_no).trim() === String(sel).trim());
        if (!row || Number(row.state) !== 0) setSelectedSlot(null);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load slots');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSlots();
    }, [loadSlots])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const raw = route.params?.presetSlot;
        if (raw != null && String(raw).trim() !== '') {
          setSelectedSlot(String(raw).trim());
          navigation.setParams({ presetSlot: undefined });
          return;
        }
        try {
          const pending = await AsyncStorage.getItem(PARKGO_PENDING_SLOT_KEY);
          if (cancelled || pending == null || String(pending).trim() === '') return;
          const t = String(pending).trim();
          if (!slots.length) return;
          const row = slots.find((x) => String(x.slot_no).trim() === t);
          if (row && Number(row.state) === 0) setSelectedSlot(t);
        } catch {
          /* ignore */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [navigation, route.params?.presetSlot, slots])
  );

  const startDateTime = useMemo(() => parseLocalStart(date, time), [date, time]);

  const duration = useMemo(() => {
    const n = Number(String(durationHours || '').trim());
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.min(24, Math.max(1, n));
  }, [durationHours]);

  const canSubmit = Boolean(user?.id) && Boolean(selectedSlot) && Boolean(startDateTime);

  const submit = async () => {
    setError('');
    if (!canSubmit) {
      setError('Select an available parking slot and enter a valid date/time.');
      return;
    }
    setCreating(true);
    try {
      const startTime = startDateTime.toISOString();
      const endTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000).toISOString();
      const data = await createReservation({
        userId: user.id,
        startTime,
        endTime,
        paymentMethod,
        slotNo: selectedSlot,
      });
      const reservation = data?.reservation || null;
      const qrJwt =
        data?.qrJwt ??
        reservation?.qrJwt ??
        reservation?.qr_jwt ??
        null;
      await bookingStorage.setLastBooking({ reservation, qrJwt });
      await AsyncStorage.removeItem(PARKGO_PENDING_SLOT_KEY).catch(() => {});
      await loadSlots();
      if (qrJwt) {
        navigation.navigate({
          name: 'QR',
          params: { qrPass: String(qrJwt), resPass: reservation },
          merge: true,
        });
      } else {
        navigation.navigate('QR');
      }
    } catch (e) {
      setError(e?.message || 'Booking failed');
      loadSlots();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen contentContainerStyle={{ paddingBottom: 24 }}>
      <Card>
        <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '900' }}>Your booking</Text>
        <Text style={{ color: Colors.muted, lineHeight: 20 }}>
          Pick a green slot, then set date and start time. You’ll get a signed QR after confirmation.
        </Text>
      </Card>

      <Banner tone="danger" text={error} />

      <Card>
        <Text style={{ color: Colors.text, fontWeight: '900' }}>Parking map — choose your slot</Text>
        <Text style={{ color: Colors.muted }}>
          Available: <Text style={{ color: Colors.text, fontWeight: '900' }}>{availability.available}</Text> /{' '}
          <Text style={{ color: Colors.text, fontWeight: '900' }}>{availability.total}</Text>{' '}
          · Reserved: <Text style={{ color: Colors.text, fontWeight: '900' }}>{availability.reserved}</Text>{' '}
          · Occupied: <Text style={{ color: Colors.text, fontWeight: '900' }}>{availability.occupied}</Text>
        </Text>

        {loadingSlots && slots.length === 0 ? (
          <ActivityIndicator color={Colors.logoBlueLight} />
        ) : (
          <SlotGrid
            slots={slots}
            selectedSlotNo={selectedSlot}
            onSelect={(slotNo) => setSelectedSlot(slotNo)}
            showLegend
          />
        )}

        <View
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: 'rgba(37,99,235,0.08)',
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Selected slot
          </Text>
          <Text style={{ color: Colors.text, fontWeight: '900', fontSize: 18 }}>
            {selectedSlot || 'None'}
          </Text>
        </View>

        <Button title="Refresh map" onPress={loadSlots} disabled={loadingSlots} loading={loadingSlots} tone="secondary" />
      </Card>

      <Card>
        <Text style={{ color: Colors.text, fontWeight: '900' }}>Arrival details</Text>
        <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-05-06" />
        <TextField label="Start time (HH:MM)" value={time} onChangeText={setTime} placeholder="14:30" />
        <TextField
          label="Duration (hours)"
          value={String(durationHours)}
          onChangeText={setDurationHours}
          placeholder="1"
          keyboardType="numeric"
        />

        {!user?.id ? (
          <Text style={{ color: Colors.muted, marginTop: 8 }}>Log in to book a parking slot.</Text>
        ) : !selectedSlot ? (
          <Text style={{ color: Colors.muted, marginTop: 8 }}>
            Tap a green available slot on the map above, then book.
          </Text>
        ) : !startDateTime ? (
          <Text style={{ color: Colors.muted, marginTop: 8 }}>Enter a valid date and start time (HH:MM).</Text>
        ) : (
          <Text style={{ color: Colors.muted, marginTop: 8 }}>
            Booking <Text style={{ color: Colors.text, fontWeight: '800' }}>{selectedSlot}</Text> · {date} {time} ·{' '}
            {duration}h
          </Text>
        )}

        <Button
          title={creating ? 'Booking…' : 'Book this slot'}
          onPress={submit}
          disabled={!canSubmit || creating}
          loading={creating}
        />
      </Card>
    </Screen>
  );
}

