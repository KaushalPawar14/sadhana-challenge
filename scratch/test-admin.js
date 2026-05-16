const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAdmin() {
  const email = 'kpawar.kp.21@gmail.com'; // Testing with user's email if possible, or common admin email
  const { data, error } = await supabase.rpc('is_admin', { user_email: email });
  console.log('Test Admin Check:', { email, data, error });
}

testAdmin();
