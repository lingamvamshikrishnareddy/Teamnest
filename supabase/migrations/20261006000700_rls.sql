-- =====================================================================
-- TeamNest · 0007 · Row-Level Security
-- Every table in `public` has RLS enabled. Patterns:
--   org      : org_id = auth_org_id()                (tenant isolation)
--   sales    : can_view_sales_of(owner)  → self, downline, Finance, Super Admin
--   hr       : can_view_hr_of(user)      → self, downline, HR Admin, Super Admin
--   config   : everyone in the org reads; the owning admin role writes
--   system   : written only by SECURITY DEFINER functions/triggers
-- Helper calls that don't depend on the row are wrapped in (select …) so
-- Postgres evaluates them once per statement (initPlan), not per row.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lock everything down first
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- The anonymous role gets nothing in public; signed-in users get table
-- privileges, and RLS decides which rows.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.audit_logs, public.number_sequences from authenticated;
grant select on public.audit_logs to authenticated;   -- rows filtered by policy below
revoke all on schema app from public;

-- Status changes to approved/rejected may only come from decide_approval()
-- (or service-role jobs), never from a direct client update.
create or replace function app.guard_status_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.status::text in ('approved', 'rejected')
     and old.status::text is distinct from new.status::text
     and current_setting('app.approval_context', true) is distinct from 'on' then
    raise exception 'Use the approvals inbox to approve or reject' using errcode = '42501';
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['leave_requests','reimbursements','requests','quotes','incentives'] loop
    execute format('create trigger %I_status_guard before update of status on public.%I for each row execute function app.guard_status_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Core
-- ---------------------------------------------------------------------
create policy org_select on public.organizations for select to authenticated
  using (id = (select public.auth_org_id()));
create policy org_update on public.organizations for update to authenticated
  using (id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated
  using ((select public.has_role('super_admin'))) with check ((select public.has_role('super_admin')));

create policy territories_select on public.territories for select to authenticated
  using (org_id = (select public.auth_org_id()));
create policy territories_write on public.territories for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy teams_select on public.teams for select to authenticated
  using (org_id = (select public.auth_org_id()));
create policy teams_write on public.teams for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin', 'area_manager')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin', 'area_manager')));

-- Directory: everyone in the org can see names/roles/teams (no sensitive data lives here).
create policy users_select on public.users for select to authenticated
  using (org_id = (select public.auth_org_id()));
create policy users_insert on public.users for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')));
create policy users_update on public.users for update to authenticated
  using (org_id = (select public.auth_org_id()) and (id = (select auth.uid()) or (select public.has_role('hr_admin', 'super_admin'))))
  with check (org_id = (select public.auth_org_id())
              and (role <> 'super_admin' or (select public.has_role('super_admin')) or id = (select auth.uid())));

create policy employees_select on public.employees for select to authenticated
  using (org_id = (select public.auth_org_id()) and (public.can_view_hr_of(user_id) or (select public.has_role('finance'))));
create policy employees_write on public.employees for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')));

-- Ciphertext + last4 only; writes go through set_employee_sensitive().
create policy employee_sensitive_select on public.employee_sensitive for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (select public.has_role('hr_admin', 'finance'))
    or exists (select 1 from public.employees e where e.id = employee_id and e.user_id = (select auth.uid()))));

-- ---------------------------------------------------------------------
-- Sales: configuration
-- ---------------------------------------------------------------------
create policy outcome_codes_select on public.outcome_codes for select to authenticated using (org_id = (select public.auth_org_id()));
create policy outcome_codes_write on public.outcome_codes for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy lead_queues_select on public.lead_queues for select to authenticated using (org_id = (select public.auth_org_id()));
create policy lead_queues_write on public.lead_queues for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy packages_select on public.packages for select to authenticated using (org_id = (select public.auth_org_id()));
create policy packages_write on public.packages for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

-- ---------------------------------------------------------------------
-- Sales: leads & activity
-- ---------------------------------------------------------------------
create policy leads_select on public.leads for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    owner_id = (select auth.uid())
    or (owner_id is null and (select public.has_role('team_lead', 'area_manager', 'super_admin', 'finance')))
    or (owner_id is not null and public.can_view_sales_of(owner_id))));
