import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const POLL_MS = 15000

// isOpen is null until the status has been read (or when it can't be). Callers
// must treat null as "don't block": place_order() enforces closing on the server.
export default function useCanteenStatus({ pollMs = POLL_MS } = {}) {
  const [isOpen, setIsOpen] = useState(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('canteen_settings').select('is_open').eq('id', true).single()
      if (mounted.current && !error && typeof data?.is_open === 'boolean') setIsOpen(data.is_open)
    } catch {
      // Keep the last known value; the next poll tries again.
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const timer = pollMs > 0 ? setInterval(refresh, pollMs) : null
    return () => {
      mounted.current = false
      if (timer) clearInterval(timer)
    }
  }, [refresh, pollMs])

  const setOpen = useCallback(async (open) => {
    try {
      const { data, error } = await supabase.rpc('set_canteen_open', { p_open: open })
      if (error) return { error }
      if (mounted.current) setIsOpen(typeof data?.is_open === 'boolean' ? data.is_open : open)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }, [])

  return { isOpen, loading, refresh, setOpen }
}
