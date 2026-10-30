-- Places an order for the current user in a single transaction: creates the
-- order, decrements serving_count per item (via the existing race-safe
-- decrement_menu_item_serving), and records line items at their current
-- price. If any item doesn't have enough servings left, the whole order
-- (including the ones already decremented earlier in the loop) rolls back
-- automatically, since a PL/pgSQL function body shares the caller's
-- transaction and RAISE EXCEPTION aborts it.
--
-- cart_items shape: [{ "menu_item_id": "<uuid>", "quantity": 2 }, ...]
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
