// A minimal stand-in for supabase-js's chainable, "thenable" query builder.
// Every method returns the same object, and awaiting the object (or calling
// .then on it) at any point in the chain resolves to `result` — matching how
// the real PostgrestFilterBuilder can be awaited after any link in the chain.
export function makeThenable(result) {
  const builder = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'order', 'single', 'limit']
  methods.forEach((method) => {
    builder[method] = jest.fn(() => builder)
  })
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return builder
}

export const mainLocation = { id: 'loc-main', name: 'Main', sort_order: 1, is_open: true }
export const annexLocation = { id: 'loc-annex', name: 'Annex', sort_order: 2, is_open: true }

// The result of reading `locations`, with optional per-location overrides,
// e.g. locationsResult({ Annex: { is_open: false } }).
export function locationsResult(overrides = {}) {
  return {
    data: [mainLocation, annexLocation].map((location) => ({ ...location, ...overrides[location.name] })),
    error: null,
  }
}

// Route supabase.from(table) to a result per table. Tables not listed resolve
// to empty data, so a page never receives another table's rows by accident.
export function routeTables(supabase, tables) {
  supabase.from.mockImplementation((table) => makeThenable(tables[table] ?? { data: [], error: null }))
}
