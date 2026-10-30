// Jest stand-in for src/lib/env.js. Defaults keep the current behaviour
// (placeholder fallback allowed, no demo bypass). Override per test with
// jest.mock('../../lib/env.js', () => ({ ... })).
export const isDev = true
export const isDemoMode = false
export const allowPlaceholderData = true
export const supabaseUrl = 'https://placeholder.supabase.co'
export const supabaseKey = 'placeholder-key'
export const appUrl = ''
