import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CanteenMenuPage from './CanteenMenuPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { makeThenable } from '../../test/supabaseMock.js'

jest.mock('../../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}))

const canteenUser = { data: { user: { id: 'u1' } }, error: null }

function renderPage() {
  render(
    <MemoryRouter>
      <CanteenMenuPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

test('shows an error with Retry and no sample rows when the access check fails', async () => {
  supabase.auth.getUser.mockRejectedValue(new Error('fetch failed'))

  renderPage()

  expect(await screen.findByText(/couldn't load the menu\. check your connection\./i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  expect(screen.queryByText('Pork Adobo')).not.toBeInTheDocument()
  expect(screen.queryByText(/supabase isn't reachable/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /add item/i })).not.toBeInTheDocument()
})

test('Retry after a failed access check loads the real menu', async () => {
  supabase.auth.getUser.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValue(canteenUser)
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    return makeThenable({
      data: [{ id: 'm1', name: 'Real Sinigang', description: 'd', price: 80, serving_count: 4, is_available: true }],
      error: null,
    })
  })

  const user = userEvent.setup()
  renderPage()

  await user.click(await screen.findByRole('button', { name: /retry/i }))

  expect(await screen.findByText('Real Sinigang')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add item/i })).toBeEnabled()
})

test('shows an error, no fake rows, and a disabled form when the menu fetch fails', async () => {
  supabase.auth.getUser.mockResolvedValue(canteenUser)
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    return makeThenable({ data: null, error: { message: 'fetch failed' } })
  })

  renderPage()

  expect(await screen.findByText(/couldn't load the menu\. check your connection\./i)).toBeInTheDocument()
  expect(screen.queryByText('Pork Adobo')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
  expect(screen.getByLabelText(/item name/i)).toBeDisabled()
})

test('Retry reloads the menu items', async () => {
  supabase.auth.getUser.mockResolvedValue(canteenUser)
  let menuCalls = 0
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return makeThenable({ data: { role: 'canteen' }, error: null })
    menuCalls += 1
    if (menuCalls === 1) return makeThenable({ data: null, error: { message: 'fetch failed' } })
    return makeThenable({
      data: [{ id: 'm1', name: 'Real Sinigang', description: 'd', price: 80, serving_count: 4, is_available: true }],
      error: null,
    })
  })

  const user = userEvent.setup()
  renderPage()

  await user.click(await screen.findByRole('button', { name: /retry/i }))

  expect(await screen.findByText('Real Sinigang')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add item/i })).toBeEnabled()
})
