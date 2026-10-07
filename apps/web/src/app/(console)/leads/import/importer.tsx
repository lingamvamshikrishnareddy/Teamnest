'use client';

import { useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { importLeads, type ImportRow } from '@teamnest/api-client';
import type { Tables } from '@teamnest/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldRow, Select } from '@/components/ui/form';
import { exportCsv } from '@/lib/export';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

const TARGETS: { key: keyof ImportRow; label: string; required?: boolean; aliases: string[] }[] = [
  { key: 'business_name', label: 'Business name', required: true, aliases: ['business', 'business name', 'company', 'name', 'shop', 'firm'] },
  { key: 'phone', label: 'Phone', required: true, aliases: ['phone', 'mobile', 'contact number', 'phone number', 'mobile number'] },
  { key: 'contact_name', label: 'Contact person', aliases: ['contact', 'contact name', 'owner', 'person'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'mail'] },
  { key: 'category', label: 'Category', aliases: ['category', 'type', 'industry'] },
  { key: 'segment', label: 'Segment (b2b/b2c)', aliases: ['segment'] },
  { key: 'locality', label: 'Locality', aliases: ['locality', 'area', 'location'] },
  { key: 'city', label: 'City', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', aliases: ['state'] },
  { key: 'pincode', label: 'Pincode', aliases: ['pincode', 'pin', 'zip', 'postal code'] },
  { key: 'tag', label: 'Tag', aliases: ['tag', 'label'] },
  { key: 'owner_email', label: 'Owner email', aliases: ['owner email', 'assign to', 'executive email', 'assigned to'] },
  { key: 'lat', label: 'Latitude', aliases: ['lat', 'latitude'] },
  { key: 'lng', label: 'Longitude', aliases: ['lng', 'lon', 'long', 'longitude'] },
];

type Batch = Tables<'import_batches'>;

export function Importer({ queues }: { queues: { code: string; name: string }[] }) {
  const { run, busy } = useAction();
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<keyof ImportRow, string>>>({});
  const [opts, setOpts] = useState({ queueCode: 'main', onDuplicate: 'skip' as 'skip' | 'update', assign: 'none' as 'none' | 'round_robin' | 'territory' });
  const [report, setReport] = useState<Batch | null>(null);
  const [done, setDone] = useState<Batch | null>(null);
  const [parsing, setParsing] = useState(false);

  const onFile = async (file: File) => {
    setParsing(true);
    setReport(null);
    setDone(null);
    try {
      let rows: Record<string, string>[] = [];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const { default: readXlsx } = await import('read-excel-file');
        const sheet = await readXlsx(file);
        const head = (sheet[0] ?? []).map((h) => String(h ?? '').trim());
        rows = sheet.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] == null ? '' : String(r[i])])));
      } else {
        const Papa = (await import('papaparse')).default;
        const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
        rows = parsed.data;
      }
      if (rows.length > 20000) throw new Error('Please split files larger than 20,000 rows.');
      const head = Object.keys(rows[0] ?? {});
      setHeaders(head);
      setRaw(rows);
      setFileName(file.name);
      // auto-map by header name
      const m: Partial<Record<keyof ImportRow, string>> = {};
      for (const t of TARGETS) {
        const hit = head.find((h) => t.aliases.includes(h.toLowerCase()) || h.toLowerCase() === t.key);
        if (hit) m[t.key] = hit;
      }
      setMapping(m);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  };

  const mapped = (): ImportRow[] =>
    raw.map((r) => Object.fromEntries(TARGETS.filter((t) => mapping[t.key]).map((t) => [t.key, String(r[mapping[t.key]!] ?? '').trim()])) as unknown as ImportRow);

  const ready = !!mapping.business_name && !!mapping.phone && raw.length > 0;

  const validate = () => run('validate', () => importLeads(getBrowserClient(), mapped(), { ...opts, dryRun: true }), (b) => `Checked ${b.total_rows} rows: ${b.valid_rows} ready`).then((b) => b && setReport(b));
  const commit = () => run('import', () => importLeads(getBrowserClient(), mapped(), { ...opts, dryRun: false }), (b) => `Imported ${b.valid_rows} leads`).then((b) => b && setDone(b));

  const template = () => exportCsv([{}], TARGETS.map((t) => ({ header: t.label === 'Segment (b2b/b2c)' ? 'segment' : t.key, value: () => '' })), 'teamnest-lead-template');
  const errors = ((report?.errors ?? []) as { row: number; field: string; message: string }[]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>1. Upload file</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-strong bg-surface-muted/50 px-6 py-10 text-center hover:border-primary">
            {parsing ? <Loader2 className="size-8 animate-spin text-primary-text" /> : <FileUp className="size-8 text-primary-text" />}
            <span className="font-semibold">{fileName ?? 'Choose a CSV or Excel file'}</span>
            <span className="text-sm text-text-muted">{fileName ? `${raw.length.toLocaleString('en-IN')} rows · ${headers.length} columns` : 'Up to 20,000 rows. First row must be headers.'}</span>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <Button variant="link" size="sm" onClick={template}><Download /> Download template</Button>

          {headers.length > 0 && (
            <>
              <h3 className="pt-2 font-semibold">2. Match columns</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGETS.map((t) => (
                  <FieldRow key={t.key} label={`${t.label}${t.required ? ' *' : ''}`} htmlFor={`m-${t.key}`}>
                    <Select id={`m-${t.key}`} value={mapping[t.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value || undefined })}>
                      <option value="">— not in file —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </Select>
                  </FieldRow>
                ))}
              </div>
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted text-left uppercase text-text-muted"><tr>{TARGETS.filter((t) => mapping[t.key]).map((t) => <th key={t.key} className="px-2 py-1.5">{t.label}</th>)}</tr></thead>
                  <tbody>{mapped().slice(0, 5).map((r, i) => <tr key={i} className="border-t border-border">{TARGETS.filter((t) => mapping[t.key]).map((t) => <td key={t.key} className="px-2 py-1.5">{r[t.key]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>3. Options</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FieldRow label="Add to queue" htmlFor="o-q"><Select id="o-q" value={opts.queueCode} onChange={(e) => setOpts({ ...opts, queueCode: e.target.value })}>{queues.map((q) => <option key={q.code} value={q.code}>{q.name}</option>)}</Select></FieldRow>
            <FieldRow label="If the phone already exists" htmlFor="o-d"><Select id="o-d" value={opts.onDuplicate} onChange={(e) => setOpts({ ...opts, onDuplicate: e.target.value as 'skip' })}><option value="skip">Skip the row</option><option value="update">Update missing details</option></Select></FieldRow>
            <FieldRow label="Assign new leads" htmlFor="o-a" hint="People on leave are skipped."><Select id="o-a" value={opts.assign} onChange={(e) => setOpts({ ...opts, assign: e.target.value as 'none' })}><option value="none">Leave unassigned</option><option value="round_robin">Round robin</option><option value="territory">By territory</option></Select></FieldRow>
            <Button className="w-full" variant="outline" disabled={!ready || busy !== null} onClick={validate}><ShieldCheck /> Check file (dry run)</Button>
            <Button className="w-full" disabled={!report || busy !== null || !!done || report.valid_rows === 0} onClick={commit}>Import {report ? `${report.valid_rows} leads` : ''}</Button>
          </CardContent>
        </Card>

        {report && (
          <Card>
            <CardHeader><CardTitle>{done ? 'Import complete' : 'Validation report'}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {done && <p className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" /> {done.valid_rows} leads imported.</p>}
              <div className="flex flex-wrap gap-2"><Badge tone="success">{report.valid_rows} ready</Badge><Badge tone="warning">{report.duplicate_rows} duplicates</Badge><Badge tone="danger">{report.error_rows} errors</Badge></div>
              {errors.length > 0 && (
                <>
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {errors.slice(0, 100).map((e, i) => <li key={i} className="rounded-xs bg-surface-muted px-2 py-1"><strong>Row {e.row + 1}</strong> · {e.field}: {e.message}</li>)}
                  </ul>
                  <Button variant="outline" size="sm" onClick={() => exportCsv(errors, [{ header: 'Row', value: (e) => e.row + 1 }, { header: 'Field', value: (e) => e.field }, { header: 'Problem', value: (e) => e.message }], 'import-errors')}><Download /> Download error report</Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
