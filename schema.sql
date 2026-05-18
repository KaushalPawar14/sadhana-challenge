-- Admin whitelist
CREATE TABLE admin_emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL
);

-- Users / students
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  mobile TEXT,
  department TEXT,
  avatar_url TEXT,
  target_chanting INT DEFAULT 16,
  target_reading INT DEFAULT 30,
  target_hearing INT DEFAULT 30,
  total_points INT DEFAULT 0,
  streak_count INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_log_date DATE,
  freeze_credits INT DEFAULT 1,
  is_onboarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);

-- Daily activity logs
CREATE TABLE activity_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  chanting_rounds INT DEFAULT 0,
  reading_minutes INT DEFAULT 0,
  hearing_minutes INT DEFAULT 0,
  points_earned INT DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT now(),
  is_late_submission BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, log_date)
);

-- Bonus points (admin-given)
CREATE TABLE bonus_points (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES users(id),
  title TEXT NOT NULL,
  points INT NOT NULL,
  given_at TIMESTAMP DEFAULT now()
);

-- Awards / badges
CREATE TABLE awards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  award_key TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT now(),
  custom_message TEXT,
  UNIQUE(user_id, award_key)
);

-- App global settings (editable by admin)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT now()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
  ('challenge_title', '26-Day Sadhana Challenge'),
  ('challenge_start_date', CURRENT_DATE::TEXT),
  ('challenge_end_date', (CURRENT_DATE + INTERVAL '26 days')::TEXT),
  ('log_cutoff_hour', '20'),
  ('late_log_allowed_days', '1'),
  ('onboarding_fields', '["full_name","mobile","department","target_chanting","target_reading","target_hearing"]'),
  ('points_per_chanting_round', '2'),
  ('points_per_reading_minute', '1'),
  ('points_per_hearing_minute', '1'),
  ('streak_bonus_multiplier', '0.1'),
  ('freeze_credits_on_join', '1');

-- Helper Postgres function
CREATE OR REPLACE FUNCTION is_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM admin_emails WHERE email = user_email);
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS Policies

-- Enable RLS
ALTER TABLE admin_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- users: Users can read all rows (for leaderboard). Users can only UPDATE their own row.
CREATE POLICY "Users can read all profiles" ON users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- activity_logs: Users can INSERT/SELECT their own rows. Admins can SELECT all.
CREATE POLICY "Users can insert own logs" ON activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select own logs" ON activity_logs FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.jwt() ->> 'email'));
CREATE POLICY "Admins can select all logs" ON activity_logs FOR SELECT USING (is_admin(auth.jwt() ->> 'email'));

-- bonus_points: Only admins can INSERT. All users can SELECT their own.
CREATE POLICY "Admins can insert bonus points" ON bonus_points FOR INSERT WITH CHECK (is_admin(auth.jwt() ->> 'email'));
CREATE POLICY "Users can select own bonus points" ON bonus_points FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.jwt() ->> 'email'));

-- awards: All users can SELECT their own. Admins can INSERT for any user.
CREATE POLICY "Users can select own awards" ON awards FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.jwt() ->> 'email'));
CREATE POLICY "Admins can insert awards" ON awards FOR INSERT WITH CHECK (is_admin(auth.jwt() ->> 'email'));

-- app_settings: All authenticated users can SELECT. Only admins can UPDATE.
CREATE POLICY "Everyone can select settings" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can update settings" ON app_settings FOR UPDATE USING (is_admin(auth.jwt() ->> 'email'));

-- admin_emails: Only admins can read/write.
CREATE POLICY "Admins can manage admin list" ON admin_emails FOR ALL USING (is_admin(auth.jwt() ->> 'email'));

-- =========================================================================
-- AUDIOBOOKS & QUIZZES CMS SCHEMA (STEP 1)
-- =========================================================================

-- Enable uuid-ossp extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 'audiobooks' Table
CREATE TABLE audiobooks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('F2', 'F4', 'F8', 'F12', 'F16')),
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 'quiz_questions' Table
CREATE TABLE quiz_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  audiobook_id UUID NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of 4 strings
  correct_answer TEXT NOT NULL
);

-- 3. 'user_audiobook_progress' Table (The Tracking Table)
CREATE TABLE user_audiobook_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audiobook_id UUID NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, audiobook_id)
);

-- Enable Row Level Security
ALTER TABLE audiobooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_audiobook_progress ENABLE ROW LEVEL SECURITY;

-- audiobooks RLS Policies
CREATE POLICY "Everyone can select audiobooks" ON audiobooks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage audiobooks" ON audiobooks FOR ALL USING (is_admin(auth.jwt() ->> 'email'));

-- quiz_questions RLS Policies
CREATE POLICY "Everyone can select quiz questions" ON quiz_questions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage quiz questions" ON quiz_questions FOR ALL USING (is_admin(auth.jwt() ->> 'email'));

-- user_audiobook_progress RLS Policies
CREATE POLICY "Everyone can select all progress" ON user_audiobook_progress FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert own progress" ON user_audiobook_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON user_audiobook_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all progress" ON user_audiobook_progress FOR ALL USING (is_admin(auth.jwt() ->> 'email'));

-- 4. 'quiz_submissions' Table (Dedicated Quiz Submissions Tracking Table)
CREATE TABLE quiz_submissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audiobook_id UUID NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
  score INT NOT NULL,
  points_earned INT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, audiobook_id)
);

-- Enable Row Level Security
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;

-- quiz_submissions RLS Policies
CREATE POLICY "Everyone can select all quiz submissions" ON quiz_submissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert own quiz submissions" ON quiz_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all quiz submissions" ON quiz_submissions FOR ALL USING (is_admin(auth.jwt() ->> 'email'));



