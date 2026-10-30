import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('renders the new password fields', () => {
  renderPage()

  expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
})

test('shows a validation error and skips updateUser when passwords do not match', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/new password/i), 'Password123!')
  await user.type(screen.getByLabelText(/confirm password/i), 'Different123!')
  await user.click(screen.getByRole('button', { name: /reset password/i }))

  expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  expect(supabase.auth.updateUser).not.toHaveBeenCalled()
})

test('updates the password, signs out, and shows a success message', async () => {
  supabase.auth.updateUser.mockResolvedValue({ error: null })
  supabase.auth.signOut.mockResolvedValue({ error: null })
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/new password/i), 'Password123!')
  await user.type(screen.getByLabelText(/confirm password/i), 'Password123!')
  await user.click(screen.getByRole('button', { name: /reset password/i }))

  expect(await screen.findByText(/password has been reset/i)).toBeInTheDocument()
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'Password123!' })
  expect(supabase.auth.signOut).toHaveBeenCalled()
  expect(screen.getByRole('link', { name: /back to log in/i })).toHaveAttribute('href', '/login')
})

test('shows the supabase error message on failure', async () => {
  supabase.auth.updateUser.mockResolvedValue({ error: { message: 'Auth session missing' } })
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/new password/i), 'Password123!')
  await user.type(screen.getByLabelText(/confirm password/i), 'Password123!')
  await user.click(screen.getByRole('button', { name: /reset password/i }))

  expect(await screen.findByText('Auth session missing')).toBeInTheDocument()
  expect(supabase.auth.signOut).not.toHaveBeenCalled()
})

test('shows a connection error message instead of hanging when supabase is unreachable', async () => {
  supabase.auth.updateUser.mockRejectedValue(new Error('fetch failed'))
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/new password/i), 'Password123!')
  await user.type(screen.getByLabelText(/confirm password/i), 'Password123!')
  await user.click(screen.getByRole('button', { name: /reset password/i }))

  expect(await screen.findByText(/can't reach the server/i)).toBeInTheDocument()
})
