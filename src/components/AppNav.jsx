import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'

// Nav links per role. Append entries here (e.g. My Orders -> /orders,
// Admin -> /admin) to extend the nav; each entry is { to, label }.
export const NAV_LINKS = {
  student: [
    { to: '/menu', label: 'Menu' },
    { to: '/orders', label: 'My Orders' },
  ],
  canteen: [
    { to: '/canteen-orders', label: 'Orders' },
    { to: '/canteen-menu', label: 'Manage Menu' },
  ],
  admin: [
    { to: '/menu', label: 'Menu' },
    { to: '/canteen-orders', label: 'Orders' },
    { to: '/canteen-menu', label: 'Manage Menu' },
    { to: '/orders', label: 'My Orders' },
    { to: '/admin', label: 'Admin' },
  ],
}

const linkClass = ({ isActive }) => `app-nav-link${isActive ? ' app-nav-link-active' : ''}`

export default function AppNav() {
  const { user, role, signOut } = useAuth()
  const { totalCount } = useCart()
  const navigate = useNavigate()

  const links = NAV_LINKS[role] ?? NAV_LINKS.student
  const showCart = role !== 'canteen'

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="app-nav">
      <span className="app-nav-brand">QuickBites</span>
      <nav className="app-nav-links" aria-label="Main">
        {links.map(({ to, label }) => (
          <NavLink key={to} to={to} className={linkClass}>
            {label}
          </NavLink>
        ))}
        {showCart && (
          <NavLink
            to="/checkout"
            className={linkClass}
            aria-label={`Cart, ${totalCount} ${totalCount === 1 ? 'item' : 'items'}`}
          >
            Cart <span className="app-nav-cart-count">{totalCount}</span>
          </NavLink>
        )}
      </nav>
      <div className="app-nav-user">
        {user?.email && <span className="app-nav-email">{user.email}</span>}
        <button type="button" className="app-nav-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
