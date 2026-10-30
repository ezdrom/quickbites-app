import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RegisterUserPage from './RegisterUserPage.jsx'
import { supabase } from '../../lib/supabaseClient.js'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
    },
  },
}))

function renderPage() {
  render(
    <MemoryRouter>
      <RegisterUserPage />
    </MemoryRouter>,
  )
}

async function fillForm(user, { password = 'Password123!', confirmPassword = password } = {}) {
  await user.type(screen.getByLabelText(/first name/i), 'Jane')
  await user.type(screen.getByLabelText(/last name/i), 'Doe')
  await user.type(screen.getByLabelText(/^email$/i), 'jane.doe@example.com')
  await user.type(screen.getByLabelText(/^password$/i), password)
  await user.type(screen.getByLabelText(/confirm password/i), confirmPassword)
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('renders all registration fields', () => {
  renderPage()

  expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
})

test('does not let people pick a role and explains how staff accounts are made', () => {
  renderPage()

  expect(screen.queryByLabelText(/registering as/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByText(/canteen staff accounts are set up by an administrator/i)).toBeInTheDocument()
})

test('shows a validation error and skips signUp when passwords do not match', async () => {
  const user = userEvent.setup()
  renderPage()

  await fillForm(user, { password: 'Password123!', confirmPassword: 'Different123!' })
  await user.click(screen.getByRole('button', { name: /sign up/i }))

  expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  expect(supabase.auth.signUp).not.toHaveBeenCalled()
})

test('combines first and last name and calls supabase.auth.signUp without asking for any role, navigating to /menu when a session is returned', async () => {
  supabase.auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
  const user = userEvent.setup()
  renderPage()

  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /sign up/i }))

  await waitFor(() => {
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'jane.doe@example.com',
      password: 'Password123!',
      options: { data: { full_name: 'Jane Doe' } },
    })
  })
  expect(mockNavigate).toHaveBeenCalledWith('/menu')
})

test('shows an email-confirmation status message when signUp succeeds without a session', async () => {
  supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
  const user = userEvent.setup()
  renderPage()

  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /sign up/i }))

  expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  expect(mockNavigate).not.toHaveBeenCalled()
})

test('shows the supabase error message when signUp fails', async () => {
  supabase.auth.signUp.mockResolvedValue({
    data: {},
    error: { message: 'Email already registered' },
  })
  const user = userEvent.setup()
  renderPage()

  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /sign up/i }))

  expect(await screen.findByText('Email already registered')).toBeInTheDocument()
  expect(mockNavigate).not.toHaveBeenCalled()
})
