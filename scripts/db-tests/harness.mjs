import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export const root = path.resolve(import.meta.dirname, '../..');
const migDir = path.join(root, 'supabase/migrations');

export function latestBackup() {
  const dir = path.join(root, 'backups');
  if (!fs.existsSync(dir)) return null;
  const ds = fs.readdirSync(dir).sort();
  return ds.length ? path.join(dir, ds[ds.length - 1]) : null;
}

export const newMigrations = () => fs.readdirSync(migDir).filter(f => /^2026103100\d+_.*\.sql$/.test(f)).sort();

export async function createDb({ withBackup = true, migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(import.meta.dirname, 'baseline.sql'), 'utf8'));
  let backup = null;
  if (withBackup) {
    backup = latestBackup();
    if (backup) await loadBackup(db, backup);
  }
  if (migrate) {
    for (const f of newMigrations()) await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
    // test-only clock override
    await db.exec(`create or replace function public.app_now() returns timestamptz language sql stable as
      $$ select coalesce((select ts from public.test_clock limit 1), now()) $$;`);
  }
  return { db, backup };
}

async function loadBackup(db, dir) {
  const j = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const u of j('auth_users.json')) {
    await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [u.id, u.email]);
  }
  const order = ['users', 'admin_emails', 'app_settings', 'audiobooks', 'quiz_questions', 'books',
                 'activity_logs', 'reading_sessions', 'bonus_points', 'user_audiobook_progress', 'quiz_submissions'];
  for (const t of order) {
    const rows = j(`${t}.json`);
    if (!rows.length) continue;
    await db.query(`insert into public.${t} select * from json_populate_recordset(null::public.${t}, $1::json)`, [JSON.stringify(rows)]);
  }
}

export async function setClock(db, iso) {
  await db.exec('delete from public.test_clock');
  if (iso) await db.query('insert into public.test_clock (ts) values ($1)', [iso]);
}

// run SQL as a simulated Supabase caller: a user {id,email}, 'anon', or 'system' (direct DB connection)
export async function as(db, who, sql, params = []) {
  await db.exec('reset role');
  if (who === 'system') {
    await db.query("select set_config('request.jwt.claims', '', false)");
  } else {
    const claims = who === 'anon' ? { role: 'anon' } : { sub: who.id, email: who.email, role: 'authenticated' };
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`);
  }
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
