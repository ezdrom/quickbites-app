import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from './RequireAuth.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { isDemoMode } from '../lib/env.js'

jest.mock('../context/AuthContext.jsx', () => ({ useAuth: jest.fn() }))
jest.mock('../lib/env.js', () => ({
  isDev: true,
  allowPlaceholderData: true,
  get isDemoMode() {
    return mockDemo.value
  },
}))

const mockDemo = { value: false }

function renderAt(path, roles) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/menu" element={<div>menu page</div>} />
        <Route path="/canteen-orders" element={<div>orders page</div>} />
        <Route element={<RequireAuth roles={roles} />}>
          <Route path="/secret" element={<div>secret page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockDemo.value = false
  useAuth.mockReset()
})

test('shows a loading state while auth resolves', () => {
  useAuth.mockReturnValue({ user: null, role: null, loading: true })
  renderAt('/secret')
  expect(screen.getByText('Loading...')).toBeInTheDocument()
  expect(screen.queryByText('login page')).not.toBeInTheDocument()
})

test('redirects unauthenticated visitors to /login', () => {
  useAuth.mockReturnValue({ user: null, role: null, loading: false })
  renderAt('/secret')
  expect(screen.getByText('login page')).toBeInTheDocument()
})

test('renders the route for any signed-in user when no roles are required', () => {
  useAuth.mockReturnValue({ user: { id: 'u1' }, role: 'student', loading: false })
  renderAt('/secret')
  expect(screen.getByText('secret page')).toBeInTheDocument()
})

test('renders the route when the role is allowed', () => {
  useAuth.mockReturnValue({ user: { id: 'u1' }, role: 'admin', loading: false })
  renderAt('/secret', ['canteen', 'admin'])
  expect(screen.getByText('secret page')).toBeInTheDocument()
})

test('sends a student with a disallowed role to /menu', () => {
  useAuth.mockReturnValue({ user: { id: 'u1' }, role: 'student', loading: false })
  renderAt('/secret', ['canteen', 'admin'])
  expect(screen.getByText('menu page')).toBeInTheDocument()
})

test('sends a canteen user with a disallowed role to /canteen-orders', () => {
  useAuth.mockReturnValue({ user: { id: 'u1' }, role: 'canteen', loading: false })
  renderAt('/secret', ['admin'])
  expect(screen.getByText('orders page')).toBeInTheDocument()
})

test('demo mode lets everyone through', () => {
  mockDemo.value = true
  expect(isDemoMode).toBe(true)
  useAuth.mockReturnValue({ user: null, role: null, loading: false })
  renderAt('/secret', ['admin'])
  expect(screen.getByText('secret page')).toBeInTheDocument()
})
