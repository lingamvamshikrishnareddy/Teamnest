import * as Location from 'expo-location';

import { distanceTo, type Coords } from './geo';

export { distanceTo, type Coords };

export class LocationError extends Error {}

/** Foreground position with a clear error when permission is denied. */
export async function currentPosition(accuracy: Location.Accuracy = Location.Accuracy.High): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationError('Location permission is needed for check-in. Enable it in Settings.');
  }
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
}

/** Best-effort, never prompts (for list distances). */
export async function quietPosition(): Promise<Coords | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } : null;
  } catch {
    return null;
  }
}

export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
