import Constants from 'expo-constants';
import { Platform } from 'react-native';

function fromExpoPublicEnv() {
  // Expo SDK supports EXPO_PUBLIC_* env vars at build time.
  const v = process.env.EXPO_PUBLIC_API_BASE_URL;
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\/$/, '') : null;
}

function fromExpoExtra() {
  const extra = Constants?.expoConfig?.extra;
  const v = extra?.API_BASE_URL;
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\/$/, '') : null;
}

export function getApiBaseUrl() {
  // Prefer explicit config. Required for real devices.
  return (
    fromExpoPublicEnv() ||
    fromExpoExtra() ||
    // Sensible defaults for local development:
    // - Android emulator -> host machine
    // - iOS simulator -> host machine
    (Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000')
  );
}

