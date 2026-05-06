import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Colors } from '../utils/colors';
import { LinearGradient } from 'expo-linear-gradient';

export function HeroSection({
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  compact = false,
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: Colors.text,
            fontSize: compact ? 26 : 30,
            fontWeight: '900',
            letterSpacing: -0.6,
            lineHeight: compact ? 32 : 36,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: 'rgba(148,163,184,0.95)', fontSize: 13.5, lineHeight: 19 }}>
          {subtitle}
        </Text>
      </View>

      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 10, alignItems: 'stretch' }}>
        {primaryCta ? <PrimaryCta title={primaryCta.title} onPress={primaryCta.onPress} /> : null}
        {secondaryCta ? <SecondaryCta title={secondaryCta.title} onPress={secondaryCta.onPress} /> : null}
      </View>

      <Text style={{ color: 'rgba(148,163,184,0.8)', fontSize: 11 }}>
        For parking owners & businesses
      </Text>
    </View>
  );
}

function PrimaryCta({ title, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1 })}>
      <LinearGradient
        colors={[Colors.logoBlue, Colors.accentPurple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          alignItems: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function SecondaryCta({ title, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1 })}>
      <View
        style={{
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          alignItems: 'center',
          backgroundColor: 'rgba(148,163,184,0.10)',
          borderWidth: 1,
          borderColor: 'rgba(148,163,184,0.20)',
        }}
      >
        <Text style={{ color: '#cbd5e1', fontWeight: '900', fontSize: 13 }}>{title}</Text>
      </View>
    </Pressable>
  );
}

