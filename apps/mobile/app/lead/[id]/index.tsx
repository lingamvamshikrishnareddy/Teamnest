import { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, { Marker } from 'react-native-maps';
import {
  CalendarClock, Camera, Clock, FileText, Footprints, Handshake, LocateFixed, LogIn, LogOut, Mail, MapPin, MessageCircle,
  Navigation, Phone, Plus, ReceiptText, Star, Upload, UserRound,
} from 'lucide-react-native';
import {
  checkInVisit, checkOutVisit, getLead, getLeadReviews, getLeadTimeline, getOpenVisit, listDocumentCategories, listLeadDocuments,
  listLeadQuotes, scheduleFollowUp, scheduleMeeting, toAppError,
} from '@teamnest/api-client';
import { formatDate, formatDateTime, formatDistance, formatINR, formatPhone, formatRelative, phoneForLinks } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Header } from '@/components/header';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, Loading } from '@/components/states';
import { Text } from '@/components/text';
import { quickTimes } from '@/lib/dates';
import { currentPosition, mapsUrl } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { pickDocument, pickPhoto, uploadFile } from '@/lib/upload';
import { useAuth } from '@/providers/auth';
import { useCall } from '@/providers/call';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

type Tab = 'timeline' | 'pitch' | 'documents' | 'reviews';

const STATUS_TONE: Record<string, BadgeTone> = {
  new: 'primary', contacted: 'info', interested: 'success', meeting_set: 'info', negotiation: 'warning', won: 'success', lost: 'neutral', dnc: 'danger', invalid: 'neutral',
};
const QUOTE_TONE: Record<string, BadgeTone> = { draft: 'neutral', pending_approval: 'warning', approved: 'success', rejected: 'danger', sent: 'primary', accepted: 'success', expired: 'neutral' };
const DOC_TONE: Record<string, BadgeTone> = { pending: 'warning', verified: 'success', rejected: 'danger', expired: 'neutral' };

