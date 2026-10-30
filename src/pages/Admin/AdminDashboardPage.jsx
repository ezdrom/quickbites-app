import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LoadError from '../../components/LoadError.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'

// Keep in sync with profiles_role_check (see docs/backend-contract.md).
const ROLES = ['student', 'instructor', 'staff', 'canteen', 'admin']

const TOP_ITEMS_LIMIT = 5

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

function formatPeso(value) {
  return pesoFormatter.format(Number(value) || 0)
}

function toDateInput(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return { from: toDateInput(from), to: toDateInput(to) }
}

// Parse a 'YYYY-MM-DD' string as a local date (new Date(str) would be UTC).
function formatDay(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(value)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatJoined(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isNotAuthorized(error) {
  return error?.code === '42501' || /not authorized/i.test(error?.message ?? '')
}

// supabase-js usually returns { error } but can also throw (network failure).
// Normalise both into { data } or { error }.
async function callRpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) return { error }
    return { data }
  } catch (error) {
    return { error }
  }
}

// Turn an RPC error into section state. Validation errors (22023) carry a
// message that is useful to the admin (e.g. "date range too large"); anything
// else is treated as a connectivity problem.
function describeError(error, fallback) {
  if (isNotAuthorized(error)) return { unauthorized: true, message: '' }
  if (error?.code === '22023' && error.message) return { unauthorized: false, message: error.message }
  return { unauthorized: false, message: fallback }
}

function NotAuthorized() {
  return (
    <p className="auth-error admin-unauthorized" role="alert">
      You are not authorized to view this. Admin access is required.
    </p>
  )
}

// Loads one RPC into { status, data, error } and ignores stale responses.
function useRpc(name, args, enabled, fallbackMessage) {
  const [state, setState] = useState({ status: 'loading', data: [], error: null })
  const latest = useRef(0)
  const argsKey = JSON.stringify(args)

  const load = useCallback(async () => {
    const ticket = ++latest.current
    setState((s) => ({ ...s, status: 'loading', error: null }))
    const { data, error } = await callRpc(name, JSON.parse(argsKey))
    if (ticket !== latest.current) return
    if (error) {
      setState({ status: 'error', data: [], error: describeError(error, fallbackMessage) })
    } else {
      setState({ status: 'ready', data: Array.isArray(data) ? data : [], error: null })
    }
  }, [name, argsKey, fallbackMessage])

  useEffect(() => {
    if (enabled) load()
    return () => {
      latest.current += 1
    }
  }, [enabled, load])

  return { ...state, reload: load }
}

function SectionBody({ state, children }) {
  if (state.status === 'loading') return <p className="auth-status admin-status">Loading...</p>
  if (state.status === 'error') {
    if (state.error.unauthorized) return <NotAuthorized />
    return <LoadError onRetry={state.reload} message={state.error.message} />
  }
  return children
}

