import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function LandingBackground({ children }) {
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={['#0b1c2c', '#0f172a', '#0b1426']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* soft vignette blobs (approx of web background) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -160,
            left: -120,
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: 'rgba(37,99,235,0.14)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -120,
            right: -140,
            width: 360,
            height: 360,
            borderRadius: 999,
            backgroundColor: 'rgba(99,102,241,0.12)',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -200,
            right: -180,
            width: 420,
            height: 420,
            borderRadius: 999,
            backgroundColor: 'rgba(96,165,250,0.10)',
          }}
        />

        {children}
      </LinearGradient>
    </View>
  );
}

