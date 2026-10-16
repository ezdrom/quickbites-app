import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import OrdersPage from './OrdersPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, role: 'student', loading: false }),
}))

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

function makeOrder(overrides = {}) {
  return {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    user_id: 'user-1',
    status: 'pending',
    total_amount: 140,
    special_instructions: null,
    created_at: '2026-10-08T05:30:00Z',
    order_items: [{ quantity: 2, unit_price: 70, menu_items: { name: 'Pork Adobo' } }],
    ...overrides,
  }
}

const pending = makeOrder()
const ready = makeOrder({
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  status: 'ready',
  total_amount: 55,
  special_instructions: 'No onions please',
  order_items: [{ quantity: 1, unit_price: 55, menu_items: { name: 'Chicken Sisig' } }],
})
const completed = makeOrder({
  id: 'cccccccc-1111-2222-3333-444444444444',
  status: 'completed',
  created_at: '2026-10-07T05:30:00Z',
})
const cancelled = makeOrder({
  id: 'dddddddd-1111-2222-3333-444444444444',
  status: 'cancelled',
  created_at: '2026-10-06T05:30:00Z',
})

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  )
}

function cardFor(shortId) {
  return screen.getByText(`Order #${shortId}`).closest('li')
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('queries only the signed-in user orders, newest first', async () => {
  const builder = makeThenable({ data: [pending], error: null })
  supabase.from.mockReturnValue(builder)

  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  expect(supabase.from).toHaveBeenCalledWith('orders')
  expect(builder.select).toHaveBeenCalledWith('*, order_items(quantity, unit_price, menu_items(name))')
  expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
  expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
})

test('renders order details: short id, items, total, note', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [ready], error: null }))

  renderPage()

  const card = within(await screen.findByText('Order #bbbbbbbb').then(() => cardFor('bbbbbbbb')))
  expect(card.getByText(/1 x Chicken Sisig/)).toBeInTheDocument()
  expect(card.getByText('Total: ₱55')).toBeInTheDocument()
  expect(card.getByText(/No onions please/)).toBeInTheDocument()
  expect(card.getByText(/Placed/)).toBeInTheDocument()
})

test('lists active orders above a Past orders section', async () => {
  // API order is newest first; the past order is the newest here on purpose.
  supabase.from.mockReturnValue(makeThenable({ data: [completed, cancelled, pending, ready], error: null }))

  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(headings).toEqual(['Active orders', 'Past orders'])

  const ids = screen.getAllByText(/^Order #/).map((el) => el.textContent)
  expect(ids).toEqual(['Order #aaaaaaaa', 'Order #bbbbbbbb', 'Order #cccccccc', 'Order #dddddddd'])

  const past = screen.getByRole('heading', { name: 'Past orders' }).closest('section')
  expect(within(past).getByText('Order #cccccccc')).toBeInTheDocument()
  expect(within(past).queryByText('Order #aaaaaaaa')).not.toBeInTheDocument()
})

test('shows friendly status labels', async () => {
  const preparing = makeOrder({ id: 'eeeeeeee-1111-2222-3333-444444444444', status: 'preparing' })
  supabase.from.mockReturnValue(
    makeThenable({ data: [pending, preparing, ready, completed, cancelled], error: null }),
  )

  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  expect(within(cardFor('aaaaaaaa')).getByText('Order received')).toBeInTheDocument()
  expect(within(cardFor('eeeeeeee')).getByText('Being prepared')).toBeInTheDocument()
  expect(within(cardFor('bbbbbbbb')).getByText('Ready for pickup')).toBeInTheDocument()
  expect(within(cardFor('cccccccc')).getByText('Picked up')).toBeInTheDocument()
  expect(within(cardFor('dddddddd')).getByText('Cancelled')).toBeInTheDocument()
})

test('only pending orders get a Cancel order button', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [pending, ready, completed, cancelled], error: null }))

  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  expect(screen.getAllByRole('button', { name: 'Cancel order' })).toHaveLength(1)
  expect(within(cardFor('aaaaaaaa')).getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
})

test('shows an empty state linking to the menu', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [], error: null }))

  renderPage()

  expect(await screen.findByText(/haven't placed any orders/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /browse the menu/i })).toHaveAttribute('href', '/menu')
})

test('cancel: confirms, calls the RPC with p_order_id and shows Cancelled', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))
  supabase.rpc.mockResolvedValue({ data: { ...pending, status: 'cancelled' }, error: null })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  await user.click(screen.getByRole('button', { name: 'Cancel order' }))

  expect(window.confirm).toHaveBeenCalled()
  expect(supabase.rpc).toHaveBeenCalledWith('cancel_order', { p_order_id: pending.id })
  const card = within(cardFor('aaaaaaaa'))
  expect(await card.findByText('Cancelled')).toBeInTheDocument()
  expect(card.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument()
  // Cancelled orders move to the past section.
  const past = screen.getByRole('heading', { name: 'Past orders' }).closest('section')
  expect(within(past).getByText('Order #aaaaaaaa')).toBeInTheDocument()
})

