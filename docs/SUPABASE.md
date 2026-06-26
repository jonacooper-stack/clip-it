# ClipIt accounts & data (Supabase)

Real sign-in runs on Supabase. The whole layer is **gated on two env vars** — with
them unset, the app runs local-only (no account step), so demos and the web
preview work with zero backend. Set them and accounts turn on.

## One-time setup (browser only, no local machine)
1. **Create the project** — [supabase.com](https://supabase.com) → **New project**
   (name, database password, region). Wait ~2 min for provisioning.
2. **Get the keys** — project → **Settings → API**:
   - **Project URL**
   - the **publishable** key (`sb_publishable_…`) — the new client-safe key that
     replaces the legacy `anon` key.
3. **Add to Vercel** — your ClipIt project → **Settings → Environment Variables**,
   for **Production + Preview**:
   | Variable | Value |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | the Project URL |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_…` key |

   > The variable is named `…ANON_KEY` for historical reasons; the publishable key
   > goes in it. `EXPO_PUBLIC_*` vars are inlined at **build time**, so you must
   > **redeploy** after changing them (a push or Vercel → Deployments → Redeploy).
4. **Smoother testing** — **Authentication → Providers → Email** → turn **off
   "Confirm email"** so you and friends sign in instantly (no confirmation-link
   round-trip). Turn it back on before a public launch.

## The two key types — don't mix them up
- **Publishable** (`sb_publishable_…`): goes in the **client** (app / Vercel). Safe
  to expose *because* Row-Level Security protects the data.
- **Secret** (`sb_secret_…`): **server-only**. It **bypasses RLS** — never put it in
  the app, Vercel public env, or git.

## Row-Level Security
RLS is what makes the publishable key safe: it's the only thing stopping anyone
with that public key from reading/writing everyone's rows. `supabase/migrations/
0001_init.sql` already `enable row level security` on every table plus
owner-scoped policies (`auth.uid()`), including parent→child access via
`guardian_id`. Run that migration when we add the cloud data tables (next step);
until then there are no app tables, so nothing is exposed.

## Status & roadmap
- **Now — identity:** email + password sign-up / sign-in / sign-out; name + age
  saved to the account and mirrored into the local store the UI reads.
- **Next — journal cloud sync:** run the migration, then store sightings per-user
  (RLS-scoped) so a journal follows you across devices and unlocks the social /
  science features.
- **Native:** when the iOS build is unblocked, the same two keys get added to the
  EAS build environment.
