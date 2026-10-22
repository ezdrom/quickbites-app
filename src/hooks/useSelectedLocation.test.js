import { act, renderHook, waitFor } from '@testing-library/react'
import useSelectedLocation from './useSelectedLocation.js'
import { setSelectedLocationId } from '../lib/locationSelection.js'
import { supabase } from '../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const load = async (overrides) => {
  supabase.from.mockReturnValue(makeThenable(locationsResult(overrides)))
  const hook = renderHook(() => useSelectedLocation({ pollMs: 0 }))
  await waitFor(() => expect(hook.result.current.selected).not.toBeNull())
  return hook
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('defaults to the first open location and remembers it', async () => {
  const { result } = await load()

  expect(result.current.selected.name).toBe('Main')
  expect(result.current.orderingClosed).toBe(false)
  expect(result.current.openElsewhere).toEqual([])
  expect(window.localStorage.getItem('quickbites.pickupLocation')).toBe('loc-main')
})

test('skips a closed first location when choosing the default', async () => {
  const { result } = await load({ Main: { is_open: false } })

  expect(result.current.selected.name).toBe('Annex')
  expect(result.current.orderingClosed).toBe(false)
})

test('uses the saved choice even when it is closed, and lists where else is open', async () => {
  setSelectedLocationId('loc-annex')

  const { result } = await load({ Annex: { is_open: false } })

  expect(result.current.selected.name).toBe('Annex')
  expect(result.current.orderingClosed).toBe(true)
  expect(result.current.openElsewhere.map((l) => l.name)).toEqual(['Main'])
})

test('ignores a saved choice that no longer exists', async () => {
  setSelectedLocationId('loc-gone')

  const { result } = await load()

  expect(result.current.selected.name).toBe('Main')
  await waitFor(() => expect(window.localStorage.getItem('quickbites.pickupLocation')).toBe('loc-main'))
})

test('selectLocation switches the selection', async () => {
  const { result } = await load()

  act(() => result.current.selectLocation('loc-annex'))

  expect(result.current.selected.name).toBe('Annex')
  expect(window.localStorage.getItem('quickbites.pickupLocation')).toBe('loc-annex')
})

test('has nothing selected, and does not claim closed, before any locations load', () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'x' } }))
  const { result } = renderHook(() => useSelectedLocation({ pollMs: 0 }))

  expect(result.current.selected).toBeNull()
  expect(result.current.orderingClosed).toBe(false)
})
