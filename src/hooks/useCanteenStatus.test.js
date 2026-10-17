import { act, renderHook, waitFor } from '@testing-library/react'
import useCanteenStatus from './useCanteenStatus.js'
import { supabase } from '../lib/supabaseClient.js'
import { makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}))

const status = (is_open) => makeThenable({ data: { is_open }, error: null })

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.useRealTimers()
})

test('reads the status from canteen_settings', async () => {
  supabase.from.mockReturnValue(status(false))

  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))

  expect(result.current.isOpen).toBeNull()
  await waitFor(() => expect(result.current.isOpen).toBe(false))
  expect(supabase.from).toHaveBeenCalledWith('canteen_settings')
  expect(result.current.loading).toBe(false)
})

test('stays unknown when the status cannot be read', async () => {
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'nope' } }))

  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.isOpen).toBeNull()
})

test('stays unknown when the request throws', async () => {
  supabase.from.mockImplementation(() => {
    throw new Error('network down')
  })

  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.isOpen).toBeNull()
})

test('polls, keeps the last known value when a poll fails, and picks up changes', async () => {
  jest.useFakeTimers()
  supabase.from.mockReturnValue(status(true))
  const { result } = renderHook(() => useCanteenStatus({ pollMs: 15000 }))
  await waitFor(() => expect(result.current.isOpen).toBe(true))

  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'blip' } }))
  await act(async () => {
    jest.advanceTimersByTime(15000)
  })
  expect(result.current.isOpen).toBe(true)

  supabase.from.mockReturnValue(status(false))
  await act(async () => {
    jest.advanceTimersByTime(15000)
  })
  await waitFor(() => expect(result.current.isOpen).toBe(false))
})

test('stops polling when unmounted', async () => {
  jest.useFakeTimers()
  supabase.from.mockReturnValue(status(true))
  const { result, unmount } = renderHook(() => useCanteenStatus({ pollMs: 15000 }))
  await waitFor(() => expect(result.current.loading).toBe(false))
  const callsBefore = supabase.from.mock.calls.length

  unmount()
  await act(async () => {
    jest.advanceTimersByTime(60000)
  })

  expect(supabase.from.mock.calls.length).toBe(callsBefore)
})

test('setOpen calls the RPC and updates the status', async () => {
  supabase.from.mockReturnValue(status(true))
  supabase.rpc.mockResolvedValue({ data: { is_open: false }, error: null })
  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))
  await waitFor(() => expect(result.current.isOpen).toBe(true))

  let outcome
  await act(async () => {
    outcome = await result.current.setOpen(false)
  })

  expect(supabase.rpc).toHaveBeenCalledWith('set_canteen_open', { p_open: false })
  expect(outcome).toEqual({ error: null })
  expect(result.current.isOpen).toBe(false)
})

test('setOpen reports a server error and leaves the status alone', async () => {
  supabase.from.mockReturnValue(status(true))
  supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Only canteen staff or admins can open or close the canteen' } })
  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))
  await waitFor(() => expect(result.current.isOpen).toBe(true))

  let outcome
  await act(async () => {
    outcome = await result.current.setOpen(false)
  })

  expect(outcome.error.message).toMatch(/only canteen staff/i)
  expect(result.current.isOpen).toBe(true)
})

test('setOpen reports a network failure instead of throwing', async () => {
  supabase.from.mockReturnValue(status(true))
  supabase.rpc.mockRejectedValue(new Error('network down'))
  const { result } = renderHook(() => useCanteenStatus({ pollMs: 0 }))
  await waitFor(() => expect(result.current.isOpen).toBe(true))

  let outcome
  await act(async () => {
    outcome = await result.current.setOpen(false)
  })

  expect(outcome.error.message).toBe('network down')
  expect(result.current.isOpen).toBe(true)
})
