-- Fixes: 42P17 infinite recursion detected in policy for relation "profiles".
--
-- is_admin_or_staff() runs `SELECT ... FROM public.profiles` internally, but
-- it's also called from a policy ON public.profiles itself ("Admins and
-- Staff have full access"). Any query touching profiles re-evaluates that
-- policy -> calls the function -> queries profiles again -> re-evaluates the
-- policy again, forever. This also happens transitively through every other
-- table whose policies subquery profiles (menu_items, orders, order_items),
-- since evaluating THEIR "role IN (...)" subquery against profiles triggers
-- profiles' own RLS, which hits this same function again.
--
-- This bug was latent from the very first migration (base_schema.sql) and
-- wasn't caused by the role/type work in 20260829000000 -- it just hadn't
-- been exercised by an actual canteen-role query yet.
--
-- Fix: make the function's internal query explicitly bypass row security,
-- which breaks the recursion regardless of which role owns the function.
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET row_security = off;
