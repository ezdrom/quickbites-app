import { act, renderHook, waitFor } from '@testing-library/react'
import useLocations from './useLocations.js'
import { supabase } from '../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

test('reports a failure, never sample locations, when unreachable in production', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.failed).toBe(true)
  expect(result.current.locations).toEqual([])
  expect(result.current.usingPlaceholder).toBe(false)
})

test('recovers on refresh once the connection is back', async () => {
  supabase.from.mockReturnValueOnce(makeThenable({ data: null, error: { message: 'fetch failed' } }))
  supabase.from.mockReturnValue(makeThenable(locationsResult()))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))
  await waitFor(() => expect(result.current.failed).toBe(true))

  await act(() => result.current.refresh())

  expect(result.current.failed).toBe(false)
  expect(result.current.locations).toHaveLength(2)
})
