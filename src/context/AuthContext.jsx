import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { isDemoMode } from '../lib/env.js'

const AuthContext = createContext(null)

const DEMO_USER = { id: 'demo-user', email: 'demo@quickbites.local' }

async function fetchRole(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (error) return null
    return data?.role ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(isDemoMode)
  // { id, role } for the user whose profile was last resolved.
  const [roleState, setRoleState] = useState({ id: null, role: null })

  useEffect(() => {
    if (isDemoMode) return undefined
    let active = true

    // supabase-js often returns { error } instead of throwing; handle both.
    Promise.resolve()
      .then(() => supabase.auth.getSession())
      .then(({ data, error } = {}) => {
        if (!active) return
        setSession(error ? null : (data?.session ?? null))
      })
      .catch(() => {
        if (active) setSession(null)
      })
      .finally(() => {
        if (active) setAuthReady(true)
      })

    // Do not navigate here (e.g. on PASSWORD_RECOVERY); just track the session.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession ?? null)
      setAuthReady(true)
    })

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (isDemoMode || !userId) return undefined
    let active = true
    fetchRole(userId).then((role) => {
      if (active) setRoleState({ id: userId, role })
    })
    return () => {
      active = false
    }
  }, [userId])

  const signOut = useCallback(async () => {
    if (isDemoMode) return { error: null }
    let result = { error: null }
    try {
      const res = await supabase.auth.signOut()
      if (res?.error) result = { error: res.error }
    } catch (error) {
      result = { error }
    }
    // Always clear local state so logout works even when Supabase is unreachable.
    setSession(null)
    setRoleState({ id: null, role: null })
    return result
  }, [])

  const value = useMemo(() => {
    if (isDemoMode) {
      return { session: null, user: DEMO_USER, role: 'admin', loading: false, signOut }
    }
    const roleResolved = userId && roleState.id === userId
    return {
      session,
      user: session?.user ?? null,
      role: roleResolved ? roleState.role : null,
      loading: !authReady || Boolean(userId && !roleResolved),
      signOut,
    }
  }, [session, userId, roleState, authReady, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
