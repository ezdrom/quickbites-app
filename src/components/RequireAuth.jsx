import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isDemoMode } from '../lib/env.js'

export function homeForRole(role) {
  return role === 'canteen' ? '/canteen-orders' : '/menu'
}

// Route guard. `roles` (optional) restricts access to those roles.
export default function RequireAuth({ roles }) {
  const { user, role, loading } = useAuth()

  if (isDemoMode) return <Outlet />

  if (loading) {
    return (
      <div className="auth-loading" role="status">
        Loading...
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (roles && !roles.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />
  }

  return <Outlet />
}

// Wraps a public page (/, /login). A signed-in canteen user goes straight to
// their dashboard instead. `waitForAuth` holds the redirect until auth resolves.
export function CanteenHomeRedirect({ waitForAuth = false, children }) {
  const { role, loading } = useAuth()

  if (isDemoMode) return children

  if (loading && waitForAuth) {
    return (
      <div className="auth-loading" role="status">
        Loading...
      </div>
    )
  }

  if (role === 'canteen') return <Navigate to={homeForRole(role)} replace />

  return children
}
