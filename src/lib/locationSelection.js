import { useSyncExternalStore } from 'react'

// Which pickup location the student chose. Shared by the menu and checkout
// pages and remembered between visits, without needing a provider.
const STORAGE_KEY = 'quickbites.pickupLocation'
const listeners = new Set()

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

let selectedId = readStored()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setSelectedLocationId(id) {
  selectedId = id
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage can be blocked (private mode); the choice then lasts for this visit only.
  }
  notify()
}

// For tests.
export function resetSelectedLocation() {
  selectedId = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  notify()
}

export function useSelectedLocationId() {
  return useSyncExternalStore(subscribe, () => selectedId)
}
