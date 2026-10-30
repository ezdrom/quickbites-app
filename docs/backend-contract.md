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

## Pickup locations (Main and Annex)

Migration `20261019000000_locations_main_and_annex.sql` (replaces the single canteen open/closed switch from `20261017000000`; `canteen_settings` and `set_canteen_open` no longer exist). The menu and its stock are shared; only the pickup location and its open/closed state differ. Staff are not tied to a location.

`locations` is readable by everyone, including signed-out visitors, and has no write policies:

```js
const { data } = await supabase.from('locations').select('id, name, sort_order, is_open').order('sort_order')
// [{ id, name: 'Main', sort_order: 1, is_open: true }, { id, name: 'Annex', ... }]
```

`orders.location_id` (uuid, not null) says where an order is picked up. Embed the name with `.select('*, locations(name)')`. Orders that existed before this migration were assigned to Main.

### `set_location_open(p_location_id uuid, p_open boolean) returns locations`

```js
const { data, error } = await supabase.rpc('set_location_open', { p_location_id: id, p_open: false })
```

- Who: `canteen` and `admin`. This function is the only way to change `is_open`.
- Returns the updated row.

| message | code | when |
|---|---|---|
| `Only canteen staff or admins can open or close a location` | 42501 | any other signed-in user (anonymous callers get a plain permission error) |
| `p_location_id and p_open are required` | 22023 | either is `null` |
| `location not found` | P0002 | no such location |

### `place_order(cart_items jsonb, p_location_id uuid, special_instructions text default null, pickup_time timestamptz default null)`

```js
const { data, error } = await supabase.rpc('place_order', {
  cart_items: [{ menu_item_id, quantity: 2 }],
  p_location_id: locationId,
})
```

The location is required. It is checked and locked inside the same transaction as the stock update, so a location that closes mid-checkout cannot still take the order. Orders can only be created through this function; the direct-insert policies on `orders` and `order_items` were removed in `20261019000001`.

| message | when |
|---|---|
| `Choose a pickup location` | `p_location_id` is null |
| `Unknown pickup location` | no such location |
| `<Name> is closed right now. Please try again when it reopens.` | that location is closed. Nothing is created and no stock is taken |
| `Cart is empty` | no items |

Orders already placed are unaffected by a location closing, and staff can keep fulfilling them. Stock errors are unchanged.

## Pickup codes (student sign-off)

Migration `20261022000000_order_pickup_codes.sql`. Every order gets a random 4-digit code when it is placed. Only the student who placed the order can read it; staff mark the order picked up by typing the code the student tells them. Orders that were waiting when this shipped were given codes.

The code lives in `order_pickup_codes` (not on `orders`) because staff can read every `orders` row. The table has a SELECT policy for the order's owner only, so staff and admins cannot read it, and no write policies. Read it with an embed:

```js
const { data } = await supabase.from('orders').select('*, order_pickup_codes(code)').eq('user_id', userId)
// order.order_pickup_codes?.code  ->  '0925' (null once the order is completed)
```

`orders` also gained `picked_up_at`, `picked_up_by` and `pickup_code_overridden`.

### `complete_order(p_order_id uuid, p_code text default null) returns jsonb`

```js
const { data, error } = await supabase.rpc('complete_order', { p_order_id: id, p_code: '0925' })
// data.result: 'ok' | 'wrong_code' | 'locked'
```

- Who: `canteen` and `admin`. Orders in `pending`, `preparing` or `ready` can be completed.
- `{ result: 'ok', order }`: the order is now `completed`; who and when are recorded and the code is deleted.
- `{ result: 'wrong_code', attempts_left }`: nothing changes except the attempt count. These are returned, not raised, so the count survives. Surrounding spaces in the code are ignored.
- `{ result: 'locked' }`: five wrong codes locks the order against further code attempts, even the right one. An admin can still complete it with no code.
- `p_code = null` is an **admin override** for a student who cannot show a code. It is recorded as `pickup_code_overridden = true`. For canteen staff, a null code is an error.

| message | code | when |
|---|---|---|
| `Only canteen staff or admins can complete an order` | 42501 | any other signed-in user |
| `p_order_id is required` | 22023 | `null` |
| `order not found` | P0002 | no such order |
| `order cannot be completed: status is <status>` | 55000 | already completed or cancelled |
| `Enter the pickup code` | 22023 | `p_code` is null and the caller is not an admin |
| `This order has no pickup code. An admin can complete it without one.` | 55000 | no code row exists |

**Staff can no longer update `orders` directly.** The "Canteen and admins can update order status" policy was dropped, because a direct `update({ status: 'completed' })` would skip the code. Use `complete_order` to finish an order and `cancel_order` to cancel one.

## Kitchen steps and sold-out items

### `advance_order_status(p_order_id uuid, p_status text) returns orders`

Migration `20261030000001_advance_order_status.sql`. The canteen dashboard's Accept and Mark Ready buttons.

```js
const { data: order, error } = await supabase.rpc('advance_order_status', { p_order_id: id, p_status: 'preparing' })
```

- Who: `canteen` and `admin`. Only one step forward: `pending` -> `preparing`, `preparing` -> `ready`. Picking up stays with `complete_order`, cancelling with `cancel_order`.

| message | code | when |
|---|---|---|
| `Only canteen staff or admins can update an order` | 42501 | any other caller |
| `p_status must be preparing or ready` | 22023 | any other status |
| `order not found` | P0002 | no such order |
| `order cannot move to <status>: status is <status>` | 55000 | not at the step before (already moved, cancelled or completed) |

### Sold out

Migration `20261030000000_menu_item_sold_out_toggle.sql`. Staff mark an item sold out or available with a plain update, which now sticks:

```js
await supabase.from('menu_items').update({ is_available: false }).eq('id', id).select().single()
```

- `serving_count = 0` always forces `is_available = false`; restocking from 0 makes the item available again.
- Otherwise `is_available` is whatever staff last chose; orders and edits that change `serving_count` keep it.
- `place_order` rejects a sold-out item with the usual `Not enough servings available for item <id>` error, even if servings remain.

## Helpers (rarely needed from the client)

- `is_admin()` and `is_canteen_or_admin()` return a boolean for the current user. They are handy for route guards: `supabase.rpc('is_admin')`.

## Signup always creates a student
`handle_new_user()` (migration 20261017000001) ignores any `role` in the signup metadata, so every new account is a `student`. Privileged roles (`canteen`, `admin`, ...) are granted by an admin with `admin_set_user_role`; the admin dashboard has a role dropdown for it. An earlier version (20261008000004) still honoured `canteen` from the signup request, which let anyone register as canteen staff.
