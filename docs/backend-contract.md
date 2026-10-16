# Backend contract: order tracking and admin RPCs

Migrations: `supabase/migrations/20261008000000` to `20261008000003`.
All functions are called with `supabase.rpc(name, args)` by a signed-in user (`authenticated`). Anonymous callers are rejected. Errors come back as `{ error: { message, code } }` where `code` is the SQLSTATE below (PostgREST also maps `42501` to HTTP 403). Match on `message`, not wording you guess.

Roles are the text values in `profiles.role`: `student`, `instructor`, `staff`, `admin`, `canteen`.

## Student order tracking

Students can already read their own data directly (RLS, unchanged):

```js
supabase.from('orders').select('*, order_items(quantity, unit_price, menu_items(name, image_url))')
  .order('created_at', { ascending: false })   // returns only the caller's orders
```

`orders.status` values: `pending`, `preparing`, `ready`, `completed`, `cancelled`. Students have no direct UPDATE on orders; use the RPC below to cancel.

### `cancel_order(p_order_id uuid) returns orders`

```js
const { data: order, error } = await supabase.rpc('cancel_order', { p_order_id: id })
```

- Returns the updated `orders` row (`id, user_id, status, total_amount, pickup_time, special_instructions, created_at, updated_at`) with `status = 'cancelled'`.
- Who: the order's owner while status is `pending`. `canteen` and `admin` may cancel any order that is `pending` or `preparing`.
- Side effect: every line item's quantity is added back to `menu_items.serving_count`; `is_available` is resynced by the existing trigger. Safe against double cancel (row lock).

| message | code | when |
|---|---|---|
| `not authenticated` | 28000 | no session |
| `order not found` | P0002 | unknown id |
| `not allowed to cancel this order` | 42501 | student cancelling someone else's order |
| `order cannot be cancelled: status is <status>` | 55000 | wrong status for this caller (a student cannot cancel `preparing` or later) |

## Admin (role `admin` only; `canteen` and `staff` get `not authorized`)

Every admin function raises `not authorized` (code `42501`) for non-admins and anonymous callers.

### `admin_list_users()` returns table

```js
const { data } = await supabase.rpc('admin_list_users')
// [{ id, full_name, email, role, created_at }, ...]  newest signup first
```

| column | type |
|---|---|
| id | uuid |
| full_name | text |
| email | text (from auth.users) |
| role | text |
| created_at | timestamptz (signup time) |

### `admin_set_user_role(p_user_id uuid, p_role text) returns void`

```js
const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: id, p_role: 'canteen' })
```

`p_role` must be one of `student`, `instructor`, `staff`, `admin`, `canteen`. Returns nothing (`data` is null) on success; setting the role a user already has is a no-op.

| message | code | when |
|---|---|---|
| `not authorized` | 42501 | caller is not an admin |
| `invalid role: <value>` | 22023 | role not in the list above |
| `user id is required` | 22023 | `p_user_id` null |
| `cannot change your own role` | 42501 | `p_user_id` is the caller |
| `user not found` | P0002 | no such profile |
| `cannot demote the last admin` | 55000 | target is the only admin |

Also note: a database trigger now blocks any non-admin from changing `profiles.role` through direct table updates (`not authorized to change roles`, 42501). Role changes must go through this RPC.

### `admin_sales_summary(p_from date, p_to date)` returns table

```js
const { data } = await supabase.rpc('admin_sales_summary', { p_from: '2026-10-01', p_to: '2026-10-07' })
// [{ day: '2026-10-01', orders_count: 12, revenue: 1840.5 }, ...]
```

| column | type | notes |
|---|---|---|
| day | date | one row per day in the inclusive range, ascending, zero-filled |
| orders_count | bigint | completed orders placed that day (may arrive as number) |
| revenue | numeric | sum of `total_amount`; PostgREST returns it as a JSON number |

Counts only `status = 'completed'`. Days are in Asia/Manila time, by order placement time (`created_at`). Max range 366 days.

Errors: `not authorized`; `p_from and p_to are required`; `p_from must not be after p_to`; `date range too large (max 366 days)` (the last three are code 22023).

### `admin_top_items(p_from date, p_to date, p_limit int default 5)` returns table

```js
const { data } = await supabase.rpc('admin_top_items', { p_from: '2026-10-01', p_to: '2026-10-07', p_limit: 5 })
// [{ menu_item_id, name, quantity_sold, revenue }, ...]  best seller first
```

| column | type |
|---|---|
| menu_item_id | uuid |
| name | text |
| quantity_sold | bigint |
| revenue | numeric (quantity x price at time of sale) |

Same completed-orders / Asia/Manila / inclusive-range rules as above. `p_limit` is 1 to 100. Errors: `not authorized`; `p_from and p_to are required`; `p_from must not be after p_to`; `p_limit must be between 1 and 100` (22023).

## Helpers (rarely needed from the client)

- `is_admin()` and `is_canteen_or_admin()` return a boolean for the current user. They are handy for route guards: `supabase.rpc('is_admin')`.

## Signup role clamp
`handle_new_user()` (migration 20261008000004) only honours `student` and `canteen` from signup metadata; any other value (including `admin`) becomes `student`. Promote admins with `admin_set_user_role`.
