import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'parkgo.accessToken',
  refreshToken: 'parkgo.refreshToken',
  userJson: 'parkgo.userJson',
};

async function setItem(key, value) {
  if (value == null) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
  const v = await SecureStore.getItemAsync(key);
  return v == null ? null : v;
}

export const tokenStorage = {
  async getAccessToken() {
    return await getItem(KEYS.accessToken);
  },
  async getRefreshToken() {
    return await getItem(KEYS.refreshToken);
  },
  async getUser() {
    const raw = await getItem(KEYS.userJson);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setSession({ accessToken, refreshToken, user }) {
    await setItem(KEYS.accessToken, accessToken || null);
    await setItem(KEYS.refreshToken, refreshToken || null);
    await setItem(KEYS.userJson, user ? JSON.stringify(user) : null);
  },

  async clear() {
    await SecureStore.deleteItemAsync(KEYS.accessToken);
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
    await SecureStore.deleteItemAsync(KEYS.userJson);
  },
};

