import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

/** Registers this device for push and stores the Expo token (idempotent). */
export async function registerForPush(userId: string) {
  if (!Device.isDevice || Platform.OS === 'web') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'TeamNest', importance: Notifications.AndroidImportance.HIGH });
  }
  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS as 'ios' | 'android', device_name: Device.deviceName ?? null, last_used_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
  return token;
}

/** Opens the screen a push notification points to (data.route). */
export function listenForNotificationTaps() {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const route = (res.notification.request.content.data as { route?: string } | undefined)?.route;
    if (!route) return;
    if (route.startsWith('/deals/')) router.push(`/deal/${route.split('/')[2]}` as never);
    else if (route.startsWith('/approvals')) router.push('/approvals');
    else router.push(route as never);
  });
  return () => sub.remove();
}
