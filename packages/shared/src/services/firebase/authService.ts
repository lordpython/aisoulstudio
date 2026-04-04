/**
 * Firebase Authentication Service
 *
 * Provides Google and email sign-in functionality.
 * Manages auth state and user sessions.
 */
import {
  signInWithPopup,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './config';
import { firebaseLogger } from '../infrastructure/logger';

const log = firebaseLogger.child('Auth');

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
 * Sign in with Google redirect
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    log.warn('Firebase not configured');
    return null;
  }

  log.info('Starting Google sign-in with popup...');

  try {
    const result = await signInWithPopup(auth, googleProvider);
    log.info(`Google sign-in successful: ${result.user.email}`);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    log.error(`Google sign-in failed: ${firebaseError.message}`);
    throw error;
  }
}

// Module-level guard: only check for redirect result once per page load
let _redirectCheckPromise: Promise<AuthUser | null> | null = null;

/**
 * Check for redirect result on app load
 * Call this when the app initializes to handle redirect-based sign-in.
 * Deduplicates across multiple hook mounts — only runs once per page load.
 */
export async function handleRedirectResult(): Promise<AuthUser | null> {
  // Return cached promise if already checking/checked
  if (_redirectCheckPromise) {
    return _redirectCheckPromise;
  }

  _redirectCheckPromise = _handleRedirectResultImpl();
  return _redirectCheckPromise;
}

async function _handleRedirectResultImpl(): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    log.debug('No auth instance, skipping redirect check');
    return null;
  }

  try {
    log.debug('Checking for redirect result...');
    const result = await getRedirectResult(auth);

    if (result) {
      log.info(`Redirect sign-in successful: ${result.user.email}`);
      return toAuthUser(result.user);
    }

    log.debug('No redirect result found');
    return null;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    log.error(`Redirect result error: ${firebaseError.message}`);
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
    log.warn('Firebase not configured');
    return null;
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    log.info(`Email sign-in successful: ${result.user.email}`);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    log.error(`Email sign-in failed: ${firebaseError.message}`);
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
    log.warn('Firebase not configured');
    return null;
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    log.info(`Account created: ${result.user.email}`);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    log.error(`Account creation failed: ${firebaseError.message}`);
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
    log.info('Signed out');
  } catch (error: unknown) {
    const firebaseError = error as { message?: string };
    log.error(`Sign out failed: ${firebaseError.message}`);
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
