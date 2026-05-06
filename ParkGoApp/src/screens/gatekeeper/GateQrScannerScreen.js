import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { gatePreviewQr } from '../../services/parkgo.service';
import { gateStorage } from '../../services/gateStorage';

/** Same QR can re-fire many times per second (native events differ by corners); server allows 15 previews / min / IP. */
const SAME_QR_COOLDOWN_MS = 4000;

export function GateQrScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const previewInFlightRef = useRef(false);
  const lastQrRef = useRef({ payload: '', at: 0 });

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setError('');
      previewInFlightRef.current = false;
      lastQrRef.current = { payload: '', at: 0 };
    }, [])
  );

  const onScanned = useCallback(async ({ data }) => {
    const qr = String(data || '').trim();
    if (!qr) return;

    const now = Date.now();
    if (
      lastQrRef.current.payload === qr &&
      now - lastQrRef.current.at < SAME_QR_COOLDOWN_MS
    ) {
      return;
    }
    if (previewInFlightRef.current) return;

    lastQrRef.current = { payload: qr, at: now };
    previewInFlightRef.current = true;
    setScanned(true);
    setError('');
    setLoading(true);
    try {
      const preview = await gatePreviewQr(qr);
      await gateStorage.setLastPreview({ scannedQr: qr, ...preview });
      navigation.navigate('Gate');
    } catch (e) {
      const msg = e?.message || 'Invalid QR';
      setError(msg);
      if (e?.code === 'RATE_LIMIT') {
        Alert.alert(
          'Too many scans',
          'The server briefly limits QR checks. Wait up to a minute, then tap Scan again and point at the code once.'
        );
      } else {
        Alert.alert('Scan failed', msg);
      }
    } finally {
      previewInFlightRef.current = false;
      setLoading(false);
    }
  }, [navigation]);

  if (!permission) {
    return (
      <Screen scroll={false} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text }}>Requesting camera permission…</Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Card>
          <Text style={{ color: Colors.text, fontWeight: '900' }}>Camera permission required</Text>
          <Text style={{ color: Colors.muted }}>
            Enable camera permission to scan booking QR codes.
          </Text>
          <Button title="Grant permission" onPress={requestPermission} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} style={{ padding: 0 }}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          onBarcodeScanned={scanned ? undefined : onScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 10 }}>
          <Banner tone="danger" text={error} />
          <Card>
            <Text style={{ color: Colors.text, fontWeight: '900' }}>Scan a ParkGo booking QR</Text>
            <Text style={{ color: Colors.muted }}>
              The app sends the scanned token to `POST /gate/qr/preview` and shows the validation result.
            </Text>
            <Button
              title={scanned ? 'Scan again' : 'Ready'}
              tone="warning"
              onPress={() => {
                setScanned(false);
                setError('');
                lastQrRef.current = { payload: '', at: 0 };
                previewInFlightRef.current = false;
              }}
              disabled={loading}
              loading={loading}
            />
          </Card>
        </View>
      </View>
    </Screen>
  );
}