create policy leads_insert on public.leads for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (
    owner_id = (select auth.uid())
    or ((select public.has_role('team_lead', 'area_manager', 'super_admin'))
        and (owner_id is null or public.same_org_user(owner_id)))));
create policy leads_update on public.leads for update to authenticated
  using (org_id = (select public.auth_org_id()) and (
    owner_id = (select auth.uid())
    or (select public.has_role('super_admin'))
    or ((select public.has_role('team_lead', 'area_manager')) and (owner_id is null or public.reports_to_me(owner_id)))))
  with check (org_id = (select public.auth_org_id()) and (
    owner_id = (select auth.uid())
    or ((select public.has_role('team_lead', 'area_manager', 'super_admin')) and (owner_id is null or public.same_org_user(owner_id)))));
create policy leads_delete on public.leads for delete to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy lead_assignments_select on public.lead_assignments for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    public.can_view_sales_of(to_user_id) or public.can_view_sales_of(from_user_id)
    or (select public.has_role('super_admin'))));
create policy lead_assignments_insert on public.lead_assignments for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (
    (select public.has_role('team_lead', 'area_manager', 'super_admin'))
    or (method = 'self' and to_user_id = (select auth.uid()))));

-- calls / visits / outcomes / follow_ups / meetings share one shape:
-- read = sales visibility of the actor; write = the actor themself.
do $$
declare t text;
begin
  foreach t in array array['calls','visits','outcomes','follow_ups','meetings'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (org_id = (select public.auth_org_id()) and public.can_view_sales_of(user_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()));
    $f$, t);
  end loop;
  -- mutable activity: owner or their managers (reschedule, check-out, mark done)
  foreach t in array array['visits','follow_ups','meetings'] loop
    execute format($f$
      create policy %1$s_update on public.%1$I for update to authenticated
        using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or public.reports_to_me(user_id)))
        with check (org_id = (select public.auth_org_id()) and public.same_org_user(user_id));
    $f$, t);
  end loop;
  foreach t in array array['follow_ups','meetings'] loop
    execute format($f$
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Sales: quotes, deals, money
-- ---------------------------------------------------------------------
create policy quotes_select on public.quotes for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_sales_of(created_by));
create policy quotes_insert on public.quotes for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and created_by = (select auth.uid()));
create policy quotes_update on public.quotes for update to authenticated
  using (org_id = (select public.auth_org_id()) and (created_by = (select auth.uid()) or public.reports_to_me(created_by) or (select public.has_role('super_admin'))))
  with check (org_id = (select public.auth_org_id()));

create policy deals_select on public.deals for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_sales_of(owner_id));
create policy deals_insert on public.deals for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (
    owner_id = (select auth.uid())
    or ((select public.has_role('team_lead', 'area_manager', 'super_admin')) and public.same_org_user(owner_id))));
create policy deals_update on public.deals for update to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (select public.has_role('finance', 'super_admin'))
    or (owner_id = (select auth.uid()) and status = 'pending_payment')
    or public.reports_to_me(owner_id)))
  with check (org_id = (select public.auth_org_id()));

-- payments, mandates, invoices: visible with the deal; created by the deal
-- owner (collection in the field) or Finance; updated by Finance only
-- (gateway webhooks use the service role and bypass RLS).
do $$
declare t text;
begin
  foreach t in array array['payments','mandates','invoices'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (org_id = (select public.auth_org_id()) and exists (select 1 from public.deals d where d.id = deal_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (org_id = (select public.auth_org_id()) and (
          (select public.has_role('finance', 'super_admin'))
          or exists (select 1 from public.deals d where d.id = deal_id and d.owner_id = (select auth.uid()))));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (org_id = (select public.auth_org_id()) and (select public.has_role('finance', 'super_admin')))
        with check (org_id = (select public.auth_org_id()));
    $f$, t);
  end loop;
end $$;

create policy receipts_select on public.receipts for select to authenticated
  using (org_id = (select public.auth_org_id()) and exists (select 1 from public.payments p where p.id = payment_id));
create policy receipts_insert on public.receipts for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and exists (select 1 from public.payments p where p.id = payment_id));

create policy targets_select on public.targets for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (user_id is not null and public.can_view_sales_of(user_id))
    or (user_id is null and (team_id = (select u.team_id from public.users u where u.id = (select auth.uid()))
                             or (select public.has_role('team_lead', 'area_manager', 'super_admin', 'hr_admin'))))
    or (select public.has_role('hr_admin'))));
