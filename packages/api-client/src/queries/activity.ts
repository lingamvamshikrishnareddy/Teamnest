import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

/** Client-generated idempotency key so offline retries never double-log. */
export function clientRef() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CallLog {
  leadId: string;
  phone: string;
  startedAt: Date;
  durationSec: number;
  connected: boolean;
  channel?: 'phone' | 'whatsapp';
  recordingConsent?: boolean;
  clientRef?: string;
}

export async function logCall(client: TeamNestClient, userId: string, c: CallLog) {
  return unwrap(
    await client
      .from('calls')
      .upsert(
        {
          lead_id: c.leadId,
          user_id: userId,
          phone: c.phone,
          channel: c.channel ?? 'phone',
          started_at: c.startedAt.toISOString(),
          ended_at: new Date(c.startedAt.getTime() + c.durationSec * 1000).toISOString(),
          duration_sec: Math.max(0, Math.round(c.durationSec)),
          connected: c.connected,
          recording_consent: !!c.recordingConsent,
          client_ref: c.clientRef ?? clientRef(),
        },
        { onConflict: 'user_id,client_ref', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle(),
  );
}

export interface OutcomeInput {
  leadId: string;
  code: string;
  remarks?: string;
  callId?: string;
  visitId?: string;
  nextFollowUpAt?: Date | null;
  clientRef?: string;
}

export async function logOutcome(client: TeamNestClient, userId: string, o: OutcomeInput) {
  return unwrap(
    await client
      .from('outcomes')
      .insert({
        lead_id: o.leadId,
        user_id: userId,
        outcome_code: o.code,
        remarks: o.remarks || null,
        call_id: o.callId ?? null,
        visit_id: o.visitId ?? null,
        next_follow_up_at: o.nextFollowUpAt?.toISOString() ?? null,
        client_ref: o.clientRef ?? clientRef(),
      })
      .select('id')
      .single(),
  );
}

export async function getOutcomeCodes(client: TeamNestClient) {
  return unwrap(await client.from('outcome_codes').select('*').eq('is_active', true).order('sort_order'));
}

export async function scheduleMeeting(
  client: TeamNestClient,
  userId: string,
  m: { leadId: string; at: Date; mode?: 'in_person' | 'video' | 'phone'; location?: string; agenda?: string },
) {
  return unwrap(
    await client
      .from('meetings')
      .insert({ lead_id: m.leadId, user_id: userId, scheduled_at: m.at.toISOString(), mode: m.mode ?? 'in_person', location: m.location, agenda: m.agenda })
      .select('*')
      .single(),
  );
}

export async function scheduleFollowUp(client: TeamNestClient, userId: string, f: { leadId: string; at: Date; kind?: 'follow_up' | 'callback'; note?: string }) {
  const row = unwrap(
    await client.from('follow_ups').insert({ lead_id: f.leadId, user_id: userId, due_at: f.at.toISOString(), kind: f.kind ?? 'follow_up', note: f.note }).select('*').single(),
  );
  await client.from('leads').update({ next_follow_up_at: f.at.toISOString() }).eq('id', f.leadId);
  return row;
}

export async function listMyAgenda(client: TeamNestClient, userId: string, kind: 'follow_ups' | 'callbacks' | 'meetings', range: { from: string; to: string }) {
  if (kind === 'meetings') {
    return unwrap(
      await client
        .from('meetings')
        .select('id, scheduled_at, status, location, agenda, lead:leads(id, business_name, phone, locality)')
        .eq('user_id', userId)
        .gte('scheduled_at', range.from)
        .lte('scheduled_at', range.to)
        .order('scheduled_at'),
    );
  }
  return unwrap(
    await client
      .from('follow_ups')
      .select('id, due_at, status, kind, note, lead:leads(id, business_name, phone, locality)')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('kind', kind === 'callbacks' ? 'callback' : 'follow_up')
      .lte('due_at', range.to)
      .order('due_at'),
  );
}

// ---------------------------------------------------------------------------
// Field visits (GPS check-in/out; geofence evaluated in the database)
// ---------------------------------------------------------------------------
export async function checkInVisit(
  client: TeamNestClient,
  userId: string,
  v: { leadId: string; lat: number; lng: number; accuracyM?: number; purpose?: string; photoFileId?: string; travelKm?: number; clientRef?: string },
) {
  return unwrap(
    await client
      .from('visits')
      .insert({
        lead_id: v.leadId,
        user_id: userId,
        purpose: v.purpose ?? 'pitch',
        check_in_lat: v.lat,
        check_in_lng: v.lng,
        check_in_accuracy_m: v.accuracyM,
        check_in_photo_file_id: v.photoFileId,
        travel_distance_km: v.travelKm ?? 0,
        client_ref: v.clientRef ?? clientRef(),
      })
      .select('*')
      .single(),
  );
}

export async function checkOutVisit(client: TeamNestClient, visitId: string, v: { lat: number; lng: number; notes?: string }) {
  return unwrap(
    await client
      .from('visits')
      .update({ check_out_at: new Date().toISOString(), check_out_lat: v.lat, check_out_lng: v.lng, notes: v.notes })
      .eq('id', visitId)
      .select('*')
      .single(),
  );
}

export async function getOpenVisit(client: TeamNestClient, userId: string) {
  const { data } = await client
    .from('visits')
    .select('*, lead:leads(id, business_name)')
    .eq('user_id', userId)
    .is('check_out_at', null)
    .order('check_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function recordConsent(client: TeamNestClient, userId: string, type: 'call_recording' | 'location_tracking' | 'privacy_notice', granted: boolean, noticeVersion = '2026.1') {
  return unwrap(await client.from('consents').insert({ user_id: userId, type, granted, notice_version: noticeVersion }).select('id').single());
}

export async function getConsents(client: TeamNestClient, userId: string) {
  const rows = unwrap(await client.from('consents').select('type, granted, created_at').eq('user_id', userId).order('created_at', { ascending: false }));
  const latest: Partial<Record<string, boolean>> = {};
  for (const r of rows) if (!(r.type in latest)) latest[r.type] = r.granted;
  return latest;
}

export async function sendLocationPing(client: TeamNestClient, userId: string, p: { lat: number; lng: number; accuracyM?: number; batteryPct?: number }) {
  const { error } = await client.from('location_pings').insert({ user_id: userId, lat: p.lat, lng: p.lng, accuracy_m: p.accuracyM, battery_pct: p.batteryPct });
  // RLS rejects pings outside working hours / without consent — that is expected, not an error to surface
  return !error;
}
