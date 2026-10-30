import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import CanteenStatusControl from '../../components/CanteenStatusControl.jsx'
import LoadError from '../../components/LoadError.jsx'
import SavedToast, { newFlash } from '../../components/SavedToast.jsx'
import useLocations from '../../hooks/useLocations.js'
import { supabase } from '../../lib/supabaseClient.js'

const REFRESH_MS = 15000

const STATUS_LABELS = {
  pending: 'New',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
}

// The one-tap kitchen steps. "Picked up" needs the student's code (below).
const NEXT_STEP = {
  pending: { status: 'preparing', label: 'Accept' },
  preparing: { status: 'ready', label: 'Mark Ready' },
}

export default function CanteenOrdersPage() {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const { locations } = useLocations({ pollMs: 0 })
  const [locationFilter, setLocationFilter] = useState('all')
  const [authorized, setAuthorized] = useState(null)
  const [role, setRole] = useState(null)
  const [connectionError, setConnectionError] = useState(false)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [completingId, setCompletingId] = useState(null)
  const [codes, setCodes] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const [advancingId, setAdvancingId] = useState(null)
  // "Saved ✓" handed over by another canteen page (e.g. after saving a menu item).
  const [flash, setFlash] = useState(() =>
    routerLocation.state?.flash ? newFlash(routerLocation.state.flash) : null,
  )
  const clearFlash = useCallback(() => setFlash(null), [])

  useEffect(() => {
    checkAccessAndLoad()
    // Drop the handed-over message so a refresh or Back doesn't show it again.
    if (routerLocation.state?.flash) navigate(routerLocation.pathname, { replace: true, state: null })
  }, [])

  // New orders show up on their own, so the tablet can stay on this page.
  useEffect(() => {
    if (!authorized) return undefined
    const timer = setInterval(() => loadOrders({ silent: true }), REFRESH_MS)
    return () => clearInterval(timer)
  }, [authorized])

  async function checkAccessAndLoad() {
    setLoading(true)
    setError('')

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError

      if (!user) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      if (!profile || !['canteen', 'admin'].includes(profile.role)) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      setRole(profile.role)
      setAuthorized(true)
      await loadOrders()
    } catch {
      setConnectionError(true)
      setAuthorized(true)
      setLoading(false)
    }
  }

  // `silent` is the background refresh: no spinner, and a failed refresh keeps
  // the list on screen instead of replacing it with an error.
  async function loadOrders({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, locations(name), order_items(quantity, unit_price, menu_items(name))')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      setLoading(false)
      setConnectionError(false)
      setOrders(data)
    } catch {
      if (silent) return
      setLoading(false)
      setConnectionError(true)
    }
  }

  const setRowError = (orderId, message) => setRowErrors((prev) => ({ ...prev, [orderId]: message }))

  // The student's pickup code is what signs the order off. An admin can
  // complete without one (code = null) when the student can't show it.
  async function handleMarkPickedUp(orderId, code) {
    if (connectionError) return
    setError('')
    setRowError(orderId, '')
    setCompletingId(orderId)
    try {
      const { data, error: rpcError } = await supabase.rpc('complete_order', {
        p_order_id: orderId,
        p_code: code,
      })
      if (rpcError) {
        setRowError(orderId, rpcError.message)
        return
      }
      if (data?.result === 'wrong_code') {
        const left = data.attempts_left
        setRowError(orderId, `That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`)
        setCodes((prev) => ({ ...prev, [orderId]: '' }))
        return
      }
      if (data?.result === 'locked') {
        setRowError(orderId, 'Too many wrong codes. Ask an admin to complete this order.')
        return
      }
      setOrders((prev) => prev.filter((order) => order.id !== orderId))
      setFlash(newFlash('Saved ✓'))
    } catch {
      setRowError(orderId, "Can't reach Supabase right now. Please try again.")
    } finally {
      setCompletingId(null)
    }
  }

  async function handleAdvance(orderId, nextStatus) {
    if (connectionError) return
    setRowError(orderId, '')
    setAdvancingId(orderId)
    try {
      const { data, error: rpcError } = await supabase.rpc('advance_order_status', {
        p_order_id: orderId,
        p_status: nextStatus,
      })
      if (rpcError) {
        setRowError(orderId, rpcError.message)
        return
      }
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? { ...order, status: data?.status ?? nextStatus } : order)),
      )
      setFlash(newFlash('Saved ✓'))
    } catch {
      setRowError(orderId, "Can't reach the server right now. Please try again.")
    } finally {
      setAdvancingId(null)
    }
  }

  function handleOverride(orderId) {
    if (!window.confirm('Complete this order without the pickup code? This is recorded on the order.')) return
    handleMarkPickedUp(orderId, null)
  }

  const visibleOrders =
    locationFilter === 'all' ? orders : orders.filter((order) => order.location_id === locationFilter)
  const filterName = locations.find((l) => l.id === locationFilter)?.name

  if (authorized === null) {
    return (
      <div className="canteen-page">
        <p className="auth-status">Checking access...</p>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="canteen-page">
        <p className="auth-error">You need a canteen or admin account to view orders.</p>
        <p className="auth-register-text">
          <Link to="/login" className="auth-inline-link">
            Log in
          </Link>{' '}
          with a canteen account to continue.
        </p>
      </div>
    )
  }

  return (
    <div className="canteen-page">
      <div className="canteen-page-header">
        <h1 className="menu-page-title">Orders</h1>
        <Link to="/canteen-menu" className="auth-inline-link">
          Manage Menu
        </Link>
      </div>

      <SavedToast flash={flash} onDone={clearFlash} />

      <CanteenStatusControl />

      {error && <p className="auth-error">{error}</p>}

      {loading ? (
        <p className="canteen-empty" role="status">
          Loading orders...
        </p>
      ) : connectionError ? (
        <div className="canteen-empty">
          <LoadError
            onRetry={checkAccessAndLoad}
            message="Can't reach the server right now, so orders can't be shown. Check the connection and tap Retry."
          />
        </div>
      ) : orders.length === 0 ? (
        <div className="canteen-empty">
          <p className="canteen-empty-title">No orders yet</p>
          <p className="canteen-empty-hint">New orders show up here automatically.</p>
        </div>
      ) : (
        <div className="canteen-list">
          {locations.length > 1 && (
            <label className="canteen-filter">
              Show orders for
              <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
                <option value="all">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {visibleOrders.length === 0 && (
            <div className="canteen-empty">
              <p className="canteen-empty-hint">No orders waiting for pickup at {filterName ?? 'this location'}.</p>
            </div>
          )}
          {visibleOrders.map((order) => (
            <div key={order.id} className="canteen-item canteen-order-item">
              <div className="canteen-item-info">
                <p className="canteen-item-name">
                  Order #{order.id.slice(0, 8)} — ₱{order.total_amount}{' '}
                  <span className={`orders-badge orders-badge-${order.status}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </p>
                <p className="canteen-item-meta">Pickup: {order.locations?.name ?? 'Unknown location'}</p>
                <ul className="canteen-order-lines">
                  {order.order_items.map((line, index) => (
                    <li key={index}>
                      {line.quantity}× {line.menu_items?.name ?? 'Unknown item'} (₱{line.unit_price} each)
                    </li>
                  ))}
                </ul>
                {order.special_instructions && (
                  <p className="canteen-item-meta">Note: {order.special_instructions}</p>
                )}
              </div>
              <div className="canteen-order-actions">
                {NEXT_STEP[order.status] && (
                  <Button
                    variant="gold"
                    disabled={advancingId === order.id || completingId === order.id}
                    onClick={() => handleAdvance(order.id, NEXT_STEP[order.status].status)}
                  >
                    {advancingId === order.id ? 'Saving...' : NEXT_STEP[order.status].label}
                  </Button>
                )}
                <form
                  className="canteen-item-actions pickup-code-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleMarkPickedUp(order.id, codes[order.id] ?? '')
                  }}
                >
                  <label className="pickup-code-field">
                    Pickup code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="0000"
                      aria-label={`Pickup code for order ${order.id.slice(0, 8)}`}
                      value={codes[order.id] ?? ''}
                      onChange={(event) =>
                        setCodes((prev) => ({ ...prev, [order.id]: event.target.value.replace(/\D/g, '') }))
                      }
                    />
                  </label>
                  <Button
                    type="submit"
                    variant={order.status === 'ready' ? 'gold' : 'outline'}
                    disabled={completingId === order.id || (codes[order.id] ?? '').length !== 4}
                  >
                    {completingId === order.id ? 'Marking...' : 'Mark Picked Up'}
                  </Button>
                  {role === 'admin' && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={completingId === order.id}
                      onClick={() => handleOverride(order.id)}
                    >
                      Complete without code
                    </Button>
                  )}
                  {rowErrors[order.id] && (
                    <p className="auth-error pickup-code-error" role="alert">
                      {rowErrors[order.id]}
                    </p>
                  )}
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
