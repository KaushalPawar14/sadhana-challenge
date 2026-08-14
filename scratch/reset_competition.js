const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length > 0) {
    envVars[key.trim()] = vals.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function resetCompetition() {
  console.log("Starting competition reset...");

  // 1. Delete all activity logs
  const { error: err1 } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) console.error("Error clearing activity_logs:", err1.message);
  else console.log("Cleared activity_logs");

  // 2. Delete all bonus points
  const { error: err2 } = await supabase.from('bonus_points').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) console.error("Error clearing bonus_points:", err2.message);
  else console.log("Cleared bonus_points");

  // 3. Delete all awards
  const { error: err3 } = await supabase.from('awards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err3) console.error("Error clearing awards:", err3.message);
  else console.log("Cleared awards");

  // 4. Delete all user audiobook progress
  const { error: err4 } = await supabase.from('user_audiobook_progress').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err4) console.error("Error clearing user_audiobook_progress:", err4.message);
  else console.log("Cleared user_audiobook_progress");

  // 5. Delete all quiz submissions
  const { error: err5 } = await supabase.from('quiz_submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err5) console.error("Error clearing quiz_submissions:", err5.message);
  else console.log("Cleared quiz_submissions");

  // 6. Reset all user statistics (total_points, streak_count, best_streak, last_log_date)
  const { error: err6 } = await supabase
    .from('users')
    .update({
      total_points: 0,
      streak_count: 0,
      best_streak: 0,
      last_log_date: null,
      freeze_credits: 1
    })
    .neq('id', '00000000-0000-0000-0000-000000000000');
    
  if (err6) console.error("Error resetting users:", err6.message);
  else console.log("Reset all user stats to zero.");

  console.log("Competition reset complete!");
}

resetCompetition();
