import { useState } from 'react'
import Button from './Button.jsx'
import useCanteenStatus from '../hooks/useCanteenStatus.js'

// Open/close switch for canteen staff and admins (the server checks the role too).
export default function CanteenStatusControl() {
  const { isOpen, loading, refresh, setOpen } = useCanteenStatus()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleToggle() {
    setError('')
    setSaving(true)
    const { error: toggleError } = await setOpen(!isOpen)
    setSaving(false)
    if (toggleError) setError(toggleError.message || "Couldn't update the canteen status. Try again.")
  }

  if (loading) return <p className="auth-status">Loading canteen status...</p>

  if (isOpen === null) {
    return (
      <div className="canteen-status" role="alert">
        <p className="auth-error">Couldn't load the canteen status.</p>
        <Button type="button" variant="outline" onClick={refresh}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <section className="canteen-status" aria-label="Canteen status">
      <p
        role="status"
        className={`canteen-status-label ${isOpen ? 'canteen-status-open' : 'canteen-status-closed'}`}
      >
        {isOpen ? 'Canteen is open' : 'Canteen is closed'}
      </p>
      <Button type="button" variant={isOpen ? 'outline' : 'gold'} disabled={saving} onClick={handleToggle}>
        {saving ? 'Saving...' : isOpen ? 'Close canteen' : 'Open canteen'}
      </Button>
      {error && <p className="auth-error">{error}</p>}
    </section>
  )
}
