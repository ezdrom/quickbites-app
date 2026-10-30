-- Lets canteen staff (and admins) advance an order's status, e.g. to mark
-- it picked up. This does not touch menu_items.serving_count — that's
-- already decremented atomically at order placement (place_order()), which
-- is what actually prevents overselling. Pickup is purely fulfillment
-- tracking on top of that.
CREATE POLICY "Canteen and admins can update order status"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('canteen', 'admin')
    )
  );
