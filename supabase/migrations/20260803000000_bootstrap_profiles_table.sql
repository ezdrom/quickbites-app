-- Recreates the starting state the QA Supabase project actually had.
--
-- That project was created from a Supabase starter template, so public.profiles
-- already existed (role is text with CHECK IN ('student','faculty','admin'))
-- before any of our migrations ran. Every later migration's
-- CREATE TABLE IF NOT EXISTS public.profiles was therefore a no-op there, and
-- 20260829000000_align_profiles_role_with_app_role.sql was written against that
-- text column.
--
-- A fresh database (supabase start / db reset, i.e. the Supabase CI check) has
-- no such template, so base_schema.sql created role as the app_role enum and
-- 20260829000000 failed with: invalid input value for enum app_role: "faculty".
--
-- This runs before base_schema.sql and creates the table the template way, so a
-- fresh replay follows the same path as the QA project. On a database where
-- profiles already exists (QA, anything migrated before this file) it does
-- nothing; push it there once with `supabase db push --include-all`.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'student'
    CONSTRAINT profiles_role_check CHECK (role IN ('student', 'faculty', 'admin')),
  avatar_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
