'use client';

import { formatDateTime } from '@teamnest/ui';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';

type Row = { id: string; created_at: string; actor: string; actor_role: string | null; action: string; table_name: string | null; record_id: string | null; changed_fields: string[] | null; old_data: unknown; new_data: unknown };

export function AuditTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.id} exportName="audit-log" pageSize={50}
      expand={(r) => (
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div><div className="mb-1 font-semibold text-text-muted">Before</div><pre className="max-h-64 overflow-auto rounded-sm bg-surface p-2">{r.old_data ? JSON.stringify(r.old_data, null, 2) : '—'}</pre></div>
          <div><div className="mb-1 font-semibold text-text-muted">After</div><pre className="max-h-64 overflow-auto rounded-sm bg-surface p-2">{r.new_data ? JSON.stringify(r.new_data, null, 2) : '—'}</pre></div>
        </div>
      )}
      columns={[
        { key: 'created_at', header: 'When', cell: (r) => formatDateTime(r.created_at) },
        { key: 'actor', header: 'Who', cell: (r) => <span>{r.actor}<span className="block text-xs text-text-muted">{r.actor_role}</span></span> },
        { key: 'action', header: 'Action', cell: (r) => <Badge tone={r.action === 'view_sensitive' ? 'warning' : r.action === 'delete' ? 'danger' : 'primary'}>{r.action.replace('_', ' ')}</Badge> },
        { key: 'table_name', header: 'Record' },
        { key: 'changed_fields', header: 'Changed', value: (r) => (r.changed_fields ?? []).join(', '), hideOnMobile: true },
      ]} />
  );
}
