-- Migration: Add Books and Reading Sessions Tables
-- Created: 2026-05-19

-- Enable uuid-ossp extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 'books' Table
CREATE TABLE IF NOT EXISTS books (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('Hindi', 'English', 'Gujarati')),
  pdf_link TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 'reading_sessions' Table (Log time chunks)
CREATE TABLE IF NOT EXISTS reading_sessions (
  session_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  seconds_read INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow clean replay
DROP POLICY IF EXISTS "Everyone can select books" ON books;
DROP POLICY IF EXISTS "Admins can manage books" ON books;
DROP POLICY IF EXISTS "Everyone can select all reading sessions" ON reading_sessions;
DROP POLICY IF EXISTS "Users can insert own reading sessions" ON reading_sessions;
DROP POLICY IF EXISTS "Admins can manage all reading sessions" ON reading_sessions;

-- 'books' RLS Policies
CREATE POLICY "Everyone can select books" ON books FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage books" ON books FOR ALL USING (is_admin(auth.jwt() ->> 'email'));

-- 'reading_sessions' RLS Policies
CREATE POLICY "Everyone can select all reading sessions" ON reading_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert own reading sessions" ON reading_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all reading sessions" ON reading_sessions FOR ALL USING (is_admin(auth.jwt() ->> 'email'));
