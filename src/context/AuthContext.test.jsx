import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { makeThenable } from '../test/supabaseMock.js'

jest.mock('../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}))

const unsubscribe = jest.fn()
let authListener

function Probe() {
  const { user, role, loading, signOut } = useAuth()
  return (
    <div>
      <span data-testid="state">
        {loading ? 'loading' : 'ready'}|{user?.email ?? 'none'}|{role ?? 'norole'}
      </span>
      <button onClick={signOut}>out</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

const session = { user: { id: 'u1', email: 'jane@example.com' } }

beforeEach(() => {
  jest.clearAllMocks()
  supabase.auth.onAuthStateChange.mockImplementation((cb) => {
    authListener = cb
    return { data: { subscription: { unsubscribe } } }
  })
  supabase.auth.signOut.mockResolvedValue({ error: null })
})

test('loads the session and the role from profiles', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  supabase.from.mockReturnValue(makeThenable({ data: { role: 'canteen' }, error: null }))

  renderProbe()

  expect(screen.getByTestId('state')).toHaveTextContent('loading')
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|jane@example.com|canteen'))
  expect(supabase.from).toHaveBeenCalledWith('profiles')
})

test('is signed out with loading=false when there is no session', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

  renderProbe()

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))
})

test('ends signed out when getSession returns an error', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'fetch failed' } })

  renderProbe()

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))
})

test('ends signed out when getSession throws', async () => {
  supabase.auth.getSession.mockRejectedValue(new Error('network down'))

  renderProbe()

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))
})

test('stops loading with no role when the profile lookup fails', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  supabase.from.mockReturnValue(makeThenable({ data: null, error: { message: 'boom' } }))

  renderProbe()

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|jane@example.com|norole'))
})

test('reacts to auth state changes', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  supabase.from.mockReturnValue(makeThenable({ data: { role: 'student' }, error: null }))

  renderProbe()
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))

  act(() => authListener('SIGNED_IN', session))

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|jane@example.com|student'))
})

test('signOut calls supabase and clears the user', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  supabase.from.mockReturnValue(makeThenable({ data: { role: 'student' }, error: null }))
  const user = userEvent.setup()
  renderProbe()
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('student'))

  await user.click(screen.getByRole('button', { name: 'out' }))

  expect(supabase.auth.signOut).toHaveBeenCalled()
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))
})

test('signOut still clears local state when supabase is unreachable', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  supabase.from.mockReturnValue(makeThenable({ data: { role: 'student' }, error: null }))
  supabase.auth.signOut.mockRejectedValue(new Error('network down'))
  const user = userEvent.setup()
  renderProbe()
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('student'))

  await user.click(screen.getByRole('button', { name: 'out' }))

  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready|none|norole'))
})

test('unsubscribes from auth changes on unmount', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

  const { unmount } = renderProbe()
  await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'))
  unmount()

  expect(unsubscribe).toHaveBeenCalled()
})

test('useAuth throws outside the provider', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => render(<Probe />)).toThrow(/AuthProvider/)
  console.error.mockRestore()
})
