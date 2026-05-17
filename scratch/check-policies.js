const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Fetching RLS policies for activity_logs...");
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'activity_logs'"
  });
  
  if (error) {
    console.error("Failed to query policies via RPC:", error);
    
    // Let's try directly fetching if execute_sql function doesn't exist
    console.log("Attempting standard table query for policies...");
  } else {
    console.log("Policies:", data);
  }
}

run();
