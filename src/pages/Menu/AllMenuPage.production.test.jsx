import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AllMenuPage from './AllMenuPage.jsx'
import { CartProvider } from '../../context/CartContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable, routeTables } from '../../test/supabaseMock.js'

jest.mock('../../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))

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

test('shows an error with Retry and no sample items when the fetch fails in production', async () => {
  routeTables(supabase, { menu_items: { data: null, error: { message: 'fetch failed' } }, locations: locationsResult() })

  renderPage()

  expect(await screen.findByText(/couldn't load the menu\. check your connection\./i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  expect(screen.queryByText('Pork Adobo')).not.toBeInTheDocument()
  expect(screen.queryByText(/showing sample menu items/i)).not.toBeInTheDocument()
})

test('Retry re-runs the fetch and shows the real menu', async () => {
  const menuQuery = jest
    .fn()
    .mockReturnValueOnce(makeThenable({ data: null, error: { message: 'fetch failed' } }))
    .mockReturnValue(
      makeThenable({
        data: [
          { id: '1', name: 'Real Sinigang', price: 80, description: 'd', is_available: true, serving_count: 4 },
        ],
        error: null,
      }),
    )
  supabase.from.mockImplementation((table) =>
    table === 'locations' ? makeThenable(locationsResult()) : menuQuery(table),
  )

  const user = userEvent.setup()
  renderPage()

  await user.click(await screen.findByRole('button', { name: /retry/i }))

  expect(await screen.findByText('Real Sinigang')).toBeInTheDocument()
  expect(screen.queryByText(/couldn't load the menu/i)).not.toBeInTheDocument()
  expect(menuQuery).toHaveBeenCalledTimes(2)
})

test('shows an error with Retry, not sample locations, when the locations cannot be loaded in production', async () => {
  const locations = jest
    .fn()
    .mockReturnValueOnce({ data: null, error: { message: 'fetch failed' } })
    .mockReturnValue(locationsResult())
  const menu = {
    data: [{ id: '1', name: 'Real Sinigang', price: 80, description: 'd', is_available: true, serving_count: 4 }],
    error: null,
  }
  supabase.from.mockImplementation((table) => makeThenable(table === 'locations' ? locations() : menu))

  const user = userEvent.setup()
  renderPage()

  expect(await screen.findByText(/couldn't load the pickup locations/i)).toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /retry/i }))

  expect(await screen.findByRole('radio', { name: /main/i })).toBeInTheDocument()
  expect(screen.queryByText(/couldn't load the pickup locations/i)).not.toBeInTheDocument()
})
