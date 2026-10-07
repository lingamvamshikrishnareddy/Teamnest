import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MapPin, Phone, Star } from 'lucide-react';
import { formatDate, formatDateTime, formatINR, formatPhone, formatRelative } from '@teamnest/ui';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { ReassignButton } from './reassign';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireConsoleSession();
  const { id } = await params;
  const supabase = await getServerClient();
  const { data: lead } = await supabase.from('leads').select('*, owner:users!leads_owner_id_fkey(id, full_name)').eq('id', id).maybeSingle();
  if (!lead) notFound();
  const [timeline, deals, history, docs] = await Promise.all([
    supabase.from('lead_timeline').select('*').eq('lead_id', id).order('at', { ascending: false }).limit(60),
    supabase.from('deals').select('id, deal_no, status, contract_value, payment_mode, closed_at').eq('lead_id', id),
    supabase.from('lead_assignments').select('id, assigned_at, method, reason, to:users!lead_assignments_to_user_id_fkey(full_name)').eq('lead_id', id).order('assigned_at', { ascending: false }),
    supabase.from('documents').select('id, title, status, rejection_reason, created_at').eq('lead_id', id),
  ]);
  const owner = lead.owner as { id: string; full_name: string } | null;

  return (
    <>
      <Link href="/leads" className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><ChevronLeft className="size-4" /> Leads</Link>
      <PageHeader
        title={lead.business_name}
        description={<>{lead.lead_code} · {lead.category ?? 'Uncategorised'} · {lead.segment.toUpperCase()}</>}
        actions={<ReassignButton leadId={lead.id} currentOwner={owner?.id ?? null} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2"><Badge tone="primary">{lead.status.replace('_', ' ')}</Badge>{lead.tag && <Badge tone="highlight">{lead.tag}</Badge>}{lead.is_dnc && <Badge tone="danger">Do not contact</Badge>}</div>
              <p className="flex items-center gap-2"><Phone className="size-4 text-text-subtle" /> {formatPhone(lead.phone)} {lead.contact_name ? `· ${lead.contact_name}` : ''}</p>
              <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-text-subtle" /> {[lead.address_line, lead.locality, lead.city, lead.pincode].filter(Boolean).join(', ') || '—'}</p>
              {lead.rating != null && <p className="flex items-center gap-2"><Star className="size-4 fill-highlight text-highlight" /> {Number(lead.rating).toFixed(1)} ({lead.reviews_count} reviews)</p>}
              <p>Owner: <strong>{owner?.full_name ?? 'Unassigned'}</strong></p>
              <p>Priority score: <strong>{lead.priority_score}</strong></p>
              {lead.next_follow_up_at && <p>Next follow-up: <strong>{formatDateTime(lead.next_follow_up_at)}</strong></p>}
              {lead.lat != null && <Button asChild variant="outline" size="sm"><a href={`https://www.openstreetmap.org/?mlat=${lead.lat}&mlon=${lead.lng}#map=17/${lead.lat}/${lead.lng}`} target="_blank" rel="noreferrer">Open map</a></Button>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Deals</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(deals.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-sm bg-surface-muted p-2">
                  <span>{d.deal_no} · {d.payment_mode}</span>
                  <span className="font-semibold">{formatINR(Number(d.contract_value))} <Badge tone={d.status === 'active' ? 'success' : 'warning'}>{d.status}</Badge></span>
                </div>
              ))}
              {!deals.data?.length && <p className="text-text-muted">No deals yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>KYC documents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(docs.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between"><span>{d.title}</span><Badge tone={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}>{d.status}</Badge></div>
              ))}
              {!docs.data?.length && <p className="text-text-muted">None uploaded.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Assignment history</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(history.data ?? []).map((h) => (
                <div key={h.id}><strong>{(h.to as { full_name?: string } | null)?.full_name ?? '—'}</strong> <span className="text-text-muted">· {h.method} · {formatDate(h.assigned_at)}</span>{h.reason ? <div className="text-xs text-text-muted">{h.reason}</div> : null}</div>
              ))}
            </CardContent>
          </Card>
        </div>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {(timeline.data ?? []).map((e) => (
                <li key={`${e.kind}-${e.id}`} className="relative">
                  <span className={`absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-surface ${e.kind === 'call' ? 'bg-primary' : e.kind === 'visit' ? 'bg-accent' : e.kind === 'deal' ? 'bg-success' : e.kind === 'outcome' ? 'bg-highlight' : 'bg-border-strong'}`} aria-hidden />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-text-muted">{e.at ? `${formatDateTime(e.at)} · ${formatRelative(e.at)}` : ''}</span>
                  </div>
                  {e.detail && <p className="text-sm text-text-muted">{e.detail}</p>}
                </li>
              ))}
              {!timeline.data?.length && <li className="text-sm text-text-muted">No activity yet.</li>}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
