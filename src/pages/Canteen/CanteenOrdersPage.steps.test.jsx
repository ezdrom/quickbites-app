import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CanteenOrdersPage from './CanteenOrdersPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}))

function renderPage(initialEntry = '/canteen-orders') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CanteenOrdersPage />
    </MemoryRouter>,
  )
}

const orderAt = (id, item, status = 'pending') => ({
  id,
  total_amount: 70,
  status,
  special_instructions: null,
  location_id: 'loc-main',
  locations: { name: 'Main' },
  order_items: [{ quantity: 1, unit_price: 70, menu_items: { name: item } }],
})

function mockStaffWithOrders(orders) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    if (table === 'locations') return makeThenable(locationsResult())
    return makeThenable({ data: orders, error: null })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.useRealTimers()
})

test('says "No orders yet" when the queue is empty', async () => {
  mockStaffWithOrders([])

  renderPage()

  expect(await screen.findByText('No orders yet')).toBeInTheDocument()
  expect(screen.getByText(/show up here automatically/i)).toBeInTheDocument()
})

test('Accept moves a new order to Preparing and confirms with "Saved ✓"', async () => {
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo')])
  supabase.rpc.mockResolvedValue({ data: { id: 'order-aaaaaaaa', status: 'preparing' }, error: null })
  const user = userEvent.setup()

  renderPage()
  expect(await screen.findByText('New')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Accept' }))

  expect(supabase.rpc).toHaveBeenCalledWith('advance_order_status', {
    p_order_id: 'order-aaaaaaaa',
    p_status: 'preparing',
  })
  expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
  expect(screen.getByText('Preparing')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mark Ready' })).toBeInTheDocument()
})

test('Mark Ready moves a preparing order to Ready, which leaves only the pickup step', async () => {
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo', 'preparing')])
  supabase.rpc.mockResolvedValue({ data: { id: 'order-aaaaaaaa', status: 'ready' }, error: null })
  const user = userEvent.setup()

  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Mark Ready' }))

  expect(supabase.rpc).toHaveBeenCalledWith('advance_order_status', { p_order_id: 'order-aaaaaaaa', p_status: 'ready' })
  expect(await screen.findByText('Ready for pickup')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mark Ready' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /mark picked up/i })).toBeInTheDocument()
})

test('shows the reason on the order when a status change is refused', async () => {
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo')])
  supabase.rpc.mockResolvedValue({ data: null, error: { message: 'order cannot move to preparing: status is cancelled' } })
  const user = userEvent.setup()

  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Accept' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/status is cancelled/)
  expect(screen.getByText('New')).toBeInTheDocument()
  expect(screen.queryByText('Saved ✓')).not.toBeInTheDocument()
})

test('shows "Saved ✓" handed over from another canteen page', async () => {
  mockStaffWithOrders([])

  renderPage({ pathname: '/canteen-orders', state: { flash: 'Saved ✓' } })

  expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
})

test('refreshes the queue on its own so new orders appear', async () => {
  jest.useFakeTimers()
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo')])

  renderPage()
  expect(await screen.findByText(/Pork Adobo/)).toBeInTheDocument()

  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo'), orderAt('order-bbbbbbbb', 'Chicken Sinigang')])
  await act(async () => {
    jest.advanceTimersByTime(15000)
  })

  await waitFor(() => expect(screen.getByText(/Chicken Sinigang/)).toBeInTheDocument())
})

test('a failed background refresh keeps the current orders on screen', async () => {
  jest.useFakeTimers()
  mockStaffWithOrders([orderAt('order-aaaaaaaa', 'Pork Adobo')])

  renderPage()
  expect(await screen.findByText(/Pork Adobo/)).toBeInTheDocument()

  supabase.from.mockImplementation(() => makeThenable({ data: null, error: new Error('fetch failed') }))
  await act(async () => {
    jest.advanceTimersByTime(15000)
  })

  expect(screen.getByText(/Pork Adobo/)).toBeInTheDocument()
  expect(screen.queryByText(/can't reach the server/i)).not.toBeInTheDocument()
})