create policy targets_write on public.targets for all to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (select public.has_role('super_admin'))
    or ((select public.has_role('team_lead', 'area_manager')) and user_id is not null and public.reports_to_me(user_id))))
  with check (org_id = (select public.auth_org_id()) and (
    (select public.has_role('super_admin'))
    or ((select public.has_role('team_lead', 'area_manager')) and user_id is not null and public.reports_to_me(user_id))));

-- Rollups are maintained by triggers only.
create policy daily_kpis_select on public.daily_kpis for select to authenticated
  using (org_id = (select public.auth_org_id()) and (public.can_view_sales_of(user_id) or (select public.has_role('hr_admin'))));

create policy ratings_select on public.ratings for select to authenticated
  using (org_id = (select public.auth_org_id()) and (lead_id is not null or public.can_view_hr_of(subject_user_id)));
create policy ratings_insert on public.ratings for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and given_by = (select auth.uid()) and (
    (subject_user_id is not null and (public.reports_to_me(subject_user_id) or (select public.has_role('hr_admin'))))
    or (lead_id is not null and source = 'customer')));

-- ---------------------------------------------------------------------
-- HR: configuration (HR Admin / Super Admin write)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shifts','geofences','leave_types','holidays','document_categories','appraisal_cycles'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (org_id = (select public.auth_org_id()));
      create policy %1$s_write on public.%1$I for all to authenticated
        using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')))
        with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- HR: employee data
-- ---------------------------------------------------------------------
-- Punches go through punch_in()/punch_out(); direct writes are HR only.
create policy attendance_select on public.attendance for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_hr_of(user_id));
create policy attendance_hr_write on public.attendance for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')));

create policy attendance_locks_select on public.attendance_locks for select to authenticated
  using (org_id = (select public.auth_org_id()));
create policy attendance_locks_write on public.attendance_locks for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin')));

create policy leave_balances_select on public.leave_balances for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_hr_of(user_id));
create policy leave_balances_write on public.leave_balances for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin')));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_hr_of(user_id));
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()) and status = 'pending');
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or (select public.has_role('hr_admin'))))
  with check (org_id = (select public.auth_org_id()));

create policy payslips_select on public.payslips for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (user_id = (select auth.uid()) and status = 'published')
    or (select public.has_role('hr_admin', 'finance'))));
create policy payslips_write on public.payslips for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'finance')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'finance')));

-- Employee vault: owner + HR. KYC docs: whoever can see the lead + Finance.
create policy documents_select on public.documents for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (owner_user_id is not null and (owner_user_id = (select auth.uid()) or (select public.has_role('hr_admin'))))
    or (lead_id is not null and ((select public.has_role('finance', 'super_admin'))
                                 or exists (select 1 from public.leads l where l.id = lead_id)))));
create policy documents_insert on public.documents for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (
    (owner_user_id is not null and (owner_user_id = (select auth.uid()) or (select public.has_role('hr_admin'))))
    or (lead_id is not null and exists (select 1 from public.leads l where l.id = lead_id))));
create policy documents_update on public.documents for update to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (select public.has_role('hr_admin')) and owner_user_id is not null
    or (select public.has_role('finance', 'super_admin')) and lead_id is not null
    or (uploaded_by = (select auth.uid()) and status in ('pending', 'rejected'))))
  with check (org_id = (select public.auth_org_id()));

-- Grievances are visible to HR only (and to the author when not anonymous).
create policy requests_select on public.requests for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    user_id = (select auth.uid())
    or (select public.has_role('hr_admin'))
    or (type <> 'grievance' and (select public.has_role('super_admin')))
    or (type <> 'grievance' and user_id is not null and public.reports_to_me(user_id))));
create policy requests_insert on public.requests for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and status = 'pending' and (
    (user_id = (select auth.uid()) and not is_anonymous)
    or (user_id is null and is_anonymous and type = 'grievance')));
