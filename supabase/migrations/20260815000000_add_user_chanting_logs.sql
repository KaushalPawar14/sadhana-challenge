-- Migration: Add User Chanting Logs Table for In-App Chanting Tracking & Auto-Fulfillment
-- Created: 2026-08-15

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 'user_chanting_logs' Table (Tracks rounds completed in the Chanting tab per day)
CREATE TABLE IF NOT EXISTS user_chanting_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  rounds_chanted INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, log_date)
);

-- Enable Row Level Security
ALTER TABLE user_chanting_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow clean replay
DROP POLICY IF EXISTS "Users can view own chanting logs" ON user_chanting_logs;
DROP POLICY IF EXISTS "Users can insert own chanting logs" ON user_chanting_logs;
DROP POLICY IF EXISTS "Users can update own chanting logs" ON user_chanting_logs;
DROP POLICY IF EXISTS "Admins can manage all chanting logs" ON user_chanting_logs;

-- Policies
CREATE POLICY "Users can view own chanting logs" 
  ON user_chanting_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chanting logs" 
  ON user_chanting_logs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chanting logs" 
  ON user_chanting_logs FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all chanting logs" 
  ON user_chanting_logs FOR ALL 
  USING (is_admin(auth.jwt() ->> 'email'));
