import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
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

export interface AuthProfile {
  id: number;
  name: string;
  username: string;
  email?: string;
  email_verified?: boolean;
  role: 'Administrator' | 'Customer';
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

  // If registering with an email address, create Firebase credentials
  if (targetEmail) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, targetEmail, password);
      createdFirebaseUser = cred.user;
      try {
        await sendEmailVerification(cred.user, {
          url: 'https://aqualicious.vercel.app/verify-email-complete'
        });
      } catch (verifyErr: any) {
        console.warn('Firebase sendEmailVerification notice:', verifyErr.message);
      }
    } catch (fbErr: any) {
      console.warn('Firebase user creation fallback:', fbErr.message);
    }
  }

  try {
    const res = await resolver.request<{ token: string; user: AuthProfile }>('/api/auth', {
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

    resolver.setToken(res.token);
    return res;
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
