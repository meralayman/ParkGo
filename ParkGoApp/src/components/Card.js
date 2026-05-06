import React from 'react';
import { View } from 'react-native';
import { Colors } from '../utils/colors';

export function Card({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: Colors.card,
          borderColor: Colors.border,
          borderWidth: 1,
          borderRadius: 14,
          padding: 16,
          gap: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

