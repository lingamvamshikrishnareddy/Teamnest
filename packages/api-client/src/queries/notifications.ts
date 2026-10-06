import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export async function getUnreadCount(client: TeamNestClient) {
  const { count, error } = await client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function listNotifications(client: TeamNestClient, limit = 30) {
  return unwrap(await client.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit));
}

export async function markAllRead(client: TeamNestClient) {
  const { error } = await client.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}
