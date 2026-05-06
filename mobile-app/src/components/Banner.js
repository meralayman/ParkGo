import React from 'react';
import { Text, View } from 'react-native';
import { Colors } from '../utils/colors';

export function Banner({ tone = 'info', text }) {
  if (!text) return null;
  const border =
    tone === 'danger' ? Colors.danger : tone === 'warning' ? Colors.warning : Colors.info;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: border,
        backgroundColor: 'rgba(96,165,250,0.10)',
        padding: 12,
        borderRadius: 12,
      }}
    >
      <Text style={{ color: Colors.text, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

