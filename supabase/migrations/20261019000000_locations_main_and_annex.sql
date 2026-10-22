-- =============================================================================
-- Pickup locations: Main and Annex
-- =============================================================================
-- The canteen has more than one place students can collect from. They share one
-- menu and one stock count, but each location opens and closes on its own, and
-- a student picks the location when they order. Any canteen staff member or
-- admin can open or close any location.
--
-- This replaces the single canteen_settings switch from 20261017000000:
-- * public.locations holds the locations and their open/closed state.
-- * public.orders gets location_id (existing orders are assigned to Main).
-- * set_location_open(location, open) replaces set_canteen_open(open).
-- * place_order() takes the location and refuses it while that location is
--   closed. The old three-argument version is dropped, not overloaded.
-- Main inherits whatever the old switch said, so nothing reopens by surprise.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.locations (name, sort_order, is_open)
VALUES ('Main', 1, COALESCE((SELECT s.is_open FROM public.canteen_settings s WHERE s.id), true))
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.locations (name, sort_order)
VALUES ('Annex', 2)
ON CONFLICT (name) DO NOTHING;

-- Everyone can read locations (the menu shows them); only set_location_open()
-- changes them, so there are no write policies.
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view locations" ON public.locations;
CREATE POLICY "Anyone can view locations"
  ON public.locations FOR SELECT
  USING (true);

REVOKE ALL ON public.locations FROM anon, authenticated;
GRANT SELECT ON public.locations TO anon, authenticated;

-- Every order belongs to a location. Existing orders were all Main.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

UPDATE public.orders
SET location_id = (SELECT l.id FROM public.locations l WHERE l.name = 'Main')
WHERE location_id IS NULL;

ALTER TABLE public.orders ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_location_id ON public.orders(location_id);

-- Open or close one location. Canteen staff and admins only, any location.
CREATE OR REPLACE FUNCTION public.set_location_open(p_location_id uuid, p_open boolean)
RETURNS public.locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.locations;
BEGIN
  IF p_location_id IS NULL OR p_open IS NULL THEN
    RAISE EXCEPTION 'p_location_id and p_open are required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_canteen_or_admin() THEN
    RAISE EXCEPTION 'Only canteen staff or admins can open or close a location'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.locations
  SET is_open = p_open, updated_at = now(), updated_by = auth.uid()
  WHERE id = p_location_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'location not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_open(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_location_open(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_location_open(uuid, boolean) TO authenticated;

-- place_order() with a pickup location. The signature changes, so the old one
-- is dropped first; keeping both would make calls by name ambiguous.
DROP FUNCTION IF EXISTS public.place_order(jsonb, text, timestamptz);

CREATE FUNCTION public.place_order(
  cart_items JSONB,
  p_location_id UUID,
  special_instructions TEXT DEFAULT NULL,
  pickup_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
  new_order public.orders;
  target public.locations;
  cart_item JSONB;
  decremented_item public.menu_items;
  item_qty INTEGER;
  order_total DECIMAL(10, 2) := 0;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'Choose a pickup location';
  END IF;

  -- FOR SHARE makes a concurrent close wait for orders already in flight, and
  -- orders that start after the close see it.
  SELECT * INTO target FROM public.locations WHERE id = p_location_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown pickup location';
  END IF;

  IF NOT target.is_open THEN
    RAISE EXCEPTION '% is closed right now. Please try again when it reopens.', target.name;
  END IF;

  IF cart_items IS NULL OR jsonb_array_length(cart_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  INSERT INTO public.orders (user_id, location_id, status, total_amount, pickup_time, special_instructions)
  VALUES (auth.uid(), p_location_id, 'pending', 0, pickup_time, special_instructions)
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

REVOKE ALL ON FUNCTION public.place_order(jsonb, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(jsonb, uuid, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, uuid, text, timestamptz) TO authenticated;

-- The single-switch version is gone.
DROP FUNCTION IF EXISTS public.set_canteen_open(boolean);
DROP TABLE IF EXISTS public.canteen_settings;
