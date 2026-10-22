import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LocationPicker from './LocationPicker.jsx'
import { annexLocation, mainLocation } from '../test/supabaseMock.js'

const locations = [mainLocation, { ...annexLocation, is_open: false }]

test('lists each location with its open/closed state and marks the selected one', () => {
  render(<LocationPicker locations={locations} selected={mainLocation} onSelect={jest.fn()} />)

  expect(screen.getByRole('group', { name: /pickup location/i })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /main\s*open/i })).toBeChecked()
  expect(screen.getByRole('radio', { name: /annex\s*closed/i })).not.toBeChecked()
})

test('calls onSelect with the id of the location the student picks', async () => {
  const onSelect = jest.fn()
  const user = userEvent.setup()
  render(<LocationPicker locations={locations} selected={mainLocation} onSelect={onSelect} />)

  await user.click(screen.getByRole('radio', { name: /annex/i }))

  expect(onSelect).toHaveBeenCalledWith('loc-annex')
})

test('shows a loading message while the locations load', () => {
  render(<LocationPicker locations={[]} selected={null} onSelect={jest.fn()} loading />)

  expect(screen.getByText(/loading pickup locations/i)).toBeInTheDocument()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})

test('shows an error with a working Retry when the locations failed to load', async () => {
  const onRetry = jest.fn()
  const user = userEvent.setup()
  render(<LocationPicker locations={[]} selected={null} onSelect={jest.fn()} failed onRetry={onRetry} />)

  expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the pickup locations/i)
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(onRetry).toHaveBeenCalled()
})

test('renders nothing when there are no locations', () => {
  const { container } = render(<LocationPicker locations={[]} selected={null} onSelect={jest.fn()} />)

  expect(container).toBeEmptyDOMElement()
})
