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
with that public key from reading/writing everyone's rows. Every table the
app uses has row-level security on, with rules written for what each table is
for (`0002`–`0011`). `0001_init.sql` is an earlier design for a science
database (PostGIS, a species catalog) that was never run and is not needed:
the cloud journal lives in `0011_cloud_journal.sql`.

## Migrations and their tests
Migrations in `supabase/migrations/` are run by hand in the SQL editor, in
order (`0001_init.sql`, the PostGIS science schema, is not part of the live
database yet). `npm run test:db` applies them to a fresh local Postgres and
checks the rules as different players: add a check to
`supabase/tests/rules.test.sql` whenever a migration changes a policy.

The publishable key ships inside the app, so assume anyone can call the
database directly: every limit that matters has to hold in a policy, a
constraint or a trigger, not only in the app. `0010_hardening.sql` is where
the current set lives.

## Status & roadmap
- **Now — identity:** email + password sign-up / sign-in / sign-out; name + age
  saved to the account and mirrored into the local store the UI reads.
- **Now — the cloud journal** (`0011_cloud_journal.sql`): each account's
  sightings are stored in `journal_sightings` (readable only by their owner,
  written only by the server), with a copy of each photo in the private
  `journal-photos` bucket. The server scores every sighting and writes the
  leaderboard totals; `journal_state` holds where each account stands,
  including the player's two choices (`backup`: is the journal saved at all;
  `save_places`: is the rough place of each sighting saved with it). Nothing
  is stored for an account unless `backup` is `yes`. How it is rolled out:
  [RELEASE.md](RELEASE.md), "The cloud journal".
- **Later, if the game grows large:** the check for the same photo handed in
  twice (`journal_look_alikes`) compares a new photo with every stored
  fingerprint. That is quick up to a few hundred thousand photos; beyond that
  it wants an index or a first pass that narrows the field.
- **Native:** when the iOS build is unblocked, the same two keys get added to the
  EAS build environment.
