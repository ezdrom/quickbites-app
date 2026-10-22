-- =============================================================================
-- cancel_order: student order cancellation (+ canteen/admin cancellation)
-- =============================================================================
-- SIGNATURE
--   public.cancel_order(p_order_id uuid) returns public.orders
--
-- RETURNS
--   The updated public.orders row: id, user_id, status ('cancelled'),
--   total_amount, pickup_time, special_instructions, created_at, updated_at.
--
-- WHO MAY CALL (EXECUTE granted to `authenticated` only; anon revoked)
--   * The student who owns the order, while orders.status = 'pending'.
--   * Users with profiles.role 'canteen' or 'admin', for ANY order whose
--     status is 'pending' or 'preparing'.
--
-- BEHAVIOUR
--   Locks the order row (FOR UPDATE) so concurrent cancel/cancel or
--   cancel/status-update calls serialize; the loser sees the new status and
--   gets the "wrong status" error instead of restoring stock twice.
--   Sets status = 'cancelled', updated_at = now(), and adds every line item's
--   quantity back to menu_items.serving_count (the existing
--   trg_sync_menu_item_availability trigger then resyncs is_available).
--
-- ERRORS (message / SQLSTATE)
--   'not authenticated'                          28000  no signed-in user
--   'order not found'                            P0002  unknown order id
--   'not allowed to cancel this order'           42501  student, not owner
--   'order cannot be cancelled: status is <s>'   55000  status not cancellable
--                                                       for this caller
--
-- STUDENT READ ACCESS (verified, unchanged): orders has "Users can view their
-- own orders" (auth.uid() = user_id) and order_items has "View order items"
-- (owner of the parent order, or canteen/admin). Neither is a policy on
-- profiles, so there is no recursion risk. Students have no UPDATE policy on
-- orders; cancelling goes through this RPC only.
--
-- Depends on: public.is_canteen_or_admin() (20261008000000).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_order     public.orders;
  v_is_staff  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Serialize with any concurrent cancel / status change on this order.
  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_staff := public.is_canteen_or_admin();

  IF NOT v_is_staff AND v_order.user_id <> v_uid THEN
    RAISE EXCEPTION 'not allowed to cancel this order' USING ERRCODE = '42501';
  END IF;

  IF v_is_staff THEN
    IF v_order.status NOT IN ('pending', 'preparing') THEN
      RAISE EXCEPTION 'order cannot be cancelled: status is %', v_order.status
        USING ERRCODE = '55000';
    END IF;
  ELSE
    IF v_order.status <> 'pending' THEN
      RAISE EXCEPTION 'order cannot be cancelled: status is %', v_order.status
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Lock the affected menu rows in a stable order to avoid deadlocks
  -- between two cancellations touching overlapping items.
  PERFORM 1
  FROM public.menu_items mi
  WHERE mi.id IN (
    SELECT oi.menu_item_id FROM public.order_items oi
    WHERE oi.order_id = v_order.id
  )
  ORDER BY mi.id
  FOR UPDATE;

  -- Give the stock back (one UPDATE per menu item, quantities summed).
  UPDATE public.menu_items mi
  SET serving_count = mi.serving_count + li.qty
  FROM (
    SELECT oi.menu_item_id, SUM(oi.quantity)::integer AS qty
    FROM public.order_items oi
    WHERE oi.order_id = v_order.id
    GROUP BY oi.menu_item_id
  ) li
  WHERE mi.id = li.menu_item_id;

  UPDATE public.orders o
  SET status = 'cancelled', updated_at = now()
  WHERE o.id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;
