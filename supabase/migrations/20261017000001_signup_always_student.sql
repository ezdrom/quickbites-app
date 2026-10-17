-- =============================================================================
-- Signup always creates a student
-- =============================================================================
-- 20261008000004 let a signup request itself ask to be a 'canteen' user. That
-- means anyone who finds the site can register as canteen staff and then edit
-- the menu, open or close the canteen, and mark orders picked up. Privileged
-- roles should be granted by a person, so the role in the signup metadata is
-- now ignored completely. Admins promote staff afterwards with
-- admin_set_user_role() (the admin dashboard has a role dropdown for it).
--
-- Existing accounts are not changed. The on_auth_user_created trigger already
-- points at this function, so replacing it is enough.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    'student'
  );
  RETURN new;
END;
$$;
