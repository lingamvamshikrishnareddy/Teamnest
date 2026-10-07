import type { Metadata } from 'next';
import { formatDateTime } from '@teamnest/ui';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { Importer } from './importer';

export const metadata: Metadata = { title: 'Import leads' };

export default async function ImportPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const [queues, batches] = await Promise.all([
    supabase.from('lead_queues').select('code, name').eq('is_active', true).order('priority'),
    supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  return (
    <>
      <PageHeader title="Import leads" description="Upload a CSV or Excel file. We check every row, flag duplicates, and show you a report before anything is saved." />
      <Importer queues={queues.data ?? []} />
      <Card className="mt-6">
        <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-text-muted"><tr><th className="py-2">When</th><th>Status</th><th className="text-right">Rows</th><th className="text-right">Imported</th><th className="text-right">Duplicates</th><th className="text-right">Errors</th></tr></thead>
            <tbody>
              {(batches.data ?? []).map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-2">{formatDateTime(b.created_at)}</td>
                  <td><Badge tone={b.status === 'completed' ? 'success' : b.status === 'validated' ? 'info' : 'neutral'}>{b.status === 'validated' ? 'dry run' : b.status}</Badge></td>
                  <td className="text-right tabular-nums">{b.total_rows}</td><td className="text-right tabular-nums">{b.valid_rows}</td>
                  <td className="text-right tabular-nums">{b.duplicate_rows}</td><td className="text-right tabular-nums">{b.error_rows}</td>
                </tr>
              ))}
              {!batches.data?.length && <tr><td colSpan={6} className="py-6 text-center text-text-muted">No imports yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
