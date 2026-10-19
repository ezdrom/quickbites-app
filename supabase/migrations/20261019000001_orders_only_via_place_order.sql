-- =============================================================================
-- Orders can only be created through place_order()
-- =============================================================================
-- The app never inserts into orders or order_items directly; place_order() is
-- SECURITY DEFINER and does it for the caller. But two policies still let any
-- signed-in user insert rows themselves:
--
-- * "Users can create their own orders" (orders)
-- * "Insert order items for own orders" (order_items)
--
-- That makes the rules in place_order() optional: a student could create an
-- order for a closed location, or add order lines with a price of their own
-- choosing and no stock taken. With no insert policy, row level security
-- refuses direct inserts and place_order() is the only way in.
-- =============================================================================

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Insert order items for own orders" ON public.order_items;
