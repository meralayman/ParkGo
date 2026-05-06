import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { LandingBackground } from '../../components/LandingBackground';
import { PublicNavbar } from '../../components/PublicNavbar';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Colors } from '../../utils/colors';
import Svg, { Circle, Path } from 'react-native-svg';
import { EGYPT_REGION, LOT_MARKER_TARGET_REGION, LOT_NAME, LOT_POSITION } from '../../constants/alexandriaLot';

function CardIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40" fill="none">
      <Circle cx={20} cy={20} r={20} fill="#eff6ff" />
      <Path
        d="M20 12l8 5v8c0 1.5-1 2.8-2.5 3.2L20 29l-5.5-1.8C13 25.8 12 24.5 12 23v-8l8-5z"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M20 16v6M17 19h6" stroke="#2563eb" strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

export function BookParkingScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const padH = width < 360 ? 14 : width < 480 ? 16 : width < 768 ? 20 : 26;
  /** Match welcome: side-by-side mainly on tablets / wide landscape. */
  const split = width >= 840 || (width >= 720 && height < width - 40);
  const mapH = split ? Math.min(360, Math.max(260, Math.round(height * 0.38))) : Math.min(292, Math.max(220, Math.round(width * 0.62)));
  const titleSize = width < 360 ? 22 : width < 420 ? 24 : 26;
  const mapRef = useRef(null);
  const [search, setSearch] = useState('');

  const flyToLot = () => {
    mapRef.current?.animateToRegion(LOT_MARKER_TARGET_REGION, 900);
  };

  return (
    <LandingBackground>
      <PublicNavbar navigation={navigation} />
      <Screen transparent scroll contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: padH, maxWidth: split ? 1080 : undefined, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6, marginBottom: 10 }}>
          <Text style={{ color: Colors.text, fontSize: titleSize, fontWeight: '800', lineHeight: titleSize + 6 }}>Where do you want to park?</Text>
          <Text style={{ color: Colors.muted, fontSize: width < 380 ? 14 : 15, lineHeight: 22 }}>
            Choose your location to find available parking spots nearby.
          </Text>
        </View>

        <View style={{ flexDirection: split ? 'row' : 'column', gap: split ? 18 : 14 }}>
          <View style={{ flex: split ? 1 : undefined, gap: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.2)',
                borderRadius: 12,
                paddingHorizontal: 12,
                backgroundColor: Colors.card,
              }}
            >
              <Text style={{ color: Colors.muted, marginRight: 8 }}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search location..."
                placeholderTextColor={Colors.muted}
                style={{ flex: 1, color: Colors.text, paddingVertical: 11 }}
              />
            </View>

            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '700' }}>LOCATION</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.2)',
                borderRadius: 12,
                padding: 12,
                backgroundColor: Colors.elevated,
              }}
            >
              <Text style={{ color: Colors.text, fontWeight: '800' }}>{LOT_NAME}</Text>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
                Alexandria, Egypt · 1 location configured
              </Text>
            </View>

            <Pressable onPress={() => navigation.navigate('AlexandriaSlots')}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CardIcon />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>{LOT_NAME}</Text>
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>0 locations available</Text>
                </View>
                <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Select</Text>
              </Card>
            </Pressable>
          </View>

          <Card style={{ flex: split ? 1.25 : undefined, padding: 0, overflow: 'hidden' }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(148,163,184,0.15)',
              }}
            >
              <Pressable
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(148,163,184,0.2)',
                }}
              >
                <Text style={{ color: Colors.muted, fontSize: 13, fontWeight: '700' }}>Filters</Text>
                <Text style={{ color: Colors.muted }}>⌄</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.2)',
                  }}
                >
                  <Text style={{ color: Colors.muted }}>⚙︎</Text>
                </View>
                <View
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.2)',
                  }}
                >
                  <Text style={{ color: Colors.muted }}>▤</Text>
                </View>
              </View>
            </View>
            <MapView
              ref={mapRef}
              style={{ width: '100%', height: mapH }}
              initialRegion={EGYPT_REGION}
            >
              <Marker
                coordinate={{ latitude: LOT_POSITION.lat, longitude: LOT_POSITION.lng }}
                title={LOT_NAME}
                description="Alexandria, Egypt"
                onPress={() => {
                  flyToLot();
                  navigation.navigate('AlexandriaSlots');
                }}
              />
            </MapView>
          </Card>
        </View>
      </Screen>
    </LandingBackground>
  );
}
