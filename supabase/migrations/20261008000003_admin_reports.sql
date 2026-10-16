-- =============================================================================
-- Admin sales reports (admin role ONLY; canteen/staff are rejected)
-- =============================================================================
-- Both functions are SECURITY DEFINER with SET search_path = public, check the
-- caller via public.is_admin() (20261008000000), and raise 'not authorized'
-- (SQLSTATE 42501) for non-admins and unauthenticated callers. EXECUTE is
-- granted to `authenticated` only (revoked from PUBLIC and anon).
--
-- Only orders with status = 'completed' are counted. An order belongs to the
-- day it was PLACED (orders.created_at), bucketed in the campus timezone
-- 'Asia/Manila' (not UTC, otherwise morning orders land on the previous day).
-- Date ranges are inclusive on both ends.
--
-- 1) public.admin_sales_summary(p_from date, p_to date)
--      returns table (
--        day          date,     -- one row per calendar day in [p_from, p_to],
--                               -- zero-filled (0 orders / 0 revenue) for
--                               -- days without completed orders; ascending
--        orders_count bigint,   -- number of completed orders that day
--        revenue      numeric   -- SUM(orders.total_amount) of those orders
--      )
--    Errors (message / SQLSTATE):
--      'not authorized'                          42501
--      'p_from and p_to are required'            22023
--      'p_from must not be after p_to'           22023
--      'date range too large (max 366 days)'     22023
--
-- 2) public.admin_top_items(p_from date, p_to date, p_limit int default 5)
--      returns table (
--        menu_item_id  uuid,
--        name          text,     -- menu_items.name (current name)
--        quantity_sold bigint,   -- SUM(order_items.quantity)
--        revenue       numeric   -- SUM(quantity * unit_price) at sale price
--      )
--    Best sellers by quantity_sold (ties: higher revenue, then name), over
--    completed orders placed in [p_from, p_to]. Items with no sales are not
--    listed.
--    Errors (message / SQLSTATE):
--      'not authorized'                          42501
--      'p_from and p_to are required'            22023
--      'p_from must not be after p_to'           22023
--      'p_limit must be between 1 and 100'       22023
-- =============================================================================

-- Supports the date-range scans below.
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items(menu_item_id);

CREATE OR REPLACE FUNCTION public.admin_sales_summary(p_from date, p_to date)
RETURNS TABLE (
  day date,
  orders_count bigint,
  revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required' USING ERRCODE = '22023';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'p_from must not be after p_to' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 365 THEN
    RAISE EXCEPTION 'date range too large (max 366 days)' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH daily AS (
    SELECT (o.created_at AT TIME ZONE 'Asia/Manila')::date AS order_day,
           count(*) AS cnt,
           sum(o.total_amount) AS rev
    FROM public.orders o
    WHERE o.status = 'completed'
      AND o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Manila')
      AND o.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
    GROUP BY 1
  )
  SELECT g.d::date,
         coalesce(daily.cnt, 0)::bigint,
         coalesce(daily.rev, 0)::numeric
  FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS g(d)
  LEFT JOIN daily ON daily.order_day = g.d::date
  ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_top_items(
  p_from date,
  p_to date,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  menu_item_id uuid,
  name text,
  quantity_sold bigint,
  revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'p_from and p_to are required' USING ERRCODE = '22023';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'p_from must not be after p_to' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT oi.menu_item_id,
         mi.name::text,
         sum(oi.quantity)::bigint,
         sum(oi.quantity * oi.unit_price)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.status = 'completed'
    AND o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Manila')
    AND o.created_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Manila')
  GROUP BY oi.menu_item_id, mi.name
  ORDER BY 3 DESC, 4 DESC, mi.name
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_summary(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sales_summary(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_top_items(date, date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_top_items(date, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_top_items(date, date, int) TO authenticated;
