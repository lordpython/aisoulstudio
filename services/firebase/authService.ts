/**
 * Firebase Authentication Service
 *
 * Provides Google and email sign-in functionality.
 * Manages auth state and user sessions.
 */
import {
  signInWithPopup,
  signInWithRedirect,
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
 * Sign in with Google popup (fallback to redirect if popup fails)
 */
export async function signInWithGoogle(): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.warn('[Auth] Firebase not configured');
    return null;
  }

  console.log('[Auth] Starting Google sign-in...');
  console.log('[Auth] Firebase auth instance:', auth);
  console.log('[Auth] Google provider:', googleProvider);

  try {
    console.log('[Auth] Trying popup method...');
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Google sign-in successful:', result.user.email);
    return toAuthUser(result.user);
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };

    // Log full error details for debugging
    console.error('[Auth] Full error object:', error);
    console.error('[Auth] Error code:', firebaseError.code);
    console.error('[Auth] Error message:', firebaseError.message);

    // If popup is blocked or closes, try redirect instead
    if (
      firebaseError.code === 'auth/popup-closed-by-user' ||
      firebaseError.code === 'auth/popup-blocked' ||
      firebaseError.code === 'auth/cancelled-popup-request'
    ) {
      console.warn('[Auth] Popup failed, trying redirect method...');
      try {
        await signInWithRedirect(auth, googleProvider);
        // Redirect will happen, so this won't return
        return null;
      } catch (redirectError) {
        console.error('[Auth] Redirect also failed:', redirectError);
        throw redirectError;
      }
    }

    console.error('[Auth] Google sign-in failed:', firebaseError.message);
    throw error;
  }
}

/**
 * Check for redirect result on app load
 * Call this when the app initializes to handle redirect-based sign-in
 */
export async function handleRedirectResult(): Promise<AuthUser | null> {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.log('[Auth] No auth instance, skipping redirect check');
    return null;
  }

  try {
    console.log('[Auth] ===== CHECKING FOR REDIRECT RESULT =====');
    console.log('[Auth] Current URL:', window.location.href);
    console.log('[Auth] Current auth state:', auth.currentUser?.email || 'not signed in');

    const result = await getRedirectResult(auth);

    console.log('[Auth] Redirect result received:', result);

    if (result) {
      console.log('[Auth] ✅ REDIRECT SIGN-IN SUCCESSFUL!');
      console.log('[Auth] User email:', result.user.email);
      console.log('[Auth] User UID:', result.user.uid);
      const authUser = toAuthUser(result.user);
      console.log('[Auth] Converted to AuthUser:', authUser);
      return authUser;
    }

    console.log('[Auth] No redirect result found (user did not just sign in via redirect)');
    return null;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    console.error('[Auth] ❌ REDIRECT RESULT ERROR:', firebaseError.message);
    console.error('[Auth] Full error:', error);
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
