import { useQuery } from '@tanstack/react-query';
import { getOutcomeCodes } from '@teamnest/api-client';
import { supabase } from '@/lib/supabase';

export function useOutcomeCodes() {
  const q = useQuery({ queryKey: ['outcome-codes'], queryFn: () => getOutcomeCodes(supabase), staleTime: 60 * 60_000 });
  const byCode = Object.fromEntries((q.data ?? []).map((o) => [o.code, { label: o.label, color: o.color }]));
  return { ...q, byCode };
}
