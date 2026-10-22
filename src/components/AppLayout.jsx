import { Outlet } from 'react-router-dom'
import AppNav from './AppNav.jsx'

export default function AppLayout() {
  return (
    <>
      <AppNav />
      <Outlet />
    </>
  )
}
