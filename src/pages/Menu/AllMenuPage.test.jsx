import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AllMenuPage from './AllMenuPage.jsx'
import { CartProvider } from '../../context/CartContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn() },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <CartProvider>
        <AllMenuPage />
      </CartProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('renders menu items returned from supabase', async () => {
  supabase.from.mockReturnValue(
    makeThenable({
      data: [
        {
          id: '1',
          name: 'Pork Adobo',
          price: 70,
          description: 'desc',
          is_available: true,
          serving_count: 5,
        },
      ],
      error: null,
    }),
  )

  renderPage()

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.queryByText(/showing sample menu items/i)).not.toBeInTheDocument()
})

test('falls back to placeholder items with a banner when supabase is unreachable', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  renderPage()

  expect(await screen.findByText(/showing sample menu items/i)).toBeInTheDocument()
  expect(screen.getByText('Pork Adobo')).toBeInTheDocument()
})

function mockMenu({ open }) {
  supabase.from.mockImplementation((table) =>
    table === 'canteen_settings'
      ? makeThenable({ data: { is_open: open }, error: null })
      : makeThenable({
          data: [
            { id: '1', name: 'Pork Adobo', price: 70, description: 'd', is_available: true, serving_count: 5 },
          ],
          error: null,
        }),
  )
}

test('shows a closed notice and disables adding to the cart while the canteen is closed', async () => {
  mockMenu({ open: false })

  renderPage()

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(await screen.findByText(/the canteen is closed right now/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add pork adobo to cart/i })).toBeDisabled()
})

test('has no closed notice and lets students add items while the canteen is open', async () => {
  mockMenu({ open: true })

  renderPage()

  expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.queryByText(/the canteen is closed right now/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add pork adobo to cart/i })).toBeEnabled()
})
