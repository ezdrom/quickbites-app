import { act, renderHook, waitFor } from '@testing-library/react'
import useLocations from './useLocations.js'
import { supabase } from '../lib/supabaseClient.js'
import { locationsResult, makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

test('loads the locations in order', async () => {
  const builder = makeThenable(locationsResult())
  supabase.from.mockReturnValue(builder)

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(supabase.from).toHaveBeenCalledWith('locations')
  expect(builder.select).toHaveBeenCalledWith('id, name, sort_order, is_open')
  expect(builder.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  expect(result.current.locations.map((l) => l.name)).toEqual(['Main', 'Annex'])
  expect(result.current.failed).toBe(false)
  expect(result.current.usingPlaceholder).toBe(false)
})

test('falls back to sample locations when unreachable (placeholder data allowed in tests)', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.usingPlaceholder).toBe(true)
  expect(result.current.failed).toBe(false)
  expect(result.current.locations.map((l) => l.name)).toEqual(['Main', 'Annex'])
})

test('treats a malformed response as a failure rather than trusting it', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: [{ id: 'x', name: 'Main', is_open: 'yes' }], error: null }))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.usingPlaceholder).toBe(true)
})

test('keeps the last real list when a later poll fails', async () => {
  supabase.from.mockReturnValueOnce(makeThenable(locationsResult()))
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'fetch failed' } }))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))
  await waitFor(() => expect(result.current.locations).toHaveLength(2))

  await act(() => result.current.refresh())

  expect(result.current.locations.map((l) => l.id)).toEqual(['loc-main', 'loc-annex'])
  expect(result.current.usingPlaceholder).toBe(false)
  expect(result.current.failed).toBe(false)
})

test('picks up a location closing on refresh', async () => {
  supabase.from.mockReturnValueOnce(makeThenable(locationsResult()))
  supabase.from.mockReturnValue(makeThenable(locationsResult({ Annex: { is_open: false } })))

  const { result } = renderHook(() => useLocations({ pollMs: 0 }))
  await waitFor(() => expect(result.current.locations).toHaveLength(2))

  await act(() => result.current.refresh())

  expect(result.current.locations.find((l) => l.name === 'Annex').is_open).toBe(false)
  expect(result.current.locations.find((l) => l.name === 'Main').is_open).toBe(true)
})

test('polls on the given interval', async () => {
  jest.useFakeTimers()
  try {
    supabase.from.mockImplementation(() => makeThenable(locationsResult()))
    renderHook(() => useLocations({ pollMs: 1000 }))
    await act(async () => {})
    const initial = supabase.from.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    expect(supabase.from.mock.calls.length).toBe(initial + 3)
  } finally {
    jest.useRealTimers()
  }
})

describe('setOpen', () => {
  async function loaded() {
    supabase.from.mockReturnValue(makeThenable(locationsResult()))
    const hook = renderHook(() => useLocations({ pollMs: 0 }))
    await waitFor(() => expect(hook.result.current.locations).toHaveLength(2))
    return hook
  }

  test('calls the rpc and updates only that location', async () => {
    const { result } = await loaded()
    supabase.rpc.mockResolvedValue({ data: { id: 'loc-annex', is_open: false }, error: null })

    let outcome
    await act(async () => {
      outcome = await result.current.setOpen('loc-annex', false)
    })

    expect(supabase.rpc).toHaveBeenCalledWith('set_location_open', { p_location_id: 'loc-annex', p_open: false })
    expect(outcome).toEqual({ error: null })
    expect(result.current.locations.find((l) => l.id === 'loc-annex').is_open).toBe(false)
    expect(result.current.locations.find((l) => l.id === 'loc-main').is_open).toBe(true)
  })

  test('returns the error and leaves the state alone when refused', async () => {
    const { result } = await loaded()
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Only canteen staff or admins can open or close a location' },
    })

    let outcome
    await act(async () => {
      outcome = await result.current.setOpen('loc-annex', false)
    })

    expect(outcome.error.message).toMatch(/only canteen staff/i)
    expect(result.current.locations.find((l) => l.id === 'loc-annex').is_open).toBe(true)
  })

  test('returns the error when the request itself throws', async () => {
    const { result } = await loaded()
    supabase.rpc.mockRejectedValue(new Error('fetch failed'))

    let outcome
    await act(async () => {
      outcome = await result.current.setOpen('loc-annex', false)
    })

    expect(outcome.error.message).toBe('fetch failed')
    expect(result.current.locations.find((l) => l.id === 'loc-annex').is_open).toBe(true)
  })
})
