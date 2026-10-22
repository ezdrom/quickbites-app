import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '../pages/Login/LoginPage.jsx'
import ForgotPasswordPage from '../pages/ForgotPassword/ForgotPasswordPage.jsx'
import ResetPasswordPage from '../pages/ResetPassword/ResetPasswordPage.jsx'
import RegisterUserPage from '../pages/RegisterUser/RegisterUserPage.jsx'
import AllMenuPage from '../pages/Menu/AllMenuPage.jsx'
import CanteenMenuPage from '../pages/Canteen/CanteenMenuPage.jsx'
import CanteenOrdersPage from '../pages/Canteen/CanteenOrdersPage.jsx'
import CheckoutPage from '../pages/Checkout/CheckoutPage.jsx'
import AdminDashboardPage from '../pages/Admin/AdminDashboardPage.jsx'
import OrdersPage from '../pages/Orders/OrdersPage.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import AppLayout from '../components/AppLayout.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public routes (outside the guard) */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterUserPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register-user" element={<RegisterUserPage />} />

      {/* Any signed-in user */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/menu" element={<AllMenuPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
        </Route>
      </Route>

      {/* Canteen staff and admins */}
      <Route element={<RequireAuth roles={['canteen', 'admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/canteen-menu" element={<CanteenMenuPage />} />
          <Route path="/canteen-orders" element={<CanteenOrdersPage />} />
        </Route>
      </Route>

      {/* Admins only */}
      <Route element={<RequireAuth roles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
