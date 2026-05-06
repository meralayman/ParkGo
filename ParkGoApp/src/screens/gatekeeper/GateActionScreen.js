import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { gateCheckIn, gateCheckOut } from '../../services/parkgo.service';
import { gateStorage } from '../../services/gateStorage';

function gateBookingId(raw) {
  // Backend currently parses bookingId with parseInt.
  // If DB uses SERIAL ids, this will work. If DB uses UUID ids, backend needs update.
  const s = String(raw ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

export function GateActionScreen() {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const p = await gateStorage.getLastPreview();
    setPreview(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reservation = preview?.reservation || null;
  const nextAction = preview?.nextAction || null;

  const run = async (action) => {
    setError('');
    if (!reservation?.id) {
      setError('No scanned reservation. Go to Scan first.');
      return;
    }
    setLoading(true);
    try {
      const id = gateBookingId(reservation.id);
      const out = action === 'check-in' ? await gateCheckIn(id) : await gateCheckOut(id);
      Alert.alert('Success', out?.message || 'Done');
      await gateStorage.clear();
      setPreview(null);
    } catch (e) {
      const msg = e?.message || 'Gate action failed';
      setError(msg);
      Alert.alert('Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '900' }}>Gate action</Text>
        <Text style={{ color: Colors.muted }}>
          Scan a QR first, then use check-in/check-out based on validation.
        </Text>
      </Card>

      <Banner tone="danger" text={error} />

      {reservation ? (
        <Card>
          <Text style={{ color: Colors.text, fontWeight: '900' }}>Preview</Text>
          <Text style={{ color: Colors.muted }}>Booking: {String(reservation.id)}</Text>
          <Text style={{ color: Colors.muted }}>User: {String(reservation.user_id)}</Text>
          <Text style={{ color: Colors.muted }}>Slot: {String(reservation.slot_no)}</Text>
          <Text style={{ color: Colors.muted }}>Status: {String(reservation.status)}</Text>
          <Text style={{ color: Colors.muted }}>
            Next action: <Text style={{ color: Colors.text, fontWeight: '900' }}>{nextAction || '—'}</Text>
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: Colors.muted }}>No preview loaded yet.</Text>
        </Card>
      )}

      <Card>
        <Button
          title="Check-in"
          onPress={() => run('check-in')}
          disabled={loading || nextAction !== 'check-in'}
          loading={loading && nextAction === 'check-in'}
        />
        <Button
          title="Check-out"
          onPress={() => run('check-out')}
          tone="warning"
          disabled={loading || nextAction !== 'check-out'}
          loading={loading && nextAction === 'check-out'}
        />
        <Button title="Clear" tone="danger" onPress={() => gateStorage.clear().then(() => setPreview(null))} />
      </Card>
    </Screen>
  );
}

