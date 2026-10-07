import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ChevronLeft, ChevronRight, Fingerprint, LogOut, MapPin } from 'lucide-react-native';
import { getAttendanceMonth, getTodayAttendance, punchIn, punchOut, summarizeAttendance, toAppError } from '@teamnest/api-client';
import { formatDate, formatDuration, formatTime, istMonthStart, toIstDateString } from '@teamnest/ui';
import { Badge, type BadgeTone } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Donut } from '@/components/donut';
import { Header } from '@/components/header';
import { Loading } from '@/components/states';
import { Text } from '@/components/text';
import { currentPosition } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { pickPhoto, uploadFile } from '@/lib/upload';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

const STATUS_TONE: Record<string, BadgeTone> = { present: 'success', half_day: 'warning', absent: 'danger', on_leave: 'info', holiday: 'primary', week_off: 'neutral' };
const STATUS_LABEL: Record<string, string> = { present: 'Present', half_day: 'Half day', absent: 'Absent', on_leave: 'Leave', holiday: 'Holiday', week_off: 'Week off' };

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

export default function Attendance() {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors, kpi } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id ?? '';
  const [month, setMonth] = useState(istMonthStart());
  const today = useQuery({ queryKey: ['attendance', 'today', userId], queryFn: () => getTodayAttendance(supabase, userId), enabled: !!userId });
  const rows = useQuery({ queryKey: ['attendance', 'month', userId, month], queryFn: () => getAttendanceMonth(supabase, userId, month), enabled: !!userId });
  const s = useMemo(() => summarizeAttendance(rows.data ?? []), [rows.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['attendance'] });
  const pin = useMutation({
    mutationFn: async (selfie: boolean) => {
      const pos = await currentPosition();
      let selfieId: string | undefined;
      if (selfie) {
        const p = await pickPhoto('camera');
        if (p) selfieId = await uploadFile(p, { bucket: 'selfies', orgId: context!.user.org_id, userId, folder: 'selfies', sensitive: true });
      }
      return punchIn(supabase, pos, selfieId);
    },
    onSuccess: (a) => { refresh(); if (a.is_late) Alert.alert('Punched in (late)', 'You punched in after the grace period. 3 late marks count as a half day.'); },
    onError: (e) => Alert.alert('Punch in failed', e instanceof Error && !('code' in e) ? e.message : toAppError(e).message),
  });
  const pout = useMutation({
    mutationFn: async () => punchOut(supabase, await currentPosition()),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Punch out failed', toAppError(e).message),
  });

  // calendar grid (Mon-first)
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const byDay = new Map((rows.data ?? []).map((r) => [r.day, r]));
    return { first, cells: Array.from({ length: count }, (_, i) => {
      const day = `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
      return { day, n: i + 1, row: byDay.get(day) };
    }) };
  }, [month, rows.data]);

  const todayStr = toIstDateString();
  const needsApply = (rows.data ?? []).filter((r) => r.status === 'absent' && r.day < todayStr && !r.is_locked);
  const tdy = today.data;
  const toneColor = (st?: string) => st === 'present' ? kpi.green.bg : st === 'absent' ? kpi.pink.bg : st === 'on_leave' ? kpi.sky.bg : st === 'half_day' ? kpi.amber.bg : st === 'holiday' ? kpi.blue.bg : 'transparent';

  return (
    <View className="flex-1 bg-background">
      <Header title={t('work.attendance')} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-16">
        <Card className="gap-3">
          <View className="flex-row items-center gap-2">
            <Fingerprint size={20} color={colors.primaryText} />
            <Text weight="semibold" className="flex-1 text-base">Today · {formatDate(new Date())}</Text>
            {tdy?.status ? <Badge label={STATUS_LABEL[tdy.status] ?? tdy.status} tone={STATUS_TONE[tdy.status] ?? 'neutral'} /> : null}
          </View>
          <View className="flex-row">
            <View className="flex-1"><Text className="text-xs text-text-muted">Punch in</Text><Text weight="bold" className="text-lg">{tdy?.punch_in_at ? formatTime(tdy.punch_in_at) : '—'}</Text></View>
            <View className="flex-1"><Text className="text-xs text-text-muted">Punch out</Text><Text weight="bold" className="text-lg">{tdy?.punch_out_at ? formatTime(tdy.punch_out_at) : '—'}</Text></View>
            <View className="flex-1"><Text className="text-xs text-text-muted">Points</Text><Text weight="bold" className="text-lg">{tdy?.activity_points ?? 0}</Text></View>
          </View>
          {!tdy?.punch_in_at ? (
            <View className="flex-row gap-2">
              <Button label={t('action.punchIn')} className="flex-1" loading={pin.isPending && pin.variables === false} onPress={() => pin.mutate(false)} />
              <Button label="With selfie" variant="outline" icon={<Camera size={16} color={colors.text} />} loading={pin.isPending && pin.variables === true} onPress={() => pin.mutate(true)} />
            </View>
          ) : !tdy.punch_out_at ? (
            <Button label={t('action.punchOut')} variant="accent" icon={<LogOut size={16} color={colors.onAccent} />} loading={pout.isPending} onPress={() => pout.mutate()} />
          ) : (
            <Text className="text-sm text-text-muted">Worked {formatDuration((tdy.work_minutes ?? 0) * 60)} today.</Text>
          )}
          <View className="flex-row items-center gap-1.5"><MapPin size={12} color={colors.textSubtle} /><Text className="flex-1 text-xs text-text-subtle">Calls and field visits also count toward attendance automatically.</Text></View>
        </Card>

        {needsApply.length ? (
          <Card className="gap-2 bg-warning-soft">
            <Text weight="semibold" className="text-warning">Need to apply ({needsApply.length})</Text>
            <Text className="text-sm text-warning">These days are marked absent. Apply leave or request a punch correction before the month is locked.</Text>
            {needsApply.slice(0, 4).map((r) => (
              <View key={r.day} className="flex-row items-center gap-2">
                <Text className="flex-1 text-sm text-warning">{formatDate(r.day)}</Text>
                <Pressable onPress={() => router.push({ pathname: '/work/leave', params: { from: r.day } })} hitSlop={8}><Text weight="semibold" className="text-sm text-primary-text">Apply leave</Text></Pressable>
                <Pressable onPress={() => router.push({ pathname: '/work/requests', params: { type: 'punch_correction', day: r.day } })} hitSlop={8}><Text weight="semibold" className="text-sm text-primary-text">Correct punch</Text></Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <Card className="gap-4">
          <View className="flex-row items-center">
            <Pressable onPress={() => setMonth(shiftMonth(month, -1))} className="size-11 items-center justify-center" accessibilityLabel="Previous month" accessibilityRole="button"><ChevronLeft size={22} color={colors.text} /></Pressable>
            <Text weight="semibold" className="flex-1 text-center text-base">{new Date(`${month}T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= istMonthStart()} className={`size-11 items-center justify-center ${month >= istMonthStart() ? 'opacity-30' : ''}`} accessibilityLabel="Next month" accessibilityRole="button"><ChevronRight size={22} color={colors.text} /></Pressable>
          </View>
          {rows.isLoading ? <Loading /> : (
            <>
              <Donut
                center={String(s.present + s.half_day * 0.5)}
                sub="days present"
                slices={[
                  { label: 'Present', value: s.present, color: colors.success },
                  { label: 'Half day', value: s.half_day, color: colors.warning },
                  { label: 'Leave', value: s.on_leave, color: colors.info },
                  { label: 'Absent', value: s.absent, color: colors.danger },
                  { label: 'Holiday / off', value: s.holiday + s.week_off, color: colors.borderStrong },
                ]}
              />
              <View className="flex-row justify-between">
                <Text className="text-xs text-text-muted">Late marks: <Text weight="semibold" className="text-xs">{s.late}</Text></Text>
                <Text className="text-xs text-text-muted">Hours: <Text weight="semibold" className="text-xs">{Math.round(s.workMinutes / 60)}</Text></Text>
                <Text className="text-xs text-text-muted">Points: <Text weight="semibold" className="text-xs">{s.points}</Text></Text>
              </View>
              <View>
                <View className="flex-row">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Text key={i} className="flex-1 text-center text-xs text-text-muted">{d}</Text>)}</View>
                <View className="mt-1 flex-row flex-wrap">
                  {Array.from({ length: days.first }).map((_, i) => <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="aspect-square" />)}
                  {days.cells.map((c) => (
                    <View key={c.day} style={{ width: `${100 / 7}%` }} className="aspect-square p-0.5">
                      <View className={`flex-1 items-center justify-center rounded-sm ${c.day === todayStr ? 'border-2 border-primary' : ''}`} style={{ backgroundColor: toneColor(c.row?.status) }}
                        accessible accessibilityLabel={`${formatDate(c.day)} ${c.row ? STATUS_LABEL[c.row.status] : ''}`}>
                        <Text weight={c.row?.is_late ? 'bold' : 'regular'} className={`text-sm ${c.row?.is_late ? 'text-warning' : ''}`}>{c.n}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </Card>

        <Text weight="semibold" className="text-base">Daily log</Text>
        <View className="overflow-hidden rounded-card">
          {[...(rows.data ?? [])].reverse().filter((r) => r.status !== 'week_off').map((r) => (
            <View key={r.id} className="flex-row items-center gap-3 border-b border-border bg-surface px-4 py-3">
              <View className="w-16"><Text weight="semibold" className="text-sm">{formatDate(r.day).slice(0, 6)}</Text></View>
              <View className="flex-1">
                <Text className="text-sm">{r.punch_in_at ? `${formatTime(r.punch_in_at)} – ${r.punch_out_at ? formatTime(r.punch_out_at) : '…'}` : r.source === 'call_activity' || r.source === 'field_visit' ? 'Auto (field activity)' : '—'}</Text>
                <Text className="text-xs text-text-muted">{r.work_minutes ? formatDuration(r.work_minutes * 60) : ''}{r.activity_points ? ` · ${r.activity_points} pts` : ''}{r.is_late ? ' · late' : ''}</Text>
              </View>
              <Badge label={STATUS_LABEL[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
