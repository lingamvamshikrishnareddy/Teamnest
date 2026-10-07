'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { cn } from '@/lib/utils';

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

/** Card wrapper with a chart ⇄ table toggle (every chart has a table view). */
export function ChartCard({ title, description, table, children, actions, className }: { title: string; description?: string; table?: TableView; children: ReactNode; actions?: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {table ? (
            <div className="flex rounded-sm bg-surface-muted p-0.5" role="group" aria-label="View as">
              <button type="button" onClick={() => setAsTable(false)} aria-pressed={!asTable} className={cn('rounded-xs p-1.5', !asTable && 'bg-surface shadow-sm')} aria-label="Chart view"><BarChart3 className="size-4" /></button>
              <button type="button" onClick={() => setAsTable(true)} aria-pressed={asTable} className={cn('rounded-xs p-1.5', asTable && 'bg-surface shadow-sm')} aria-label="Table view"><Table2 className="size-4" /></button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {asTable && table ? (
          <div className="max-h-80 overflow-auto rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-xs uppercase text-text-muted">
                <tr>{table.columns.map((c, i) => <th key={c} className={cn('px-3 py-2', i ? 'text-right' : 'text-left')}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">{r.map((v, j) => <td key={j} className={cn('px-3 py-1.5', j ? 'text-right tabular-nums' : '')}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />{i.label}</li>
      ))}
    </ul>
  );
}
