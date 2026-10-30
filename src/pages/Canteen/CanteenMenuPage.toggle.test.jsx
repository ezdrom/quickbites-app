import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CanteenMenuPage from './CanteenMenuPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}))

function Dashboard() {
  const location = useLocation()
  return <p>dashboard: {location.state?.flash}</p>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/canteen-menu']}>
      <Routes>
        <Route path="/canteen-menu" element={<CanteenMenuPage />} />
        <Route path="/canteen-orders" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  )
}

const adobo = { id: 'm1', name: 'Pork Adobo', description: 'd', price: 70, serving_count: 5, is_available: true }

// menuBuilder lets a test inspect the update call made on menu_items.
function mockStaffWithItems(items, menuBuilder = makeThenable({ data: items, error: null })) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    if (table === 'menu_items') return menuBuilder
    return makeThenable({ data: [], error: null })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('one tap marks an available item sold out', async () => {
  mockStaffWithItems([adobo])
  const user = userEvent.setup()

  renderPage()
  const toggle = await screen.findByRole('switch', { name: 'Pork Adobo available' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')

  const builder = makeThenable({ data: { ...adobo, is_available: false }, error: null })
  supabase.from.mockImplementation(() => builder)
  await user.click(toggle)

  expect(builder.update).toHaveBeenCalledWith({ is_available: false })
  expect(builder.eq).toHaveBeenCalledWith('id', 'm1')
  expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(toggle).toHaveTextContent('Sold out')
})

test('one tap puts a sold-out item back on sale', async () => {
  mockStaffWithItems([{ ...adobo, is_available: false }])
  const user = userEvent.setup()

  renderPage()
  const toggle = await screen.findByRole('switch', { name: 'Pork Adobo available' })

  const builder = makeThenable({ data: adobo, error: null })
  supabase.from.mockImplementation(() => builder)
  await user.click(toggle)

  expect(builder.update).toHaveBeenCalledWith({ is_available: true })
  expect(await screen.findByText('Saved ✓')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-checked', 'true')
})

test('an item with no servings left cannot be marked available', async () => {
  mockStaffWithItems([{ ...adobo, serving_count: 0, is_available: false }])

  renderPage()

  expect(await screen.findByRole('switch', { name: 'Pork Adobo available' })).toBeDisabled()
  expect(screen.getByText(/add servings/i)).toBeInTheDocument()
})

test('shows the error and keeps the item unchanged when the toggle fails', async () => {
  mockStaffWithItems([adobo])
  const user = userEvent.setup()

  renderPage()
  const toggle = await screen.findByRole('switch', { name: 'Pork Adobo available' })
  supabase.from.mockImplementation(() => makeThenable({ data: null, error: { message: 'permission denied' } }))
  await user.click(toggle)

  expect(await screen.findByText('permission denied')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-checked', 'true')
})

test('adding an item goes to the dashboard with "Saved ✓"', async () => {
  mockStaffWithItems([])
  const user = userEvent.setup()

  renderPage()
  await screen.findByRole('button', { name: /add item/i })
  await user.type(screen.getByLabelText(/item name/i), 'Pork Adobo')
  await user.type(screen.getByLabelText(/^price$/i), '70')
  await user.type(screen.getByLabelText(/servings today/i), '10')
  await user.click(screen.getByRole('button', { name: /add item/i }))

  expect(await screen.findByText('dashboard: Saved ✓')).toBeInTheDocument()
})

test('saving an edit goes to the dashboard with "Saved ✓"', async () => {
  mockStaffWithItems([adobo])
  const user = userEvent.setup()

  renderPage()
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(await screen.findByText('dashboard: Saved ✓')).toBeInTheDocument()
})
