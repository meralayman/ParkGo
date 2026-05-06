import React from 'react';
import { Text, View } from 'react-native';
import { Colors } from '../utils/colors';

export function FeatureCard({ icon, title, description }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(30,41,59,0.92)',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: 0.24,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: 'rgba(96,165,250,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(96,165,250,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={{ marginTop: 12, color: Colors.text, fontWeight: '900', fontSize: 16 }}>{title}</Text>
      <Text style={{ marginTop: 6, color: Colors.muted, lineHeight: 19 }}>{description}</Text>
    </View>
  );
}

