-- ==========================================
-- MENU ITEMS: serving count + canteen management
-- ==========================================

-- 1. Track how many servings of an item are available today.
ALTER TABLE public.menu_items
  ADD COLUMN serving_count INTEGER NOT NULL DEFAULT 0 CHECK (serving_count >= 0);

-- 2. Keep is_available in sync with serving_count regardless of caller
--    (canteen form, admin panel, or the decrement function below).
CREATE OR REPLACE FUNCTION public.sync_menu_item_availability()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_available := NEW.serving_count > 0;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sync_menu_item_availability
  BEFORE INSERT OR UPDATE OF serving_count ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_menu_item_availability();

-- 3. Let canteen staff (not just admins) manage the menu.
DROP POLICY IF EXISTS "Admins can insert menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can delete menu items" ON public.menu_items;

CREATE POLICY "Canteen and admins can insert menu items"
  ON public.menu_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('canteen', 'admin')
    )
  );

CREATE POLICY "Canteen and admins can update menu items"
  ON public.menu_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('canteen', 'admin')
    )
  );

CREATE POLICY "Canteen and admins can delete menu items"
  ON public.menu_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('canteen', 'admin')
    )
  );

-- 4. Atomic, race-safe decrement for when a student places an order.
--    A single guarded UPDATE means two concurrent orders for the last
--    serving can't both succeed. SECURITY DEFINER lets any authenticated
--    student call it without needing direct UPDATE rights on menu_items.
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
  WHERE id = item_id AND serving_count >= qty
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not enough servings available for item %', item_id;
  END IF;

  RETURN updated_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.decrement_menu_item_serving(UUID, INTEGER) TO authenticated;
