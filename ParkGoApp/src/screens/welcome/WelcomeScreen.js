import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { LandingBackground } from '../../components/LandingBackground';
import { PublicNavbar } from '../../components/PublicNavbar';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Colors } from '../../utils/colors';
import { WelcomeHeroIllustration } from '../../components/WelcomeHeroIllustration';

function FeatureIconEffortless({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={20} fill="#eff6ff" />
      <Circle cx={27} cy={13} r={6} fill="#2563eb" />
      <SvgText x={27} y={16} textAnchor="middle" fill="#ffffff" fontSize={7} fontWeight="700" fontFamily="System">
        P
      </SvgText>
      <Path
        d="M11 25h18v-4.5l-1.8-4.5H12.8L11 20.5V25z"
        stroke="#2563eb"
        strokeWidth={1.5}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M13 25v2M27 25v2" stroke="#2563eb" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function CarIcon({ color = '#ffffff' }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M5 17h14v-5l-2-5H7L5 12v5z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M7 17v2M17 17v2" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function WelcomeScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 360;
  const isPhone = width < 768;
  /** Side-by-side hero + art: tablets and wide landscape phones. */
  const heroRow = width >= 900 || (width >= 820 && height < width);
  const padH = isCompact ? 14 : width < 480 ? 16 : width < 768 ? 20 : 26;
  const titleSize = isCompact ? 24 : width < 420 ? 26 : width < 540 ? 28 : heroRow ? 32 : 29;
  const titleLineHeight = Math.round(titleSize * 1.16);
  const subSize = width < 380 ? 14.5 : 16;
  const artMaxW = Math.min(400, width - padH * 2);

  return (
    <LandingBackground>
      <PublicNavbar navigation={navigation} />
      <Screen
        transparent
        scroll
        contentContainerStyle={{
          paddingHorizontal: padH,
          paddingBottom: 32,
          paddingTop: 4,
          maxWidth: heroRow ? 1100 : undefined,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            flexDirection: heroRow ? 'row' : 'column',
            gap: heroRow ? 28 : 20,
            alignItems: heroRow ? 'center' : 'center',
            marginBottom: heroRow ? 26 : 22,
          }}
        >
          <View
            style={{
              flex: heroRow ? 1 : undefined,
              width: heroRow ? undefined : '100%',
              alignItems: heroRow ? 'flex-start' : 'center',
              maxWidth: heroRow ? 440 : 560,
              alignSelf: heroRow ? undefined : 'center',
            }}
          >
            <Text
              style={{
                color: Colors.text,
                fontSize: titleSize,
                fontWeight: '700',
                lineHeight: titleLineHeight,
                textAlign: heroRow ? 'left' : 'center',
                letterSpacing: -0.5,
                marginBottom: 12,
              }}
            >
              Find and Manage Parking Effortlessly
            </Text>
            <Text
              style={{
                color: Colors.muted,
                fontSize: subSize,
                lineHeight: subSize * 1.55,
                textAlign: heroRow ? 'left' : 'center',
                marginBottom: 20,
                maxWidth: 480,
              }}
            >
              Book, pay, and navigate to your parking spot with live availability and secure check-in.
            </Text>
            <View
              style={{
                width: '100%',
                alignItems: heroRow ? 'flex-start' : 'center',
              }}
            >
              <Pressable
                onPress={() => navigation.navigate('BookParking')}
                style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
              >
                <LinearGradient
                  colors={[Colors.logoBlue, '#1d4ed8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: isPhone ? 12 : 14,
                    paddingHorizontal: isPhone ? 20 : 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: Colors.logoBlue,
                    minWidth: heroRow ? undefined : Math.min(width - padH * 2, 320),
                    justifyContent: 'center',
                  }}
                >
                  <CarIcon color="#ffffff" />
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: isCompact ? 15 : 16 }}>Book Parking</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
          <View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              width: heroRow ? undefined : '100%',
              maxWidth: heroRow ? artMaxW : artMaxW,
              alignSelf: 'center',
            }}
          >
            <View
              style={{
                borderRadius: heroRow ? 24 : 20,
                borderWidth: 1,
                borderColor: 'rgba(148, 163, 184, 0.15)',
                overflow: 'hidden',
              }}
            >
              <WelcomeHeroIllustration />
            </View>
          </View>
        </View>

        <Card style={{ alignSelf: 'center', width: '100%', maxWidth: 560 }}>
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              marginBottom: 14,
              borderRadius: 36,
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(96, 165, 250, 0.25)',
            }}
          >
            <FeatureIconEffortless size={40} />
          </View>
          <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Effortless Parking</Text>
          <Text style={{ color: Colors.muted, fontSize: 15, lineHeight: 23 }}>
            Quickly find and book parking, pay seamlessly, and receive navigation assistance.
          </Text>
        </Card>
      </Screen>
    </LandingBackground>
  );
}
