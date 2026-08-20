const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addRoleColumn() {
  // Try calling rpc or raw query if postgres function exists, or update directly
  const { data, error } = await supabase.rpc('exec_sql', { sql: `ALTER TABLE admin_emails ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'HOD';` });
  console.log("RPC result:", { data, error });
}

addRoleColumn();
