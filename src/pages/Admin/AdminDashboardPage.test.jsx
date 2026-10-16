import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminDashboardPage from './AdminDashboardPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../context/AuthContext.jsx'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { rpc: jest.fn() },
}))
jest.mock('../../context/AuthContext.jsx', () => ({
  useAuth: jest.fn(),
}))

const USERS = [
  { id: 'admin-1', full_name: 'Ada Admin', email: 'ada@jrcc.edu', role: 'admin', created_at: '2026-09-01T00:00:00Z' },
  { id: 'stu-1', full_name: 'Sam Student', email: 'sam@jrcc.edu', role: 'student', created_at: '2026-09-10T00:00:00Z' },
  { id: 'can-1', full_name: 'Cora Canteen', email: 'cora@jrcc.edu', role: 'canteen', created_at: '2026-09-15T00:00:00Z' },
]

const SALES = [
  { day: '2026-10-01', orders_count: 2, revenue: 300 },
  { day: '2026-10-02', orders_count: 0, revenue: 0 },
  { day: '2026-10-03', orders_count: 5, revenue: '1200.50' },
]

const TOP = [
  { menu_item_id: 'm1', name: 'Pork Adobo', quantity_sold: 12, revenue: 840 },
  { menu_item_id: 'm2', name: 'Chicken Sinigang', quantity_sold: 7, revenue: 560 },
]

// Per-RPC handlers; tests override individual entries.
let handlers

function ok(data) {
  return Promise.resolve({ data, error: null })
}

function fail(message, code) {
  return Promise.resolve({ data: null, error: { message, code } })
}

beforeEach(() => {
  jest.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', email: 'ada@jrcc.edu' }, role: 'admin', loading: false })
  handlers = {
    admin_list_users: () => ok(USERS),
    admin_set_user_role: () => ok(null),
    admin_sales_summary: () => ok(SALES),
    admin_top_items: () => ok(TOP),
  }
  supabase.rpc.mockImplementation((name, args) => handlers[name](args))
})

function callsTo(name) {
  return supabase.rpc.mock.calls.filter(([n]) => n === name)
}

function userRow(name) {
  return screen.getByText(name).closest('li')
}

async function renderPage() {
  render(<AdminDashboardPage />)
  await screen.findByText('Sam Student')
}

