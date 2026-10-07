import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { requireConsoleSession } from '@/lib/session';
import { getServerClient } from '@/lib/supabase/server';
import { SettingsView } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requireConsoleSession();
  const supabase = await getServerClient();
  const month = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7) + '-01';
  const [users, teams, territories, targets, outcomes, packages, chains, templates, settings] = await Promise.all([
    supabase.from('users').select('id, full_name, email, role, status, team_id, manager_id, last_seen_at, mfa_enrolled').order('full_name'),
    supabase.from('teams').select('id, name, lead_user_id, territory_id, is_active').order('name'),
    supabase.from('territories').select('id, name, code, kind, parent_id, pincodes').order('kind').order('name'),
    supabase.from('targets').select('id, user_id, metric, target_value, weightage_pct').eq('period_month', month),
    supabase.from('outcome_codes').select('*').order('sort_order'),
    supabase.from('packages').select('*').order('sort_order'),
    supabase.from('approval_chains').select('*').order('type').order('priority'),
    supabase.from('notification_templates').select('*').order('code'),
    supabase.from('app_settings').select('key, value, description').order('key'),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Organisation configuration. Every change here is recorded in the audit log." />
      <SettingsView
        month={month}
        users={users.data ?? []} teams={teams.data ?? []} territories={territories.data ?? []} targets={targets.data ?? []}
        outcomes={outcomes.data ?? []} packages={packages.data ?? []} chains={chains.data ?? []} templates={templates.data ?? []} settings={settings.data ?? []}
      />
    </>
  );
}
