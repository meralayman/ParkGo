import React from 'react';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../../store/AuthContext';
import { Colors } from '../../utils/colors';

export function HeaderRightLogout() {
  const { logout, busy } = useAuth();
  return (
    <Pressable
      onPress={() => logout()}
      disabled={busy}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 8,
        opacity: busy ? 0.6 : pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: Colors.text, fontWeight: '700' }}>Logout</Text>
    </Pressable>
  );
}

