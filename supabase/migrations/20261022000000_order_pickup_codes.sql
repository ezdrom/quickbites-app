-- Pickup codes: the student's sign-off before an order is handed over.
--
-- Every order gets a random 4-digit code, shown only to the student who placed
-- it. Staff mark an order picked up by typing the code the student tells them,
-- through complete_order(). The code lives in its own table because staff can
-- read every row of `orders`; here only the order's owner can read it.
--
-- Staff can no longer set a status by updating `orders` directly (that policy
-- is dropped), since that would skip the code. Cancelling still goes through
-- cancel_order().

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_code_overridden BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.order_pickup_codes (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0)
);

ALTER TABLE public.order_pickup_codes ENABLE ROW LEVEL SECURITY;

-- Owner only. No policy for staff or admins, and none for writes: the code is
-- created by place_order() and checked by complete_order(), both SECURITY DEFINER.
CREATE POLICY "Students can view the pickup code of their own orders"
  ON public.order_pickup_codes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_pickup_codes.order_id AND o.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.order_pickup_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_pickup_codes TO authenticated;

-- A random 4-digit code. gen_random_uuid() is backed by a cryptographic
-- generator and is available without extra extensions.
CREATE FUNCTION public.generate_pickup_code() RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT lpad(
    (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 10000)::text,
    4, '0'
  )
$$;

REVOKE ALL ON FUNCTION public.generate_pickup_code() FROM PUBLIC, anon, authenticated;

-- Orders that are still waiting get a code now, so nothing in flight is stranded.
INSERT INTO public.order_pickup_codes (order_id, code)
SELECT id, public.generate_pickup_code()
FROM public.orders
WHERE status IN ('pending', 'preparing', 'ready')
ON CONFLICT (order_id) DO NOTHING;

-- place_order(): same behaviour as before, plus the pickup code. Same
-- signature, so CREATE OR REPLACE keeps the existing grants.
CREATE OR REPLACE FUNCTION public.place_order(
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

  INSERT INTO public.order_pickup_codes (order_id, code)
  VALUES (new_order.id, public.generate_pickup_code());

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- complete_order(): mark an order picked up after checking the student's code.
--
-- Returns jsonb:
--   {"result": "ok", "order": {...}}
--   {"result": "wrong_code", "attempts_left": n}
--   {"result": "locked"}      too many wrong codes; an admin can complete it
-- A wrong code is returned, not raised, so the failed-attempt count is kept
-- (an exception would roll it back).
--
-- p_code = null is an admin override for a student who can't show a code
-- (lost phone, dead battery). It is recorded on the order.
CREATE FUNCTION public.complete_order(p_order_id UUID, p_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_code public.order_pickup_codes;
  v_max_attempts CONSTANT INTEGER := 5;
  v_override BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_canteen_or_admin() THEN
    RAISE EXCEPTION 'Only canteen staff or admins can complete an order' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'p_order_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status NOT IN ('pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'order cannot be completed: status is %', v_order.status USING ERRCODE = '55000';
  END IF;

  IF p_code IS NULL THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Enter the pickup code' USING ERRCODE = '22023';
    END IF;
    v_override := true;
  ELSE
    SELECT * INTO v_code FROM public.order_pickup_codes WHERE order_id = v_order.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This order has no pickup code. An admin can complete it without one.'
        USING ERRCODE = '55000';
    END IF;

    IF v_code.failed_attempts >= v_max_attempts THEN
      RETURN jsonb_build_object('result', 'locked');
    END IF;

    IF btrim(p_code) <> v_code.code THEN
      UPDATE public.order_pickup_codes
      SET failed_attempts = failed_attempts + 1
      WHERE order_id = v_order.id;
      IF v_code.failed_attempts + 1 >= v_max_attempts THEN
        RETURN jsonb_build_object('result', 'locked');
      END IF;
      RETURN jsonb_build_object(
        'result', 'wrong_code',
        'attempts_left', v_max_attempts - (v_code.failed_attempts + 1)
      );
    END IF;
  END IF;

  UPDATE public.orders o
  SET status = 'completed',
      picked_up_at = now(),
      picked_up_by = auth.uid(),
      pickup_code_overridden = v_override,
      updated_at = now()
  WHERE o.id = v_order.id
  RETURNING * INTO v_order;

  -- The code has done its job.
  DELETE FROM public.order_pickup_codes WHERE order_id = v_order.id;

  RETURN jsonb_build_object('result', 'ok', 'order', to_jsonb(v_order));
END;
$$;

REVOKE ALL ON FUNCTION public.complete_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid, text) TO authenticated;

-- Staff can no longer change an order's status by updating the table: that
-- would skip the pickup code.
DROP POLICY IF EXISTS "Canteen and admins can update order status" ON public.orders;
