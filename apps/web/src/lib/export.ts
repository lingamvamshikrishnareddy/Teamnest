'use client';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const lines = [columns.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))];
  // BOM so Excel opens UTF-8 (₹, Hindi, Telugu) correctly
  download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export async function exportXlsx<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const data = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      return typeof v === 'number' ? { type: Number, value: v } : { type: String, value: v === null || v === undefined ? '' : String(v) };
    }),
  );
  await writeXlsxFile([header, ...data] as never, { fileName: filename.endsWith('.xlsx') ? filename : `${filename}.xlsx` });
}