describe('users', () => {
  test('lists name, email, role and joined date', async () => {
    await renderPage()

    const row = userRow('Sam Student')
    expect(within(row).getByText('sam@jrcc.edu')).toBeInTheDocument()
    expect(within(row).getByRole('combobox')).toHaveValue('student')
    expect(within(row).getByText(/joined/i)).toBeInTheDocument()
    expect(userRow('Cora Canteen')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_users', {})
  })

  test('offers every role the RPC accepts', async () => {
    await renderPage()

    const options = within(userRow('Sam Student')).getAllByRole('option').map((o) => o.value)
    expect(options).toEqual(['student', 'instructor', 'staff', 'canteen', 'admin'])
  })

  test('search filters by name and email, and shows a message when nothing matches', async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.type(screen.getByLabelText(/search users/i), 'cora')
    expect(screen.getByText('Cora Canteen')).toBeInTheDocument()
    expect(screen.queryByText('Sam Student')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText(/search users/i))
    await user.type(screen.getByLabelText(/search users/i), 'SAM@JRCC')
    expect(screen.getByText('Sam Student')).toBeInTheDocument()
    expect(screen.queryByText('Cora Canteen')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText(/search users/i))
    await user.type(screen.getByLabelText(/search users/i), 'zzz')
    expect(screen.getByText(/no users match/i)).toBeInTheDocument()
  })

  test('changing a role calls the RPC and shows success', async () => {
    const user = userEvent.setup()
    await renderPage()

    const select = within(userRow('Sam Student')).getByRole('combobox')
    await user.selectOptions(select, 'canteen')

    expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_role', { p_user_id: 'stu-1', p_role: 'canteen' })
    expect(await within(userRow('Sam Student')).findByText(/role changed to canteen/i)).toBeInTheDocument()
    expect(select).toHaveValue('canteen')
  })

  test('reverts the select and shows the RPC message when the change fails', async () => {
    handlers.admin_set_user_role = () => fail('user not found', 'P0002')
    const user = userEvent.setup()
    await renderPage()

    const select = within(userRow('Cora Canteen')).getByRole('combobox')
    await user.selectOptions(select, 'student')

    expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_role', { p_user_id: 'can-1', p_role: 'student' })
    expect(await within(userRow('Cora Canteen')).findByRole('alert')).toHaveTextContent('user not found')
    expect(select).toHaveValue('canteen')
  })

  test('shows the last-admin message and keeps the original role', async () => {
    handlers.admin_set_user_role = () => fail('cannot demote the last admin', '55000')
    handlers.admin_list_users = () =>
      ok([
        { id: 'admin-1', full_name: 'Ada Admin', email: 'ada@jrcc.edu', role: 'admin', created_at: '2026-09-01T00:00:00Z' },
        { id: 'admin-2', full_name: 'Bo Admin', email: 'bo@jrcc.edu', role: 'admin', created_at: '2026-09-02T00:00:00Z' },
      ])
    const user = userEvent.setup()
    render(<AdminDashboardPage />)
    await screen.findByText('Bo Admin')

    const select = within(userRow('Bo Admin')).getByRole('combobox')
    await user.selectOptions(select, 'student')

    expect(await screen.findByText('cannot demote the last admin')).toBeInTheDocument()
    expect(select).toHaveValue('admin')
  })

  test('disables the role control on the signed-in admin\'s own row only', async () => {
    await renderPage()

    expect(within(userRow('Ada Admin')).getByRole('combobox')).toBeDisabled()
    expect(within(userRow('Sam Student')).getByRole('combobox')).toBeEnabled()
    expect(within(userRow('Ada Admin')).getByText(/can't change your own role/i)).toBeInTheDocument()
  })

  test('shows an empty state when there are no users', async () => {
    handlers.admin_list_users = () => ok([])
    render(<AdminDashboardPage />)

    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument()
  })

  test('shows Retry for a failed load and recovers on retry', async () => {
    let attempts = 0
    handlers.admin_list_users = () => {
      attempts += 1
      return attempts === 1 ? fail('TypeError: Failed to fetch') : ok(USERS)
    }
    const user = userEvent.setup()
    render(<AdminDashboardPage />)

    const alert = await screen.findByText(/couldn't load users/i)
    // Only the users section is broken.
    expect(await screen.findByTestId('sales-orders-total')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /retry/i })).toHaveLength(1)

    await user.click(within(alert.closest('[role="alert"]')).getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Sam Student')).toBeInTheDocument()
  })

  test('handles the users RPC throwing', async () => {
    handlers.admin_list_users = () => Promise.reject(new Error('network down'))
    render(<AdminDashboardPage />)

    expect(await screen.findByText(/couldn't load users/i)).toBeInTheDocument()
  })

  test('shows a friendly not-authorized state', async () => {
    handlers.admin_list_users = () => fail('not authorized', '42501')
    render(<AdminDashboardPage />)

    expect(await screen.findByText(/you are not authorized/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })
})

describe('sales', () => {
  test('defaults to the last 7 days and calls the RPC with that range', async () => {
    await renderPage()
    await screen.findByTestId('sales-orders-total')

    const [, args] = callsTo('admin_sales_summary')[0]
    const from = new Date(`${args.p_from}T00:00:00`)
    const to = new Date(`${args.p_to}T00:00:00`)
    expect(Math.round((to - from) / 86400000)).toBe(6)
    expect(screen.getByLabelText('From')).toHaveValue(args.p_from)
    expect(screen.getByLabelText('To')).toHaveValue(args.p_to)
  })

  test('shows totals and one row per day', async () => {
    await renderPage()

    expect(await screen.findByTestId('sales-orders-total')).toHaveTextContent('7')
    expect(screen.getByTestId('sales-revenue-total')).toHaveTextContent('1,500.50')
    const days = screen.getAllByTestId('sales-day')
    expect(days).toHaveLength(3)
    expect(days[0]).toHaveTextContent('2 orders')
    expect(days[0]).toHaveTextContent('300.00')
    expect(days[1]).toHaveTextContent('0 orders')
    expect(days[2]).toHaveTextContent('1,200.50')
  })

  test('scales the bars against the best day', async () => {
    await renderPage()
    const days = await screen.findAllByTestId('sales-day')

    const bar = (li) => li.querySelector('.admin-bar')
    expect(bar(days[2])).toHaveStyle({ width: '100%' })
    expect(bar(days[1])).toHaveStyle({ width: '0%' })
    expect(parseFloat(bar(days[0]).style.width)).toBeCloseTo((300 / 1200.5) * 100, 1)
  })

  test('shows an empty state when there are no completed orders', async () => {
    handlers.admin_sales_summary = () => ok([])
    await renderPage()
    expect(await screen.findByText(/no completed orders/i)).toBeInTheDocument()

    handlers.admin_sales_summary = () => ok([{ day: '2026-10-01', orders_count: 0, revenue: 0 }])
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    await waitFor(() => expect(callsTo('admin_sales_summary')).toHaveLength(2))
    // Zero-filled rows with no orders count as empty, not as a list of zero days.
    expect(await screen.findByText(/no completed orders/i)).toBeInTheDocument()
    expect(screen.queryByTestId('sales-day')).not.toBeInTheDocument()
  })

  test('shows Retry for a failed load without affecting other sections', async () => {
    let attempts = 0
    handlers.admin_sales_summary = () => {
      attempts += 1
      return attempts === 1 ? fail('boom', 'XX000') : ok(SALES)
    }
    const user = userEvent.setup()
    await renderPage()

    expect(await screen.findByText(/couldn't load sales/i)).toBeInTheDocument()
    expect(screen.getByText('Pork Adobo')).toBeInTheDocument()
    expect(screen.getByText('Sam Student')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByTestId('sales-orders-total')).toHaveTextContent('7')
  })

  test('handles the sales RPC throwing', async () => {
    handlers.admin_sales_summary = () => Promise.reject(new Error('network down'))
    await renderPage()

    expect(await screen.findByText(/couldn't load sales/i)).toBeInTheDocument()
  })

  test('surfaces the RPC range error (e.g. range too large)', async () => {
    handlers.admin_sales_summary = () => fail('date range too large (max 366 days)', '22023')
    handlers.admin_top_items = () => fail('date range too large (max 366 days)', '22023')
    await renderPage()

    expect((await screen.findAllByText('date range too large (max 366 days)')).length).toBeGreaterThan(0)
  })

  test('shows a friendly not-authorized state', async () => {
    handlers.admin_sales_summary = () => fail('not authorized', '42501')
    await renderPage()

    expect(await screen.findByText(/you are not authorized/i)).toBeInTheDocument()
  })
})

describe('top items', () => {
  test('lists ranked items with quantity and revenue, limit 5', async () => {
    await renderPage()

    const items = (await screen.findAllByText(/sold,/)).map((el) => el.closest('li'))
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Pork Adobo')
    expect(items[0]).toHaveTextContent('12 sold')
    expect(items[0]).toHaveTextContent('840.00')
    expect(items[1]).toHaveTextContent('Chicken Sinigang')
    expect(callsTo('admin_top_items')[0][1]).toEqual(
      expect.objectContaining({ p_limit: 5, p_from: expect.any(String), p_to: expect.any(String) }),
    )
  })

  test('shows an empty state', async () => {
    handlers.admin_top_items = () => ok([])
    await renderPage()

    expect(await screen.findByText(/no items sold/i)).toBeInTheDocument()
  })

  test('shows Retry for a failed load without affecting sales', async () => {
    let attempts = 0
    handlers.admin_top_items = () => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('offline')) : ok(TOP)
    }
    const user = userEvent.setup()
    await renderPage()

    expect(await screen.findByText(/couldn't load top items/i)).toBeInTheDocument()
    expect(await screen.findByTestId('sales-orders-total')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Pork Adobo')).toBeInTheDocument()
  })
})

describe('date range', () => {
  test('changing the range refetches sales and top items with the new dates', async () => {
    await renderPage()
    await screen.findByTestId('sales-orders-total')
    const salesBefore = callsTo('admin_sales_summary').length
    const topBefore = callsTo('admin_top_items').length

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-05' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('admin_sales_summary', { p_from: '2026-10-01', p_to: '2026-10-05' })
      expect(supabase.rpc).toHaveBeenCalledWith('admin_top_items', {
        p_from: '2026-10-01',
        p_to: '2026-10-05',
        p_limit: 5,
      })
    })
    expect(callsTo('admin_sales_summary').length).toBeGreaterThan(salesBefore)
    expect(callsTo('admin_top_items').length).toBeGreaterThan(topBefore)
    // Users are not refetched by a range change.
    expect(callsTo('admin_list_users')).toHaveLength(1)
  })

  test('an inverted range shows an error and does not call the RPCs', async () => {
    await renderPage()
    await screen.findByTestId('sales-orders-total')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-05' } })
    await screen.findByTestId('sales-orders-total')
    const salesCalls = callsTo('admin_sales_summary').length
    const topCalls = callsTo('admin_top_items').length

    // min/max on the inputs do not stop programmatic changes.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-09' } })

    expect(await screen.findByText(/start date must be on or before/i)).toBeInTheDocument()
    expect(callsTo('admin_sales_summary')).toHaveLength(salesCalls)
    expect(callsTo('admin_top_items')).toHaveLength(topCalls)
    expect(screen.queryByTestId('sales-orders-total')).not.toBeInTheDocument()
    expect(screen.getByText(/valid date range to see sales/i)).toBeInTheDocument()

    // Fixing the range loads again.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-02' } })
    expect(await screen.findByTestId('sales-orders-total')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('admin_sales_summary', { p_from: '2026-10-02', p_to: '2026-10-05' })
  })

  test('a cleared date asks for both dates and does not call the RPCs', async () => {
    await renderPage()
    await screen.findByTestId('sales-orders-total')
    const salesCalls = callsTo('admin_sales_summary').length

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } })

    expect(await screen.findByText(/choose both a start and an end date/i)).toBeInTheDocument()
    expect(callsTo('admin_sales_summary')).toHaveLength(salesCalls)
  })
})
