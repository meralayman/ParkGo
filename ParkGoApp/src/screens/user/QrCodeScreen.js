import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { bookingStorage } from '../../services/bookingStorage';
import { useAuth } from '../../store/AuthContext';
import { getUserReservations } from '../../services/parkgo.service';

function bestQrForReservation(r) {
  if (!r) return null;
  return r.qrJwt ?? r.qr_jwt ?? r.qrToken ?? null;
}

function normalizeStatus(st) {
  return String(st ?? '').trim().toLowerCase();
}

/** Pick newest reservation that counts as active and carries a usable QR. */
async function qrFromReservationList(userId) {
  const r = await getUserReservations(userId);
  const list = Array.isArray(r) ? r : [];
  const activeStatuses = ['confirmed', 'checked_in'];
  const active = list.filter((x) => activeStatuses.includes(normalizeStatus(x.status)));
  active.sort((a, b) => {
    const tb = new Date(b.created_at || b.createdAt || 0).getTime();
    const ta = new Date(a.created_at || a.createdAt || 0).getTime();
    return tb - ta;
  });
  for (const row of active) {
    const q = bestQrForReservation(row);
    if (q) return { qr: String(q), reservation: row };
  }
  const newest = active[0];
  return newest ? { qr: null, reservation: newest } : { qr: null, reservation: null };
}

export function QrCodeScreen({ navigation }) {
  const route = useRoute();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qr, setQr] = useState(null);
  const [reservation, setReservation] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError('');
    setLoading(true);
    try {
      let nextQr = null;
      let nextRes = null;

      const passthrough = route.params?.qrPass;
      const passRes = route.params?.resPass;
      if (passthrough != null && String(passthrough).trim() !== '') {
        nextQr = String(passthrough).trim();
        if (passRes && typeof passRes === 'object') nextRes = passRes;
        navigation.setParams({ qrPass: undefined, resPass: undefined });
      }

      const last = await bookingStorage.getLastBooking();
      const storedQr = last?.qrJwt ?? bestQrForReservation(last?.reservation);
      const storedRes = last?.reservation ?? null;
      if (storedQr && !nextQr) nextQr = String(storedQr);
      if (storedRes && !nextRes) nextRes = storedRes;

      if (!nextQr) {
        const { qr: q2, reservation: r2 } = await qrFromReservationList(user.id);
        if (q2) nextQr = q2;
        if (r2 && !nextRes) nextRes = r2;
      }

      setQr(nextQr || null);
      setReservation(nextRes || null);
    } catch (e) {
      setError(e?.message || 'Failed to load QR');
    } finally {
      setLoading(false);
    }
  }, [user?.id, navigation, route.params?.qrPass, route.params?.resPass]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const clear = async () => {
    await bookingStorage.clear();
    setQr(null);
    setReservation(null);
  };

  return (
    <Screen>
      <Card>
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Your booking QR</Text>
        <Text style={{ color: Colors.muted }}>
          This QR is issued by ParkGo after you confirm a booking. Gate staff scan it against the server — it is not
          fabricated in the app.
        </Text>
      </Card>

      <Banner tone="danger" text={error} />

      <Card style={{ alignItems: 'center' }}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : qr ? (
          <>
            <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16 }}>
              <QRCode value={String(qr)} size={220} />
            </View>
            <Text style={{ color: Colors.muted, marginTop: 8 }} numberOfLines={2}>
              {String(qr)}
            </Text>
          </>
        ) : (
          <Text style={{ color: Colors.muted }}>No active booking QR found yet. Complete a booking, then tap Refresh.</Text>
        )}
      </Card>

      {reservation ? (
        <Card>
          <Text style={{ color: Colors.text, fontWeight: '900' }}>Booking details</Text>
          <Text style={{ color: Colors.muted }}>ID: {reservation.id}</Text>
          <Text style={{ color: Colors.muted }}>Slot: {reservation.slot_no ?? reservation.slotNo}</Text>
          <Text style={{ color: Colors.muted }}>Status: {reservation.status}</Text>
          <Text style={{ color: Colors.muted }}>
            Start:{' '}
            {reservation.start_time || reservation.startTime
              ? new Date(reservation.start_time || reservation.startTime).toLocaleString()
              : '-'}
          </Text>
          <Text style={{ color: Colors.muted }}>
            End:{' '}
            {reservation.end_time || reservation.endTime
              ? new Date(reservation.end_time || reservation.endTime).toLocaleString()
              : '-'}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Button title="Refresh" onPress={load} disabled={loading} loading={loading} />
        <Button title="Clear cached QR" onPress={clear} tone="warning" />
      </Card>
    </Screen>
  );
}
