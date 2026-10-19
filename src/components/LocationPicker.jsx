import Button from './Button.jsx'

// Presentational: the page owns useSelectedLocation() and passes it in, so the
// locations are only polled once per page.
export default function LocationPicker({ locations, selected, onSelect, loading, failed, onRetry }) {
  if (loading) return <p className="auth-status">Loading pickup locations...</p>

  if (failed) {
    return (
      <div role="alert" className="location-picker-error">
        <p className="auth-error">Couldn't load the pickup locations.</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (locations.length === 0) return null

  return (
    <fieldset className="location-picker">
      <legend className="location-picker-legend">Pickup location</legend>
      <div className="location-picker-options">
        {locations.map((location) => {
          const checked = selected?.id === location.id
          return (
            <label
              key={location.id}
              className={`location-option${checked ? ' location-option-selected' : ''}${location.is_open ? '' : ' location-option-closed'}`}
            >
              <input
                type="radio"
                name="pickup-location"
                value={location.id}
                checked={checked}
                onChange={() => onSelect(location.id)}
              />
              <span className="location-option-name">{location.name}</span>
              <span className="location-option-status">{location.is_open ? 'Open' : 'Closed'}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
