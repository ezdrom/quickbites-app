const joinNames = (names) =>
  names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`

export default function CanteenClosedNotice({ locationName = 'The canteen', openElsewhere = [] }) {
  return (
    <p role="status" className="canteen-closed-notice">
      {locationName} is closed right now.{' '}
      {openElsewhere.length > 0
        ? `You can order from ${joinNames(openElsewhere)} instead, or keep browsing the menu.`
        : 'You can still browse the menu.'}
    </p>
  )
}
