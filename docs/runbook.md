# QuickBites runbook

How to run, release, back up and fix the production app. Written for whoever maintains it after handover.
Setup of the environments themselves is in [environments.md](environments.md); the database API is in
[backend-contract.md](backend-contract.md).

## 1. What runs where

| Piece | What it is | Owner after handover |
|---|---|---|
| GitHub repo | Source, CI, deploy and backup workflows | ______ |
| Supabase `quickbites-prd` (`ggfmadzmsxkeceqrplai`) | Production database, logins | ______ |
| Supabase `quickbites-qa` (`ugdyxcuwtxopwlfnudfy`) | Test copy; safe to break | ______ |
| Vercel project `quickbites-app` | Hosts the web app. `main` is production, everything else is a preview | ______ |
| Email provider (custom SMTP) | Sends password-reset emails only | ______ |
| Android APK | Built from the same code with Capacitor (`npm run cap:sync`) | ______ |

| | URL |
|---|---|
| Production | https://quickbites-app.vercel.app |
| QA | https://quickbites-app-git-develop-ezdroms-projects.vercel.app |

The web app (also installable as a PWA) updates for everyone on the next deploy. **The Android APK does not**: after a
release that matters to phone users, build and distribute a new APK.

## 2. Releasing a change

1. Branch off `develop` (`feature/...`, `fix/...`, `chore/...`) and open a PR into `develop`. CI runs the tests, the build,
   and replays every migration on an empty database.
2. Merge. QA's database migrates automatically and Vercel rebuilds the QA site.
3. Test on QA. Use the checklist in section 3.
4. Open a PR from `develop` into `main`. Merging it starts the production deploy, which **pauses for approval** in
   Actions -> Supabase CI/CD. Read the "Migrations about to be applied to production" summary, then approve.
5. Vercel deploys the app to production automatically once `main` changes.

Rules that keep production safe:
- Never run `supabase db push` against production from a laptop.
- Migrations are append-only. To change the database, add a new file in `supabase/migrations/`; never edit an applied one.
- Do the release outside canteen hours.

### Release smoke test (QA, then production after release)
- Log in as a student: the menu loads with no "sample items" banner; Main / Annex picker works.
- Place an order. My Orders shows it with a 4-digit pickup code.
- Log in as canteen staff: the order is in the queue. A wrong code is refused; the right code completes it.
- Close and reopen a location; the student side shows the closed notice, then recovers.

### Rolling back
- **Web app:** Vercel -> Deployments -> pick the last good one -> Promote to Production. Takes seconds.
- **Database change:** do not undo by hand. Write a new migration that reverses it and release it the normal way.
- **Lost or damaged data:** restore from a backup (section 5).

## 3. Everyday admin tasks

| Task | How |
|---|---|
| Make the first admin | Sign up in the app, then in the Supabase SQL Editor: `update public.profiles set role = 'admin' where email = '<email>';` |
| Make someone canteen staff or admin | They sign up first (everyone starts as a student). Then Admin dashboard (`/admin`) -> role dropdown |
| Open or close Main / Annex | Staff: Orders page, one switch per location |
| Add or edit menu items | Staff: Manage Menu page |
| Student lost their phone / cannot show the pickup code | An admin uses **Complete without code** on the Orders page. It is recorded on the order |
| Order is locked (5 wrong codes) | Same: an admin completes it without a code |
| Cancel an order and give the stock back | A student can cancel a pending order; staff can cancel pending or preparing ones |
| Someone is locked out | They use Forgot password. Nothing needs doing in Supabase |
| See sales | Admin dashboard |

## 4. Routine checks

| When | Check |
|---|---|
| Weekly | Actions tab: **Database backup** ran every night and is green. Open the latest run and confirm an artifact is attached |
| Weekly | Open the production site and log in |
| Monthly | Supabase dashboard -> Reports: database size and auth usage against the plan limits |
| Quarterly | Rehearse a restore (section 5). A backup you have never restored is a guess |
| Quarterly | Review who is `admin` and `canteen`; demote anyone who left |
| Yearly | Rotate the Supabase access token and database passwords (section 7) |

Free Supabase projects **pause after about a week with little activity** and stop answering (logins fail with a
connection timeout). A paid plan avoids this. On the free plan, keep the scheduled `keep-alive.yml` workflow enabled; if
the project does pause, restore it from the Supabase dashboard (possible for a limited time).

## 5. Backups and restore

### What exists
`.github/workflows/db-backup.yml` dumps the production database every night at 02:00 Manila time: roles, schema,
public data and the accounts in the `auth` schema. The dump is **encrypted** with a public key before it is
uploaded, because this repository is public and anyone signed in to GitHub can download a public repository's
artifacts. It is kept for 30 days as a workflow artifact (Actions -> Database backup -> a run -> Artifacts).

The backup is only as good as three things: the workflow keeps running, **the private key is safe**, and a
restore has been tried. Losing the private key means the backups cannot be opened.

### One-time setup
1. On a trusted computer install `age` (`winget install FiloSottile.age`, or `brew install age`) and run:
   ```bash
   age-keygen -o quickbites-backup.key
   ```
   It prints `Public key: age1...`. Keep `quickbites-backup.key` in the client's password manager (and a second copy
   offline). **Never commit it and never paste it into GitHub.**
2. GitHub -> Settings -> Environments -> New environment `production-backup`. Deployment branches: `main`.
   **No required reviewers** (a reviewer would stall the nightly run). Secrets:
   - `SUPABASE_PROJECT_ID`: the production ref
   - `SUPABASE_DB_PASSWORD`: the production database password
   - `BACKUP_AGE_PUBLIC_KEY`: the `age1...` line from step 1
