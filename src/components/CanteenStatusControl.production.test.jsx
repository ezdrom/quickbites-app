import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanteenStatusControl from './CanteenStatusControl.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

test('shows an error with Retry and no switches when the locations cannot be loaded', async () => {
  supabase.from.mockReturnValueOnce(makeThenable({ data: null, error: { message: 'fetch failed' } }))
  supabase.from.mockReturnValue(makeThenable(locationsResult()))
  const user = userEvent.setup()

  render(<CanteenStatusControl />)

  expect(await screen.findByText(/couldn't load the locations/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^(close|open) /i })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Main is open')).toBeInTheDocument()
  expect(screen.getByText('Annex is open')).toBeInTheDocument()
})
