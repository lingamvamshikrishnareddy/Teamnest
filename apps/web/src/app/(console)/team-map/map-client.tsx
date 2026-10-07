'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export interface MapPerson { id: string; name: string; lat: number; lng: number; at: string; battery: number | null; visits: number }

const LeafletMap = dynamic(() => import('./leaflet-map'), { ssr: false, loading: () => <Skeleton className="h-[560px] w-full rounded-none" /> });

export function TeamMapClient({ people }: { people: MapPerson[] }) {
  return <LeafletMap people={people} />;
}
