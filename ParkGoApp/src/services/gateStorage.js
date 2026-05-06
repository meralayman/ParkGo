import * as SecureStore from 'expo-secure-store';

const KEY = 'parkgo.gate.lastPreview';

export const gateStorage = {
  async setLastPreview(preview) {
    if (!preview) {
      await SecureStore.deleteItemAsync(KEY);
      return;
    }
    await SecureStore.setItemAsync(KEY, JSON.stringify(preview));
  },
  async getLastPreview() {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};

