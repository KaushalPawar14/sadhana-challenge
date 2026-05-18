-- Migration: Add Audiobooks, Quiz Questions, and User Audiobook Progress Tables
-- Created: 2026-05-18

-- Enable uuid-ossp extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 'audiobooks' Table
CREATE TABLE IF NOT EXISTS audiobooks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('F2', 'F4', 'F8', 'F12', 'F16')),
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 'quiz_questions' Table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  audiobook_id UUID NOT NULL REFERENCES audiobooks(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of 4 strings
  correct_answer TEXT NOT NULL
);

-- 3. 'user_audiobook_progress' Table (The Tracking Table)
CREATE TABLE IF NOT EXISTS user_audiobook_progress (
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

-- Drop existing policies if they exist to allow clean replay
DROP POLICY IF EXISTS "Everyone can select audiobooks" ON audiobooks;
DROP POLICY IF EXISTS "Admins can manage audiobooks" ON audiobooks;
DROP POLICY IF EXISTS "Everyone can select quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "Admins can manage quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "Users can select own progress" ON user_audiobook_progress;
DROP POLICY IF EXISTS "Everyone can select all progress" ON user_audiobook_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON user_audiobook_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON user_audiobook_progress;
DROP POLICY IF EXISTS "Admins can manage all progress" ON user_audiobook_progress;

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

