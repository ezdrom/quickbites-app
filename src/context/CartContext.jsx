import { createContext, useContext, useMemo, useState, useCallback } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState({}) // { [menuItemId]: quantity }

  const addItem = useCallback((id) => {
    setItems((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }, [])

  const updateQuantity = useCallback((id, quantity) => {
    setItems((prev) => {
      if (quantity <= 0) {
        const { [id]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: quantity }
    })
  }, [])

  const clearCart = useCallback(() => setItems({}), [])

  const totalCount = useMemo(
    () => Object.values(items).reduce((sum, qty) => sum + qty, 0),
    [items],
  )

  const value = useMemo(
    () => ({ items, addItem, updateQuantity, clearCart, totalCount }),
    [items, addItem, updateQuantity, clearCart, totalCount],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
