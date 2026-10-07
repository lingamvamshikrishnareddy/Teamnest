import type { Lead, LeadStatus, TablesInsert } from '@teamnest/types';
import { toIstDateString } from '@teamnest/ui';
import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export type LeadChip = 'today' | 'all' | 'pending';

export interface LeadFilters {
  chip?: LeadChip;
  search?: string;
  status?: LeadStatus[];
  segment?: 'b2b' | 'b2c';
  tag?: string;
  queueId?: string;
  ownerId?: string | null;   // null = unassigned
  city?: string;
  page?: number;             // 0-based
  pageSize?: number;
  sort?: 'priority' | 'recent' | 'follow_up' | 'name';
}

export const LEAD_LIST_COLUMNS =
  'id, lead_code, business_name, contact_name, phone, whatsapp, category, segment, tag, rating, reviews_count, locality, city, pincode, lat, lng, status, priority_score, last_outcome_code, last_contacted_at, next_follow_up_at, owner_id, is_dnc, created_at';

export type LeadListItem = Pick<
  Lead,
  | 'id' | 'lead_code' | 'business_name' | 'contact_name' | 'phone' | 'whatsapp' | 'category' | 'segment' | 'tag' | 'rating'
  | 'reviews_count' | 'locality' | 'city' | 'pincode' | 'lat' | 'lng' | 'status' | 'priority_score' | 'last_outcome_code'
  | 'last_contacted_at' | 'next_follow_up_at' | 'owner_id' | 'is_dnc' | 'created_at'
>;

const OPEN: LeadStatus[] = ['new', 'contacted', 'interested', 'meeting_set', 'negotiation'];

function istDayBounds(d = new Date()) {
  const day = toIstDateString(d);
  return { start: `${day}T00:00:00+05:30`, end: `${day}T23:59:59.999+05:30` };
}

/** Paginated lead list. RLS limits rows to what the caller may see. */
export async function listLeads(client: TeamNestClient, f: LeadFilters = {}) {
  const pageSize = f.pageSize ?? 25;
  const page = f.page ?? 0;
  let q = client.from('leads').select(LEAD_LIST_COLUMNS, { count: 'exact' });

  const { start, end } = istDayBounds();
  if (f.chip === 'today') q = q.gte('next_follow_up_at', start).lte('next_follow_up_at', end);
  if (f.chip === 'pending') q = q.lt('next_follow_up_at', start).in('status', OPEN);
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ');
    q = /^\+?\d[\d\s]{3,}$/.test(s) ? q.ilike('phone', `%${s.replace(/\s/g, '').slice(-10)}%`) : q.or(`business_name.ilike.%${s}%,lead_code.ilike.%${s}%`);
  }
  if (f.status?.length) q = q.in('status', f.status);
  if (f.segment) q = q.eq('segment', f.segment);
  if (f.tag) q = q.eq('tag', f.tag);
  if (f.queueId) q = q.eq('queue_id', f.queueId);
  if (f.city) q = q.eq('city', f.city);
  if (f.ownerId === null) q = q.is('owner_id', null);
  else if (f.ownerId) q = q.eq('owner_id', f.ownerId);

  switch (f.sort ?? (f.chip === 'today' || f.chip === 'pending' ? 'follow_up' : 'priority')) {
    case 'recent': q = q.order('created_at', { ascending: false }); break;
    case 'follow_up': q = q.order('next_follow_up_at', { ascending: true, nullsFirst: false }); break;
    case 'name': q = q.order('business_name'); break;
    default: q = q.order('priority_score', { ascending: false }).order('next_follow_up_at', { ascending: true, nullsFirst: false });
  }

  const { data, count, error } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as LeadListItem[], total: count ?? 0, page, pageSize, hasMore: (page + 1) * pageSize < (count ?? 0) };
}

