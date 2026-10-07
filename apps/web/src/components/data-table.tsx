'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search } from 'lucide-react';
import { exportCsv, exportXlsx } from '@/lib/export';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Checkbox } from './ui/form';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer; defaults to the raw value. */
  cell?: (row: T) => ReactNode;
  /** Sort / search / export value. */
  value?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  className?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  exportName?: string;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  selectionActions?: (ids: string[], clear: () => void) => ReactNode;
  toolbar?: ReactNode;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  expand?: (row: T) => ReactNode;
  caption?: string;
}

const get = <T,>(c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]) as string | number | null | undefined;

/** Client-side table: search, sort, paginate, select, expand rows, CSV / Excel export. */
export function DataTable<T>({
  rows, columns, rowKey, searchPlaceholder = 'Search…', pageSize = 25, exportName, selectable, onSelectionChange, selectionActions, toolbar, empty, onRowClick, expand, caption,
}: DataTableProps<T>) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(get(c, r) ?? '').toLowerCase().includes(needle))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)!;
      out = [...out].sort((a, b) => {
        const va = get(col, a), vb = get(col, b);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'en-IN', { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const setSel = (next: Set<string>) => {
    setSelected(next);
    onSelectionChange?.([...next]);
  };
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(rowKey(r)));
  const exportCols = columns.map((c) => ({ header: c.header, value: (r: T) => get(c, r) }));

  return (
    <div className="rounded-card border border-border/70 bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchPlaceholder} aria-label="Search table"
            className="h-9 w-full rounded-sm border border-border bg-surface-muted pl-9 pr-3 text-sm placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
        {toolbar}
        {selectable && selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-sm bg-primary-soft px-2 py-1 text-sm text-primary-text">
            <span className="font-semibold">{selected.size} selected</span>
            {selectionActions?.([...selected], () => setSel(new Set()))}
          </div>
        )}
        {exportName && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => exportCsv(filtered, exportCols, exportName)}><Download /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx(filtered, exportCols, exportName)}><FileSpreadsheet /> Excel</Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <Checkbox aria-label="Select all on this page" checked={allVisibleSelected}
                    onChange={() => { const n = new Set(selected); visible.forEach((r) => { if (allVisibleSelected) n.delete(rowKey(r)); else n.add(rowKey(r)); }); setSel(n); }} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={cn('whitespace-nowrap px-3 py-2.5 font-semibold', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left', c.hideOnMobile && 'hidden md:table-cell')}>
                    {c.sortable !== false ? (
                      <button type="button" onClick={() => setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })} className="inline-flex items-center gap-1 uppercase hover:text-text">
                        {c.header}
                        {active ? (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const id = rowKey(r);
              const isOpen = expanded.has(id);
              return (
                <FragmentRow key={id}>
                  <tr
                    className={cn('border-t border-border transition-colors', (onRowClick || expand) && 'cursor-pointer hover:bg-surface-muted/50', selected.has(id) && 'bg-primary-soft/40')}
                    onClick={() => {
                      if (expand) { const n = new Set(expanded); if (isOpen) n.delete(id); else n.add(id); setExpanded(n); }
                      onRowClick?.(r);
                    }}
                  >
                    {selectable && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label="Select row" checked={selected.has(id)} onChange={() => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); }} />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                        {c.cell ? c.cell(r) : String(get(c, r) ?? '—')}
                      </td>
                    ))}
                  </tr>
                  {expand && isOpen && (
                    <tr className="border-t border-border bg-surface-muted/40">
                      <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-3">{expand(r)}</td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-3 py-12 text-center text-sm text-text-muted">{empty ?? 'No records match these filters.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm text-text-muted">
        <span>{filtered.length.toLocaleString('en-IN')} record{filtered.length === 1 ? '' : 's'}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft /></Button>
          <span className="tabular-nums">{current + 1} / {pages}</span>
          <Button variant="ghost" size="icon" className="size-8" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Summary chip row shown above reports. */
export function SummaryChips({ items }: { items: { label: string; value: string; tone?: 'primary' | 'accent' | 'highlight' | 'success' | 'danger' | 'neutral' }[] }) {
  const tones = { primary: 'bg-primary-soft text-primary-text', accent: 'bg-accent-soft text-accent-text', highlight: 'bg-highlight-soft text-highlight-text', success: 'bg-success-soft text-success', danger: 'bg-danger-soft text-danger', neutral: 'bg-surface-muted text-text' };
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map((i) => (
        <div key={i.label} className={cn('rounded-sm px-3 py-2', tones[i.tone ?? 'neutral'])}>
          <div className="text-xs font-medium opacity-90">{i.label}</div>
          <div className="text-lg font-bold tabular-nums">{i.value}</div>
        </div>
      ))}
    </div>
  );
}
