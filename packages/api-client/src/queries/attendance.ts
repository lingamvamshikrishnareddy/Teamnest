import { toIstDateString } from '@teamnest/ui';
import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export async function getTodayAttendance(client: TeamNestClient, userId: string) {
  const { data, error } = await client
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .eq('day', toIstDateString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function punchIn(client: TeamNestClient, coords: { lat: number; lng: number }, selfieFileId?: string) {
  return unwrap(await client.rpc('punch_in', { p_lat: coords.lat, p_lng: coords.lng, p_selfie_file_id: selfieFileId }));
}

export async function punchOut(client: TeamNestClient, coords: { lat: number; lng: number }) {
  return unwrap(await client.rpc('punch_out', { p_lat: coords.lat, p_lng: coords.lng }));
}
