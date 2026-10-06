-- =====================================================================
-- TeamNest · 0008 · Storage buckets & policies
-- Object path convention: {org_id}/{user_id}/{entity}/{uuid}.{ext}
-- Skipped automatically on plain Postgres (no storage schema).
-- =====================================================================
do $outer$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('avatars',      'avatars',      true,  2097152,  array['image/jpeg','image/png','image/webp']),
    ('documents',    'documents',    false, 10485760, array['application/pdf','image/jpeg','image/png']),
    ('kyc',          'kyc',          false, 10485760, array['application/pdf','image/jpeg','image/png']),
    ('payslips',     'payslips',     false, 5242880,  array['application/pdf']),
    ('invoices',     'invoices',     false, 5242880,  array['application/pdf']),
    ('recordings',   'recordings',   false, 52428800, array['audio/mpeg','audio/mp4','audio/aac','audio/wav']),
    ('visit-photos', 'visit-photos', false, 5242880,  array['image/jpeg','image/png','image/webp']),
    ('selfies',      'selfies',      false, 2097152,  array['image/jpeg','image/png','image/webp']),
    ('imports',      'imports',      false, 20971520, array['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  on conflict (id) do nothing;

  -- Upload into your own folder inside your org.
  execute $p$
    create policy "tn upload own folder" on storage.objects for insert to authenticated
    with check (
      bucket_id in ('avatars','documents','kyc','recordings','visit-photos','selfies','imports')
      and (storage.foldername(name))[1] = public.auth_org_id()::text
      and (storage.foldername(name))[2] = auth.uid()::text
    )$p$;

  -- Read: your own files; HR/Finance/Super Admin read org files; managers
  -- read their downline's visit photos and recordings; avatars are public.
  execute $p$
    create policy "tn read org files" on storage.objects for select to authenticated
    using (
      (storage.foldername(name))[1] = public.auth_org_id()::text
      and (
        (storage.foldername(name))[2] = auth.uid()::text
        or (bucket_id in ('documents','payslips') and public.has_role('hr_admin'))
        or (bucket_id in ('kyc','invoices','payslips') and public.has_role('finance','super_admin'))
        or (bucket_id in ('visit-photos','recordings','kyc','invoices')
            and public.reports_to_me(((storage.foldername(name))[2])::uuid))
        or bucket_id = 'avatars'
      )
    )$p$;

  -- Server-generated PDFs (payslips, invoices) are written with the service role.
  execute $p$
    create policy "tn delete own files" on storage.objects for delete to authenticated
    using ((storage.foldername(name))[2] = auth.uid()::text and bucket_id not in ('payslips','invoices','recordings'))
  $p$;
end
$outer$;
