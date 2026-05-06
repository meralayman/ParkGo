import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Colors } from '../utils/colors';

function Pill({ title, onPress, variant = 'ghost' }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: isPrimary ? Colors.logoBlue : 'rgba(148,163,184,0.10)',
        borderWidth: 1,
        borderColor: isPrimary ? 'transparent' : 'rgba(148,163,184,0.20)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: isPrimary ? '#fff' : Colors.text, fontWeight: '800', fontSize: 12 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function LandingHeader({ rightPrimary, rightSecondary }) {
  return (
    <View
      style={{
        height: 56,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148,163,184,0.12)',
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
        {/* left spacer to keep logo centered */}
        <View style={{ width: 86 }} />

        {/* centered logo mark */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: 'rgba(96,165,250,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(96,165,250,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: Colors.logoBlueLight, fontWeight: '900' }}>P</Text>
          </View>
        </View>

        {/* right pills */}
        <View style={{ width: 86, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          {rightSecondary ? (
            <Pill title={rightSecondary.title} onPress={rightSecondary.onPress} variant="ghost" />
          ) : null}
          {rightPrimary ? (
            <Pill title={rightPrimary.title} onPress={rightPrimary.onPress} variant="primary" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

