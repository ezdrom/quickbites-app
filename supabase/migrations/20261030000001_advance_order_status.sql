-- advance_order_status(): canteen staff move an order along the kitchen steps.
--
--   pending -> preparing   ("Accept")
--   preparing -> ready     ("Ready")
--
-- Picking up still goes through complete_order() with the student's code, and
-- cancelling through cancel_order(); this function can do neither. Staff have
-- no UPDATE policy on orders (dropped in 20261022000000), so this is the only
-- way to set these two statuses.
--
-- Returns the updated public.orders row.
-- Errors:
--   'Only canteen staff or admins can update an order'   42501
--   'order not found'                                    P0002
--   'order cannot move to <s>: status is <s>'            55000  (already moved,
--                                                         cancelled, or picked up)

CREATE OR REPLACE FUNCTION public.advance_order_status(p_order_id uuid, p_status text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_from  text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_canteen_or_admin() THEN
    RAISE EXCEPTION 'Only canteen staff or admins can update an order' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'p_order_id and p_status are required' USING ERRCODE = '22023';
  END IF;

  v_from := CASE p_status
    WHEN 'preparing' THEN 'pending'
    WHEN 'ready' THEN 'preparing'
  END;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'p_status must be preparing or ready' USING ERRCODE = '22023';
  END IF;

  -- Serialize with cancel_order() / complete_order() on the same order.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> v_from THEN
    RAISE EXCEPTION 'order cannot move to %: status is %', p_status, v_order.status
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.orders o
  SET status = p_status, updated_at = now()
  WHERE o.id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_order_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_order_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_order_status(uuid, text) TO authenticated;
