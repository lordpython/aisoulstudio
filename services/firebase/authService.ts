/**
 * Firebase Authentication Service
 *
 * Provides Google and email sign-in functionality.
 * Manages auth state and user sessions.
 */
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './config';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

// Convert Firebase User to AuthUser
function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
  };
}

// Google provider instance
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google popup
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('[Auth] Firebase not configured');
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Google sign-in successful:', result.user.email);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    console.error('[Auth] Google sign-in failed:', firebaseError.message);

    // Handle specific errors
    if (firebaseError.code === 'auth/popup-closed-by-user') {
      return null; // User cancelled
    }
    throw error;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('[Auth] Firebase not configured');
    return null;
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log('[Auth] Email sign-in successful:', result.user.email);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    console.error('[Auth] Email sign-in failed:', firebaseError.message);
    throw error;
  }
}

/**
 * Create account with email and password
 */
export async function createAccount(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('[Auth] Firebase not configured');
    return null;
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[Auth] Account created:', result.user.email);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    console.error('[Auth] Account creation failed:', firebaseError.message);
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;

  try {
    await firebaseSignOut(auth);
    console.log('[Auth] Signed out');
  } catch (error: unknown) {
    const firebaseError = error as { message?: string };
    console.error('[Auth] Sign out failed:', firebaseError.message);
    throw error;
  }
}

/**
 * Get current user (synchronous)
 */
export function getCurrentUser(): AuthUser | null {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) return null;
  return toAuthUser(auth.currentUser);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(
  callback: (user: AuthUser | null) => void
): Unsubscribe | null {
  const auth = getFirebaseAuth();
  if (!auth) {
    // Call with null immediately if Firebase not configured
    callback(null);
    return null;
  }

  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAuthUser(user) : null);
  });
}

/**
 * Check if Firebase Auth is available
 */
export function isAuthAvailable(): boolean {
  return isFirebaseConfigured();
}