function UsersSection() {
  const { user: currentUser } = useAuth()
  const users = useRpc('admin_list_users', {}, true, "Couldn't load users. Check your connection.")
  const [query, setQuery] = useState('')
  // Per-row role-change state: { [id]: { saving, pendingRole, message, ok } }
  const [rows, setRows] = useState({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users.data
    return users.data.filter(
      (u) => (u.full_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q),
    )
  }, [users.data, query])

  const [overrides, setOverrides] = useState({})

  async function changeRole(target, nextRole) {
    if (nextRole === (overrides[target.id] ?? target.role)) return
    setRows((r) => ({ ...r, [target.id]: { saving: true, pendingRole: nextRole } }))
    const { error } = await callRpc('admin_set_user_role', { p_user_id: target.id, p_role: nextRole })
    if (error) {
      // Revert: the select falls back to the last known good role.
      const raw = error?.message ?? ''
      const message =
        raw && !/failed to fetch|networkerror|network request/i.test(raw)
          ? raw
          : "Couldn't change the role. Check your connection."
      setRows((r) => ({ ...r, [target.id]: { saving: false, ok: false, message } }))
    } else {
      setOverrides((o) => ({ ...o, [target.id]: nextRole }))
      setRows((r) => ({ ...r, [target.id]: { saving: false, ok: true, message: `Role changed to ${nextRole}.` } }))
    }
  }

  return (
    <section className="admin-section" aria-labelledby="admin-users-heading">
      <h2 id="admin-users-heading" className="admin-section-title">Users</h2>
      <SectionBody state={users}>
        <div className="form-field admin-search">
          <label htmlFor="admin-user-search">Search users</label>
          <input
            id="admin-user-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
          />
        </div>
        {users.data.length === 0 ? (
          <p className="auth-status admin-status">No users yet.</p>
        ) : filtered.length === 0 ? (
          <p className="auth-status admin-status">No users match your search.</p>
        ) : (
          <ul className="admin-user-list">
            {filtered.map((u) => {
              const row = rows[u.id] ?? {}
              const currentRole = overrides[u.id] ?? u.role
              const isSelf = Boolean(currentUser?.id) && u.id === currentUser.id
              const options = ROLES.includes(currentRole) ? ROLES : [currentRole, ...ROLES]
              const label = u.full_name || u.email || 'user'
              return (
                <li key={u.id} className="admin-user">
                  <div className="admin-user-info">
                    <p className="admin-user-name">
                      {u.full_name || 'Unnamed user'}
                      {isSelf && <span className="admin-user-you"> (you)</span>}
                    </p>
                    <p className="admin-user-email">{u.email}</p>
                    <p className="admin-user-joined">Joined {formatJoined(u.created_at)}</p>
                  </div>
                  <div className="admin-user-role">
                    <label className="admin-role-label" htmlFor={`role-${u.id}`}>
                      Role for {label}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      className="admin-role-select"
                      value={row.saving ? row.pendingRole : currentRole}
                      disabled={isSelf || row.saving}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {options.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {isSelf && <p className="admin-row-note">You can't change your own role.</p>}
                    {row.saving && <p className="auth-status admin-row-note">Saving...</p>}
                    {!row.saving && row.message && (
                      <p
                        className={row.ok ? 'auth-status admin-row-note' : 'auth-error admin-row-note'}
                        role={row.ok ? 'status' : 'alert'}
                      >
                        {row.message}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionBody>
    </section>
  )
}

function SalesSection({ range, enabled }) {
  const args = useMemo(() => ({ p_from: range.from, p_to: range.to }), [range.from, range.to])
  const sales = useRpc('admin_sales_summary', args, enabled, "Couldn't load sales. Check your connection.")

  const totals = useMemo(
    () =>
      sales.data.reduce(
        (acc, d) => ({
          orders: acc.orders + (Number(d.orders_count) || 0),
          revenue: acc.revenue + (Number(d.revenue) || 0),
        }),
        { orders: 0, revenue: 0 },
      ),
    [sales.data],
  )
  const maxRevenue = Math.max(0, ...sales.data.map((d) => Number(d.revenue) || 0))

  return (
    <section className="admin-section" aria-labelledby="admin-sales-heading">
      <h2 id="admin-sales-heading" className="admin-section-title">Sales</h2>
      {!enabled ? (
        <p className="auth-status admin-status">Choose a valid date range to see sales.</p>
      ) : (
        <SectionBody state={sales}>
          {sales.data.length === 0 || totals.orders === 0 ? (
            <p className="auth-status admin-status">No completed orders in this date range.</p>
          ) : (
            <>
              <dl className="admin-totals">
                <div className="admin-total">
                  <dt>Orders</dt>
                  <dd data-testid="sales-orders-total">{totals.orders}</dd>
                </div>
                <div className="admin-total">
                  <dt>Revenue</dt>
                  <dd data-testid="sales-revenue-total">{formatPeso(totals.revenue)}</dd>
                </div>
              </dl>
              <ul className="admin-days" aria-label="Sales per day">
                {sales.data.map((d) => {
                  const revenue = Number(d.revenue) || 0
                  const pct = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0
                  return (
                    <li key={d.day} className="admin-day" data-testid="sales-day">
                      <span className="admin-day-label">{formatDay(d.day)}</span>
                      <span className="admin-bar-track" aria-hidden="true">
                        <span className="admin-bar" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="admin-day-values">
                        {Number(d.orders_count) || 0} {Number(d.orders_count) === 1 ? 'order' : 'orders'},{' '}
                        {formatPeso(revenue)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </SectionBody>
      )}
    </section>
  )
}

function TopItemsSection({ range, enabled }) {
  const args = useMemo(
    () => ({ p_from: range.from, p_to: range.to, p_limit: TOP_ITEMS_LIMIT }),
    [range.from, range.to],
  )
  const top = useRpc('admin_top_items', args, enabled, "Couldn't load top items. Check your connection.")

  return (
    <section className="admin-section" aria-labelledby="admin-top-heading">
      <h2 id="admin-top-heading" className="admin-section-title">Top items</h2>
      {!enabled ? (
        <p className="auth-status admin-status">Choose a valid date range to see top items.</p>
      ) : (
        <SectionBody state={top}>
          {top.data.length === 0 ? (
            <p className="auth-status admin-status">No items sold in this date range.</p>
          ) : (
            <ol className="admin-top-list">
              {top.data.map((item) => (
                <li key={item.menu_item_id ?? item.name} className="admin-top-item">
                  <span className="admin-top-name">{item.name}</span>
                  <span className="admin-top-values">
                    {Number(item.quantity_sold) || 0} sold, {formatPeso(item.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SectionBody>
      )}
    </section>
  )
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState(defaultRange)

  let rangeError = ''
  if (!range.from || !range.to) rangeError = 'Choose both a start and an end date.'
  else if (range.from > range.to) rangeError = 'The start date must be on or before the end date.'
  const rangeValid = !rangeError

  return (
    <div className="admin-page">
      <h1 className="menu-page-title">Admin Dashboard</h1>

      <UsersSection />

      <div className="admin-reports">
        <h2 className="admin-reports-title">Reports</h2>
        <div className="admin-range">
          <div className="form-field">
            <label htmlFor="admin-from">From</label>
            <input
              id="admin-from"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="admin-to">To</label>
            <input
              id="admin-to"
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
        </div>
        {rangeError && (
          <p className="auth-error admin-range-error" role="alert">
            {rangeError}
          </p>
        )}
        <SalesSection range={range} enabled={rangeValid} />
        <TopItemsSection range={range} enabled={rangeValid} />
      </div>
    </div>
  )
}
