import { useEffect, useMemo } from 'react'
import useLocations from './useLocations.js'
import { setSelectedLocationId, useSelectedLocationId } from '../lib/locationSelection.js'

// The student's pickup location: their saved choice if it still exists,
// otherwise the first open location, otherwise the first one. A default is
// saved as soon as it is shown, so a location closing later never silently
// moves the student somewhere else.
export default function useSelectedLocation(options) {
  const state = useLocations(options)
  const storedId = useSelectedLocationId()
  const { locations } = state

  const selected = useMemo(() => {
    if (locations.length === 0) return null
    return locations.find((l) => l.id === storedId) ?? locations.find((l) => l.is_open) ?? locations[0]
  }, [locations, storedId])

  useEffect(() => {
    if (selected && selected.id !== storedId) setSelectedLocationId(selected.id)
  }, [selected, storedId])

  const orderingClosed = Boolean(selected) && !selected.is_open
  const openElsewhere = orderingClosed ? locations.filter((l) => l.is_open) : []

  return { ...state, selected, orderingClosed, openElsewhere, selectLocation: setSelectedLocationId }
}
