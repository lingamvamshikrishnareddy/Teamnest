import { istMonthStart, toIstDateString } from '@teamnest/ui';

export type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'quarter' | 'custom';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'quarter', label: 'Past 90 days' },
];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Resolves ?range=&from=&to= to inclusive IST dates. */
export function resolveRange(sp: { range?: string; from?: string; to?: string }, fallback: RangePreset = 'month') {
  const today = toIstDateString();
  const preset = (sp.range as RangePreset) ?? (sp.from ? 'custom' : fallback);
  let from = today;
  let to = today;
  switch (preset) {
    case 'yesterday': from = to = addDays(today, -1); break;
    case '7d': from = addDays(today, -6); break;
    case '30d': from = addDays(today, -29); break;
    case 'quarter': from = addDays(today, -89); break;
    case 'month': from = istMonthStart(); break;
    case 'last_month': {
      const start = istMonthStart();
      to = addDays(start, -1);
      from = `${to.slice(0, 8)}01`;
      break;
    }
    case 'custom':
      from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') ? sp.from! : istMonthStart();
      to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') ? sp.to! : today;
      break;
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  // comparison window of equal length immediately before
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { preset, from, to, days, prevFrom, prevTo, fromTs: `${from}T00:00:00+05:30`, toTs: `${to}T23:59:59.999+05:30` };
}
