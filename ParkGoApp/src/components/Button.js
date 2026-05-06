import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../utils/colors';

export function Button({ title, onPress, disabled, loading, tone = 'primary' }) {
  const isPrimary = tone === 'primary';
  const isDanger = tone === 'danger';
  const isWarning = tone === 'warning';
  const bg = isDanger ? Colors.danger : isWarning ? Colors.warning : Colors.elevated;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: isPrimary ? 0 : 1,
        borderColor: Colors.border,
        opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {isPrimary ? (
        <LinearGradient
          colors={[Colors.logoBlue, Colors.accentPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={{ color: '#ffffff', fontWeight: '800' }}>{title}</Text>
          )}
        </LinearGradient>
      ) : (
        <LinearGradient
          colors={[bg, bg]}
          style={{ paddingVertical: 12, alignItems: 'center' }}
        >
          {loading ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={{ color: Colors.text, fontWeight: '800' }}>{title}</Text>
          )}
        </LinearGradient>
      )}
    </Pressable>
  );
}

