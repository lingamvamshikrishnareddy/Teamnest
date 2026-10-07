// Nightly: deletes Storage objects whose retention has passed (call
// recordings after 90 days etc.), then their metadata rows.
import { admin } from '../_shared/clients.ts';
import { json, serve } from '../_shared/http.ts';
import { requireServiceRole } from '../_shared/service.ts';

serve(async (req) => {
  requireServiceRole(req);
  const { data, error } = await admin.rpc('expired_files', { p_limit: 500 });
  if (error) throw error;
  const files = (data ?? []) as { id: string; bucket: string; path: string }[];
  const byBucket = new Map<string, typeof files>();
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f]);
  let removed = 0;
  for (const [bucket, list] of byBucket) {
    const { error: e } = await admin.storage.from(bucket).remove(list.map((f) => f.path));
    if (e) continue;
    await admin.from('files').delete().in('id', list.map((f) => f.id));
    removed += list.length;
  }
  return json({ removed });
});
