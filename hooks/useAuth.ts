/**
 * useAuth Hook
 *
 * React hook for Firebase authentication state.
 * Provides current user, loading state, and auth methods.
 * Syncs auth state with the global app store.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  onAuthChange,
  signInWithGoogle,
  signInWithEmail,
  createAccount,
  signOut,
  getCurrentUser,
  isAuthAvailable,
  handleRedirectResult,
  type AuthUser,
} from '@/services/firebase';
import { useAppStore } from '@/stores/appStore';

interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthAvailable: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get app store actions for syncing auth state
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const clearCurrentUser = useAppStore((state) => state.clearCurrentUser);

  // Helper to sync auth user to app store
  const syncUserToStore = useCallback((authUser: AuthUser | null) => {
    if (authUser) {
      setCurrentUser({
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        photoURL: authUser.photoURL,
        isAuthenticated: true,
      });
    } else {
      clearCurrentUser();
    }
  }, [setCurrentUser, clearCurrentUser]);

  // Subscribe to auth state changes and check for redirect result
  useEffect(() => {
    let mounted = true;

    console.log('[useAuth] Starting auth initialization...');

    // Subscribe to auth state changes immediately (don't gate behind redirect check)
    const unsubscribe = onAuthChange((authUser) => {
      if (!mounted) return;
      console.log('[useAuth] Auth state changed:', authUser?.email || 'signed out');
      setUser(authUser);
      syncUserToStore(authUser);
      setIsLoading(false);
    });

    // If Firebase not configured, stop loading immediately
    if (!unsubscribe) {
      setIsLoading(false);
    }

    // Check for redirect result separately (from Google sign-in redirect)
    handleRedirectResult()
      .then((redirectUser) => {
        if (!mounted) return;
        if (redirectUser) {
          console.log('[useAuth] Got redirect user:', redirectUser.email);
          setUser(redirectUser);
          syncUserToStore(redirectUser);
        }
      })
      .catch((error) => {
        console.error('[useAuth] Redirect result error:', error);
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [syncUserToStore]);

  const handleSignInWithGoogle = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const err = e as { message?: string; code?: string };
      setError(getAuthErrorMessage(err.code));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSignInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsLoading(true);
      try {
        await signInWithEmail(email, password);
      } catch (e) {
        const err = e as { message?: string; code?: string };
        setError(getAuthErrorMessage(err.code));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleCreateAccount = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setIsLoading(true);
      try {
        await createAccount(email, password);
      } catch (e) {
        const err = e as { message?: string; code?: string };
        setError(getAuthErrorMessage(err.code));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      await signOut();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || 'Sign out failed');
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    isAuthAvailable: isAuthAvailable(),
    error,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithEmail: handleSignInWithEmail,
    createAccount: handleCreateAccount,
    signOut: handleSignOut,
    clearError,
  };
}

/**
 * Convert Firebase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/popup-closed-by-user':
      return ''; // User cancelled, no error message needed
    default:
      return code ? `Authentication error: ${code}` : 'An error occurred.';
  }
}

export default useAuth;
