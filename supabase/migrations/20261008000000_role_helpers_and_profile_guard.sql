-- =============================================================================
-- Role helpers + guard against self-promotion on public.profiles
-- =============================================================================
-- Adds two non-recursive role-check helpers used by the order/admin RPCs in
-- the following migrations, and a trigger that closes a privilege-escalation
-- hole on profiles.
--
-- FUNCTIONS
--   public.is_admin() returns boolean
--     True iff the current auth.uid() has profiles.role = 'admin'.
--     Callable by: authenticated (returns false for non-admins; never raises).
--
--   public.is_canteen_or_admin() returns boolean
--     True iff the current auth.uid() has profiles.role IN ('canteen','admin').
--     Callable by: authenticated (returns false otherwise; never raises).
--
--   public.guard_profile_role_change() returns trigger   (trigger function)
--     BEFORE UPDATE OF role ON public.profiles. Rejects any change of
--     profiles.role made by a signed-in user who is not an admin.
--     Calls with no auth.uid() (SQL editor, migrations, service_role key) are
--     allowed. Not callable directly (trigger functions cannot be called).
--
-- WHY THE TRIGGER
--   The original profiles policies are "Users can update own profile"
--   (FOR UPDATE USING auth.uid() = id, no WITH CHECK, no column limit) and
--   "Admins and Staff have full access" (FOR ALL for staff/admin). Together
--   they let ANY student set their own role to 'admin' with a plain
--   supabase.from('profiles').update({ role: 'admin' }), and let 'staff'
--   promote anyone. The admin RPCs would be meaningless with that hole open.
--   A trigger is used instead of a new profiles policy so that no policy on
--   profiles ever has to query profiles (42P17 recursion); is_admin() is
--   SECURITY DEFINER with row_security = off, same pattern as
--   is_admin_or_staff().
--
-- NOTE: profiles.role is plain text with a CHECK constraint. Nothing here
-- alters that column.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_canteen_or_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('canteen', 'admin')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_canteen_or_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_canteen_or_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_canteen_or_admin() TO authenticated;

-- Trigger function (SECURITY INVOKER is fine: it only calls is_admin(), which
-- is itself SECURITY DEFINER and bypasses RLS, so there is no recursion).
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to change roles' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();
