-- =============================================================================
-- Admin user management RPCs (admin role ONLY; canteen/staff are rejected)
-- =============================================================================
-- Both functions are SECURITY DEFINER with SET search_path = public, check the
-- caller via public.is_admin() (non-recursive; 20261008000000), and raise
-- 'not authorized' (SQLSTATE 42501) for anyone who is not an admin, including
-- unauthenticated callers. EXECUTE is granted to `authenticated` only
-- (revoked from PUBLIC and anon).
--
-- 1) public.admin_list_users()
--      returns table (
--        id         uuid,         -- profiles.id (= auth.users.id)
--        full_name  text,         -- profiles.full_name
--        email      text,         -- auth.users.email
--        role       text,         -- profiles.role
--        created_at timestamptz   -- auth.users.created_at (signup time)
--      )
--    Every user, newest signup first.
--    Errors: 'not authorized' (42501).
--
-- 2) public.admin_set_user_role(p_user_id uuid, p_role text) returns void
--    Sets profiles.role. p_role must be one of the profiles_role_check values:
--    'student', 'instructor', 'staff', 'admin', 'canteen'.
--    Errors (message / SQLSTATE):
--      'not authorized'                       42501  caller is not an admin
--      'invalid role: <value>'                22023  p_role not allowed / null
--      'user id is required'                  22023  p_user_id null
--      'cannot change your own role'          42501  p_user_id = caller
--      'user not found'                       P0002  no profile with that id
--      'cannot demote the last admin'         55000  target is the only admin
--    Concurrency: all admin rows are locked (ORDER BY id FOR UPDATE) and the
--    caller's admin status is re-checked after the lock is acquired, so two
--    admins demoting each other at the same instant cannot leave zero admins.
--
-- ASSUMPTIONS: profiles has id, full_name, role (text). Email and signup time
-- come from auth.users so this works even if the pre-existing profiles table
-- lacks email/created_at columns.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.full_name::text,
         u.email::text,
         p.role::text,
         u.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY u.created_at DESC, p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_old_role  text;
  v_admins    integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
  END IF;

  -- Keep in sync with profiles_role_check.
  IF p_role IS NULL
     OR p_role NOT IN ('student', 'instructor', 'staff', 'admin', 'canteen') THEN
    RAISE EXCEPTION 'invalid role: %', coalesce(p_role, '<null>')
      USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot change your own role' USING ERRCODE = '42501';
  END IF;

  -- Serialize all admin-set changes, then re-verify the caller is still an
  -- admin (they may have been demoted while we waited for the lock).
  PERFORM 1
  FROM public.profiles p
  WHERE p.role = 'admin'
  ORDER BY p.id
  FOR UPDATE;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.role INTO v_old_role
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_role = p_role THEN
    RETURN;  -- nothing to do
  END IF;

  IF v_old_role = 'admin' THEN
    SELECT count(*) INTO v_admins
    FROM public.profiles p
    WHERE p.role = 'admin';

    IF v_admins <= 1 THEN
      RAISE EXCEPTION 'cannot demote the last admin' USING ERRCODE = '55000';
    END IF;
  END IF;

  UPDATE public.profiles p
  SET role = p_role
  WHERE p.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
