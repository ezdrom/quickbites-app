import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CanteenOrdersPage from './CanteenOrdersPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn(), rpc: jest.fn() },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <CanteenOrdersPage />
    </MemoryRouter>,
  )
}

const orderAt = (id, item) => ({
  id,
  total_amount: 70,
  status: 'pending',
  special_instructions: null,
  location_id: 'loc-main',
  locations: { name: 'Main' },
  order_items: [{ quantity: 1, unit_price: 70, menu_items: { name: item } }],
})

function mockStaffWithOrders(orders, role = 'canteen') {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role }, error: null })
    if (table === 'locations') return makeThenable(locationsResult())
    return makeThenable({ data: orders, error: null })
  })
}

const codeBox = (shortId) => screen.getByLabelText(`Pickup code for order ${shortId}`)
const markButton = () => screen.getByRole('button', { name: /mark picked up/i })
const adobo = () => orderAt('order-aaaaaaaa', 'Pork Adobo')

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('Mark Picked Up stays disabled until a 4-digit code is typed, and only digits are accepted', async () => {
  mockStaffWithOrders([adobo()])
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  expect(markButton()).toBeDisabled()

  await user.type(codeBox('order-aa'), '12ab3')
  expect(codeBox('order-aa')).toHaveValue('123')
  expect(markButton()).toBeDisabled()

  await user.type(codeBox('order-aa'), '4')
  expect(markButton()).toBeEnabled()
})

test('sends the code with the order id and removes the order once it matches', async () => {
  mockStaffWithOrders([adobo(), orderAt('order-bbbbbbbb', 'Chicken Sinigang')])
  supabase.rpc.mockResolvedValue({ data: { result: 'ok', order: { id: 'order-aaaaaaaa' } }, error: null })
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '0925')
  await user.click(screen.getAllByRole('button', { name: /mark picked up/i })[0])

  expect(supabase.rpc).toHaveBeenCalledWith('complete_order', { p_order_id: 'order-aaaaaaaa', p_code: '0925' })
  await waitFor(() => expect(screen.queryByText(/Pork Adobo/)).not.toBeInTheDocument())
  expect(screen.getByText(/Chicken Sinigang/)).toBeInTheDocument()
})

test('a wrong code keeps the order, clears the box and says how many tries are left', async () => {
  mockStaffWithOrders([adobo()])
  supabase.rpc.mockResolvedValue({ data: { result: 'wrong_code', attempts_left: 4 }, error: null })
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '1111')
  await user.click(markButton())

  expect(await screen.findByRole('alert')).toHaveTextContent("That code doesn't match. 4 tries left.")
  expect(screen.getByText(/Pork Adobo/)).toBeInTheDocument()
  expect(codeBox('order-aa')).toHaveValue('')
})

test('uses the singular for the last try', async () => {
  mockStaffWithOrders([adobo()])
  supabase.rpc.mockResolvedValue({ data: { result: 'wrong_code', attempts_left: 1 }, error: null })
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '1111')
  await user.click(markButton())

  expect(await screen.findByText(/1 try left/)).toBeInTheDocument()
})

test('a locked order tells staff to ask an admin', async () => {
  mockStaffWithOrders([adobo()])
  supabase.rpc.mockResolvedValue({ data: { result: 'locked' }, error: null })
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '1111')
  await user.click(markButton())

  expect(await screen.findByText(/too many wrong codes\. ask an admin/i)).toBeInTheDocument()
  expect(screen.getByText(/Pork Adobo/)).toBeInTheDocument()
})

test('shows the server message when the order cannot be completed', async () => {
  mockStaffWithOrders([adobo()])
  supabase.rpc.mockResolvedValue({ data: null, error: { message: 'order cannot be completed: status is cancelled' } })
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '1111')
  await user.click(markButton())

  expect(await screen.findByText(/status is cancelled/i)).toBeInTheDocument()
})

test('a dropped connection is reported on that order and the button comes back', async () => {
  mockStaffWithOrders([adobo()])
  supabase.rpc.mockRejectedValue(new Error('fetch failed'))
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.type(codeBox('order-aa'), '1111')
  await user.click(markButton())

  expect(await screen.findByText(/can't reach supabase right now\. please try again/i)).toBeInTheDocument()
  expect(markButton()).toBeEnabled()
})

test('canteen staff get no way around the code', async () => {
  mockStaffWithOrders([adobo()], 'canteen')

  renderPage()
  await screen.findByText(/Pork Adobo/)

  expect(screen.queryByRole('button', { name: /complete without code/i })).not.toBeInTheDocument()
})

test('an admin can complete without a code after confirming, and that is sent as no code', async () => {
  mockStaffWithOrders([adobo()], 'admin')
  supabase.rpc.mockResolvedValue({ data: { result: 'ok', order: {} }, error: null })
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.click(screen.getByRole('button', { name: /complete without code/i }))

  expect(confirm).toHaveBeenCalled()
  expect(supabase.rpc).toHaveBeenCalledWith('complete_order', { p_order_id: 'order-aaaaaaaa', p_code: null })
  await waitFor(() => expect(screen.queryByText(/Pork Adobo/)).not.toBeInTheDocument())
})

test('declining the confirmation does nothing', async () => {
  mockStaffWithOrders([adobo()], 'admin')
  jest.spyOn(window, 'confirm').mockReturnValue(false)
  const user = userEvent.setup()

  renderPage()
  await screen.findByText(/Pork Adobo/)
  await user.click(screen.getByRole('button', { name: /complete without code/i }))

  expect(supabase.rpc).not.toHaveBeenCalled()
  expect(screen.getByText(/Pork Adobo/)).toBeInTheDocument()
})
