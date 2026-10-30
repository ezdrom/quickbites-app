import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CheckoutPage from './CheckoutPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable, routeTables } from '../../test/supabaseMock.js'

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

const cartItem = { id: 'placeholder-pork-adobo', name: 'Pork Adobo', price: 70, serving_count: 5 }
const menuResult = { data: [cartItem], error: null }

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
  routeTables(supabase, { locations: locationsResult() })

  renderPage()

  expect(await screen.findByText(/cart is empty/i)).toBeInTheDocument()
})

test('renders cart rows and total from supabase menu items', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })

  renderPage()

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByText(/Total: ₱140/)).toBeInTheDocument()
})

test('lets the student choose a pickup location and starts on the first open one', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })

  renderPage()

  expect(await screen.findByRole('radio', { name: /main/i })).toBeChecked()
  expect(screen.getByRole('radio', { name: /annex/i })).not.toBeChecked()
})

test('says an order is picked up at one location only', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })

  renderPage()

  expect(await screen.findByText(/whole order is picked up at one location/i)).toBeInTheDocument()
  expect(screen.getByText(/place two separate orders/i)).toBeInTheDocument()
})

test('places an order at the default location and shows where to pick it up', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.rpc.mockResolvedValue({ data: { total_amount: 140, status: 'pending' }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText(/order has been placed/i)).toBeInTheDocument()
  expect(supabase.rpc).toHaveBeenCalledWith('place_order', {
    cart_items: [{ menu_item_id: 'placeholder-pork-adobo', quantity: 2 }],
    p_location_id: 'loc-main',
  })
  expect(screen.getByText('Pick it up at Main.')).toBeInTheDocument()
  expect(screen.getByText(/your pickup code is under my orders/i)).toBeInTheDocument()
  expect(screen.getByText(/no time limit, so collect any time before the canteen closes/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Track your order' })).toHaveAttribute('href', '/orders')
  expect(screen.getByRole('link', { name: 'Back to menu' })).toHaveAttribute('href', '/menu')
  expect(mockUseCart.clearCart).toHaveBeenCalled()
})

test('orders for the location the student picked', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.rpc.mockResolvedValue({ data: { total_amount: 140, status: 'pending' }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('radio', { name: /annex/i }))
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText('Pick it up at Annex.')).toBeInTheDocument()
  expect(supabase.rpc).toHaveBeenCalledWith('place_order', expect.objectContaining({ p_location_id: 'loc-annex' }))
})

test('shows an error when placing an order while logged out', async () => {
  routeTables(supabase, { menu_items: menuResult, locations: locationsResult() })
  supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText(/need to log in/i)).toBeInTheDocument()
})

test('falls back to placeholder cart rows and locations with a banner when supabase is unreachable (dev/demo)', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  renderPage()

  expect(await screen.findByText(/showing sample menu items/i)).toBeInTheDocument()
  expect(screen.getByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByText(/Total: ₱140/)).toBeInTheDocument()
  expect(await screen.findByRole('radio', { name: /annex/i })).toBeInTheDocument()
})

test('a closed location shows a notice that points to the open one and blocks ordering there', async () => {
  routeTables(supabase, {
    menu_items: menuResult,
    locations: locationsResult({ Annex: { is_open: false } }),
  })

  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('radio', { name: /annex/i }))

  expect(await screen.findByText(/annex is closed right now\. you can order from main instead/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled()
  expect(supabase.rpc).not.toHaveBeenCalled()

  await user.click(screen.getByRole('radio', { name: /main/i }))

  expect(screen.queryByText(/is closed right now/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled()
})

test('when every location is closed there is nowhere to point to', async () => {
  routeTables(supabase, {
    menu_items: menuResult,
    locations: locationsResult({ Main: { is_open: false }, Annex: { is_open: false } }),
  })

  renderPage()

  expect(await screen.findByText(/main is closed right now\. you can still browse the menu/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled()
})

test('when the server refuses because the location just closed, it says why and updates the page', async () => {
  const locations = jest
    .fn()
    .mockReturnValueOnce(locationsResult())
    .mockReturnValue(locationsResult({ Main: { is_open: false } }))
  supabase.from.mockImplementation((table) =>
    makeThenable(table === 'locations' ? locations() : menuResult),
  )
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.rpc.mockResolvedValue({
    data: null,
    error: { message: 'Main is closed right now. Please try again when it reopens.' },
  })

  const user = userEvent.setup()
  renderPage()
  await screen.findByText('Pork Adobo')
  await user.click(screen.getByRole('button', { name: /place order/i }))

  expect(await screen.findByText(/please try again when it reopens/i)).toBeInTheDocument()
  expect(await screen.findByText(/you can order from annex instead/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled()
  expect(mockUseCart.clearCart).not.toHaveBeenCalled()
})
