import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AllMenuPage from './AllMenuPage.jsx'
import { CartProvider } from '../../context/CartContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { locationsResult, makeThenable, routeTables } from '../../test/supabaseMock.js'

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

const adobo = { id: '1', name: 'Pork Adobo', price: 70, description: 'd', is_available: true, serving_count: 5 }

function mockMenu(overrides) {
  routeTables(supabase, { menu_items: { data: [adobo], error: null }, locations: locationsResult(overrides) })
}

test('lets the student pick a pickup location, starting on the first open one', async () => {
  mockMenu()

  renderPage()

  expect(await screen.findByRole('radio', { name: /main/i })).toBeChecked()
  expect(screen.getByRole('radio', { name: /annex/i })).not.toBeChecked()
  expect(screen.queryByText(/is closed right now/i)).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /add pork adobo to cart/i })).toBeEnabled()
})

test('starts on the open location when the first one is closed', async () => {
  mockMenu({ Main: { is_open: false } })

  renderPage()

  expect(await screen.findByRole('radio', { name: /annex/i })).toBeChecked()
  expect(screen.queryByText(/is closed right now/i)).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /add pork adobo to cart/i })).toBeEnabled()
})

test('shows a closed notice and disables adding to the cart for a closed location, pointing to the open one', async () => {
  mockMenu({ Annex: { is_open: false } })
  const user = userEvent.setup()

  renderPage()
  await user.click(await screen.findByRole('radio', { name: /annex/i }))

  expect(await screen.findByText(/annex is closed right now. you can order from main instead/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add pork adobo to cart/i })).toBeDisabled()

  await user.click(screen.getByRole('radio', { name: /main/i }))

  expect(screen.queryByText(/is closed right now/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add pork adobo to cart/i })).toBeEnabled()
})

test('when every location is closed the notice has nowhere to point to', async () => {
  mockMenu({ Main: { is_open: false }, Annex: { is_open: false } })

  renderPage()

  expect(await screen.findByText(/main is closed right now. you can still browse the menu/i)).toBeInTheDocument()
  expect(screen.getByText('Pork Adobo')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add pork adobo to cart/i })).toBeDisabled()
})
