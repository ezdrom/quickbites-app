import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MenuCard from '../../components/MenuCard.jsx'
import Pagination from '../../components/Pagination.jsx'
import { useCart } from '../../context/CartContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import LoadError from '../../components/LoadError.jsx'
import CanteenClosedNotice from '../../components/CanteenClosedNotice.jsx'
import useCanteenStatus from '../../hooks/useCanteenStatus.js'
import { placeholderMenuItems } from '../../data/placeholderMenuItems.js'
import { allowPlaceholderData } from '../../lib/env.js'

const ITEMS_PER_PAGE = 9

function toCardItem(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    description: row.description,
    available: row.is_available,
    servingCount: row.serving_count,
  }
}

export default function AllMenuPage() {
  const { totalCount } = useCart()
  const { isOpen } = useCanteenStatus()
  const orderingClosed = isOpen === false
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [usingPlaceholder, setUsingPlaceholder] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  const retry = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let isMounted = true

    async function loadMenuItems() {
      setLoading(true)
      setLoadError(false)
      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*')
        .order('created_at', { ascending: true })

      if (!isMounted) return
      setLoading(false)

      if (fetchError) {
        if (allowPlaceholderData) {
          setUsingPlaceholder(true)
          setMenuItems(placeholderMenuItems.map(toCardItem))
        } else {
          setUsingPlaceholder(false)
          setMenuItems([])
          setLoadError(true)
        }
        return
      }

      setUsingPlaceholder(false)
      setMenuItems(data.map(toCardItem))
    }

    loadMenuItems()
    return () => {
      isMounted = false
    }
  }, [reloadKey])

  const pageCount = Math.max(1, Math.ceil(menuItems.length / ITEMS_PER_PAGE))
  const pageItems = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE
    return menuItems.slice(start, start + ITEMS_PER_PAGE)
  }, [menuItems, currentPage])

  return (
    <div className="menu-page">
      <div className="menu-page-header">
        <h1 className="menu-page-title">All Menu</h1>
        {totalCount > 0 && (
          <Link to="/checkout" className="cart-summary-link">
            🛒 {totalCount} item{totalCount > 1 ? 's' : ''} — Checkout
          </Link>
        )}
      </div>

      {orderingClosed && <CanteenClosedNotice />}

      {usingPlaceholder && (
        <p className="auth-status">
          Showing sample menu items — Supabase isn't reachable, so this is placeholder data.
        </p>
      )}

      {loading ? (
        <p className="auth-status">Loading menu...</p>
      ) : loadError ? (
        <LoadError onRetry={retry} />
      ) : (
        <>
          <div className="menu-grid">
            {pageItems.map((item) => (
              <MenuCard key={item.id} item={item} orderingClosed={orderingClosed} />
            ))}
          </div>
          <Pagination
            pageCount={pageCount}
            currentPage={currentPage}
            onPrev={() => setCurrentPage((page) => Math.max(0, page - 1))}
            onNext={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
          />
        </>
      )}
    </div>
  )
}
