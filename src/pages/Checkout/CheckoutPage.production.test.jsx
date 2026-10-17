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

jest.mock('../../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))

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

test('shows an error, no placeholder items, and a disabled Place Order when the fetch fails', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  renderPage()

  expect(await screen.findByText(/couldn't load the menu\. check your connection\./i)).toBeInTheDocument()
  expect(screen.queryByText('Pork Adobo')).not.toBeInTheDocument()
  expect(screen.queryByText(/showing sample menu items/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/cart is empty/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled()
  expect(supabase.rpc).not.toHaveBeenCalled()
})

test('Retry re-runs the fetch and enables ordering once items load', async () => {
  const menuQuery = jest
    .fn()
    .mockReturnValueOnce(makeThenable({ data: null, error: { message: 'fetch failed' } }))
    .mockReturnValue(
      makeThenable({
        data: [{ id: 'placeholder-pork-adobo', name: 'Pork Adobo', price: 70, serving_count: 5 }],
        error: null,
      }),
    )
  supabase.from.mockImplementation((table) =>
    table === 'canteen_settings' ? makeThenable({ data: { is_open: true }, error: null }) : menuQuery(table),
  )

  const user = userEvent.setup()
  renderPage()

  await user.click(await screen.findByRole('button', { name: /retry/i }))

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /place order/i })).toBeEnabled()
  expect(menuQuery).toHaveBeenCalledTimes(2)
})
