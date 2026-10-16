import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CheckoutPage from './CheckoutPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

const mockUseCart = {
  items: {},
  updateQuantity: jest.fn(),
  clearCart: jest.fn(),
}

jest.mock('../../context/CartContext.jsx', () => ({
  useCart: () => mockUseCart,
}))

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <CheckoutPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseCart.items = { 'placeholder-pork-adobo': 2 }
})

test('shows an empty cart message when the cart has no items', async () => {
  mockUseCart.items = {}

  renderPage()

  expect(await screen.findByText(/cart is empty/i)).toBeInTheDocument()
})

test('renders cart rows and total from supabase menu items', async () => {
  supabase.from.mockReturnValue(
    makeThenable({
      data: [{ id: 'placeholder-pork-adobo', name: 'Pork Adobo', price: 70, serving_count: 5 }],
      error: null,
    }),
  )

  renderPage()

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByText(/Total: ₱140/)).toBeInTheDocument()
})

test('places an order and shows the confirmation', async () => {
  supabase.from.mockReturnValue(
    makeThenable({
      data: [{ id: 'placeholder-pork-adobo', name: 'Pork Adobo', price: 70, serving_count: 5 }],
      error: null,
    }),
  )
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.rpc.mockResolvedValue({ data: { total_amount: 140, status: 'pending' }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText(/order has been placed/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Track your order' })).toHaveAttribute('href', '/orders')
  expect(screen.getByRole('link', { name: 'Back to menu' })).toHaveAttribute('href', '/menu')
  expect(mockUseCart.clearCart).toHaveBeenCalled()
})

test('shows an error when placing an order while logged out', async () => {
  supabase.from.mockReturnValue(
    makeThenable({
      data: [{ id: 'placeholder-pork-adobo', name: 'Pork Adobo', price: 70, serving_count: 5 }],
      error: null,
    }),
  )
  supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText(/need to log in/i)).toBeInTheDocument()
})

test('falls back to placeholder cart rows with a banner when supabase is unreachable (dev/demo)', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  renderPage()

  expect(await screen.findByText(/showing sample menu items/i)).toBeInTheDocument()
  expect(screen.getByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByText(/Total: ₱140/)).toBeInTheDocument()
})
