import { useState } from 'react'
import Button from './Button.jsx'
import useLocations from '../hooks/useLocations.js'

// Open/close switches for canteen staff and admins, one per location. Staff
// aren't tied to a location, so every location is listed (the server checks
// the role too).
export default function CanteenStatusControl() {
  const { locations, loading, failed, usingPlaceholder, refresh, setOpen } = useLocations()
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')

  async function handleToggle(location) {
    setError('')
    setSavingId(location.id)
    const { error: toggleError } = await setOpen(location.id, !location.is_open)
    setSavingId(null)
    if (toggleError) setError(toggleError.message || `Couldn't update ${location.name}. Try again.`)
  }

  if (loading) return <p className="auth-status">Loading locations...</p>

  if (failed || usingPlaceholder || locations.length === 0) {
    return (
      <div className="canteen-status" role="alert">
        <p className="auth-error">Couldn't load the locations.</p>
        <Button type="button" variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <section className="canteen-status" aria-label="Location status">
      {locations.map((location) => (
        <div key={location.id} className="canteen-status-row">
          <p
            role="status"
            className={`canteen-status-label ${location.is_open ? 'canteen-status-open' : 'canteen-status-closed'}`}
          >
            {location.name} is {location.is_open ? 'open' : 'closed'}
          </p>
          <Button
            type="button"
            variant={location.is_open ? 'outline' : 'gold'}
            disabled={savingId === location.id}
            onClick={() => handleToggle(location)}
          >
            {savingId === location.id
              ? 'Saving...'
              : `${location.is_open ? 'Close' : 'Open'} ${location.name}`}
          </Button>
        </div>
      ))}
      {error && <p className="auth-error">{error}</p>}
    </section>
  )
}
