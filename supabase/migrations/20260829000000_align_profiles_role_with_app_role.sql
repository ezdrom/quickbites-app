-- This project's public.profiles table pre-existed (from a Supabase starter
-- template: role text CHECK IN ('student','faculty','admin')) before any of
-- our migrations ran, so the earlier CREATE TABLE IF NOT EXISTS statements
-- never touched it. role is still plain text, not public.app_role.
--
-- An earlier version of this migration tried ALTER COLUMN role TYPE
-- public.app_role, but that's blocked by Postgres: several RLS policies on
-- OTHER tables (menu_items, orders, order_items) embed direct subqueries
-- like "role IN ('canteen', 'admin')" against profiles.role, and Postgres
-- tracks those as dependencies on the column too, not just same-table
-- policies. Safely enumerating and restoring every one of those by hand is
-- too easy to get wrong, so this takes the simpler route instead: keep role
-- as text, just widen the CHECK constraint, and fix the one function
-- (is_admin_or_staff) that compares it against enum-cast literals. Every
-- other policy already compares role to bare string literals, which works
-- identically against a text column.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Map the starter template's 'faculty' onto our closest equivalent.
UPDATE public.profiles SET role = 'instructor' WHERE role = 'faculty';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['student', 'instructor', 'staff', 'admin', 'canteen']::text[]));

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'student';

-- Was comparing the (actually text) role column against ::public.app_role
-- cast literals, which would fail with "operator does not exist: text =
-- app_role" the moment this function actually ran.
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
