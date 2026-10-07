import type { Metadata } from 'next';
import { formatRelative } from '@teamnest/ui';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { TeamMapClient } from './map-client';

export const metadata: Metadata = { title: 'Live team map' };
export const dynamic = 'force-dynamic';

export default async function TeamMapPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [live, visits] = await Promise.all([
    supabase.from('team_live_locations').select('*'),
    supabase.from('report_field_visits').select('id, user_id, full_name, business_name, check_in_at, within_geofence').eq('day', today).order('check_in_at', { ascending: false }).limit(200),
  ]);
  const people = live.data ?? [];
  return (
    <>
      <PageHeader title="Live team map" description="Where your team is now. Shown only for people who are punched in, consented and within shift hours." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <TeamMapClient people={people.map((p) => ({ id: p.user_id!, name: p.full_name!, lat: p.lat!, lng: p.lng!, at: p.recorded_at!, battery: p.battery_pct, visits: Number(p.visits_today ?? 0) }))} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Online now ({people.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {people.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between">
                  <span>{p.full_name}</span>
                  <span className="text-xs text-text-muted">{p.recorded_at ? formatRelative(p.recorded_at) : ''} · {p.visits_today} visits</span>
                </div>
              ))}
              {!people.length && <p className="text-text-muted">Nobody is sharing location right now.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Visits today ({visits.data?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {(visits.data ?? []).map((v) => (
                <div key={v.id} className="flex items-start justify-between gap-2">
                  <span><strong>{v.full_name}</strong><span className="block text-xs text-text-muted">{v.business_name}</span></span>
                  {v.within_geofence === false ? <Badge tone="warning">off-site</Badge> : <Badge tone="success">verified</Badge>}
                </div>
              ))}
              {!visits.data?.length && <p className="text-text-muted">No visits yet today.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
