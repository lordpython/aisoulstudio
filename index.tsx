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