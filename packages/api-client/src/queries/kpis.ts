import type { DailyKpi } from '@teamnest/types';
import { istMonthStart, pctChange } from '@teamnest/ui';
import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export interface KpiTotals {
  calls: number;
  connectedCalls: number;
  talkTimeSec: number;
  visits: number;
  distanceKm: number;
  meetings: number;
  deals: number;
  revenue: number;
  collections: number;
  autopayDeals: number;
  onlinePayments: number;
  activityPoints: number;
  /** derived */
  autopayDealPct: number;
  connectRatePct: number;
}

export function sumKpis(rows: Pick<DailyKpi, keyof DailyKpi>[]): KpiTotals {
  const t = rows.reduce(
    (a, r) => ({
      calls: a.calls + r.calls,
      connectedCalls: a.connectedCalls + r.connected_calls,
      talkTimeSec: a.talkTimeSec + r.talk_time_sec,
      visits: a.visits + r.visits,
      distanceKm: a.distanceKm + Number(r.distance_km),
      meetings: a.meetings + r.meetings,
      deals: a.deals + r.deals,
      revenue: a.revenue + Number(r.revenue),
      collections: a.collections + Number(r.collections),
      autopayDeals: a.autopayDeals + r.autopay_deals,
      onlinePayments: a.onlinePayments + r.online_payments,
      activityPoints: a.activityPoints + r.activity_points,
    }),
    { calls: 0, connectedCalls: 0, talkTimeSec: 0, visits: 0, distanceKm: 0, meetings: 0, deals: 0, revenue: 0,
      collections: 0, autopayDeals: 0, onlinePayments: 0, activityPoints: 0 },
  );
  return {
    ...t,
    autopayDealPct: t.deals ? (t.autopayDeals / t.deals) * 100 : 0,
    connectRatePct: t.calls ? (t.connectedCalls / t.calls) * 100 : 0,
  };
}

/** Month-to-date vs the same span of last month, for one user (RLS scopes visibility). */
export async function getMonthSummary(client: TeamNestClient, userId: string, now = new Date()) {
  const thisMonth = istMonthStart(now);
  const prevDate = new Date(now);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevMonth = istMonthStart(prevDate);

  const rows = unwrap(
    await client.from('daily_kpis').select('*').eq('user_id', userId).gte('day', prevMonth).order('day'),
  );
  const current = sumKpis(rows.filter((r) => r.day >= thisMonth));
  // compare like-for-like: same number of days into the previous month
  const dayOfMonth = Number(now.toISOString().slice(8, 10));
  const prevCutoff = `${prevMonth.slice(0, 8)}${String(dayOfMonth).padStart(2, '0')}`;
  const previous = sumKpis(rows.filter((r) => r.day < thisMonth && r.day <= prevCutoff));

  return { current, previous, revenueChangePct: pctChange(current.revenue, previous.revenue) };
}
