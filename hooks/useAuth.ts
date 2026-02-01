/**
 * useAuth Hook
 *
 * React hook for Firebase authentication state.
 * Provides current user, loading state, and auth methods.
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
  type AuthUser,
} from '@/services/firebase';

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

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setUser(authUser);
      setIsLoading(false);
    });

    // If Firebase not configured, stop loading
    if (!unsubscribe) {
      setIsLoading(false);
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

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
