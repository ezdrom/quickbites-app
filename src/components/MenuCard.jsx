import { useState } from 'react'
import { useCart } from '../context/CartContext.jsx'

export default function MenuCard({ item, orderingClosed = false }) {
  const { items, addItem } = useCart()
  const [isFavorited, setIsFavorited] = useState(false)
  const quantity = items[item.id] ?? 0

  return (
    <div className="menu-card">
      <div className="menu-card-image" role="img" aria-label={item.name}>
        <span className={`menu-card-badge${item.available ? '' : ' menu-card-badge-unavailable'}`}>
          {item.available ? 'Available' : 'Unavailable'}
        </span>
        <span className="menu-card-name-overlay">{item.name}</span>
      </div>
      <div className="menu-card-body">
        <p className="menu-card-price">₱{item.price}</p>
        <p className="menu-card-desc">{item.description}</p>
        {typeof item.servingCount === 'number' && (
          <p className="menu-card-servings">
            {item.servingCount > 0 ? `${item.servingCount} servings left` : 'Sold out'}
          </p>
        )}
        <div className="menu-card-footer">
          <button
            type="button"
            className={`menu-card-star${isFavorited ? ' menu-card-star-active' : ''}`}
            onClick={() => setIsFavorited((prev) => !prev)}
            aria-label="Toggle favorite"
          >
            ★
          </button>
          <span className="menu-card-add-wrap">
            {quantity > 0 && <span className="menu-card-qty-badge">{quantity}</span>}
            <button
              type="button"
              className="menu-card-add"
              onClick={() => addItem(item.id)}
              disabled={!item.available || orderingClosed}
              title={orderingClosed ? 'The canteen is closed' : undefined}
              aria-label={`Add ${item.name} to cart`}
            >
              +
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
