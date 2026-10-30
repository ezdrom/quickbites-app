export default function Button({ variant = 'gold', type = 'button', disabled = false, onClick, children }) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
