-- Add a 'canteen' role for canteen staff who manage the menu.
-- Kept as its own migration: a new enum value must be committed before it
-- can be referenced by policies/functions in a later migration.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'canteen';
