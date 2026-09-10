# Compass

A mobile-first app for family memories, wellbeing, and informed citizenship —
built deliberately without the mechanics of mainstream social media.

The product constitution lives in [`CLAUDE.md`](../CLAUDE.md) at the repository
root and governs what may be built here. Read it before starting work.

## Status: Phase 1 — foundation

Built:

- Expo + TypeScript app scaffold.
- Supabase Postgres schema for `users`, `circles`, `circle_members` and
  `circle_invites`, with Row Level Security as the enforcement mechanism.
- Email + password auth: sign up, log in, log out.
- Circles: list the circles you belong to, create one, invite someone by email,
  and accept or decline an invitation addressed to you.

Not built yet: media upload, timelines, messaging, the civic module,
sponsorship, notifications, data export, and in-app account deletion.

There is no content feed in this phase, so there is nothing here that could
scroll infinitely, tally reactions, count followers, or rank anything.

## Getting started

```sh
npm install
cp .env.example .env      # then fill in your Supabase URL and anon key
npx expo start
```

Apply `supabase/migrations/0001_initial_schema.sql` to your Supabase project
before signing up — see [`supabase/README.md`](supabase/README.md).

Without credentials the app still runs and shows a screen explaining exactly
what is missing, rather than crashing or hanging on a login form that cannot
work.

## Checks

```sh
npx tsc --noEmit            # types
supabase/tests/run.sh       # RLS policy tests (needs a local postgres)
npx expo export --platform android --output-dir /tmp/compass-export   # bundles
```

There is no JavaScript test runner configured yet — see the Phase 2 notes.

## How it fits together

`App.tsx` wraps everything in `AuthProvider`, which owns the Supabase session
and restores it from AsyncStorage on launch. `RootNavigator` then picks one of
three states: a setup notice if credentials are missing, the auth stack if
nobody is signed in, or the app stack if someone is.

Screens read and write through the Supabase client directly. They deliberately
carry no access-control logic: the RLS policies in `supabase/migrations/` decide
what any given user can see, so a query that forgot a filter returns nothing
rather than someone else's data.

## Dependencies

Eleven runtime dependencies: Expo, React, React Native, React Navigation
(+ screens and safe-area-context), supabase-js, AsyncStorage, and a URL
polyfill.

There are no analytics or advertising SDKs, and there must never be
(constitution §8) — the requirement is enforced by not installing them, not by
policy alone.
