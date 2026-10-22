import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanteenStatusControl from './CanteenStatusControl.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { locationsResult, makeThenable, routeTables } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const rowFor = (name) => screen.getByText(new RegExp(`^${name} is (open|closed)$`)).closest('.canteen-status-row')

beforeEach(() => {
  jest.clearAllMocks()
})

test('lists every location with its own state', async () => {
  routeTables(supabase, { locations: locationsResult({ Annex: { is_open: false } }) })
  render(<CanteenStatusControl />)

  expect(await screen.findByText('Main is open')).toBeInTheDocument()
  expect(screen.getByText('Annex is closed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close Main' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Open Annex' })).toBeEnabled()
})

test('closes one location without touching the other', async () => {
  routeTables(supabase, { locations: locationsResult() })
  supabase.rpc.mockResolvedValue({ data: { id: 'loc-annex', is_open: false }, error: null })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Close Annex' }))

  expect(supabase.rpc).toHaveBeenCalledWith('set_location_open', { p_location_id: 'loc-annex', p_open: false })
  expect(await screen.findByText('Annex is closed')).toBeInTheDocument()
  expect(screen.getByText('Main is open')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open Annex' })).toBeEnabled()
})

test('reopens a closed location', async () => {
  routeTables(supabase, { locations: locationsResult({ Main: { is_open: false } }) })
  supabase.rpc.mockResolvedValue({ data: { id: 'loc-main', is_open: true }, error: null })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Open Main' }))

  expect(supabase.rpc).toHaveBeenCalledWith('set_location_open', { p_location_id: 'loc-main', p_open: true })
  expect(await screen.findByText('Main is open')).toBeInTheDocument()
})

test('only the location being saved shows Saving and is disabled', async () => {
  routeTables(supabase, { locations: locationsResult() })
  let finish
  supabase.rpc.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Close Main' }))

  expect(within(rowFor('Main')).getByRole('button', { name: 'Saving...' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close Annex' })).toBeEnabled()

  finish({ data: { id: 'loc-main', is_open: false }, error: null })
  expect(await screen.findByRole('button', { name: 'Open Main' })).toBeEnabled()
})

test('shows the server message and keeps the state when the change is refused', async () => {
  routeTables(supabase, { locations: locationsResult() })
  supabase.rpc.mockResolvedValue({
    data: null,
    error: { message: 'Only canteen staff or admins can open or close a location' },
  })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Close Annex' }))

  expect(await screen.findByText(/only canteen staff or admins/i)).toBeInTheDocument()
  expect(screen.getByText('Annex is open')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close Annex' })).toBeEnabled()
})

test('shows an error with Retry when the locations cannot be loaded', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  expect(await screen.findByText(/couldn't load the locations/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^(close|open) /i })).not.toBeInTheDocument()

  routeTables(supabase, { locations: locationsResult() })
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Main is open')).toBeInTheDocument()
})
