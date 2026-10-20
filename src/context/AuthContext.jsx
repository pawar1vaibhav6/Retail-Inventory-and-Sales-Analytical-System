import React, { createContext, useContext, useState, useEffect } from 'react';

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

  const login = (username, password) => {
    const trimmed = (username || '').trim().toLowerCase();
    if (!trimmed) {
      return { success: false, message: 'Please enter a valid username.' };
    }
    // Simple role determination matching app logic
    const role = (trimmed.includes('cashier')) ? 'cashier' : 'admin';
    const authUser = {
      id: trimmed === 'cashier' ? 2 : 1,
      username: username.trim(),
      role
    };
    setUser(authUser);
    return { success: true, user: authUser };
  };

  const register = (username, role) => {
    const trimmed = (username || '').trim();
    if (!trimmed) return { success: false, message: 'Username is required.' };
    const authUser = {
      id: Date.now() % 10000,
      username: trimmed,
      role: role || 'cashier'
    };
    setUser(authUser);
    return { success: true, user: authUser };
  };

  const logout = () => {
    setUser(null);
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
