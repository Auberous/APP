# Supabase setup

Everything the database needs for Phase 1 is in
`migrations/0001_initial_schema.sql`. It is written to be re-runnable, so
applying it twice is safe.

## Applying the migration

**Dashboard:** open the SQL Editor for your project, paste the contents of
`migrations/0001_initial_schema.sql`, and run it.

**CLI:** `supabase db push`, or
`psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql`.

Then set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
`.env` (see `.env.example`) and restart with `npx expo start --clear`.

## What it creates

| Object | Purpose |
|---|---|
| `users` | One profile row per account, created automatically on sign-up. |
| `circles` | A named private group. |
| `circle_members` | Membership, with an `admin` / `member` role. |
| `circle_invites` | A pending invitation addressed to an email address. |
| `is_circle_member` / `is_circle_admin` / `shares_circle_with` / `has_pending_circle_invite` | `SECURITY DEFINER` helpers used by the policies. |
| `accept_circle_invite` | The one path by which a non-member may join a circle. |

## Why the helper functions are `SECURITY DEFINER`

A policy on `circle_members` that itself queries `circle_members` recurses, and
Postgres aborts the query. Running the membership lookup inside a definer
function bypasses RLS *for that lookup only* and breaks the cycle. Each helper
takes an id, is scoped internally to `auth.uid()`, and returns a boolean, so it
cannot be used to read rows. `search_path` is pinned on every one of them.

## Access rules, in words

- A circle is visible to its members. A pending invitee can additionally read
  the circle row, so the invitation can name the circle — but not
  `circle_members`, so they learn nothing about who is in it until they join.
- Membership rows are visible to members of that circle, and to nobody else.
- Only an admin can add, remove, or re-role members, or rename the circle.
- Anyone can remove *themselves* from a circle. Leaving is never harder than
  joining (constitution §3).
- Profiles are visible to yourself and to people you actually share a circle
  with. There is no browsable user directory.
- Only an admin can create an invite. An invite can only be accepted by someone
  signed in with that **verified** email address, and only once.
- `anon` is granted nothing on any table.

## Running the tests

```sh
supabase/tests/run.sh
```

This stands up a throwaway local Postgres, fakes the small part of Supabase the
migration depends on (`auth.uid()`, `auth.jwt()`, the `authenticated` and `anon`
roles), applies the migration, and then exercises the policies as three separate
users — checking both that the right things are allowed and that the wrong ones
are refused. It needs a local `postgres` install and touches no real project; if
Postgres is absent it exits quietly.

Add a case here whenever you add a policy. Policy bugs are silent: an
over-permissive policy looks exactly like a working app.

## Deliberately absent

There are no columns anywhere for likes, reactions, view counts, follower
counts, or ranking scores, and no table stores an engagement signal
(constitution §3). Adding one is a product decision for Charles, not a schema
detail.

## Not done yet

- **Invitation emails are not sent.** An invite is a row in `circle_invites`;
  nothing delivers it. The inviter is told this plainly on screen. Choosing a
  delivery mechanism (Supabase Auth invite emails, a transactional provider, or
  a share link) is a Phase 2+ decision — see the note in the root summary.
- **Account and data deletion** (constitution §4) is not built. The foreign keys
  cascade from `auth.users`, so deleting an account removes its rows, but the
  one-tap in-app deletion and the stated backup retention window still need
  designing and disclosing.
- **Data export** (constitution §4) is not built.