3. The repository secret `SUPABASE_ACCESS_TOKEN` (already used by deploys) is reused.
4. The workflow only runs from `main`. After it reaches `main`, run it once by hand (Actions -> Database backup ->
   Run workflow) and confirm an artifact appears. GitHub emails the repository owner when a scheduled run fails.
   GitHub also switches scheduled workflows off after 60 days without repository activity; re-enable them in the
   Actions tab if that happens.

### Restore
Always restore into a **new, empty Supabase project first**, check it, and only then decide what to do with
production. Never restore over production blindly.

```bash
# 1. Download the artifact from the Actions run, unzip it, then decrypt and unpack
age -d -i quickbites-backup.key quickbites-prd-YYYYMMDD-HHMM.tar.gz.age > backup.tar.gz
mkdir restore && tar -xzf backup.tar.gz -C restore && cd restore

# 2. Restore into the new project (its connection string is in Supabase -> Project settings -> Database)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql --file auth-data.sql \
  --dbname "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

Then check that orders and menu items are there and that a known user can log in. `schema.sql` creates the
tables, policies and functions as they were; you do not need to run the migrations again. Point the Vercel
production variables at the new project only if production is being replaced.

The auth data is the step most likely to need adjusting (a fresh project already has some auth rows). That is
exactly why to rehearse the restore before an emergency.

## 6. When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Login says "Invalid API key" | `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing or wrong for that Vercel scope | Fix in Vercel -> Settings -> Environment Variables, then **redeploy** (values are baked in at build time) |
| Everyone's logins time out ("connection timeout", status 544) | Free Supabase project paused | Supabase dashboard -> restore the project |
| Sign up says "Signups not allowed" | Supabase -> Authentication -> Sign In / Providers: "Allow new users to sign up" is off | Turn it on (leave it off on production until go-live) |
| Reset-password link opens `localhost` | Supabase Site URL or Redirect URLs are wrong | Authentication -> URL Configuration: Site URL is the site's address; add `<site>/reset-password` to Redirect URLs |
| Reset emails do not arrive | Built-in email is limited to a couple of messages an hour and only to team members | Use the custom SMTP provider; check its sending limit and logs |
| Menu shows "sample items" | Only in dev/demo builds, never on production. Production shows an error and Retry instead | Fix the connection; see the first two rows |
| Deploy job failed at "Setup Supabase CLI ... rate limit exceeded" | GitHub API rate limit, nothing wrong with the code | Actions -> the run -> Re-run failed jobs |
| Deploy job failed during `db push` | A migration has an error | Read the log. Fix with a **new** migration; never edit an applied one |
| A location stays closed | Staff closed it | Orders page -> Open <location> |
| Staff cannot mark an order picked up | They need the student's code. Wrong or locked codes are shown on the order | An admin can complete it without a code |
| A user cannot see staff pages | Their role is `student` | Admin dashboard -> role dropdown |

Where to look: Supabase -> Logs (API and Auth), Vercel -> the deployment -> Runtime Logs, and the Actions tab for
anything involving deploys or backups.

## 7. Secrets and where they live

Names only; never write the values in the repository, in chat or in an issue.

| Secret | Lives in | Used for | Rotate by |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | GitHub repository secret | CI links and deploys both projects | Create a new token in Supabase account settings, update the secret, delete the old one |
| `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD` | GitHub environments `qa`, `production`, `production-backup` | Deploys and backups | Reset the database password in Supabase, update it in every environment that holds it |
| `BACKUP_AGE_PUBLIC_KEY` | GitHub environment `production-backup` | Encrypts backups | Generate a new key pair; keep the **old private key** as long as old backups matter |
| age **private** key | Client's password manager, plus an offline copy | Opening backups | Not stored on GitHub, Vercel or Supabase |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL` | Vercel (Production and Preview scopes) | The web app. The publishable key is safe in the browser | Change in Vercel and redeploy |
| SMTP credentials | Supabase -> Authentication -> SMTP | Password-reset emails | Rotate at the email provider, update in Supabase |

The Supabase `service_role` key is never used by this app and must never be placed in the frontend or in Vercel.

## 8. Handover checklist

- [ ] The client's organisation owns the production Supabase project (Supabase can transfer a project between organisations) and the Vercel project; the maintainer is invited as a collaborator
- [ ] The repository lives in an account the client controls, with branch protection on `main` and `develop` (require `test-migrations`)
- [ ] Vercel plan matches the use. The free Hobby plan is for non-commercial use only; confirm with Vercel if unsure
- [ ] Supabase plan decided. The free plan has no automatic backups and pauses idle projects. Either upgrade or rely on the nightly backup workflow and the keep-alive
- [ ] Backup workflow set up and run once by hand; private key stored with the client; **restore rehearsed once**
- [ ] Production Supabase: Site URL and Redirect URLs set to the production address; custom SMTP set; Confirm email off; signups enabled only at go-live
- [ ] Vercel production variables set (section 7); `VITE_DEMO_MODE` unset
- [ ] First admin created; canteen staff accounts created and promoted
- [ ] Custom domain (if any) added in Vercel and in the Supabase redirect list
- [ ] Android: if the APK is shared outside the team, a release signing key exists and is stored by the client (losing it means phones cannot update the app)
- [ ] Privacy: the app stores students' emails and order history. Agree who answers deletion requests and how long records are kept
- [ ] Support contact and response expectations written down: ______
- [ ] Payments are not part of this release. When added, they need their own webhook, secrets and a section in this runbook
