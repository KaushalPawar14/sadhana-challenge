// Applies supabase/migrations/20261031000*.sql to the LIVE project through the Supabase Management API.
// Needs a personal access token (https://supabase.com/dashboard/account/tokens):
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-migrations.mjs --yes
// Refuses to run unless a fresh backup exists (node scripts/backup-live.mjs) and --yes is given.
// Each file is one request = one transaction on the Supabase side; re-running is safe
// (000400 skips itself once Competition 1 exists).
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN (sbp_...)'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error('This changes the LIVE database. Re-run with --yes.'); process.exit(1); }

const root = path.resolve(import.meta.dirname, '..');
const backups = path.join(root, 'backups');
if (!fs.existsSync(backups) || !fs.readdirSync(backups).length) { console.error('No backup found. Run: node scripts/backup-live.mjs'); process.exit(1); }

const env = {};
for (const l of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const dir = path.join(root, 'supabase/migrations');
// pass file names to apply only those, e.g.  node scripts/apply-migrations.mjs --yes 20261031000800_x.sql
const only = process.argv.slice(2).filter((a) => a.endsWith('.sql'));
const files = (only.length ? only : fs.readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f >= '20261031000100')).sort();

for (const f of files) {
  process.stdout.write(`applying ${f} ... `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: fs.readFileSync(path.join(dir, f), 'utf8') }),
  });
  const text = await res.text();
  if (!res.ok) { console.log('FAILED'); console.error(text.slice(0, 1500)); process.exit(1); }
  console.log('ok');
}
console.log('\nDone. Migration report:');
console.log('  select * from public.migration_report_competition1 where diff <> 0;');
console.log('  select * from public.migration_flags_competition1;');
