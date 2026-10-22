-- =============================================================================
-- Stop self-registering as admin (or any privileged role) at signup
-- =============================================================================
-- handle_new_user() copied raw_user_meta_data->>'role' straight into
-- profiles.role. That metadata is supplied by the client, so anyone could call
-- the signup API directly with {"role":"admin"} and get an admin profile; the
-- register form only offers Student/Canteen, but the API doesn't care.
--
-- Now only 'student' and 'canteen' are honoured at signup (canteen
-- self-registration is intended). Anything else, including 'admin', 'staff',
-- or garbage, becomes 'student'. Admins are promoted afterwards with
-- public.admin_set_user_role(). The role is handled as text, matching
-- profiles.role being a text column with a CHECK constraint.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := lower(coalesce(new.raw_user_meta_data->>'role', ''));
BEGIN
  IF v_role NOT IN ('student', 'canteen') THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    v_role
  );
  RETURN new;
END;
$$;
