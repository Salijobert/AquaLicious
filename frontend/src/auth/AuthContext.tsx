import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthProfile, loginUser, registerCustomer, logoutUser } from './firebase.js';
import { resolver } from '../api/multiServerResolver.js';

interface AuthContextType {
  user: AuthProfile | null;
  role: 'Administrator' | 'Staff' | 'Customer' | null;
  token: string | null;
  isLoading: boolean;
  login: (u: string, p: string) => Promise<void>;
  register: (name: string, u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(resolver.getToken() || null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    if (!resolver.getToken()) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const profile = await resolver.request<AuthProfile>('/api/auth');
      setUser(profile);
      setToken(resolver.getToken());
    } catch (err) {
      console.warn('Failed to load profile, clearing token:', err);
      resolver.setToken('');
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const login = async (usernameOrEmail: string, p: string) => {
    setIsLoading(true);
    try {
      const res = await loginUser(usernameOrEmail, p);
      setUser(res.user);
      setToken(res.token);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, u: string, p: string) => {
    setIsLoading(true);
    try {
      const res = await registerCustomer(name, u, p);
      setUser(res.user);
      setToken(res.token);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
