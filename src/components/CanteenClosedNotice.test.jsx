import { render, screen } from '@testing-library/react'
import CanteenClosedNotice from './CanteenClosedNotice.jsx'

test('names the closed location and points to the one that is open', () => {
  render(<CanteenClosedNotice locationName="Annex" openElsewhere={['Main']} />)

  expect(screen.getByRole('status')).toHaveTextContent(
    'Annex is closed right now. You can order from Main instead, or keep browsing the menu.',
  )
})

test('joins several open locations naturally', () => {
  render(<CanteenClosedNotice locationName="Annex" openElsewhere={['Main', 'North', 'South']} />)

  expect(screen.getByRole('status')).toHaveTextContent('You can order from Main, North, or South instead')
})

test('only offers browsing when nothing is open', () => {
  render(<CanteenClosedNotice locationName="Main" openElsewhere={[]} />)

  expect(screen.getByRole('status')).toHaveTextContent('Main is closed right now. You can still browse the menu.')
})

test('has sensible defaults', () => {
  render(<CanteenClosedNotice />)

  expect(screen.getByRole('status')).toHaveTextContent('The canteen is closed right now.')
})
