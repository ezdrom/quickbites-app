-- One-tap "Sold out / Available" for canteen staff.
--
-- Before this, is_available was always recomputed as serving_count > 0, so a
-- staff member could not mark an item sold out while servings remained (the
-- next order or edit flipped it back), and place_order() never looked at
-- is_available at all.
--
-- Now:
--   * serving_count = 0 always means sold out (unchanged).
--   * Restocking an item from 0 servings makes it available again (unchanged).
--   * Otherwise staff choose: updating is_available sticks, and orders or
--     edits that change serving_count keep whatever staff chose.
--   * Ordering a sold-out item fails, even with servings left.

CREATE OR REPLACE FUNCTION public.sync_menu_item_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.serving_count <= 0 THEN
    NEW.is_available := false;
  ELSIF TG_OP = 'INSERT' OR OLD.serving_count <= 0 THEN
    NEW.is_available := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also fire on is_available, so an item with no servings can't be marked available.
DROP TRIGGER IF EXISTS trg_sync_menu_item_availability ON public.menu_items;
CREATE TRIGGER trg_sync_menu_item_availability
  BEFORE INSERT OR UPDATE OF serving_count, is_available ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_menu_item_availability();

-- Same signature, so CREATE OR REPLACE keeps the existing grant.
CREATE OR REPLACE FUNCTION public.decrement_menu_item_serving(item_id UUID, qty INTEGER)
RETURNS public.menu_items AS $$
DECLARE
  updated_row public.menu_items;
BEGIN
  IF qty <= 0 THEN
    RAISE EXCEPTION 'qty must be positive';
  END IF;

  UPDATE public.menu_items
  SET serving_count = serving_count - qty
  WHERE id = item_id AND serving_count >= qty AND is_available
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not enough servings available for item %', item_id;
  END IF;

  RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
