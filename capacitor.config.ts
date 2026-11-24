import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fourguyscafe.app',
  appName: 'FOUR GUYS CAFE',
  webDir: 'dist',
  backgroundColor: '#FAF9F6',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: [
      '*.firebaseapp.com',
      '*.googleapis.com',
      'accounts.google.com',
      'www.google.com',
      '*.gstatic.com',
      'www.recaptcha.net',
      'recaptcha.net',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: '#FAF9F6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      backgroundColor: '#FAF9F6',
      style: 'LIGHT',
      overlaysWebView: false,
    },
  },
};

export default config;