test('cancel: does nothing when the confirm is declined', async () => {
  window.confirm.mockReturnValue(false)
  supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  await user.click(screen.getByRole('button', { name: 'Cancel order' }))

  expect(supabase.rpc).not.toHaveBeenCalled()
  expect(within(cardFor('aaaaaaaa')).getByText('Order received')).toBeInTheDocument()
})

test('cancel: disables the button while the RPC is running', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))
  let resolveRpc
  supabase.rpc.mockReturnValue(new Promise((resolve) => (resolveRpc = resolve)))

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  await user.click(screen.getByRole('button', { name: 'Cancel order' }))

  expect(screen.getByRole('button', { name: 'Cancelling...' })).toBeDisabled()

  await act(async () => {
    resolveRpc({ data: { ...pending, status: 'cancelled' }, error: null })
  })
  expect(within(cardFor('aaaaaaaa')).getByText('Cancelled')).toBeInTheDocument()
})

test('cancel error: shows the message and reloads the list', async () => {
  supabase.from
    .mockReturnValueOnce(makeThenable({ data: [pending], error: null }))
    .mockReturnValueOnce(makeThenable({ data: [{ ...pending, status: 'preparing' }], error: null }))
  supabase.rpc.mockResolvedValue({
    data: null,
    error: { message: 'order cannot be cancelled: status is preparing' },
  })

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  await user.click(screen.getByRole('button', { name: 'Cancel order' }))

  expect(await screen.findByText('order cannot be cancelled: status is preparing')).toBeInTheDocument()
  // The reload picked up the new status, so the cancel button is gone.
  expect(await within(cardFor('aaaaaaaa')).findByText('Being prepared')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /cancel order/i })).not.toBeInTheDocument()
  expect(supabase.from).toHaveBeenCalledTimes(2)
})

test('cancel error: handles the RPC throwing', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))
  supabase.rpc.mockRejectedValue(new Error('fetch failed'))

  const user = userEvent.setup()
  renderPage()

  await screen.findByText('Order #aaaaaaaa')
  await user.click(screen.getByRole('button', { name: 'Cancel order' }))

  expect(await screen.findByText('fetch failed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel order' })).toBeEnabled()
})

test('fetch error ({ error }) shows Retry, and Retry reloads', async () => {
  supabase.from
    .mockReturnValueOnce(makeThenable({ data: null, error: { message: 'fetch failed' } }))
    .mockReturnValueOnce(makeThenable({ data: [pending], error: null }))

  const user = userEvent.setup()
  renderPage()

  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load your orders/i)
  expect(screen.queryByText('Order #aaaaaaaa')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Order #aaaaaaaa')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
})

test('fetch that throws also shows Retry', async () => {
  const builder = makeThenable(null)
  builder.then = (resolve, reject) => Promise.reject(new Error('network down')).then(resolve, reject)
  supabase.from.mockReturnValue(builder)

  renderPage()

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
})

describe('polling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  test('re-fetches every 15 seconds while an order is active and picks up status changes', async () => {
    supabase.from
      .mockReturnValueOnce(makeThenable({ data: [pending], error: null }))
      .mockReturnValueOnce(makeThenable({ data: [{ ...pending, status: 'preparing' }], error: null }))
      .mockReturnValue(makeThenable({ data: [{ ...pending, status: 'ready' }], error: null }))

    renderPage()

    expect(await screen.findByText('Order received')).toBeInTheDocument()
    expect(supabase.from).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(14999)
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(1)
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Being prepared')).toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(15000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(3)
    expect(await screen.findByText('Ready for pickup')).toBeInTheDocument()
  })

  test('stops polling once no order is active', async () => {
    supabase.from
      .mockReturnValueOnce(makeThenable({ data: [pending], error: null }))
      .mockReturnValue(makeThenable({ data: [{ ...pending, status: 'completed' }], error: null }))

    renderPage()
    await screen.findByText('Order received')

    await act(async () => {
      jest.advanceTimersByTime(15000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Picked up')).toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(60000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  test('does not poll when there are only past orders', async () => {
    supabase.from.mockReturnValue(makeThenable({ data: [completed, cancelled], error: null }))

    renderPage()
    await screen.findByText('Order #cccccccc')

    await act(async () => {
      jest.advanceTimersByTime(60000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  test('clears the interval on unmount', async () => {
    supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))

    const { unmount } = renderPage()
    await screen.findByText('Order received')
    unmount()

    await act(async () => {
      jest.advanceTimersByTime(60000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  test('pauses while the tab is hidden and refreshes when it becomes visible', async () => {
    supabase.from.mockReturnValue(makeThenable({ data: [pending], error: null }))
    let visibility = 'visible'
    jest.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)

    renderPage()
    await screen.findByText('Order received')

    visibility = 'hidden'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      jest.advanceTimersByTime(60000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(1)

    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)

    await act(async () => {
      jest.advanceTimersByTime(15000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(3)
  })

  test('a failed background refresh keeps the current list', async () => {
    supabase.from
      .mockReturnValueOnce(makeThenable({ data: [pending], error: null }))
      .mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

    renderPage()
    await screen.findByText('Order received')

    await act(async () => {
      jest.advanceTimersByTime(15000)
    })
    expect(supabase.from).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Order #aaaaaaaa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