create policy requests_update on public.requests for update to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or (select public.has_role('hr_admin'))))
  with check (org_id = (select public.auth_org_id()));

create policy policies_select on public.policies for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (select public.has_role('hr_admin', 'super_admin'))
    or (published_at <= now() and (expires_at is null or expires_at > now())
        and (audience_roles is null or (select public.auth_role()) = any(audience_roles)))));
create policy policies_write on public.policies for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin', 'super_admin')));

create policy policy_ack_select on public.policy_acknowledgements for select to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or (select public.has_role('hr_admin', 'super_admin'))));
create policy policy_ack_insert on public.policy_acknowledgements for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()));

create policy goals_select on public.goals for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_hr_of(user_id));
create policy goals_write on public.goals for all to authenticated
  using (org_id = (select public.auth_org_id()) and ((select public.has_role('hr_admin', 'super_admin')) or public.reports_to_me(user_id)))
  with check (org_id = (select public.auth_org_id()) and ((select public.has_role('hr_admin', 'super_admin')) or public.reports_to_me(user_id)));

create policy appraisals_select on public.appraisals for select to authenticated
  using (org_id = (select public.auth_org_id()) and public.can_view_hr_of(user_id));
create policy appraisals_update on public.appraisals for update to authenticated
  using (org_id = (select public.auth_org_id()) and (
    user_id = (select auth.uid()) or reviewer_id = (select auth.uid()) or public.reports_to_me(user_id)
    or (select public.has_role('hr_admin'))))
  with check (org_id = (select public.auth_org_id()));
create policy appraisals_insert on public.appraisals for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('hr_admin')));

create policy reimbursements_select on public.reimbursements for select to authenticated
  using (org_id = (select public.auth_org_id()) and (public.can_view_hr_of(user_id) or (select public.has_role('finance'))));
create policy reimbursements_insert on public.reimbursements for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()) and status = 'pending');
create policy reimbursements_update on public.reimbursements for update to authenticated
  using (org_id = (select public.auth_org_id()) and (
    (user_id = (select auth.uid()) and status = 'pending') or (select public.has_role('finance', 'hr_admin'))))
  with check (org_id = (select public.auth_org_id()));

create policy incentives_select on public.incentives for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    user_id = (select auth.uid()) or public.reports_to_me(user_id)
    or (select public.has_role('finance', 'hr_admin', 'super_admin'))));
create policy incentives_write on public.incentives for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('finance', 'super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('finance', 'super_admin')));

-- ---------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------
create policy files_select on public.files for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    owner_user_id = (select auth.uid()) or not is_sensitive
    or (select public.has_role('hr_admin', 'finance', 'super_admin'))));
create policy files_insert on public.files for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and owner_user_id = (select auth.uid()));
create policy files_delete on public.files for delete to authenticated
  using (org_id = (select public.auth_org_id()) and owner_user_id = (select auth.uid()));

create policy approval_chains_select on public.approval_chains for select to authenticated using (org_id = (select public.auth_org_id()));
create policy approval_chains_write on public.approval_chains for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

-- Approvals are created/decided only via request_approval()/decide_approval().
create policy approvals_select on public.approvals for select to authenticated
  using (org_id = (select public.auth_org_id()) and (
    requested_by = (select auth.uid()) or approver_id = (select auth.uid())
    or approver_role = (select public.auth_role())
    or (select public.has_role('super_admin'))
    or (requested_by is not null and public.reports_to_me(requested_by))));

create policy notification_templates_select on public.notification_templates for select to authenticated using (org_id = (select public.auth_org_id()));
create policy notification_templates_write on public.notification_templates for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy app_settings_select on public.app_settings for select to authenticated using (org_id = (select public.auth_org_id()));
create policy app_settings_write on public.app_settings for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('super_admin')));

create policy consents_select on public.consents for select to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or (select public.has_role('hr_admin'))));
create policy consents_insert on public.consents for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid()));

create policy location_pings_select on public.location_pings for select to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or public.reports_to_me(user_id)));
create policy location_pings_insert on public.location_pings for insert to authenticated
  with check (org_id = (select public.auth_org_id()) and user_id = (select auth.uid())
              and public.can_track_location((select auth.uid()), recorded_at));

