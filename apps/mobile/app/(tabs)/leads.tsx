import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Contact, SlidersHorizontal, Search, X } from 'lucide-react-native';
import { getLeadChipCounts, listLeads, type LeadChip, type LeadFilters } from '@teamnest/api-client';
import type { LeadStatus } from '@teamnest/types';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { LeadCard } from '@/components/lead-card';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, SkeletonList } from '@/components/states';
import { Text } from '@/components/text';
import { useOutcomeCodes } from '@/hooks/use-outcome-codes';
import { quietPosition, type Coords } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useCall } from '@/providers/call';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' }, { value: 'interested', label: 'Interested' },
  { value: 'meeting_set', label: 'Meeting set' }, { value: 'negotiation', label: 'Negotiation' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' },
];
const TAGS = ['Hot', 'New', 'Renewal', 'Phone Only', 'Auto-pay Failed'];
const SORTS: { value: NonNullable<LeadFilters['sort']>; label: string }[] = [
  { value: 'priority', label: 'Priority' }, { value: 'follow_up', label: 'Follow-up time' }, { value: 'recent', label: 'Newest' }, { value: 'name', label: 'Name' },
];

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function Leads() {
  const params = useLocalSearchParams<{ chip?: LeadChip; tag?: string }>();
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { call } = useCall();
  const { byCode } = useOutcomeCodes();
  const userId = context?.user.id ?? '';
  const isManager = context?.user.role === 'team_lead' || context?.user.role === 'area_manager';

  const [chip, setChip] = useState<LeadChip>(params.chip ?? 'today');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Pick<LeadFilters, 'status' | 'segment' | 'tag' | 'sort'>>({ tag: params.tag });
  const [draft, setDraft] = useState(filters);
  const [here, setHere] = useState<Coords | null>(null);
  const q = useDebounced(search);

  useEffect(() => { quietPosition().then(setHere); }, []);
  useEffect(() => { if (params.chip) setChip(params.chip); }, [params.chip]);

  // executives see their own leads; managers see their team (RLS) unless filtered
  const scope: LeadFilters = useMemo(
    () => ({ chip, search: q, ...filters, ownerId: isManager ? undefined : userId, pageSize: 20 }),
    [chip, q, filters, isManager, userId],
  );

  const counts = useQuery({
    queryKey: ['lead-chips', userId, isManager],
    queryFn: () => getLeadChipCounts(supabase, isManager ? undefined : userId),
    enabled: !!userId,
  });

  const list = useInfiniteQuery({
    queryKey: ['leads', scope],
    queryFn: ({ pageParam }) => listLeads(supabase, { ...scope, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!userId,
  });

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const activeFilters = (filters.status?.length ?? 0) + (filters.segment ? 1 : 0) + (filters.tag ? 1 : 0);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} className="bg-header">
        <View className="px-4 pb-3 pt-2">
          <Text weight="bold" className="text-xl text-on-header">{t('tabs.leads')}</Text>
          <View className="mt-3 flex-row items-center gap-2">
            <View className="min-h-tap flex-1 flex-row items-center gap-2 rounded-sm bg-surface px-3">
              <Search size={18} color={colors.textSubtle} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search business name, lead ID or phone"
                placeholderTextColor={colors.textSubtle}
                returnKeyType="search"
                className="flex-1 font-inter text-base text-text"
                accessibilityLabel="Search leads"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search"><X size={18} color={colors.textMuted} /></Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => { setDraft(filters); setFiltersOpen(true); }}
              className="min-h-tap min-w-tap items-center justify-center rounded-sm bg-white/15"
              accessibilityRole="button"
              accessibilityLabel={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`}
            >
              <SlidersHorizontal size={20} color="#FFFFFF" />
              {activeFilters ? <View className="absolute right-2 top-2 size-2.5 rounded-full bg-highlight" /> : null}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <View className="flex-row gap-2 px-4 py-3">
        <Chip label="Today" count={counts.data?.today} active={chip === 'today'} onPress={() => setChip('today')} />
        <Chip label="All" count={counts.data?.all} active={chip === 'all'} onPress={() => setChip('all')} />
        <Chip label="Pending" count={counts.data?.pending} active={chip === 'pending'} onPress={() => setChip('pending')} />
      </View>

      {list.isLoading ? (
        <SkeletonList />
      ) : list.isError ? (
        <ErrorState message={t('error.generic')} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.id}
          contentContainerClassName="gap-3 px-4 pb-28"
          renderItem={({ item }) => <LeadCard lead={item} here={here} outcomeColors={byCode} onCall={(l) => call(l)} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { list.refetch(); counts.refetch(); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={Contact}
              title={chip === 'today' ? 'No follow-ups due today' : t('empty.title')}
              body={chip === 'today' ? 'You’re all caught up. Check All leads for your next best call.' : t('empty.leads')}
              actionLabel={chip === 'today' ? 'Show all leads' : activeFilters ? 'Clear filters' : undefined}
              onAction={() => (chip === 'today' ? setChip('all') : setFilters({}))}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <SkeletonList rows={1} /> : null}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      <Sheet
        visible={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={
          <View className="flex-row gap-3">
            <Button label="Clear" variant="outline" className="flex-1" onPress={() => setDraft({})} />
            <Button label="Apply" className="flex-1" onPress={() => { setFilters(draft); setFiltersOpen(false); }} />
          </View>
        }
      >
        <Text weight="semibold">Status</Text>
        <View className="flex-row flex-wrap gap-2">
          {STATUSES.map((s) => {
            const on = draft.status?.includes(s.value);
            return (
              <Chip key={s.value} label={s.label} active={on}
                onPress={() => setDraft((d) => ({ ...d, status: on ? d.status?.filter((x) => x !== s.value) : [...(d.status ?? []), s.value] }))} />
            );
          })}
        </View>
        <Text weight="semibold">Segment</Text>
        <View className="flex-row gap-2">
          {(['b2b', 'b2c'] as const).map((s) => (
            <Chip key={s} label={s.toUpperCase()} active={draft.segment === s} onPress={() => setDraft((d) => ({ ...d, segment: d.segment === s ? undefined : s }))} />
          ))}
        </View>
        <Text weight="semibold">Tag</Text>
        <View className="flex-row flex-wrap gap-2">
          {TAGS.map((tag) => (
            <Chip key={tag} label={tag} active={draft.tag === tag} onPress={() => setDraft((d) => ({ ...d, tag: d.tag === tag ? undefined : tag }))} />
          ))}
        </View>
        <Text weight="semibold">Sort by</Text>
        <View className="flex-row flex-wrap gap-2">
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} active={(draft.sort ?? 'priority') === s.value} onPress={() => setDraft((d) => ({ ...d, sort: s.value }))} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
