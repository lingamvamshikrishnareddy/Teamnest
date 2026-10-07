import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { getTodayAttendance, sendLocationPing } from '@teamnest/api-client';
import { supabase } from './supabase';

const INTERVAL_MS = 5 * 60_000;

/**
 * Foreground location pings for the live team map: only while the app is
 * open, the user is punched in (and not out), and permission is granted.
 * The database additionally rejects pings outside the shift window or
 * without consent (see can_track_location()).
 */
export function startShiftTracking(userId: string) {
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const today = await getTodayAttendance(supabase, userId);
      if (!today?.punch_in_at || today.punch_out_at) return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await sendLocationPing(supabase, userId, { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined });
    } catch {
      // best effort — never interrupt the user
    }
  };

  const start = () => {
    if (timer) return;
    void tick();
    timer = setInterval(tick, INTERVAL_MS);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  start();
  const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
  return () => {
    stop();
    sub.remove();
  };
}