create policy import_batches_rw on public.import_batches for all to authenticated
  using (org_id = (select public.auth_org_id()) and (select public.has_role('team_lead', 'area_manager', 'super_admin')))
  with check (org_id = (select public.auth_org_id()) and (select public.has_role('team_lead', 'area_manager', 'super_admin')));

create policy saved_views_select on public.saved_views for select to authenticated
  using (org_id = (select public.auth_org_id()) and (user_id = (select auth.uid()) or is_shared));
create policy saved_views_write on public.saved_views for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and org_id = (select public.auth_org_id()));

-- number_sequences: RLS on, no policies → only definer functions touch it.

-- ---------------------------------------------------------------------
-- RPCs for actions that must not be raw table writes
-- ---------------------------------------------------------------------
-- Punch in: GPS required, optional selfie, geofence matched, late flag
-- computed from the employee's shift. Idempotent for the day.
create or replace function public.punch_in(p_lat double precision, p_lng double precision, p_selfie_file_id uuid default null)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_org uuid := public.auth_org_id();
  v_day date := public.ist_today(); v_shift public.shifts%rowtype; v_fence uuid; a public.attendance%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select s.* into v_shift from public.employees e join public.shifts s on s.id = e.shift_id where e.user_id = v_uid;
  select g.id into v_fence from public.geofences g
  where g.org_id = v_org and g.is_active and public.distance_m(p_lat, p_lng, g.lat, g.lng) <= g.radius_m
  order by public.distance_m(p_lat, p_lng, g.lat, g.lng) limit 1;

  insert into public.attendance as t (org_id, user_id, day, status, source, shift_id, punch_in_at, punch_in_lat, punch_in_lng,
                                      punch_in_geofence_id, punch_in_selfie_file_id, is_late)
  values (v_org, v_uid, v_day, 'present', 'punch', v_shift.id, now(), p_lat, p_lng, v_fence, p_selfie_file_id,
          coalesce((now() at time zone 'Asia/Kolkata')::time > v_shift.start_time + make_interval(mins => v_shift.grace_minutes), false))
  on conflict (user_id, day) do update set
    punch_in_at = coalesce(t.punch_in_at, excluded.punch_in_at),
    punch_in_lat = coalesce(t.punch_in_lat, excluded.punch_in_lat),
    punch_in_lng = coalesce(t.punch_in_lng, excluded.punch_in_lng),
    punch_in_geofence_id = coalesce(t.punch_in_geofence_id, excluded.punch_in_geofence_id),
    punch_in_selfie_file_id = coalesce(t.punch_in_selfie_file_id, excluded.punch_in_selfie_file_id),
    shift_id = coalesce(t.shift_id, excluded.shift_id),
    is_late = case when t.punch_in_at is null then excluded.is_late else t.is_late end,
    status = case when t.status in ('absent') then 'present'::public.attendance_status else t.status end
  returning * into a;
  return a;
end;
$$;

create or replace function public.punch_out(p_lat double precision, p_lng double precision)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare a public.attendance%rowtype; v_shift public.shifts%rowtype;
begin
  update public.attendance t set punch_out_at = now(), punch_out_lat = p_lat, punch_out_lng = p_lng
  where t.user_id = auth.uid() and t.day = public.ist_today() and t.punch_in_at is not null
  returning * into a;
  if not found then raise exception 'Punch in first' using errcode = 'P0002'; end if;

  select s.* into v_shift from public.shifts s where s.id = a.shift_id;
  if v_shift.id is not null and a.work_minutes < v_shift.half_day_minutes then
    update public.attendance set status = 'half_day' where id = a.id returning * into a;
  end if;
  return a;
end;
$$;

-- ---------------------------------------------------------------------
-- Function privileges: nothing for anon; signed-in users may call the
-- public API functions (each one re-checks the caller's role/org itself).
-- ---------------------------------------------------------------------
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
  execute 'grant execute on all functions in schema public to authenticated';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    -- server-side jobs & Edge Functions (bypass RLS; never shipped to clients)
    execute 'grant usage on schema public to service_role';
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
    execute 'alter default privileges in schema public grant all on tables to service_role';
    execute 'alter default privileges in schema public grant all on sequences to service_role';
  end if;
end $$;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated;
