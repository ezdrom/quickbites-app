import Button from './Button.jsx'

// Shown in production when a required fetch fails. Never substitutes fake data.
export default function LoadError({ onRetry, message = "Couldn't load the menu. Check your connection." }) {
  return (
    <div role="alert">
      <p className="auth-error">{message}</p>
      <Button type="button" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}