export default function LeadDetail() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { call } = useCall();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const orgId = context?.user.org_id ?? '';
  const [tab, setTab] = useState<Tab>(initialTab ?? 'timeline');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => getLead(supabase, id) });
  const timeline = useQuery({ queryKey: ['lead-timeline', id], queryFn: () => getLeadTimeline(supabase, id), enabled: tab === 'timeline' });
  const quotes = useQuery({ queryKey: ['lead-quotes', id], queryFn: () => listLeadQuotes(supabase, id), enabled: tab === 'pitch' });
  const deals = useQuery({
    queryKey: ['lead-deals', id],
    queryFn: async () => (await supabase.from('deals').select('id, deal_no, status, contract_value, payment_mode, closed_at').eq('lead_id', id).order('closed_at', { ascending: false })).data ?? [],
  });
  const docs = useQuery({ queryKey: ['lead-docs', id], queryFn: () => listLeadDocuments(supabase, id), enabled: tab === 'documents' });
  const reviews = useQuery({ queryKey: ['lead-reviews', id], queryFn: () => getLeadReviews(supabase, id), enabled: tab === 'reviews' });
  const openVisit = useQuery({ queryKey: ['open-visit', userId], queryFn: () => getOpenVisit(supabase, userId), enabled: !!userId });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
    qc.invalidateQueries({ queryKey: ['lead-timeline', id] });
    qc.invalidateQueries({ queryKey: ['open-visit', userId] });
    qc.invalidateQueries({ queryKey: ['kpis'] });
  };

  const visitHere = openVisit.data?.lead_id === id ? openVisit.data : null;
  const visitElsewhere = openVisit.data && openVisit.data.lead_id !== id ? openVisit.data : null;

  const checkIn = useMutation({
    mutationFn: async (withPhoto: boolean) => {
      const pos = await currentPosition();
      let photoId: string | undefined;
      if (withPhoto) {
        const photo = await pickPhoto('camera');
        if (photo) photoId = await uploadFile(photo, { bucket: 'visit-photos', orgId, userId, folder: 'visits', entityTable: 'leads', entityId: id });
      }
      return checkInVisit(supabase, userId, { leadId: id, lat: pos.lat, lng: pos.lng, accuracyM: pos.accuracy ?? undefined, photoFileId: photoId });
    },
    onSuccess: (v) => {
      refreshAll();
      if (v.within_geofence === false) {
        Alert.alert('Checked in — outside the shop area', `You are ${formatDistance(v.distance_from_lead_m ?? 0)} from the saved location. Your manager will see this visit as off-site.`);
      }
    },
    onError: (e) => Alert.alert('Check-in failed', toAppError(e).message || String(e)),
  });

  const checkOut = useMutation({
    mutationFn: async () => {
      const pos = await currentPosition();
      return checkOutVisit(supabase, visitHere!.id, { lat: pos.lat, lng: pos.lng });
    },
    onSuccess: () => {
      refreshAll();
      router.push({ pathname: '/lead/[id]/outcome', params: { id, visitId: visitHere!.id } });
    },
    onError: (e) => Alert.alert('Check-out failed', toAppError(e).message || String(e)),
  });

  const fixLocation = useMutation({
    mutationFn: async () => {
      const pos = await currentPosition();
      const { error } = await supabase.from('leads').update({ lat: pos.lat, lng: pos.lng }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] }),
    onError: (e) => Alert.alert('Could not save location', toAppError(e).message || String(e)),
  });

  if (lead.isLoading) return <View className="flex-1 bg-background"><Header title="Lead" /><Loading /></View>;
  if (lead.isError || !lead.data) return <View className="flex-1 bg-background"><Header title="Lead" /><ErrorState message={t('error.generic')} onRetry={() => lead.refetch()} /></View>;
  const l = lead.data;
  const hasLoc = l.lat != null && l.lng != null;
  const won = (deals.data ?? []).find((d) => d.status !== 'cancelled');

  return (
    <View className="flex-1 bg-background">
      <Header title={l.business_name} subtitle={`${l.lead_code}${l.category ? ` · ${l.category}` : ''}`} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-32">
        {/* Contact */}
        <Card>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge label={l.status.replace('_', ' ')} tone={STATUS_TONE[l.status] ?? 'neutral'} />
            <Badge label={l.segment.toUpperCase()} tone="neutral" />
            {l.tag ? <Badge label={l.tag} tone="highlight" /> : null}
            {l.rating != null ? (
              <View className="flex-row items-center gap-1">
                <Star size={13} color={colors.highlight} fill={colors.highlight} />
                <Text weight="semibold" className="text-sm">{Number(l.rating).toFixed(1)}</Text>
                <Text className="text-xs text-text-muted">({l.reviews_count})</Text>
              </View>
            ) : null}
          </View>
          <View className="mt-3 gap-2">
            {l.contact_name ? <InfoRow icon={UserRound} text={l.contact_name} /> : null}
            <InfoRow icon={Phone} text={formatPhone(l.phone)} />
            {l.email ? <InfoRow icon={Mail} text={l.email} /> : null}
            <InfoRow icon={MapPin} text={[l.address_line, l.locality, l.city, l.pincode].filter(Boolean).join(', ') || 'No address yet'} />
            {l.next_follow_up_at ? <InfoRow icon={Clock} text={`Next follow-up ${formatDateTime(l.next_follow_up_at)}`} /> : null}
          </View>
          {l.is_dnc ? (
            <View className="mt-3 rounded-sm bg-danger-soft p-3"><Text className="text-sm text-danger">This business asked not to be contacted.</Text></View>
          ) : (
            <View className="mt-4 flex-row gap-2">
              <ActionButton icon={Phone} label={t('action.call')} primary onPress={() => call(l)} />
              <ActionButton icon={MessageCircle} label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${phoneForLinks(l.whatsapp ?? l.phone)}`)} />
              <ActionButton icon={Navigation} label="Navigate" disabled={!hasLoc} onPress={() => hasLoc && Linking.openURL(mapsUrl(l.lat!, l.lng!))} />
            </View>
          )}
        </Card>

        {/* Map + visit */}
        <Card className="overflow-hidden p-0">
          {hasLoc && Platform.OS !== 'web' ? (
            <MapView
              style={{ height: 160 }}
              initialRegion={{ latitude: l.lat!, longitude: l.lng!, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
              scrollEnabled={false}
              zoomEnabled={false}
              accessibilityLabel={`Map showing ${l.business_name}`}
            >
              <Marker coordinate={{ latitude: l.lat!, longitude: l.lng! }} title={l.business_name} pinColor={colors.primary} />
            </MapView>
          ) : !hasLoc ? (
            <View className="items-center gap-2 bg-surface-muted p-5">
              <MapPin size={22} color={colors.textMuted} />
              <Text className="text-center text-sm text-text-muted">Location missing. Stand at the shop and save it so visits can be verified.</Text>
              <Button label="Use my current location" variant="soft" icon={<LocateFixed size={16} color={colors.primaryText} />} loading={fixLocation.isPending} onPress={() => fixLocation.mutate()} />
            </View>
          ) : null}
          <View className="gap-3 p-4">
            <View className="flex-row items-center gap-2">
              <Footprints size={18} color={colors.primaryText} />
              <Text weight="semibold" className="flex-1">Field visit</Text>
              {visitHere ? <Badge label={`Checked in ${formatRelative(visitHere.check_in_at)}`} tone="success" /> : null}
            </View>
            {visitElsewhere ? (
              <Text className="text-sm text-warning">You’re still checked in at {(visitElsewhere.lead as { business_name?: string } | null)?.business_name ?? 'another lead'}. Check out there first.</Text>
            ) : visitHere ? (
              <Button label="Check out & add outcome" variant="accent" icon={<LogOut size={16} color={colors.onAccent} />} loading={checkOut.isPending} onPress={() => checkOut.mutate()} />
            ) : (
              <View className="flex-row gap-2">
                <Button label="Check in" className="flex-1" icon={<LogIn size={16} color={colors.onPrimary} />} loading={checkIn.isPending && checkIn.variables === false} onPress={() => checkIn.mutate(false)} />
                <Button label="With photo" variant="outline" className="flex-1" icon={<Camera size={16} color={colors.text} />} loading={checkIn.isPending && checkIn.variables === true} onPress={() => checkIn.mutate(true)} />
              </View>
            )}
            <Text className="text-xs text-text-muted">{t('privacy.location')}</Text>
          </View>
        </Card>

        {/* Won deal shortcut */}
        {won ? (
          <Pressable onPress={() => router.push(`/deal/${won.id}`)} className="flex-row items-center gap-3 rounded-card bg-success-soft p-4" accessibilityRole="button">
            <Handshake size={22} color={colors.success} />
            <View className="flex-1">
              <Text weight="semibold" className="text-success">Deal {won.deal_no} · {formatINR(Number(won.contract_value))}</Text>
              <Text className="text-xs text-success">{won.status === 'pending_payment' ? 'Payment pending — tap to collect' : `Active · ${won.payment_mode}`}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {(
            [
              ['timeline', 'Timeline'], ['pitch', 'Pitch & Quote'], ['documents', 'Documents'], ['reviews', 'Customer Reviews'],
            ] as const
          ).map(([k, label]) => <Chip key={k} label={label} active={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>

        {tab === 'timeline' && (
          timeline.isLoading ? <Loading /> : (timeline.data ?? []).length === 0 ? (
            <EmptyState icon={Clock} title="No activity yet" body="Calls, visits, outcomes and documents will appear here." />
          ) : (
            <View className="gap-0">
              {(timeline.data ?? []).map((e, i, arr) => (
                <View key={`${e.kind}-${e.id}`} className="flex-row gap-3">
                  <View className="items-center">
                    <View className="mt-1 size-3 rounded-full" style={{ backgroundColor: kindColor(e.kind ?? '', colors) }} />
                    {i < arr.length - 1 ? <View className="w-0.5 flex-1 bg-border" /> : null}
                  </View>
                  <View className="flex-1 pb-4">
                    <View className="flex-row items-center gap-2">
                      <Text weight="semibold" className="flex-1 text-sm">{e.title}</Text>
                      <Text className="text-xs text-text-muted">{e.at ? formatRelative(e.at) : ''}</Text>
                    </View>
                    {e.detail ? <Text className="mt-0.5 text-sm text-text-muted">{e.detail}</Text> : null}
                    {e.kind === 'visit' && (e.meta as { within_geofence?: boolean } | null)?.within_geofence === false ? (
                      <Text className="mt-0.5 text-xs text-warning">Outside shop area ({formatDistance(Number((e.meta as { distance_m?: number }).distance_m ?? 0))})</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )
        )}

        {tab === 'pitch' && (
          <View className="gap-3">
            <Button label="Build a quote" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => router.push(`/lead/${id}/quote`)} disabled={l.is_dnc} />
            {(quotes.data ?? []).map((q) => (
              <Pressable key={q.id} onPress={() => router.push({ pathname: '/lead/[id]/quote', params: { id, quoteId: q.id } })} accessibilityRole="button">
                <Card>
                  <View className="flex-row items-center gap-2">
                    <ReceiptText size={18} color={colors.primaryText} />
                    <Text weight="semibold" className="flex-1">{q.quote_no} · {(q.package as { name?: string } | null)?.name}</Text>
                    <Badge label={q.status.replace('_', ' ')} tone={QUOTE_TONE[q.status] ?? 'neutral'} />
                  </View>
                  <Text className="mt-1 text-sm text-text-muted">
                    {formatINR(Number(q.total_amount))} incl. GST{Number(q.discount_pct) > 0 ? ` · ${q.discount_pct}% off` : ''} · {formatDate(q.created_at)}
                  </Text>
                </Card>
              </Pressable>
            ))}
            {quotes.data?.length === 0 ? <Text className="text-center text-sm text-text-muted">No quotes yet.</Text> : null}
          </View>
        )}

        {tab === 'documents' && (
          <View className="gap-3">
            <Button label="Upload document" variant="soft" icon={<Upload size={18} color={colors.primaryText} />} onPress={() => setUploadOpen(true)} />
            {(docs.data ?? []).map((d) => (
              <Card key={d.id}>
                <View className="flex-row items-center gap-2">
                  <FileText size={18} color={colors.textMuted} />
                  <Text weight="semibold" className="flex-1">{d.title}</Text>
                  <Badge label={d.status} tone={DOC_TONE[d.status] ?? 'neutral'} />
                </View>
                {d.status === 'rejected' && d.rejection_reason ? (
                  <Text className="mt-2 rounded-sm bg-danger-soft p-2 text-sm text-danger">Rejected: {d.rejection_reason}. Please re-upload.</Text>
                ) : null}
              </Card>
            ))}
            {docs.data?.length === 0 ? <Text className="text-center text-sm text-text-muted">No KYC documents yet.</Text> : null}
          </View>
        )}

        {tab === 'reviews' && (
          (reviews.data ?? []).length === 0 ? <EmptyState icon={Star} title="No customer reviews yet" /> : (
            <View className="gap-3">
              {(reviews.data ?? []).map((r) => (
                <Card key={r.id}>
                  <View className="flex-row items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} color={colors.highlight} fill={i < Math.round(Number(r.score)) ? colors.highlight : 'transparent'} />
                    ))}
                    <Text className="ml-auto text-xs text-text-muted">{formatDate(r.created_at)}</Text>
                  </View>
                  {r.comment ? <Text className="mt-2 text-sm">{r.comment}</Text> : null}
                  <Text className="mt-1 text-xs text-text-muted">— {r.reviewer_name ?? 'Customer'}</Text>
                </Card>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Sticky actions */}
      {!l.is_dnc && (
        <View className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t border-border bg-surface px-4 pb-8 pt-3">
          <Button label="Add outcome" className="flex-1" onPress={() => router.push(`/lead/${id}/outcome`)} />
          <Button label="Schedule" variant="outline" className="flex-1" icon={<CalendarClock size={16} color={colors.text} />} onPress={() => setScheduleOpen(true)} />
        </View>
      )}

      <ScheduleSheet visible={scheduleOpen} onClose={() => setScheduleOpen(false)} leadId={id} userId={userId} defaultLocation={[l.address_line, l.locality].filter(Boolean).join(', ')} onDone={refreshAll} />
      <KycUploadSheet visible={uploadOpen} onClose={() => setUploadOpen(false)} leadId={id} dealId={won?.id} orgId={orgId} userId={userId} onDone={() => qc.invalidateQueries({ queryKey: ['lead-docs', id] })} />
    </View>
  );
}

function kindColor(kind: string, colors: ReturnType<typeof useTheme>['colors']) {
  switch (kind) {
    case 'call': return colors.primary;
    case 'visit': return colors.accent;
    case 'outcome': return colors.highlight;
    case 'deal': return colors.success;
    case 'document': return colors.info;
    default: return colors.borderStrong;
  }
}

function InfoRow({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-start gap-2">
      <Icon size={16} color={colors.textSubtle} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm">{text}</Text>
    </View>
  );
}

function ActionButton({ icon: Icon, label, onPress, primary, disabled }: { icon: typeof Phone; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`min-h-tap flex-1 items-center justify-center gap-1 rounded-sm py-2 ${primary ? 'bg-primary' : 'bg-primary-soft'} ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon size={18} color={primary ? colors.onPrimary : colors.primaryText} />
      <Text weight="semibold" className={`text-xs ${primary ? 'text-on-primary' : 'text-primary-text'}`}>{label}</Text>
    </Pressable>
  );
}

function ScheduleSheet({ visible, onClose, leadId, userId, defaultLocation, onDone }: { visible: boolean; onClose: () => void; leadId: string; userId: string; defaultLocation: string; onDone: () => void }) {
  const [kind, setKind] = useState<'follow_up' | 'callback' | 'meeting'>('follow_up');
  const options = useMemo(() => quickTimes(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState(0);
  const [note, setNote] = useState('');
  const [location, setLocation] = useState(defaultLocation);
  const save = useMutation({
    mutationFn: async () => {
      const at = options[pick]!.at;
      if (kind === 'meeting') return scheduleMeeting(supabase, userId, { leadId, at, location, agenda: note || undefined });
      return scheduleFollowUp(supabase, userId, { leadId, at, kind, note: note || undefined });
    },
    onSuccess: () => { onDone(); onClose(); setNote(''); },
    onError: (e) => Alert.alert('Could not schedule', toAppError(e).message),
  });
  return (
    <Sheet visible={visible} title="Schedule" onClose={onClose} footer={<Button label="Save" onPress={() => save.mutate()} loading={save.isPending} />}>
      <View className="flex-row flex-wrap gap-2">
        <Chip label="Follow-up" active={kind === 'follow_up'} onPress={() => setKind('follow_up')} />
        <Chip label="Callback" active={kind === 'callback'} onPress={() => setKind('callback')} />
        <Chip label="Meeting" active={kind === 'meeting'} onPress={() => setKind('meeting')} />
      </View>
      <Text weight="semibold">When</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o, i) => <Chip key={o.key} label={o.label} active={pick === i} onPress={() => setPick(i)} />)}
      </View>
      <Text className="text-sm text-text-muted">{formatDateTime(options[pick]!.at)}</Text>
      {kind === 'meeting' ? <Field label="Location" value={location} onChangeText={setLocation} /> : null}
      <Field label={kind === 'meeting' ? 'Agenda' : 'Note'} value={note} onChangeText={setNote} multiline />
    </Sheet>
  );
}

