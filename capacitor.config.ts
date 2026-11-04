import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.modu.reader',
  appName: '墨读',
  webDir: 'dist',
  backgroundColor: '#f6f3ec',
  android: {
    allowMixedContent: false,
    captureInput: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f6f3ec',
      overlaysWebView: false,
    },
  },
};

export default config;
