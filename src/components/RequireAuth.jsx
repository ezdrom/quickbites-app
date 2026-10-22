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
