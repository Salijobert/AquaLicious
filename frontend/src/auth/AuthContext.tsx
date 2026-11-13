import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthProfile, loginUser, registerCustomer, logoutUser, onFirebaseIdTokenChanged } from './firebase.js';
import { resolver } from '../api/multiServerResolver.js';

interface AuthContextType {
  user: AuthProfile | null;
  role: 'Administrator' | 'Customer' | null;
  token: string | null;
  isLoading: boolean;
  login: (u: string, p: string) => Promise<AuthProfile>;
  register: (name: string, u: string, p: string, consent?: boolean, termsVersion?: string, email?: string) => Promise<AuthProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<AuthProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthProfile | null>(null);
  const [token, setToken] = useState<string | null>(resolver.getToken() || null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async (): Promise<AuthProfile | null> => {
    if (!resolver.getToken()) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return null;
    }

    try {
      const profile = await resolver.request<AuthProfile>('/api/auth');
      setUser(profile);
      setToken(resolver.getToken());
      return profile;
    } catch (err) {
      console.warn('Failed to load profile, clearing token:', err);
      resolver.setToken('');
      setUser(null);
      setToken(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();

    const handleSessionExpired = () => {
      resolver.setToken('');
      setUser(null);
      setToken(null);
      logoutUser().catch(() => {});
    };

    window.addEventListener('aqualicious:session-expired', handleSessionExpired);
    const unsubToken = onFirebaseIdTokenChanged((freshToken) => {
      if (freshToken) setToken(freshToken);
    });

    return () => {
      window.removeEventListener('aqualicious:session-expired', handleSessionExpired);
      unsubToken();
    };
  }, []);

  const login = async (usernameOrEmail: string, p: string): Promise<AuthProfile> => {
    setIsLoading(true);
    try {
      const res = await loginUser(usernameOrEmail, p);
      setUser(res.user);
      setToken(res.token);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    name: string,
    u: string,
    p: string,
    consent: boolean = true,
    termsVersion: string = '2026-10-27.2',
    email?: string
  ): Promise<AuthProfile> => {
    setIsLoading(true);
    try {
      const res = await registerCustomer(name, u, p, consent, termsVersion, email);
      setUser(res.user);
      setToken(res.token);
      return res.user;
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
