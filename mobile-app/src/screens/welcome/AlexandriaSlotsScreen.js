import React, { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text, View, ActivityIndicator, useWindowDimensions } from 'react-native';

import { LandingBackground } from '../../components/LandingBackground';
import { PublicNavbar } from '../../components/PublicNavbar';
import { Screen } from '../../components/Screen';
import { Banner } from '../../components/Banner';
import { SlotGrid } from '../../components/SlotGrid';
import { Colors } from '../../utils/colors';
import { getSlots } from '../../services/parkgo.service';
import { LOT_NAME } from '../../constants/alexandriaLot';
import { PARKGO_PENDING_SLOT_KEY } from '../../constants/pendingSlot';

export function AlexandriaSlotsScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const padH = width < 360 ? 14 : width < 480 ? 16 : width < 768 ? 20 : 26;
  const titleSize = width < 360 ? 21 : width < 420 ? 22 : 24;
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSlotNo, setSelectedSlotNo] = useState(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const s = await getSlots();
      setSlots(Array.isArray(s) ? s : []);
    } catch (e) {
      setError(e?.message || 'Cannot reach server');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(PARKGO_PENDING_SLOT_KEY);
        if (
          saved &&
          slots.some((s) => String(s.slot_no).trim() === String(saved).trim() && Number(s.state) === 0)
        ) {
          setSelectedSlotNo(String(saved).trim());
        }
      } catch {
        /* ignore */
      }
    })();
  }, [slots]);

  const handleSelect = async (slotNo) => {
    const key = String(slotNo || '').trim();
    setSelectedSlotNo(key);
    try {
      await AsyncStorage.setItem(PARKGO_PENDING_SLOT_KEY, key);
    } catch {
      /* ignore */
    }
  };

  const handleClear = async () => {
    setSelectedSlotNo(null);
    try {
      await AsyncStorage.removeItem(PARKGO_PENDING_SLOT_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <LandingBackground>
      <PublicNavbar navigation={navigation} />
      <Screen transparent scroll contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: padH, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Pressable hitSlop={8} onPress={() => navigation.navigate('BookParking')} style={{ marginBottom: 8 }}>
          <Text style={{ color: Colors.logoBlueLight, fontWeight: '800', fontSize: 15 }}>← Book parking</Text>
        </Pressable>

        <Text style={{ color: Colors.text, fontSize: titleSize, fontWeight: '900', marginBottom: 6 }}>{LOT_NAME}</Text>
        <Text style={{ color: Colors.muted, fontSize: width < 380 ? 14 : 15, marginBottom: 16, lineHeight: 22 }}>
          Pick an available slot to continue booking.
        </Text>

        {loading ? (
          <ActivityIndicator color={Colors.logoBlueLight} style={{ marginVertical: 24 }} />
        ) : error ? (
          <Banner tone="danger" text={error} />
        ) : (
          <SlotGrid slots={slots} selectedSlotNo={selectedSlotNo} onSelect={handleSelect} showLegend />
        )}

        {selectedSlotNo && !loading && !error ? (
          <View style={{ marginTop: 20, gap: 12 }}>
            <Text style={{ color: Colors.muted, lineHeight: 22 }}>
              Slot <Text style={{ color: Colors.text, fontWeight: '900' }}>{selectedSlotNo}</Text> selected. After you log
              in, open the Booking tab — your spot stays selected.
            </Text>
            <Pressable
              onPress={() => navigation.navigate('Login')}
              style={{
                backgroundColor: Colors.logoBlue,
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Continue to login</Text>
            </Pressable>
            <Pressable onPress={handleClear} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: Colors.muted, fontWeight: '700' }}>Clear selection</Text>
            </Pressable>
          </View>
        ) : null}
      </Screen>
    </LandingBackground>
  );
}
