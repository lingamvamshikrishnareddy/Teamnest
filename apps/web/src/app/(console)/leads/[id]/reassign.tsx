'use client';

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { assignLeads, getAvailableAssignees } from '@teamnest/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldRow, Select, Textarea } from '@/components/ui/form';
import { getBrowserClient } from '@/lib/supabase/client';
import { useAction } from '@/lib/use-action';

export function ReassignButton({ leadId, currentOwner }: { leadId: string; currentOwner: string | null }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<{ user_id: string; full_name: string; open_leads: number }[]>([]);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  useEffect(() => { if (open) getAvailableAssignees(getBrowserClient()).then(setPeople).catch(() => setPeople([])); }, [open]);
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus /> {currentOwner ? 'Reassign' : 'Assign'}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={currentOwner ? 'Reassign lead' : 'Assign lead'}>
          <div className="space-y-4">
            <FieldRow label="Assign to" htmlFor="to">
              <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose…</option>
                {people.filter((p) => p.user_id !== currentOwner).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name} · {p.open_leads} open</option>)}
              </Select>
            </FieldRow>
            <FieldRow label="Reason" htmlFor="why"><Textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></FieldRow>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!to || busy === 'r'} onClick={async () => { const r = await run('r', () => assignLeads(getBrowserClient(), [leadId], to, reason || undefined), 'Lead assigned'); if (r !== undefined) setOpen(false); }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
