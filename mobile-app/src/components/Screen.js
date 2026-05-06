import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Colors } from '../utils/colors';

/** `transparent`: let a parent gradient show through (e.g. LandingBackground). */
export function Screen({ children, scroll = true, contentContainerStyle, style, transparent = false, ...scrollProps }) {
  const sheetBg = transparent ? 'transparent' : Colors.bg;
  const body = scroll ? (
    <ScrollView
      style={[{ flex: 1, backgroundColor: sheetBg }, style]}
      contentContainerStyle={[{ padding: 16, gap: 12 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, padding: 16, backgroundColor: sheetBg }, style]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: sheetBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

