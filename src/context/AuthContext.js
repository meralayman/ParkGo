import React, { createContext, useState, useContext, useEffect } from 'react';
import { API_BASE } from '../config/apiOrigin';
import {
  persistSession,
  clearSessionStorage,
  parkgoFetch,
  getStoredAccessToken,
  getStoredRefreshToken,
} from '../utils/authFetch';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('parkgo_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onRefresh = (e) => {
      if (e && e.detail) setUser(e.detail);
    };
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('parkgo-auth-refresh', onRefresh);
    return () => window.removeEventListener('parkgo-auth-refresh', onRefresh);
  }, []);

  const login = async (usernameOrEmail, password, options = {}) => {
    try {
      const { intendedRole } = options;
      const body = { usernameOrEmail, password };
      if (intendedRole) {
        body.intendedRole = intendedRole;
      }
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        // non-JSON error body
      }

      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 401
            ? 'Invalid username/email or password'
            : 'Login failed');
        return {
          success: false,
          error: msg,
          locked: data.locked === true || res.status === 429,
          lockoutSeconds: typeof data.lockoutSeconds === 'number' ? data.lockoutSeconds : undefined,
          code: data.code,
        };
      }

      if (!data.ok) {
        return {
          success: false,
          error: data.error || data.message || 'Invalid username/email or password',
        };
      }

      setUser(data.user);
      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      return { success: true, user: data.user };
    } catch (err) {
      const msg = err.message || 'Network error';
      const friendly =
        msg === 'Failed to fetch' || msg.includes('NetworkError')
          ? 'Cannot reach the server. Make sure the backend is running on http://localhost:5000'
          : msg;
      return { success: false, error: friendly };
    }
  };

  const signup = async (userData) => {
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: userData.firstName,
          lastName: userData.lastName,
          phoneNumber: userData.phoneNumber,
          nationalId: userData.nationalId,
          username: userData.username,
          email: userData.gmail,
          password: userData.password,
          role: userData.role || 'user',
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        return { success: false, error: data.error || data.message || 'Signup failed' };
      }

      return { success: true, user: data.user };
    } catch (err) {
      const msg = err.message || 'Network error';
      const friendly =
        msg === 'Failed to fetch' || msg.includes('NetworkError')
          ? 'Cannot reach the server. Make sure the backend is running on http://localhost:5000'
          : msg;
      return { success: false, error: friendly };
    }
  };

  const loginWithGoogle = async (credential, options = {}) => {
    try {
      const { intendedRole } = options;
      const body = { accessToken: credential };
      if (intendedRole) {
        body.intendedRole = intendedRole;
      }
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || (res.status === 403 ? "Not authorized" : "Google sign-in failed"),
          code: data.code,
        };
      }
      if (!data.ok) {
        return { success: false, error: data.error || data.message || 'Google sign-in failed' };
      }
      setUser(data.user);
      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      return { success: true, user: data.user };
    } catch (err) {
      const msg = err.message || 'Network error';
      const friendly =
        msg === 'Failed to fetch' || msg.includes('NetworkError')
          ? 'Cannot reach the server. Make sure the backend is running on http://localhost:5000'
          : msg;
      return { success: false, error: friendly };
    }
  };

  const logout = async () => {
    const refresh = getStoredRefreshToken();
    if (refresh) {
      const access = getStoredAccessToken();
      try {
        await parkgoFetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
          },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      } catch {
        /* still clear local session */
      }
    }
    clearSessionStorage();
    setUser(null);
  };

  const value = {
    user,
    login,
    loginWithGoogle,
    signup,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
