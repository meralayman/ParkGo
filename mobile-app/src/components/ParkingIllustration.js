import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Colors } from '../utils/colors';

export function ParkingIllustration({ height = 180 }) {
  return (
    <View
      style={{
        width: '100%',
        height,
        borderRadius: 16,
        backgroundColor: '#e6f0ff',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.18)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 360 200">
        <Rect x="0" y="0" width="360" height="200" fill="transparent" />

        {/* soft blobs */}
        <Circle cx="56" cy="44" r="50" fill="rgba(37,99,235,0.10)" />
        <Circle cx="320" cy="30" r="64" fill="rgba(99,102,241,0.08)" />
        <Circle cx="300" cy="170" r="70" fill="rgba(96,165,250,0.08)" />

        {/* grid */}
        {Array.from({ length: 4 }).map((_, r) =>
          Array.from({ length: 6 }).map((__, c) => {
            const x = 38 + c * 48;
            const y = 58 + r * 32;
            return (
              <Rect
                key={`${r}-${c}`}
                x={x}
                y={y}
                width="36"
                height="22"
                rx="6"
                fill="rgba(255,255,255,0.90)"
                stroke="rgba(15,23,42,0.12)"
              />
            );
          })
        )}

        {/* P marker */}
        <Circle cx="84" cy="74" r="20" fill={Colors.logoBlue} />
        <SvgText
          x="84"
          y="81"
          fontSize="18"
          fontWeight="700"
          textAnchor="middle"
          fill="#ffffff"
        >
          P
        </SvgText>

        {/* small car-ish */}
        <Path
          d="M250 145c0-8 6-14 14-14h26c8 0 14 6 14 14v10c0 4-3 7-7 7h-4c0-6-5-11-11-11s-11 5-11 11h-18c0-6-5-11-11-11s-11 5-11 11h-4c-4 0-7-3-7-7v-10z"
          fill="rgba(96,165,250,0.55)"
        />
      </Svg>
    </View>
  );
}

