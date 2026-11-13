import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signOut,
  onIdTokenChanged
} from 'firebase/auth';
import { resolver } from '../api/multiServerResolver.js';

// Firebase Web SDK Configuration
// Can be overridden via window.FIREBASE_CONFIG or .env
const firebaseConfig = (window as any).FIREBASE_CONFIG || {
  apiKey: "AIzaSyCbrkSEGe65o2x7BY-h-syTdscYzLDrsVU",
  authDomain: "aqualicious-723f9.firebaseapp.com",
  projectId: "aqualicious-723f9",
  storageBucket: "aqualicious-723f9.appspot.com",
  messagingSenderId: "108104638216306500845",
  appId: "1:108104638216306500845:web:aqualicious"
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

export const auth: Auth = getAuth(app);

// Keep MultiServerResolver equipped to auto-refresh active Firebase ID tokens
resolver.setTokenRefresher(async (forceRefresh = false) => {
  if (!auth.currentUser) return null;
  try {
    const idToken = await auth.currentUser.getIdToken(forceRefresh);
    if (idToken) {
      resolver.setToken(idToken);
    }
    return idToken;
  } catch {
    return null;
  }
});

export function onFirebaseIdTokenChanged(cb: (token: string | null) => void): () => void {
  return onIdTokenChanged(auth, async (fbUser) => {
    if (!fbUser) return;
    try {
      const idToken = await fbUser.getIdToken();
      if (idToken) {
        resolver.setToken(idToken);
        cb(idToken);
      }
    } catch {
      // ignore background refresh error
    }
  });
}

export interface AuthProfile {
  id: number;
  name: string;
  username: string;
  email?: string;
  email_verified?: boolean;
  role: 'Administrator' | 'Customer';
}

/**
 * Authenticates user via Firebase Web SDK.
 * Resolves username -> email first when needed, then authenticates with Firebase
 * and fetches the application profile from PostgreSQL.
 */
export async function loginUser(usernameOrEmail: string, password: string): Promise<{ token: string; user: AuthProfile }> {
  const cleanInput = (usernameOrEmail || '').trim();
  if (!cleanInput) {
    throw new Error('Please enter your username or email address.');
  }
  if (!password) {
    throw new Error('Please enter your password.');
  }

  // 1. Resolve email when user entered a username (Admin or Customer)
  let emailToUse = cleanInput;
  if (!cleanInput.includes('@')) {
    try {
      const resolveRes = await resolver.request<{ email: string; role: string }>('/api/auth', {
        method: 'POST',
        data: {
          action: 'resolve_identifier',
          identifier: cleanInput
        }
      });
      if (resolveRes && resolveRes.email) {
        emailToUse = resolveRes.email;
      } else {
        throw new Error('No account found with that username. Please check your username or use your registered email address.');
      }
    } catch (resolveErr: any) {
      const status = resolveErr?.status;
      if (status === 404) {
        throw new Error('No account found with that username. Please check your username or use your registered email address.');
      }
      if (status === 429) {
        throw new Error('Too many login attempts. Please wait a few minutes before trying again.');
      }
      if (status === 503 || (typeof status === 'number' && status >= 500) || resolveErr?.name === 'TypeError' || resolveErr?.name === 'TimeoutError') {
        throw new Error('Unable to reach the server right now. Please check your connection and try again shortly.');
      }
      throw new Error(resolveErr?.message || 'Unable to verify username right now. Please try again.');
    }
  }

  // 2. Authenticate strictly with Google Firebase Web SDK
  let firebaseToken = '';
  try {
    const userCredential = await signInWithEmailAndPassword(auth, emailToUse.toLowerCase(), password);
    firebaseToken = await userCredential.user.getIdToken();
  } catch (fbErr: any) {
    let message = 'Invalid email or password. Please verify your credentials.';
    if (
      fbErr?.code === 'auth/user-not-found' ||
      fbErr?.code === 'auth/wrong-password' ||
      fbErr?.code === 'auth/invalid-credential'
    ) {
      message = 'Invalid email or password. Please verify your credentials.';
    } else if (fbErr?.code === 'auth/too-many-requests') {
      message = 'Too many failed login attempts. Please wait a few minutes or reset your password before trying again.';
    } else if (fbErr?.code === 'auth/user-disabled') {
      message = 'This user account has been disabled. Please contact the station.';
    } else if (fbErr?.code === 'auth/network-request-failed') {
      message = 'Network error while reaching authentication service. Please check your internet connection.';
    } else if (fbErr?.message) {
      message = fbErr.message;
    }
    throw new Error(message);
  }

  // 3. Fetch profile from PostgreSQL backend with separate error mapping
  resolver.setToken(firebaseToken);
  try {
    const profileRes = await resolver.request<any>('/api/auth');
    return { token: firebaseToken, user: profileRes };
  } catch (apiErr: any) {
    const status = apiErr?.status;
    const code = apiErr?.code;
    const msg = apiErr?.message || '';

    if (status === 401 || code === 'AUTH_TOKEN_INVALID' || msg.includes('no "kid" claim')) {
      await logoutUser().catch(() => {});
      throw new Error('Your session has expired or is invalid. Please sign in again.');
    }
    if (code === 'EMAIL_NOT_VERIFIED' || code === 'EMAIL_VERIFICATION_REQUIRED_FOR_LINK') {
      throw new Error('Please verify your email address before signing in. Check your inbox for the verification link.');
    }
    if (code === 'CONSENT_REQUIRED') {
      throw new Error('Data Privacy Act consent is required before accessing your account.');
    }
    if (code === 'FIREBASE_UID_MISMATCH') {
      await logoutUser().catch(() => {});
      throw new Error('Your account could not be matched to this sign-in method. Please contact support.');
    }
    if (status === 429) {
      throw new Error('Too many requests. Please wait a few minutes before trying again.');
    }
    if (status === 503 || code === 'DATABASE_UNAVAILABLE' || (typeof status === 'number' && status >= 500) || apiErr?.name === 'TypeError' || apiErr?.name === 'TimeoutError') {
      throw new Error('Server is temporarily unavailable. Please try again in a moment.');
    }
    throw new Error(msg || 'Unable to load your account profile. Please try again.');
  }
}

export async function registerCustomer(
  name: string,
  username: string,
  password: string,
  consent: boolean = true,
  termsVersion: string = '2026-10-27.2',
  email?: string
): Promise<{ token: string; user: AuthProfile }> {
  let createdFirebaseUser: any = null;
  const targetEmail = (email || (username.includes('@') ? username : '')).trim().toLowerCase();

  // If registering with an email address, create Firebase credentials (backend sends the single verification email)
  if (targetEmail) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, targetEmail, password);
      createdFirebaseUser = cred.user;
    } catch (fbErr: any) {
      console.warn('Firebase user creation fallback:', fbErr.message);
    }
  }

  try {
    const res = await resolver.request<{ token: string; tokenType?: string; user: AuthProfile }>('/api/auth', {
      method: 'POST',
      data: {
        action: 'register',
        name,
        username,
        email: targetEmail,
        password,
        consent,
        termsVersion
      }
    });

    let finalToken = res.token;
    if (createdFirebaseUser) {
      try {
        finalToken = await createdFirebaseUser.getIdToken();
      } catch {
        // Keep backend-issued token if Firebase getIdToken fails offline
      }
    } else if (res.tokenType === 'firebase_custom' && res.token) {
      const customCred = await signInWithCustomToken(auth, res.token);
      finalToken = await customCred.user.getIdToken();
    }

    resolver.setToken(finalToken);
    return { token: finalToken, user: res.user };
  } catch (err) {
    // If backend step fails, cleanup the orphaned Firebase user
    if (createdFirebaseUser) {
      try {
        await createdFirebaseUser.delete();
      } catch (delErr) {
        console.warn('Could not cleanup orphaned Firebase user:', delErr);
      }
    }
    throw err;
  }
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
 * Re-authenticates Administrator via Firebase for void approval.
 */
export async function reauthenticateAdmin(adminUsername: string, adminPassword: string): Promise<string> {
  const result = await loginUser(adminUsername, adminPassword);
  if (result.user.role !== 'Administrator') {
    throw new Error('User is not an authorized Administrator');
  }
  return result.token;
}
