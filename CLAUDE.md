# QuickBites

Campus food ordering and pickup app for JRCC. Students browse the menu, order, and pick up. Canteen staff manage the menu and fulfil orders.

## Stack and commands
- React 18 + Vite, react-router-dom v6, Supabase (auth + Postgres + RLS). Capacitor wraps the web build as an Android app. PWA via vite-plugin-pwa.
- `npm run dev` (port 4173), `npm test` (Jest + Testing Library), `npm run build`, `npm run cap:sync` (build + copy into android/).
- Tests live next to the file as `*.test.jsx`. Mock Supabase with `jest.mock('../../lib/supabaseClient.js', ...)`; use `makeThenable` from `src/test/supabaseMock.js` for chained `.from().select().eq()` calls.

## Layout
- `src/pages/<Area>/` one folder per page (Login, RegisterUser, ForgotPassword, ResetPassword, Menu, Checkout, Canteen). `src/components/` shared UI. `src/context/CartContext.jsx` cart state.
- Auth pages style with `src/styles/login.css` (+ inline styles). Other pages use `src/styles/components.css` and the tokens in `theme.css`. Keep the existing green/cream/gold look.
- Routes are all in `src/routes/AppRoutes.jsx`.
- Roles: `student`, `canteen`, `admin` (stored in `profiles.role`). Login sends canteen users to `/canteen-orders`, everyone else to `/menu`.

## Supabase rules (learned the hard way)
- Migrations in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`. Never edit an applied migration; add a new one.
- `profiles.role` is plain text with a CHECK constraint. Do NOT `ALTER COLUMN ... TYPE` it (other tables' policies depend on it).
- Never write an RLS policy that queries `profiles` inline from a `profiles` policy (infinite recursion, 42P17). Use the `SECURITY DEFINER` helper `public.is_admin_or_staff()`.
- Stock is decremented atomically at order time inside `place_order()`; pickup only changes `orders.status`.
- The app falls back to `src/data/placeholderMenuItems.js` when Supabase is unreachable, but only when `allowPlaceholderData` (dev server or `VITE_DEMO_MODE=true`, from `src/lib/env.js`) is true. In production it shows an error + Retry instead. Never read `import.meta.env` outside `src/lib/env.js`.

## Git workflow
- Branch off `develop` (`feature/...`, `fix/...`, `chore/...`), open PRs into `develop`. `main` is production and only receives `develop` via PR.
- CI (`.github/workflows/ci.yml`) must pass: `npm test` and `npm run build`.
- Files in this repo use LF in the index; Git on Windows will warn about CRLF, that is fine.
- Pin: Capacitor 7.x, Babel 7.x, @testing-library/jest-dom 6.x (newer majors need Node 22 or break Jest).
- End commits with the Co-Authored-By trailer and PR bodies with the "Generated with Claude Code" line.

## Done means
Tests added or updated for the change, `npm test` and `npm run build` green, UI changes checked in the browser at desktop and mobile widths.
