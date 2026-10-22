import { render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'

jest.mock('../lib/env.js', () => ({ isDev: true, isDemoMode: true, allowPlaceholderData: true }))
jest.mock('../lib/supabaseClient.js', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn() }, from: jest.fn() },
}))

function Probe() {
  const { user, role, loading } = useAuth()
  return (
    <span data-testid="state">
      {loading ? 'loading' : 'ready'}|{user?.email}|{role}
    </span>
  )
}

test('demo mode reports an admin demo user without touching supabase', () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )

  expect(screen.getByTestId('state')).toHaveTextContent('ready|demo@quickbites.local|admin')
  expect(supabase.auth.getSession).not.toHaveBeenCalled()
})
