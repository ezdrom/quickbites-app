import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordPage from './ForgotPasswordPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(),
    },
  },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('renders the email field and a link back to login', () => {
  renderPage()

  expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login')
})

test('shows a confirmation message on success', async () => {
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/email/i), 'jane.doe@example.com')
  await user.click(screen.getByRole('button', { name: /send link/i }))

  expect(await screen.findByText(/password reset link sent/i)).toBeInTheDocument()
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    'jane.doe@example.com',
    expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
  )
})

test('shows the supabase error message on failure', async () => {
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } })
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/email/i), 'jane.doe@example.com')
  await user.click(screen.getByRole('button', { name: /send link/i }))

  expect(await screen.findByText('User not found')).toBeInTheDocument()
})

test('shows a connection error message instead of hanging when supabase is unreachable', async () => {
  supabase.auth.resetPasswordForEmail.mockRejectedValue(new Error('fetch failed'))
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText(/email/i), 'jane.doe@example.com')
  await user.click(screen.getByRole('button', { name: /send link/i }))

  expect(await screen.findByText(/can't reach the server/i)).toBeInTheDocument()
})
