import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { resolver } from '../api/multiServerResolver.js';

// Firebase Web SDK Configuration
// Can be overridden via window.FIREBASE_CONFIG or .env
const firebaseConfig = (window as any).FIREBASE_CONFIG || {
  apiKey: "AIzaSyAquaLiciousLocalDevKeyPlaceholder",
  authDomain: "aqualicious-pos.firebaseapp.com",
  projectId: "aqualicious-pos",
  storageBucket: "aqualicious-pos.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const auth: Auth = getAuth(app);

export interface AuthProfile {
  id: number;
  name: string;
  username: string;
  email?: string;
  role: 'Administrator' | 'Staff' | 'Customer';
}

/**
 * Authenticates user.
 * Supports Firebase Web SDK sign-in and local API login.
 */
export async function loginUser(usernameOrEmail: string, password: string):Promise<{ token: string; user: AuthProfile }> {
  // If input is an email, attempt Firebase Web SDK first
  if (usernameOrEmail.includes('@')) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, usernameOrEmail, password);
      const token = await userCredential.user.getIdToken();
      resolver.setToken(token);

      // Fetch profile from PostgreSQL backend
      const profileRes = await resolver.request<any>('/api/auth');
      return { token, user: profileRes };
    } catch (fbErr: any) {
      console.warn('Firebase Web SDK sign-in error, falling back to cluster login:', fbErr.message);
    }
  }

  // Cluster direct authentication (Node/Express API)
  const res = await resolver.request<{ token: string; user: AuthProfile }>('/api/auth', {
    method: 'POST',
    data: {
      username: usernameOrEmail,
      password
    }
  });

  resolver.setToken(res.token);
  return res;
}

export async function registerCustomer(name: string, username: string, password: string): Promise<{ token: string; user: AuthProfile }> {
  const res = await resolver.request<{ token: string; user: AuthProfile }>('/api/auth', {
    method: 'POST',
    data: {
      action: 'register',
      name,
      username,
      password
    }
  });

  resolver.setToken(res.token);
  return res;
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch {
    // Ignore signout error if offline
  }
  resolver.setToken('');
  sessionStorage.removeItem('aq_token');
  localStorage.removeItem('aq_token');
}

/**
 * Re-authenticates Administrator for void approval.
 */
export async function reauthenticateAdmin(adminUsername: string, adminPassword: string): Promise<string> {
  const res = await resolver.request<{ token: string; user: AuthProfile }>('/api/auth', {
    method: 'POST',
    data: {
      username: adminUsername,
      password: adminPassword
    }
  });

  if (res.user.role !== 'Administrator') {
    throw new Error('User is not an authorized Administrator');
  }

  return res.token;
}
