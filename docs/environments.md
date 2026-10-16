# Environments: QA and production

| | Git branch | Supabase project | Vercel scope | GitHub environment |
|---|---|---|---|---|
| QA | `develop` (and PR previews) | `quickbites-qa` | Preview | `qa` |
| PRD | `main` | `quickbites-prd` | Production | `production` |

A laptop's `.env` always points at QA. Never put production keys on a laptop.

## One-time setup

### 1. Repository access
Actions environments and secrets need **admin** on the repo. With only write access, fork it
(`gh repo fork <owner>/quickbites-app --clone=false`), enable Actions on the fork, and do the rest there.

### 2. Supabase: two projects
- Create `quickbites-qa` and `quickbites-prd` (same region). Store each database password in a password manager.
- Auth -> URL Configuration, per project: Site URL is that environment's web URL; add its `/reset-password`
  to Redirect URLs. QA also needs `http://localhost:4173/**` and a wildcard for Vercel preview URLs.
- PRD: set custom SMTP (Auth -> SMTP). The built-in sender is heavily rate-limited.
- Free projects pause after about a week idle. Put PRD on a paid plan.

### 3. GitHub: environments and secrets
Settings -> Environments:

- `qa`: deployment branches = `develop`. Secrets `SUPABASE_PROJECT_ID` (QA ref) and `SUPABASE_DB_PASSWORD` (QA).
- `production`: deployment branches = `main`, **required reviewers** = you. Secrets `SUPABASE_PROJECT_ID` (PRD ref) and `SUPABASE_DB_PASSWORD` (PRD).

Settings -> Secrets -> Actions: repository secret `SUPABASE_ACCESS_TOKEN`
(create at supabase.com/dashboard/account/tokens).

Branch protection on `main` and `develop`: require the `test-migrations` check.

### 4. Vercel: one project, two scopes
Import the repo; Production Branch is `main`. Settings -> Environment Variables:

| Variable | Production | Preview |
|---|---|---|
| `VITE_SUPABASE_URL` | PRD project URL | QA project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | PRD publishable key | QA publishable key |
| `VITE_APP_URL` | production URL, no trailing slash | leave unset (each preview uses its own origin) |
| `VITE_DEMO_MODE` | unset | unset |

`VITE_*` values are baked in at build time, so redeploy after changing them. Only ever use the
publishable key in the frontend, never `service_role`.

## First deploy
1. Push to `develop`, or Actions -> Supabase CI/CD -> Run workflow -> `qa`. A brand-new project gets every
   migration in order; no extra flags.
2. Check the QA site: sign up, and the menu loads without the "sample items" banner.
3. Merge `develop` into `main` and approve the production run in Actions. The summary lists the pending migrations.
4. First admin on PRD: sign up in the app, then in the SQL Editor:
   `update public.profiles set role = 'admin' where email = '<your email>';`
   (Signup cannot create admins.)

## Projects that were migrated by hand
If a project received migrations with `supabase db push` before `20260803000000_bootstrap_profiles_table.sql`
existed, push once locally, then CI is plain from then on:

```bash
npx supabase link --project-ref <ref>
npx supabase db push --include-all
```

## Day to day
Feature branch -> PR into `develop` (the fresh-database migration test runs) -> merge -> QA migrates
automatically -> test -> PR `develop` into `main` -> approve the production deploy.
Never `supabase db push` to PRD from a laptop. Migrations are append-only: add a new file instead of editing an applied one.
