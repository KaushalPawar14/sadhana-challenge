// Read-only export of the live Supabase project (REST + Auth admin API) into backups/<timestamp>/.
// Usage: node scripts/backup-live.mjs
import fs from 'node:fs';
import path from 'node:path';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: key, Authorization: `Bearer ${key}` };
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join('backups', ts);
fs.mkdirSync(dir, { recursive: true });

const spec = await (await fetch(`${base}/rest/v1/`, { headers: h })).json();
fs.writeFileSync(path.join(dir, 'schema-openapi.json'), JSON.stringify(spec, null, 2));
const tables = Object.keys(spec.definitions || {});
const summary = {};
for (const t of tables) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/rest/v1/${t}?select=*`, { headers: { ...h, Range: `${from}-${from + 999}` } });
    if (!r.ok) { summary[t] = `ERROR ${r.status}`; break; }
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  if (!String(summary[t] || '').startsWith('ERROR')) summary[t] = rows.length;
  fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2));
}
// auth users (emails needed for email backfill / audit)
const au = [];
for (let page = 1; ; page++) {
  const r = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
  if (!r.ok) { summary['auth.users'] = `ERROR ${r.status}`; break; }
  const j = await r.json();
  au.push(...(j.users || []));
  if ((j.users || []).length < 200) break;
}
if (!summary['auth.users']) summary['auth.users'] = au.length;
fs.writeFileSync(path.join(dir, 'auth_users.json'), JSON.stringify(au, null, 2));
fs.writeFileSync(path.join(dir, 'NOTES.txt'),
  'Exported via REST with the service-role key.\nRLS policies / functions / constraints are NOT exposed over REST and are therefore not in this backup.\nTables missing from the OpenAPI spec do not exist in the live DB.\n');
console.log(dir, summary);
