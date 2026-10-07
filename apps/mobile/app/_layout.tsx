import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { flushOutbox } from '@/lib/outbox';
import { listenForNotificationTaps, registerForPush } from '@/lib/push';
import { startShiftTracking } from '@/lib/tracking';
import { AuthProvider, useAuth } from '@/providers/auth';
import { CallProvider } from '@/providers/call';
import { I18nProvider } from '@/providers/i18n';
import { ThemeProvider, useTheme } from '@/providers/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime ≥ persister maxAge so cached lists survive restarts (offline use)
    queries: { staleTime: 60_000, gcTime: 24 * 3600_000, retry: 2, refetchOnWindowFocus: false, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
});
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'tn.query-cache.v1', throttleTime: 2000 });

function RootNavigator() {
  const { status, context } = useAuth();
  const userId = context?.user.id;

  useEffect(() => {
    if (status !== 'signed_in' || !userId) return;
    void flushOutbox();
    registerForPush(userId).catch(() => undefined);
    const stopTaps = listenForNotificationTaps();
    const stopTracking = startShiftTracking(userId);
    return () => {
      stopTaps();
      stopTracking();
    };
  }, [status, userId]);

  const { name, colors } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (fontsLoaded && status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, status]);

  if (!fontsLoaded || status === 'loading') return null;

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={status === 'signed_in'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lead/[id]/index" />
          <Stack.Screen name="lead/[id]/outcome" options={{ presentation: 'modal' }} />
          <Stack.Screen name="lead/[id]/quote" />
          <Stack.Screen name="deal/[id]" />
          <Stack.Screen name="approvals" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="work" />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signed_in'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 3600_000,
            // never persist sensitive payloads (bank/PAN) to device storage
            dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'sensitive' },
          }}
        >
          <ThemeProvider>
            <AuthProvider>
              <I18nProvider>
                <CallProvider>
                  <RootNavigator />
                </CallProvider>
              </I18nProvider>
            </AuthProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
