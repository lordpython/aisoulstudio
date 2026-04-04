/**
 * Firebase Configuration
 *
 * Initialize Firebase app with environment variables.
 * Supports both browser and potential SSR environments.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseLogger } from '../infrastructure/logger';

const log = firebaseLogger.child('Config');

// Firebase configuration from environment variables
// NOTE: Storage is handled by Google Cloud Storage (aisoul-studio-storage bucket)
// via services/cloudStorageService.ts - NOT Firebase Storage
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // storageBucket is NOT used - GCS bucket is in a different project
  // storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
}

// Initialize Firebase app (singleton pattern)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) {
    log.warn('Not configured. Set VITE_FIREBASE_* environment variables.');
    log.warn(`Current config: apiKey=${!!firebaseConfig.apiKey}, authDomain=${!!firebaseConfig.authDomain}, projectId=${!!firebaseConfig.projectId}`);
    return null;
  }

  if (!app) {
    log.info(`Initializing app: authDomain=${firebaseConfig.authDomain}, projectId=${firebaseConfig.projectId}`);
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    log.info('App initialized successfully');
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  if (!auth) {
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  if (!db) {
    db = getFirestore(firebaseApp);
  }
  return db;
}
