import { useEffect } from 'react'

// A short confirmation ("Saved ✓") that hides itself. `flash` is
// { text, id } so the same text shown twice in a row restarts the timer.
export default function SavedToast({ flash, onDone, durationMs = 3000 }) {
  useEffect(() => {
    if (!flash) return undefined
    const timer = setTimeout(onDone, durationMs)
    return () => clearTimeout(timer)
  }, [flash, onDone, durationMs])

  if (!flash) return null

  return (
    <p className="saved-toast" role="status">
      {flash.text}
    </p>
  )
}

export const newFlash = (text) => ({ text, id: Date.now() + Math.random() })
