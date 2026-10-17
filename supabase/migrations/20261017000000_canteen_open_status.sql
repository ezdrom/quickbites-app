-- =============================================================================
-- Canteen open / closed switch
-- =============================================================================
-- One row says whether the canteen is taking orders. Everyone can read it (the
-- student menu shows a banner); only canteen staff and admins can change it,
-- and only through set_canteen_open(), so there are no write policies.
--
-- Closing is enforced where it matters: place_order() refuses new orders while
-- the canteen is closed, so a stale page or a direct API call can't slip one
-- through. Orders that were already placed are untouched and staff can keep
-- fulfilling them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.canteen_settings (
  -- A boolean primary key that must be true allows exactly one row.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  is_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.canteen_settings (id, is_open) VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.canteen_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view canteen status" ON public.canteen_settings;
CREATE POLICY "Anyone can view canteen status"
  ON public.canteen_settings FOR SELECT
  USING (true);

REVOKE ALL ON public.canteen_settings FROM anon, authenticated;
GRANT SELECT ON public.canteen_settings TO anon, authenticated;

-- Open or close the canteen. Canteen staff and admins only.
CREATE OR REPLACE FUNCTION public.set_canteen_open(p_open boolean)
RETURNS public.canteen_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.canteen_settings;
BEGIN
  IF p_open IS NULL THEN
    RAISE EXCEPTION 'p_open is required';
  END IF;

  IF NOT public.is_canteen_or_admin() THEN
    RAISE EXCEPTION 'Only canteen staff or admins can open or close the canteen'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canteen_settings (id, is_open, updated_at, updated_by)
  VALUES (true, p_open, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET is_open = EXCLUDED.is_open,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_canteen_open(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_canteen_open(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_canteen_open(boolean) TO authenticated;

-- place_order(), unchanged except for the closed check at the top. Same
-- signature, so CREATE OR REPLACE keeps the existing grant.
CREATE OR REPLACE FUNCTION public.place_order(
  cart_items JSONB,
  special_instructions TEXT DEFAULT NULL,
  pickup_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
  new_order public.orders;
  cart_item JSONB;
  decremented_item public.menu_items;
  item_qty INTEGER;
  order_total DECIMAL(10, 2) := 0;
BEGIN
  IF NOT COALESCE((SELECT s.is_open FROM public.canteen_settings s WHERE s.id), true) THEN
    RAISE EXCEPTION 'The canteen is closed right now. Please try again when it reopens.';
  END IF;

  IF cart_items IS NULL OR jsonb_array_length(cart_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  INSERT INTO public.orders (user_id, status, total_amount, pickup_time, special_instructions)
  VALUES (auth.uid(), 'pending', 0, pickup_time, special_instructions)
  RETURNING * INTO new_order;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(cart_items)
  LOOP
    item_qty := (cart_item->>'quantity')::INTEGER;
    IF item_qty IS NULL OR item_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', cart_item->>'menu_item_id';
    END IF;

    decremented_item := public.decrement_menu_item_serving(
      (cart_item->>'menu_item_id')::UUID,
      item_qty
    );

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (new_order.id, decremented_item.id, item_qty, decremented_item.price);

    order_total := order_total + (decremented_item.price * item_qty);
  END LOOP;

  UPDATE public.orders SET total_amount = order_total, updated_at = now()
  WHERE id = new_order.id
  RETURNING * INTO new_order;

  RETURN new_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.place_order(JSONB, TEXT, TIMESTAMPTZ) TO authenticated;
