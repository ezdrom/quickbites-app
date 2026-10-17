import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CanteenOrdersPage from './CanteenOrdersPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <CanteenOrdersPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('shows a login prompt when no user is signed in', async () => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

  renderPage()

  expect(await screen.findByText(/need a canteen or admin account/i)).toBeInTheDocument()
})

test('lists pending orders for a canteen user', async () => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    return makeThenable({
      data: [
        {
          id: 'order-12345678',
          total_amount: 140,
          status: 'pending',
          special_instructions: null,
          order_items: [{ quantity: 2, unit_price: 70, menu_items: { name: 'Pork Adobo' } }],
        },
      ],
      error: null,
    })
  })

  renderPage()

  expect(await screen.findByText(/Pork Adobo/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /mark picked up/i })).toBeInTheDocument()
})

test('shows a connection error instead of hanging when supabase is unreachable', async () => {
  supabase.auth.getUser.mockRejectedValue(new Error('fetch failed'))

  renderPage()

  expect(await screen.findByText(/can't reach supabase/i)).toBeInTheDocument()
})

test('shows the canteen open/close control to staff', async () => {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    if (table === 'canteen_settings') return makeThenable({ data: { is_open: true }, error: null })
    return makeThenable({ data: [], error: null })
  })

  renderPage()

  expect(await screen.findByText('Canteen is open')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close canteen' })).toBeInTheDocument()
})
