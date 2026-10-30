// Shown only when Supabase is unreachable AND placeholder data is allowed (the
// dev server or demo mode), so the pickup-location UI can be seen without a
// backend. Never used in a production build.
export const placeholderLocations = [
  { id: 'placeholder-main', name: 'Main', sort_order: 1, is_open: true },
  { id: 'placeholder-annex', name: 'Annex', sort_order: 2, is_open: true },
]
