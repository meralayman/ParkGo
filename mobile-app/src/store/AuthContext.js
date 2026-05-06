import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '../services/apiClient';
import { tokenStorage } from '../services/tokenStorage';

const AuthContext = createContext(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

async function fetchMe() {
  const res = await api.get('/auth/me');
  if (!res?.data?.ok) return null;
  return res.data.user || null;
}

export function AuthProvider({ children }) {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAuthed = Boolean(user?.id);
  const role = user?.role || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedUser = await tokenStorage.getUser();
        if (cancelled) return;
        if (storedUser) setUser(storedUser);

        // Validate token via /auth/me; if it 401s, axios layer will attempt refresh once.
        const me = await fetchMe().catch(() => null);
        if (cancelled) return;
        if (me) {
          setUser(me);
          await tokenStorage.setSession({
            accessToken: await tokenStorage.getAccessToken(),
            refreshToken: await tokenStorage.getRefreshToken(),
            user: me,
          });
        } else {
          await tokenStorage.clear();
          setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo(
    () => ({
      async login({ usernameOrEmail, password }) {
        setBusy(true);
        try {
          const res = await api.post('/auth/login', { usernameOrEmail, password });
          if (!res?.data?.ok) {
            throw new Error(res?.data?.error || res?.data?.message || 'Login failed');
          }
          const next = {
            accessToken: res.data.accessToken,
            refreshToken: res.data.refreshToken,
            user: res.data.user,
          };
          if (!next.accessToken || !next.refreshToken || !next.user) {
            throw new Error('Login response missing tokens');
          }
          await tokenStorage.setSession(next);
          setUser(next.user);
          return next.user;
        } finally {
          setBusy(false);
        }
      },

      async register(payload) {
        setBusy(true);
        try {
          const res = await api.post('/auth/register', payload);
          if (!res?.data?.ok) {
            throw new Error(res?.data?.error || res?.data?.message || 'Registration failed');
          }
          const next = {
            accessToken: res.data.accessToken,
            refreshToken: res.data.refreshToken,
            user: res.data.user,
          };
          if (!next.accessToken || !next.refreshToken || !next.user) {
            throw new Error('Register response missing tokens');
          }
          await tokenStorage.setSession(next);
          setUser(next.user);
          return next.user;
        } finally {
          setBusy(false);
        }
      },

      async logout() {
        setBusy(true);
        try {
          const refreshToken = await tokenStorage.getRefreshToken();
          if (refreshToken) {
            // Best-effort. If it fails we still clear local session.
            await api.post('/auth/logout', { refreshToken }).catch(() => {});
          }
        } finally {
          await tokenStorage.clear();
          setUser(null);
          setBusy(false);
        }
      },
    }),
    []
  );

  const value = useMemo(
    () => ({
      bootstrapped,
      busy,
      user,
      role,
      isAuthed,
      ...actions,
    }),
    [bootstrapped, busy, user, role, isAuthed, actions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

