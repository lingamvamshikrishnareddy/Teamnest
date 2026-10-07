#!/usr/bin/env node
// Generates packages/types/src/database.ts from a migrated Postgres database,
// in the same shape as `supabase gen types typescript` (so supabase-js
// generics work), but without needing Docker or the Supabase CLI.
//
//   PGHOST=/tmp PGPORT=54322 PGUSER=postgres TEST_DB=teamnest_test node scripts/gen-db-types.mjs
//
// With a running Supabase stack you can use `supabase gen types typescript --local` instead.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = process.env.TEST_DB ?? 'teamnest_test';

const sql = String.raw`
with cols as (
  select c.relname as table_name, c.relkind, a.attname as column_name, a.attnum,
         not a.attnotnull as nullable,
         (a.atthasdef or a.attidentity <> '') as has_default,
         a.attgenerated <> '' as generated,
         t.typname as udt_name, tn.nspname as udt_schema, t.typtype, t.typcategory,
         et.typname as elem_name, etn.nspname as elem_schema, et.typtype as elem_typtype
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  join pg_namespace tn on tn.oid = t.typnamespace
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  left join pg_namespace etn on etn.oid = et.typnamespace
  where c.relkind in ('r', 'v', 'm')
),
fks as (
  select con.conname as name, src.relname as table_name,
         array_agg(sa.attname order by k.ord) as columns,
         tgt.relname as referenced_relation,
         array_agg(ta.attname order by k.ord) as referenced_columns,
         exists (select 1 from pg_index i where i.indrelid = con.conrelid and i.indisunique
                 and (i.indkey::int2[])::int2[] @> con.conkey and array_length(i.indkey::int2[], 1) = array_length(con.conkey, 1)) as is_one_to_one
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_namespace sn on sn.oid = src.relnamespace and sn.nspname = 'public'
  join pg_class tgt on tgt.oid = con.confrelid
  join pg_namespace tns on tns.oid = tgt.relnamespace and tns.nspname = 'public'
  cross join lateral unnest(con.conkey, con.confkey) with ordinality as k(src_att, tgt_att, ord)
  join pg_attribute sa on sa.attrelid = con.conrelid and sa.attnum = k.src_att
  join pg_attribute ta on ta.attrelid = con.confrelid and ta.attnum = k.tgt_att
  where con.contype = 'f'
  group by con.conname, src.relname, tgt.relname, con.conrelid, con.conkey
),
enums as (
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
  group by t.typname
),
fns as (
  select p.proname as name, p.proretset as returns_set,
         rt.typname as ret_type, rt.typtype as ret_typtype, rtn.nspname as ret_schema, rt.typrelid <> 0 as ret_is_composite,
         coalesce((select json_agg(json_build_object('name', p.proargnames[i], 'type', at.typname, 'typtype', at.typtype,
                                                     'category', at.typcategory, 'elem', aet.typname,
                                                     'has_default', i > p.pronargs - p.pronargdefaults) order by i)
                   from unnest(p.proargtypes::oid[]) with ordinality as x(type_oid, i)
                   join pg_type at on at.oid = x.type_oid
                   left join pg_type aet on aet.oid = at.typelem and at.typcategory = 'A'), '[]'::json) as args,
         (select json_agg(json_build_object('name', p.proargnames[i], 'type', ot.typname, 'typtype', ot.typtype,
                                            'category', ot.typcategory, 'elem', oet.typname) order by i)
          from generate_subscripts(p.proallargtypes, 1) i
          join pg_type ot on ot.oid = p.proallargtypes[i]
          left join pg_type oet on oet.oid = ot.typelem and ot.typcategory = 'A'
          where p.proargmodes[i] in ('o', 't')) as out_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  join pg_type rt on rt.oid = p.prorettype
  join pg_namespace rtn on rtn.oid = rt.typnamespace
  where p.prokind = 'f' and rt.typname not in ('trigger', 'event_trigger')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
)
select json_build_object(
  'columns', (select json_agg(row_to_json(cols) order by table_name, attnum) from cols),
  'fks', (select coalesce(json_agg(row_to_json(fks) order by table_name, name), '[]') from fks),
  'enums', (select coalesce(json_agg(row_to_json(enums) order by name), '[]') from enums),
  'fns', (select coalesce(json_agg(row_to_json(fns) order by name), '[]') from fns)
)`;

const raw = execFileSync('psql', ['-X', '-tA', '-d', db, '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const meta = JSON.parse(raw);

const enumNames = new Set(meta.enums.map((e) => e.name));
const tableNames = new Set(meta.columns.map((c) => c.table_name));

const scalar = (name) => {
  if (enumNames.has(name)) return `Database["public"]["Enums"]["${name}"]`;
  if (tableNames.has(name)) return `Database["public"]["Tables"]["${name}"]["Row"]`;
  switch (name) {
    case 'int2': case 'int4': case 'int8': case 'float4': case 'float8': case 'numeric': return 'number';
    case 'bool': return 'boolean';
    case 'json': case 'jsonb': return 'Json';
    case 'void': return 'undefined';
    case 'record': return 'Record<string, unknown>';
    default: return 'string';
  }
};
const tsType = (col) => {
  if (col.typcategory === 'A' || col.category === 'A') return `${scalar(col.elem_name ?? col.elem)}[]`;
  return scalar(col.udt_name ?? col.type);
};

const byTable = new Map();
for (const c of meta.columns) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, { kind: c.relkind, cols: [] });
  byTable.get(c.table_name).cols.push(c);
}

