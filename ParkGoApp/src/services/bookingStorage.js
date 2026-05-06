import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const ASYNC_KEY = 'parkgo.lastBooking.v1';
const LEGACY_SECURE_KEY = 'parkgo.lastBooking';

export const bookingStorage = {
  async setLastBooking(booking) {
    if (!booking) {
      await AsyncStorage.removeItem(ASYNC_KEY);
      await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY).catch(() => {});
      return;
    }
    await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(booking));
    await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY).catch(() => {});
  },

  async getLastBooking() {
    const raw = await AsyncStorage.getItem(ASYNC_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    const legacyRaw = await SecureStore.getItemAsync(LEGACY_SECURE_KEY);
    if (!legacyRaw) return null;
    try {
      const parsed = JSON.parse(legacyRaw);
      await AsyncStorage.setItem(ASYNC_KEY, legacyRaw).catch(() => {});
      await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY).catch(() => {});
      return parsed;
    } catch {
      return null;
    }
  },

  async clear() {
    await AsyncStorage.removeItem(ASYNC_KEY);
    await SecureStore.deleteItemAsync(LEGACY_SECURE_KEY).catch(() => {});
  },
};
