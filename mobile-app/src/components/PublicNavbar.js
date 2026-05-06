import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Colors } from '../utils/colors';

function GhostPill({ title, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(148,163,184,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.20)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 11 }}>{title}</Text>
    </Pressable>
  );
}

function PrimaryPill({ title, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: Colors.logoBlue,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{title}</Text>
    </Pressable>
  );
}

/** Public shell: centered brand (home); Login + Sign up on the right. */
export function PublicNavbar({ navigation }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const gap = compact ? 6 : 8;

  return (
    <View
      style={{
        paddingHorizontal: Math.max(12, Math.min(18, width * 0.045)),
        paddingVertical: compact ? 10 : 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148,163,184,0.12)',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <View style={{ flex: 1 }} />

        <Pressable
          onPress={() => navigation.navigate('Welcome')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="ParkGO home"
          style={{ paddingHorizontal: 8 }}
        >
          <Text
            style={{
              color: Colors.text,
              fontWeight: '900',
              fontSize: compact ? 16 : 17,
              letterSpacing: -0.4,
            }}
            numberOfLines={1}
          >
            ParkGO
          </Text>
        </Pressable>

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap, flexWrap: 'wrap' }}>
          <GhostPill title="Login ›" onPress={() => navigation.navigate('Login')} />
          <PrimaryPill title="Sign up" onPress={() => navigation.navigate('Register')} />
        </View>
      </View>
    </View>
  );
}
