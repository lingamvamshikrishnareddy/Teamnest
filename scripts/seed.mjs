#!/usr/bin/env node
/**
 * Loads the fictional demo dataset (supabase/seed.sql) into a database.
 *
 *   DATABASE_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres pnpm db:seed
 *   pnpm db:seed --force        # wipe the demo org (and its demo logins) first, then re-seed
 *
 * Safety:
 *   - refuses to run when APP_ENV=production (override: --allow-production)
 *   - idempotent: skips when the demo org already exists (unless --force)
 *   - runs in one transaction: all or nothing
 * The migrations must already be applied (`supabase db push` or db-test.sh).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_ORG = 'a0000000-0000-4000-8000-000000000001';

if (process.env.APP_ENV === 'production' && !args.has('--allow-production')) {
  console.error('✗ APP_ENV=production — refusing to load demo data. Pass --allow-production if you really mean it.');
  process.exit(1);
}
if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.error('✗ Set DATABASE_URL (or PGHOST/PGPORT/PGUSER/PGDATABASE).');
  process.exit(1);
}

const client = new pg.Client(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
await client.connect();

try {
  const { rows } = await client.query('select 1 from public.organizations where id = $1', [DEMO_ORG]);
  if (rows.length && !args.has('--force')) {
    console.log('• Demo data already present — nothing to do (use --force to reload).');
    process.exit(0);
  }

  const started = Date.now();
  await client.query('begin');
  if (rows.length) {
    console.log('• Removing existing demo org and demo logins…');
    // money & deals first (they restrict user deletion), then users, then the org (cascades the rest)
    for (const table of ['payment_events', 'receipts', 'incentives', 'payments', 'mandates', 'invoices', 'documents', 'deals', 'quotes']) {
      await client.query(`delete from public.${table} where org_id = $1`, [DEMO_ORG]);
    }
    await client.query('delete from public.users where org_id = $1', [DEMO_ORG]);
    await client.query("delete from auth.users where email like '%@teamnest.demo'");
    await client.query('delete from public.organizations where id = $1', [DEMO_ORG]);
  }
  console.log('• Loading supabase/seed.sql…');
  await client.query(readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8'));
  await client.query('commit');

  const counts = await client.query(`
    select (select count(*) from public.users where org_id = $1) as users,
           (select count(*) from public.leads where org_id = $1) as leads,
           (select count(*) from public.calls where org_id = $1) as calls,
           (select count(*) from public.deals where org_id = $1) as deals,
           (select count(*) from public.payments where org_id = $1) as payments`, [DEMO_ORG]);
  const c = counts.rows[0];
  console.log(`✓ Seeded in ${((Date.now() - started) / 1000).toFixed(1)}s — ${c.users} users, ${c.leads} leads, ${c.calls} calls, ${c.deals} deals, ${c.payments} payments`);
  console.log('  Logins: <name>@teamnest.demo / TeamNest@2026 (see README)');
} catch (e) {
  await client.query('rollback').catch(() => undefined);
  console.error('✗ Seed failed, nothing was written:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
