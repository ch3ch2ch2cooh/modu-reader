import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installMapHelpers } from './lib/mapHelpers';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/lxgw-wenkai/500.css';
import './styles/app.css';

installMapHelpers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Keep the library and notes available under storage pressure on Android.
if (navigator.storage?.persist) {
  void navigator.storage.persist().catch(() => undefined);
}
