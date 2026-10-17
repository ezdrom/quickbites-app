# QuickBites

Campus food ordering and pick-up app for JRCC. Students browse the menu, order, and pick up. Canteen staff manage the menu and fulfil orders.

Stack: React 18 + Vite, react-router-dom v6, Supabase (auth, Postgres, RLS). Capacitor wraps the web build as an Android app, and vite-plugin-pwa makes the web build installable.

## Getting started

Requires Node 22 (the version CI uses) and npm.

```bash
npm ci
cp .env.example .env     # then fill in your Supabase values
npm run dev              # http://localhost:4173
```

### Environment variables

Set in `.env` locally (git-ignored), in the Vercel project settings for the web app, and as GitHub secrets for the APK build.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL (Project Settings -> API). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable (anon) key. Never use the service-role key in the app. |
| `VITE_DEMO_MODE` | no | `true` allows sample menu data when Supabase is unreachable and bypasses the auth/role guards (fake admin user). **Ignored in production builds** (`import.meta.env.PROD`); only works with `npm run dev` or `vite build --mode development`. Keep `false` (or unset) everywhere else. |
| `VITE_APP_URL` | recommended | Public URL of the deployed web app, no trailing slash (e.g. `https://your-app.vercel.app`). Used for the password-reset link. Inside the Android app `window.location.origin` is `localhost`, so without this the emailed link would point at localhost. |

If the Supabase variables are missing the app still boots against a placeholder URL, but every request fails.

### Sample data policy

Sample menu items (`src/data/placeholderMenuItems.js`) are shown only when `import.meta.env.DEV` is true (`npm run dev`) or `VITE_DEMO_MODE=true` in a non-production build. In a normal production build, if the menu cannot be loaded the Menu, Checkout and Canteen pages show "Couldn't load the menu. Check your connection." with a Retry button. Place Order stays disabled and the canteen form cannot save until the real data loads. All of these flags are read in one place, `src/lib/env.js` (nothing else may touch `import.meta.env`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 4173. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the production build locally on port 4173. |
| `npm test` | Jest + Testing Library. CI runs `npm test -- --ci`. |
| `npm run cap:sync` | Build the web app and copy it into the `android/` project. |
| `npm run cap:open` | Open the `android/` project in Android Studio. |
| `npm run supabase:start` | Start the local Supabase stack (needs Docker). |
| `npm run supabase:reset` | Recreate the local database from `supabase/migrations/`. |
| `npm run supabase:push` | Push migrations to the linked remote project. |

## Supabase

- Migrations live in `supabase/migrations/` as `YYYYMMDDHHMMSS_description.sql`. Never edit a migration that has been applied; add a new one.
- Local: `npm run supabase:start`, then `npm run supabase:reset` to apply every migration.
- Remote: `npx supabase login`, `npx supabase link --project-ref <ref>`, then `npm run supabase:push`. On merge to `main`, `.github/workflows/supabase-sync.yml` tests the migrations and pushes them to the cloud project (needs the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` secrets).
- Roles are `student`, `canteen`, `admin` (`profiles.role`). Stock is decremented atomically in the `place_order()` function.

### Dashboard setup for password reset

"Forgot password" emails link back to `<current origin>/reset-password`, and Supabase only honours redirect URLs that are allow-listed. In the Supabase dashboard open Authentication -> URL Configuration and set:

- **Site URL**: your production origin, for example `https://<your-app>.vercel.app`.
- **Redirect URLs** (allow-list):
  - `http://localhost:4173/**`
  - `https://<your-app>.vercel.app/**` (or at least `https://<your-app>.vercel.app/reset-password`)
  - any Vercel preview origin you want to test, plus `/reset-password`

Without this the reset link sends users to the Site URL instead of the reset page.

## Git and CI workflow

- Branch off `develop` (`feature/...`, `fix/...`, `chore/...`) and open pull requests into `develop`. `main` is production and only receives `develop` through a pull request.
- CI (`.github/workflows/ci.yml`) must pass on every PR: `npm test -- --ci` and `npm run build`.
- Tests sit next to the code as `*.test.jsx`. Mock Supabase with `jest.mock('../../lib/supabaseClient.js', ...)` and use `makeThenable` from `src/test/supabaseMock.js` for chained queries. To test production behaviour, add `jest.mock('../../lib/env.js', () => ({ isDev: false, isDemoMode: false, allowPlaceholderData: false }))` (by default Jest maps `env.js` to `src/test/envMock.js`, which allows placeholder data).
- Commits end with the Co-Authored-By trailer and PR bodies with the "Generated with Claude Code" line.
- Pinned versions: Capacitor 7.x, Babel 7.x, `@testing-library/jest-dom` 6.x.

### GitHub secrets

Settings -> Secrets and variables -> Actions:

| Secret | Used by |
| --- | --- |
| `VITE_SUPABASE_URL` | `release.yml` (APK is built against the real project). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `release.yml`. |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` | `supabase-sync.yml` (migration deploy on `main`). |

CI itself builds with placeholder Supabase values and needs no secrets.

## Deploying the web app

`vercel.json` rewrites every route to `index.html` (single-page app). Import the repo in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the Production environment, and leave `VITE_DEMO_MODE` unset or `false`.

## Building the Android APK

Requires JDK 17 and Android Studio (Android SDK).

1. Make sure `.env` has the real Supabase values (they are baked into the build).
2. `npm run cap:sync` builds the web app and copies it into `android/`.
3. `npm run cap:open`, then in Android Studio use Build -> Build Bundle(s) / APK(s) -> Build APK(s), or run `./gradlew assembleDebug` inside `android/`. The APK ends up in `android/app/build/outputs/apk/debug/`.

Without Android Studio: every push to `main` runs `.github/workflows/release.yml`, which tests, builds, assembles a debug APK and attaches it to a GitHub pre-release (`build-<run number>`). It needs the `VITE_SUPABASE_*` secrets above and can also be started manually (Actions -> Release APK -> Run workflow).

The `android/` project is committed; generated output (`android/app/build`, copied web assets) is git-ignored.
