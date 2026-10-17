import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanteenStatusControl from './CanteenStatusControl.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const mockStatus = (is_open) => supabase.from.mockReturnValue(makeThenable({ data: { is_open }, error: null }))

beforeEach(() => {
  jest.clearAllMocks()
})

test('shows the canteen as open and closes it', async () => {
  mockStatus(true)
  supabase.rpc.mockResolvedValue({ data: { is_open: false }, error: null })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  expect(await screen.findByText('Canteen is open')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Close canteen' }))

  expect(supabase.rpc).toHaveBeenCalledWith('set_canteen_open', { p_open: false })
  expect(await screen.findByText('Canteen is closed')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open canteen' })).toBeEnabled()
})

test('shows the canteen as closed and reopens it', async () => {
  mockStatus(false)
  supabase.rpc.mockResolvedValue({ data: { is_open: true }, error: null })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  expect(await screen.findByText('Canteen is closed')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Open canteen' }))

  expect(supabase.rpc).toHaveBeenCalledWith('set_canteen_open', { p_open: true })
  expect(await screen.findByText('Canteen is open')).toBeInTheDocument()
})

test('disables the button while saving', async () => {
  mockStatus(true)
  let finish
  supabase.rpc.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Close canteen' }))

  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  finish({ data: { is_open: false }, error: null })
  expect(await screen.findByRole('button', { name: 'Open canteen' })).toBeEnabled()
})

test('shows the server message and keeps the state when the change is refused', async () => {
  mockStatus(true)
  supabase.rpc.mockResolvedValue({
    data: null,
    error: { message: 'Only canteen staff or admins can open or close the canteen' },
  })
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  await user.click(await screen.findByRole('button', { name: 'Close canteen' }))

  expect(await screen.findByText(/only canteen staff or admins/i)).toBeInTheDocument()
  expect(screen.getByText('Canteen is open')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close canteen' })).toBeEnabled()
})

test('shows an error with Retry when the status cannot be loaded', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))
  const user = userEvent.setup()
  render(<CanteenStatusControl />)

  expect(await screen.findByText(/couldn't load the canteen status/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /close canteen|open canteen/i })).not.toBeInTheDocument()

  mockStatus(true)
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Canteen is open')).toBeInTheDocument()
})
