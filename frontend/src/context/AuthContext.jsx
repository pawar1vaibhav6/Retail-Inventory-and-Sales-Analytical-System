import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('retailsphere_user');
      return saved ? JSON.parse(saved) : { id: 1, username: 'admin', role: 'admin' };
    } catch {
      return { id: 1, username: 'admin', role: 'admin' };
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('retailsphere_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('retailsphere_user');
    }
  }, [user]);

  const login = async (username, password) => {
    const trimmed = (username || '').trim();
    if (!trimmed) {
      return { success: false, message: 'Please enter a valid username.' };
    }
    try {
      const res = await authAPI.login(trimmed, password);
      if (res && res.success && res.user) {
        setUser(res.user);
        return { success: true, user: res.user };
      }
      return { success: false, message: res?.message || 'Login failed.' };
    } catch (err) {
      return { success: false, message: err.message || 'Server connection error.' };
    }
  };

  const register = async (username, password, role) => {
    const trimmed = (username || '').trim();
    if (!trimmed) return { success: false, message: 'Username is required.' };
    try {
      const res = await authAPI.register(trimmed, password, role);
      if (res && res.success && res.user) {
        setUser(res.user);
        return { success: true, user: res.user };
      }
      return { success: false, message: res?.message || 'Registration failed.' };
    } catch (err) {
      return { success: false, message: err.message || 'Server connection error.' };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // ignore network errors on logout
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
