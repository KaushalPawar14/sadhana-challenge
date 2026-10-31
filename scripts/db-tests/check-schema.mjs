// Verifies that schema.sql builds a working database from nothing (fresh deploy).
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { root } from './harness.mjs';
const db = new PGlite();
const stub = fs.readFileSync(path.join(import.meta.dirname, 'baseline.sql'), 'utf8').split('create table public.admin_emails')[0];
await db.exec(stub);
await db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const n = (await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n;
const f = (await db.query("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'")).rows[0].n;
console.log(`fresh deploy OK: ${n} tables, ${f} functions`);
