import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { placeholderLocations } from '../data/placeholderLocations.js'
import { allowPlaceholderData } from '../lib/env.js'

const POLL_MS = 15000

const isLocation = (row) =>
  Boolean(row) && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.is_open === 'boolean'

// Pickup locations and whether each is open. `failed` is true only when there
// is no list to show at all; once a list has loaded, a failed poll keeps it.
export default function useLocations({ pollMs = POLL_MS } = {}) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [usingPlaceholder, setUsingPlaceholder] = useState(false)
  const mounted = useRef(true)
  const hasRealList = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, sort_order, is_open')
        .order('sort_order', { ascending: true })

      if (error || !Array.isArray(data) || data.length === 0 || !data.every(isLocation)) {
        throw error ?? new Error('Unexpected response for locations')
      }
      if (!mounted.current) return
      hasRealList.current = true
      setLocations(data)
      setFailed(false)
      setUsingPlaceholder(false)
    } catch {
      if (!mounted.current || hasRealList.current) return
      if (allowPlaceholderData) {
        setLocations(placeholderLocations)
        setUsingPlaceholder(true)
        setFailed(false)
      } else {
        setFailed(true)
      }
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

  const setOpen = useCallback(async (locationId, open) => {
    try {
      const { data, error } = await supabase.rpc('set_location_open', { p_location_id: locationId, p_open: open })
      if (error) return { error }
      const isOpen = typeof data?.is_open === 'boolean' ? data.is_open : open
      if (mounted.current) {
        setLocations((prev) => prev.map((l) => (l.id === locationId ? { ...l, is_open: isOpen } : l)))
      }
      return { error: null }
    } catch (error) {
      return { error }
    }
  }, [])

  return { locations, loading, failed, usingPlaceholder, refresh, setOpen }
}
