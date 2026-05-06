import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { Colors } from '../utils/colors';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType,
}) {
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: Colors.muted, fontWeight: '600', fontSize: 13, letterSpacing: 0.2 }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.muted}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1,
          borderColor: Colors.border,
          backgroundColor: Colors.elevated,
          color: Colors.text,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 10,
        }}
      />
    </View>
  );
}

