'use client';

import { useRouter } from 'next/navigation';
import { ROLE_LABELS, type AppRole } from '@teamnest/types';
import { formatDate } from '@teamnest/ui';
import { DataTable, SummaryChips } from '@/components/data-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export interface DirRow { id: string; code: string; name: string; email: string; phone: string; role: string; status: string; team: string; manager: string; designation: string; department: string; city: string; joined: string; onboarding: number }

export function Directory({ rows }: { rows: DirRow[] }) {
  const router = useRouter();
  const by = (k: keyof DirRow) => rows.reduce<Record<string, number>>((a, r) => ({ ...a, [String(r[k])]: (a[String(r[k])] ?? 0) + 1 }), {});
  return (
    <>
      <SummaryChips items={[
        { label: 'Headcount', value: String(rows.length), tone: 'primary' },
        ...Object.entries(by('city')).map(([k, v]) => ({ label: k || 'No city', value: String(v) })),
        { label: 'Onboarding open', value: String(rows.filter((r) => r.onboarding < 100).length), tone: 'highlight' },
      ]} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/hr/employees/${r.id}`)}
        exportName="employees"
        searchPlaceholder="Search name, code, email, team…"
        columns={[
          { key: 'name', header: 'Employee', cell: (r) => <span className="flex items-center gap-2"><Avatar name={r.name} size={30} /><span><span className="font-medium">{r.name}</span><span className="block text-xs text-text-muted">{r.code} · {r.email}</span></span></span> },
          { key: 'designation', header: 'Designation', hideOnMobile: true },
          { key: 'role', header: 'Role', value: (r) => ROLE_LABELS[r.role as AppRole], cell: (r) => <Badge tone="primary">{ROLE_LABELS[r.role as AppRole]}</Badge> },
          { key: 'team', header: 'Team', hideOnMobile: true },
          { key: 'manager', header: 'Reports to', hideOnMobile: true },
          { key: 'city', header: 'City' },
          { key: 'joined', header: 'Joined', cell: (r) => formatDate(r.joined), hideOnMobile: true },
          { key: 'onboarding', header: 'Onboarding', align: 'right', cell: (r) => (r.onboarding < 100 ? <Badge tone="warning">{r.onboarding}%</Badge> : <Badge tone="success">Done</Badge>) },
          { key: 'status', header: 'Status', cell: (r) => <Badge tone={r.status === 'active' ? 'success' : r.status === 'inactive' ? 'neutral' : 'warning'}>{r.status.replace('_', ' ')}</Badge> },
        ]}
      />
    </>
  );
}
