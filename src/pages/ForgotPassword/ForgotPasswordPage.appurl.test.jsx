import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordPage from './ForgotPasswordPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: { auth: { resetPasswordForEmail: jest.fn() } },
}))

jest.mock('../../lib/env.js', () => ({ appUrl: 'https://quickbites.example.com' }))

test('uses the configured public app URL for the reset link, not window.location.origin', async () => {
  supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText(/email/i), 'jane.doe@example.com')
  await user.click(screen.getByRole('button', { name: /send link/i }))

  await screen.findByText(/password reset link sent/i)
  expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('jane.doe@example.com', {
    redirectTo: 'https://quickbites.example.com/reset-password',
  })
})