/** Chip counts for the lead list header: Today(n) / All(n) / Pending(n). */
export async function getLeadChipCounts(client: TeamNestClient, ownerId?: string) {
  const { start, end } = istDayBounds();
  const base = () => {
    const q = client.from('leads').select('id', { count: 'exact', head: true });
    return ownerId ? q.eq('owner_id', ownerId) : q;
  };
  const [today, all, pending] = await Promise.all([
    base().gte('next_follow_up_at', start).lte('next_follow_up_at', end),
    base().in('status', OPEN),
    base().lt('next_follow_up_at', start).in('status', OPEN),
  ]);
  return { today: today.count ?? 0, all: all.count ?? 0, pending: pending.count ?? 0 };
}

export async function getLead(client: TeamNestClient, id: string) {
  return unwrap(await client.from('leads').select('*, owner:users!leads_owner_id_fkey(id, full_name, phone)').eq('id', id).single());
}

export async function getLeadTimeline(client: TeamNestClient, leadId: string, limit = 50) {
  return unwrap(
    await client.from('lead_timeline').select('*').eq('lead_id', leadId).order('at', { ascending: false }).limit(limit),
  );
}

export async function getLeadReviews(client: TeamNestClient, leadId: string) {
  return unwrap(
    await client.from('ratings').select('id, score, comment, reviewer_name, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(20),
  );
}

export type NewLead = Pick<TablesInsert<'leads'>, 'business_name' | 'phone'> &
  Partial<Pick<TablesInsert<'leads'>, 'contact_name' | 'whatsapp' | 'email' | 'category' | 'segment' | 'address_line' | 'locality' | 'city' | 'state' | 'pincode' | 'lat' | 'lng' | 'tag' | 'custom_fields'>>;

/** "Add Business": the creator becomes the owner. Duplicate phones are rejected by the DB. */
export async function createLead(client: TeamNestClient, ownerId: string, lead: NewLead) {
  return unwrap(
    await client.from('leads').insert({ ...lead, owner_id: ownerId, source: 'manual', whatsapp: lead.whatsapp ?? lead.phone }).select('*').single(),
  );
}

export async function findLeadByPhone(client: TeamNestClient, phone: string) {
  const ten = phone.replace(/\D/g, '').slice(-10);
  if (ten.length !== 10) return null;
  const { data } = await client.from('leads').select('id, business_name, owner_id').eq('phone_normalized', ten).maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Manager tools
// ---------------------------------------------------------------------------
export async function assignLeads(client: TeamNestClient, leadIds: string[], toUserId: string, reason?: string) {
  return Number(unwrap(await client.rpc('assign_leads', { p_lead_ids: leadIds, p_to_user: toUserId, p_reason: reason })));
}

export async function autoAssignQueue(client: TeamNestClient, queueId: string, strategy?: 'round_robin' | 'territory' | 'load_balanced') {
  return unwrap(await client.rpc('auto_assign_queue', { p_queue_id: queueId, p_strategy: strategy }));
}

export async function getQueueCounts(client: TeamNestClient) {
  return unwrap(await client.rpc('queue_counts'));
}

export async function getAvailableAssignees(client: TeamNestClient, territoryId?: string) {
  return unwrap(await client.rpc('available_assignees', { p_territory: territoryId }));
}

export interface ImportRow {
  business_name: string;
  phone: string;
  contact_name?: string;
  email?: string;
  category?: string;
  segment?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
  tag?: string;
  owner_email?: string;
  lat?: string;
  lng?: string;
}

export async function importLeads(
  client: TeamNestClient,
  rows: ImportRow[],
  options: { dryRun?: boolean; onDuplicate?: 'skip' | 'update'; queueCode?: string; assign?: 'none' | 'round_robin' | 'territory' } = {},
) {
  return unwrap(
    await client.rpc('import_leads', {
      p_rows: rows as never,
      p_options: { dry_run: !!options.dryRun, on_duplicate: options.onDuplicate ?? 'skip', queue_code: options.queueCode ?? 'main', assign: options.assign ?? 'none' },
    }),
  );
}
