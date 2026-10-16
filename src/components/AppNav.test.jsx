import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppNav, { NAV_LINKS } from './AppNav.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCart } from '../context/CartContext.jsx'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))
jest.mock('../context/AuthContext.jsx', () => ({ useAuth: jest.fn() }))
jest.mock('../context/CartContext.jsx', () => ({ useCart: jest.fn() }))

const signOut = jest.fn()

function renderNav(role, { totalCount = 0, email = 'jane@example.com' } = {}) {
  useAuth.mockReturnValue({ user: { id: 'u1', email }, role, signOut })
  useCart.mockReturnValue({ totalCount })
  render(
    <MemoryRouter>
      <AppNav />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
})

test('student sees Menu and the cart but no staff links', () => {
  renderNav('student')
  expect(screen.getByText('QuickBites')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/menu')
  expect(screen.getByRole('link', { name: /cart/i })).toHaveAttribute('href', '/checkout')
  expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Manage Menu' })).not.toBeInTheDocument()
})

test('canteen sees Orders and Manage Menu but no cart', () => {
  renderNav('canteen')
  expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/canteen-orders')
  expect(screen.getByRole('link', { name: 'Manage Menu' })).toHaveAttribute('href', '/canteen-menu')
  expect(screen.queryByRole('link', { name: 'Menu' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /cart/i })).not.toBeInTheDocument()
})

test('admin sees every link and the cart', () => {
  renderNav('admin')
  expect(screen.getByRole('link', { name: 'Menu' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Manage Menu' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /cart/i })).toBeInTheDocument()
})

test('student and admin see My Orders; canteen does not', () => {
  renderNav('student')
  expect(screen.getByRole('link', { name: 'My Orders' })).toHaveAttribute('href', '/orders')
  cleanup()
  renderNav('admin')
  expect(screen.getByRole('link', { name: 'My Orders' })).toHaveAttribute('href', '/orders')
  cleanup()
  renderNav('canteen')
  expect(screen.queryByRole('link', { name: 'My Orders' })).not.toBeInTheDocument()
})

test('only admins get the Admin link', () => {
  renderNav('admin')
  expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
})

test('students and canteen staff do not get the Admin link', () => {
  expect(NAV_LINKS.student.some((l) => l.to === '/admin')).toBe(false)
  expect(NAV_LINKS.canteen.some((l) => l.to === '/admin')).toBe(false)
})

test('renders every configured link for each role', () => {
  Object.entries(NAV_LINKS).forEach(([role, links]) => {
    const { unmount } = (() => {
      useAuth.mockReturnValue({ user: { id: 'u1', email: 'a@b.c' }, role, signOut })
      useCart.mockReturnValue({ totalCount: 0 })
      return render(
        <MemoryRouter>
          <AppNav />
        </MemoryRouter>,
      )
    })()
    links.forEach(({ to, label }) => {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', to)
    })
    unmount()
  })
})

test('shows the cart count and the user email', () => {
  renderNav('student', { totalCount: 3 })
  expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toHaveTextContent('3')
  expect(screen.getByText('jane@example.com')).toBeInTheDocument()
})

test('Logout signs out and navigates to /login', async () => {
  const user = userEvent.setup()
  renderNav('student')

  await user.click(screen.getByRole('button', { name: /logout/i }))

  expect(signOut).toHaveBeenCalledTimes(1)
  expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
})
