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

async function runTest() {
  console.log("Starting DB test using Service Role client...");
  
  // 1. Fetch a user to test with
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, full_name')
    .limit(1);
    
  if (userError || !users || users.length === 0) {
    console.error("Failed to fetch test user:", userError);
    return;
  }
  
  const testUser = users[0];
  console.log("Using test user:", testUser.full_name, "(ID:", testUser.id, ")");
  
  // 2. Attempt to insert/upsert into activity_logs with onConflict specified
  const testDate = '2026-05-17';
  console.log("Attempting upsert with onConflict for date:", testDate);
  
  const { data: logData, error: logError } = await supabase
    .from('activity_logs')
    .upsert({
      user_id: testUser.id,
      log_date: testDate,
      chanting_rounds: 16,
      reading_minutes: 30,
      hearing_minutes: 0,
      points_earned: 62,
      is_late_submission: false
    }, {
      onConflict: 'user_id,log_date'
    })
    .select();
    
  if (logError) {
    console.error("❌ UPSERT FAILED:", logError);
  } else {
    console.log("✅ UPSERT SUCCEEDED! Inserted/Updated log:", logData);
  }
}

runTest();
