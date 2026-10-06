# TeamNest

Field Sales & Lead Management + Employee HR self-service, delivered as a **mobile app** (executives, team leads) and a **web console** (managers, HR, finance, admins) on one Supabase backend.

> Placeholder brand. All names, logos, people, businesses and numbers in this repo are original or fictional.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, Supabase schema + RLS, auth + roles, design system | ✅ done |
| 2 | Mobile Home, leads, lead detail, outcomes, call logging | next |
| 3–7 | See [docs/SPEC.md](docs/SPEC.md) §8 | planned |

## Repo layout

```
apps/
  web/            Next.js 15 (App Router) + Tailwind + shadcn/ui — web console
  mobile/         Expo SDK 54 + Expo Router + NativeWind — iOS/Android app
packages/
  types/          Generated Database types, roles, permissions, navigation
  ui/             Design tokens, Tailwind preset, theme.css, ₹/IST formatters, i18n (en/hi/te)
  api-client/     Typed Supabase client, auth + MFA, shared queries
supabase/
  migrations/     8 SQL migrations (schema, functions, RLS, storage)
  seed.sql        Deterministic fictional demo data
  tests/          RLS + critical-flow assertions (plain Postgres)
scripts/
  db-test.sh      Migrate + seed + test on any Postgres (no Docker)
  gen-db-types.mjs  Regenerate packages/types/src/database.ts
  local-stack/    Docker-free Supabase-compatible stack (Auth + PostgREST + gateway)
docs/             SPEC.md (original brief), ARCHITECTURE.md
```

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env.local     # fill in Supabase URL + anon key
cp .env.example apps/mobile/.env

# Option A — Supabase CLI (Docker)
supabase start && supabase db reset     # applies migrations + seed

# Option B — no Docker (needs a Postgres + the Auth/PostgREST binaries)
PGHOST=... AUTH_BIN=... POSTGREST_BIN=... ./scripts/local-stack/start.sh

pnpm dev:web        # http://localhost:3000
pnpm dev:mobile     # Expo
```

Demo logins (password `TeamNest@2026`): `aarav@` Super Admin · `kavya@` HR Admin · `rohan@` Finance · `meera@` Area Manager · `sanjana@` Team Lead · `priya@` Executive — all `@teamnest.demo`. HR, Finance and Super Admin are asked to enrol TOTP MFA on first web sign-in.

## Checks

```bash
pnpm typecheck && pnpm test          # TS + unit tests (tokens contrast, formatters, i18n, permissions)
pnpm db:test                         # migrations + seed + 66 RLS/flow assertions
pnpm --filter @teamnest/web build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, security model and design tokens.
