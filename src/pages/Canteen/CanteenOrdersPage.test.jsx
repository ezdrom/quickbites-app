import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CanteenOrdersPage from './CanteenOrdersPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../../test/supabaseMock.js'

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
    if (table === 'locations') return makeThenable(locationsResult())
    return makeThenable({
      data: [
        {
          id: 'order-12345678',
          total_amount: 140,
          status: 'pending',
          special_instructions: null,
          location_id: 'loc-annex',
          locations: { name: 'Annex' },
          order_items: [{ quantity: 2, unit_price: 70, menu_items: { name: 'Pork Adobo' } }],
        },
      ],
      error: null,
    })
  })

  renderPage()

  expect(await screen.findByText(/Pork Adobo/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /mark picked up/i })).toBeInTheDocument()
  expect(screen.getByText('Pickup: Annex')).toBeInTheDocument()
})

test('shows a connection error instead of hanging when supabase is unreachable', async () => {
  supabase.auth.getUser.mockRejectedValue(new Error('fetch failed'))

  renderPage()

  expect(await screen.findByText(/can't reach supabase/i)).toBeInTheDocument()
})

function mockStaffWithOrders(orders) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    if (table === 'locations') return makeThenable(locationsResult())
    return makeThenable({ data: orders, error: null })
  })
}

const orderAt = (id, location_id, name, item) => ({
  id,
  total_amount: 70,
  status: 'pending',
  special_instructions: null,
  location_id,
  locations: { name },
  order_items: [{ quantity: 1, unit_price: 70, menu_items: { name: item } }],
})

test('shows the open/close control for every location to staff', async () => {
  mockStaffWithOrders([])

  renderPage()

  expect(await screen.findByText('Main is open')).toBeInTheDocument()
  expect(screen.getByText('Annex is open')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close Main' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close Annex' })).toBeInTheDocument()
})

test('shows all locations by default and can filter the queue to one', async () => {
  mockStaffWithOrders([
    orderAt('order-aaaaaaaa', 'loc-main', 'Main', 'Pork Adobo'),
    orderAt('order-bbbbbbbb', 'loc-annex', 'Annex', 'Chicken Sinigang'),
  ])
  const user = userEvent.setup()

  renderPage()

  expect(await screen.findByText(/Pork Adobo/)).toBeInTheDocument()
  expect(screen.getByText(/Chicken Sinigang/)).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/show orders for/i), 'Annex')

  expect(screen.queryByText(/Pork Adobo/)).not.toBeInTheDocument()
  expect(screen.getByText(/Chicken Sinigang/)).toBeInTheDocument()
  expect(screen.getByText('Pickup: Annex')).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/show orders for/i), 'All locations')

  expect(screen.getByText(/Pork Adobo/)).toBeInTheDocument()
})

test('says so when the chosen location has no orders waiting', async () => {
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'loc-main', 'Main', 'Pork Adobo')])
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.selectOptions(screen.getByLabelText(/show orders for/i), 'Annex')

  expect(screen.getByText(/no orders waiting for pickup at annex/i)).toBeInTheDocument()
})
