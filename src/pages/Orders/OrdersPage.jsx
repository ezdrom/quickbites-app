import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import LoadError from '../../components/LoadError.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'

const POLL_INTERVAL_MS = 15000
const ACTIVE_STATUSES = ['pending', 'preparing', 'ready']

const STATUS_LABELS = {
  pending: 'Order received',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  completed: 'Picked up',
  cancelled: 'Cancelled',
}

const isActive = (order) => ACTIVE_STATUSES.includes(order.status)

function formatPlaced(createdAt) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function OrderCard({ order, cancelling, cancelError, onCancel }) {
  const placed = formatPlaced(order.created_at)
  const label = STATUS_LABELS[order.status] ?? order.status

  return (
    <li className="orders-card">
      <div className="orders-card-header">
        <div>
          <p className="canteen-item-name">Order #{order.id.slice(0, 8)}</p>
          {placed && <p className="canteen-item-meta">Placed {placed}</p>}
        </div>
        <span className={`orders-badge orders-badge-${order.status}`}>{label}</span>
      </div>

      <ul className="orders-lines">
        {(order.order_items ?? []).map((line, index) => (
          <li key={index}>
            {line.quantity} x {line.menu_items?.name ?? 'Unknown item'}
          </li>
        ))}
      </ul>

      {order.special_instructions && (
        <p className="canteen-item-meta orders-note">Note: {order.special_instructions}</p>
      )}

      <div className="orders-card-footer">
        <p className="orders-total">Total: ₱{order.total_amount}</p>
        {order.status === 'pending' && (
          <Button variant="outline" disabled={cancelling} onClick={() => onCancel(order.id)}>
            {cancelling ? 'Cancelling...' : 'Cancel order'}
          </Button>
        )}
      </div>

      {cancelError && (
        <p className="auth-error orders-error" role="alert">
          {cancelError}
        </p>
      )}
    </li>
  )
}

export default function OrdersPage() {
  const { user } = useAuth()
  const userId = user?.id
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelErrors, setCancelErrors] = useState({})
  // Bumped to discard responses from loads that started before a newer change.
  const loadSeq = useRef(0)

  // quiet = background refresh: keep the current list on failure instead of
  // swapping it for the error state.
  const loadOrders = useCallback(
    async ({ quiet = false } = {}) => {
      if (!userId) return
      const seq = ++loadSeq.current
      if (!quiet) {
        setLoading(true)
        setLoadError(false)
      }
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(quantity, unit_price, menu_items(name))')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (seq !== loadSeq.current) return
        if (error) throw error
        setOrders(data ?? [])
        setLoadError(false)
        setLoading(false)
      } catch {
        if (seq !== loadSeq.current) return
        if (!quiet) {
          setLoadError(true)
          setLoading(false)
        }
      }
    },
    [userId],
  )

  useEffect(() => {
    loadOrders()
    return () => {
      loadSeq.current += 1
    }
  }, [loadOrders])

  const hasActive = orders.some(isActive)

  // Poll every 15s while the tab is visible and something is still in progress.
  useEffect(() => {
    if (!hasActive) return undefined
    let timer = null
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = () => {
      stop()
      timer = setInterval(() => loadOrders({ quiet: true }), POLL_INTERVAL_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop()
      } else {
        loadOrders({ quiet: true })
        start()
      }
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [hasActive, loadOrders])

  async function handleCancel(orderId) {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return
    setCancellingId(orderId)
    setCancelErrors((prev) => ({ ...prev, [orderId]: '' }))
    try {
      const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId })
      if (error) throw error
      loadSeq.current += 1 // drop any in-flight refresh that still says "pending"
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? { ...order, ...data, status: 'cancelled' } : order)),
      )
    } catch (err) {
      const message = err?.message || "Couldn't cancel the order. Please try again."
      setCancelErrors((prev) => ({ ...prev, [orderId]: message }))
      // The status may have changed meanwhile (e.g. canteen started preparing).
      loadOrders({ quiet: true })
    } finally {
      setCancellingId(null)
    }
  }

  const activeOrders = orders.filter(isActive)
  const pastOrders = orders.filter((order) => !isActive(order))

  const renderCard = (order) => (
    <OrderCard
      key={order.id}
      order={order}
      cancelling={cancellingId === order.id}
      cancelError={cancelErrors[order.id]}
      onCancel={handleCancel}
    />
  )

  let content
  if (loading) {
    content = <p className="auth-status">Loading your orders...</p>
  } else if (loadError) {
    content = <LoadError onRetry={() => loadOrders()} message="Couldn't load your orders. Check your connection." />
  } else if (orders.length === 0) {
    content = (
      <>
        <p className="auth-status">You haven't placed any orders yet.</p>
        <Link to="/menu" className="auth-inline-link">
          Browse the menu
        </Link>
      </>
    )
  } else {
    content = (
      <>
        {activeOrders.length > 0 && (
          <section aria-labelledby="orders-active-heading" className="orders-section">
            <h2 id="orders-active-heading" className="orders-section-title">
              Active orders
            </h2>
            <ul className="orders-list">{activeOrders.map(renderCard)}</ul>
          </section>
        )}
        {pastOrders.length > 0 && (
          <section aria-labelledby="orders-past-heading" className="orders-section">
            <h2 id="orders-past-heading" className="orders-section-title">
              Past orders
            </h2>
            <ul className="orders-list">{pastOrders.map(renderCard)}</ul>
          </section>
        )}
      </>
    )
  }

  return (
    <div className="orders-page">
      <h1 className="menu-page-title">My Orders</h1>
      {content}
    </div>
  )
}
