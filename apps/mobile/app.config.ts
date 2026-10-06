import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_ENV = (process.env.APP_ENV ?? 'local') as 'local' | 'staging' | 'production';
const suffix = APP_ENV === 'production' ? '' : `.${APP_ENV}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_ENV === 'production' ? 'TeamNest' : `TeamNest (${APP_ENV})`,
  slug: 'teamnest',
  scheme: 'teamnest',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: './assets/icon.png',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#2563EB' },
  ios: {
    bundleIdentifier: `com.example.teamnest${suffix}`,
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'TeamNest uses your location to verify punch-in and field visits during working hours only.',
      NSCameraUsageDescription: 'TeamNest uses the camera for punch-in selfies, visit photos and KYC documents.',
      NSPhotoLibraryUsageDescription: 'Attach documents and photos from your library.',
    },
  },
  android: {
    package: `com.example.teamnest${suffix}`,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#2563EB' },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'CALL_PHONE'],
    edgeToEdgeEnabled: true,
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-localization',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'TeamNest uses your location to verify punch-in and field visits during working hours only.',
      },
    ],
    ['expo-splash-screen', { image: './assets/splash.png', backgroundColor: '#2563EB', imageWidth: 180 }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: APP_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