const q = (s) => (/^[a-z_][a-z0-9_]*$/i.test(s) ? s : JSON.stringify(s));
const ind = (n) => '  '.repeat(n);

function relationships(table) {
  const rels = meta.fks.filter((f) => f.table_name === table);
  if (!rels.length) return '[]';
  return `[\n${rels
    .map(
      (r) =>
        `${ind(6)}{\n${ind(7)}foreignKeyName: "${r.name}"\n${ind(7)}columns: [${r.columns.map((c) => `"${c}"`).join(', ')}]\n` +
        `${ind(7)}isOneToOne: ${r.is_one_to_one}\n${ind(7)}referencedRelation: "${r.referenced_relation}"\n` +
        `${ind(7)}referencedColumns: [${r.referenced_columns.map((c) => `"${c}"`).join(', ')}]\n${ind(6)}},`,
    )
    .join('\n')}\n${ind(5)}]`;
}

// NOT NULL columns that BEFORE INSERT triggers fill (human-friendly numbers) — optional on insert.
const TRIGGER_FILLED = new Set([
  'leads.lead_code', 'quotes.quote_no', 'deals.deal_no', 'invoices.invoice_no', 'receipts.receipt_no', 'requests.request_no',
]);

function tableBlock(name, { cols }, isView) {
  const row = cols.map((c) => `${ind(6)}${q(c.column_name)}: ${tsType(c)}${c.nullable ? ' | null' : ''}`).join('\n');
  const insert = cols
    .map((c) => {
      if (c.generated) return `${ind(6)}${q(c.column_name)}?: never`;
      const opt = c.nullable || c.has_default || isView || TRIGGER_FILLED.has(`${name}.${c.column_name}`);
      return `${ind(6)}${q(c.column_name)}${opt ? '?' : ''}: ${tsType(c)}${c.nullable ? ' | null' : ''}`;
    })
    .join('\n');
  const update = cols
    .map((c) => (c.generated ? `${ind(6)}${q(c.column_name)}?: never` : `${ind(6)}${q(c.column_name)}?: ${tsType(c)}${c.nullable ? ' | null' : ''}`))
    .join('\n');
  return `${ind(4)}${q(name)}: {\n${ind(5)}Row: {\n${row}\n${ind(5)}}\n${ind(5)}Insert: {\n${insert}\n${ind(5)}}\n${ind(5)}Update: {\n${update}\n${ind(5)}}\n${ind(5)}Relationships: ${relationships(name)}\n${ind(4)}}`;
}

const tables = [...byTable].filter(([, t]) => t.kind === 'r');
const views = [...byTable].filter(([, t]) => t.kind !== 'r');

// Overloads collapse to the first definition (none exist today).
const seenFns = new Set();
const fnBlocks = meta.fns
  .filter((f) => !seenFns.has(f.name) && seenFns.add(f.name))
  .map((f) => {
    const args = f.args.filter((a) => a.name);
    const argsTs = args.length
      ? `{\n${args.map((a) => `${ind(7)}${q(a.name)}${a.has_default ? '?' : ''}: ${tsType(a)}`).join('\n')}\n${ind(6)}}`
      : 'Record<PropertyKey, never>';
    let ret;
    if (f.out_args?.length) {
      ret = `{\n${f.out_args.map((a) => `${ind(7)}${q(a.name)}: ${tsType(a)}`).join('\n')}\n${ind(6)}}`;
    } else if (f.ret_is_composite && tableNames.has(f.ret_type)) {
      ret = `Database["public"]["Tables"]["${f.ret_type}"]["Row"]`;
    } else {
      ret = scalar(f.ret_type);
    }
    if (f.returns_set) ret = `${ret}[]`;
    return `${ind(4)}${q(f.name)}: {\n${ind(5)}Args: ${argsTs}\n${ind(5)}Returns: ${ret}\n${ind(4)}}`;
  });

const out = `// AUTO-GENERATED by scripts/gen-db-types.mjs — do not edit by hand.
// Regenerate after changing supabase/migrations: pnpm db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${tables.map(([n, t]) => tableBlock(n, t, false)).join('\n')}
    }
    Views: {
${views.map(([n, t]) => tableBlock(n, t, true)).join('\n')}
    }
    Functions: {
${fnBlocks.join('\n')}
    }
    Enums: {
${meta.enums.map((e) => `${ind(4)}${q(e.name)}: ${e.labels.map((l) => JSON.stringify(l)).join(' | ')}`).join('\n')}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
export type Functions<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T];

export const Constants = {
  public: {
    Enums: {
${meta.enums.map((e) => `${ind(3)}${q(e.name)}: [${e.labels.map((l) => JSON.stringify(l)).join(', ')}],`).join('\n')}
    },
  },
} as const;
`;

const target = path.join(root, 'packages/types/src/database.ts');
writeFileSync(target, out);
console.log(`wrote ${path.relative(root, target)} — ${tables.length} tables, ${views.length} views, ${fnBlocks.length} functions, ${meta.enums.length} enums`);
