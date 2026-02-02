import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Expose test functions only in development
if (import.meta.env.DEV) {
  import('./services/freesoundService').then(({ testFreesoundAPI }) => {
    if (typeof window !== "undefined") {
      (window as any).testFreesoundAPI = testFreesoundAPI;
    }
  });

  // Test Firebase configuration at startup
  import('./services/firebase/config').then(({ isFirebaseConfigured, getFirebaseApp, getFirebaseAuth }) => {
    console.log('=== FIREBASE STARTUP TEST ===');
    console.log('[Firebase] Is configured?', isFirebaseConfigured());
    console.log('[Firebase] Environment variables:', {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? '✓ Set' : '✗ Missing',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? '✓ Set' : '✗ Missing',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✓ Set' : '✗ Missing',
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ? '✓ Set' : '✗ Missing',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? '✓ Set' : '✗ Missing',
      appId: import.meta.env.VITE_FIREBASE_APP_ID ? '✓ Set' : '✗ Missing',
    });

    const app = getFirebaseApp();
    console.log('[Firebase] App initialized?', !!app);

    if (app) {
      const auth = getFirebaseAuth();
      console.log('[Firebase] Auth initialized?', !!auth);
      if (auth) {
        console.log('[Firebase] Auth config:', {
          appName: auth.app.name,
          apiKey: auth.config.apiKey.substring(0, 10) + '...',
          authDomain: auth.config.authDomain
        });
      }
    }
    console.log('=== END FIREBASE TEST ===');
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);