function KycUploadSheet({ visible, onClose, leadId, dealId, orgId, userId, onDone }: { visible: boolean; onClose: () => void; leadId: string; dealId?: string; orgId: string; userId: string; onDone: () => void }) {
  const { colors } = useTheme();
  const cats = useQuery({ queryKey: ['doc-cats', 'kyc'], queryFn: () => listDocumentCategories(supabase, 'kyc'), enabled: visible });
  const [cat, setCat] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'library' | 'file') => {
      const c = (cats.data ?? []).find((x) => x.id === cat);
      if (!c) throw new Error('Pick a document type first');
      const file = source === 'file' ? await pickDocument() : await pickPhoto(source);
      if (!file) return null;
      const fileId = await uploadFile(file, { bucket: 'kyc', orgId, userId, folder: 'kyc', entityTable: 'leads', entityId: leadId, sensitive: c.is_sensitive });
      const { error } = await supabase.from('documents').insert({ category_id: c.id, lead_id: leadId, deal_id: dealId ?? null, title: c.name, file_id: fileId });
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { onDone(); onClose(); } },
    onError: (e) => Alert.alert('Upload failed', e instanceof Error ? e.message : toAppError(e).message),
  });
  return (
    <Sheet visible={visible} title="Upload KYC document" onClose={onClose}>
      <Text weight="semibold">Document type</Text>
      <View className="flex-row flex-wrap gap-2">
        {(cats.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={cat === c.id} onPress={() => setCat(c.id)} />)}
      </View>
      <View className="gap-2">
        <Button label="Take photo" icon={<Camera size={16} color={colors.onPrimary} />} disabled={!cat} loading={upload.isPending && upload.variables === 'camera'} onPress={() => upload.mutate('camera')} />
        <Button label="Choose from gallery" variant="outline" disabled={!cat} loading={upload.isPending && upload.variables === 'library'} onPress={() => upload.mutate('library')} />
        <Button label="Pick PDF" variant="outline" disabled={!cat} loading={upload.isPending && upload.variables === 'file'} onPress={() => upload.mutate('file')} />
      </View>
    </Sheet>
  );
}
