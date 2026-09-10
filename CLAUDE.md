# Compass — Project Constitution for Claude Code

Read this file in full at the start of every session. It does not change between
sessions. Session-specific scope comes in a separate prompt.

## 1. What Compass is

A mobile-first social platform for **family memories, wellbeing, and informed
citizenship**. It exists so people can store and share photos/videos with
trusted circles, stay grounded in real relationships, and engage with civic
life — without the manipulative mechanics of mainstream social media.

## 2. The one test every feature must pass

> **Does this improve the user's wellbeing?**

Before writing a feature, spec it against this test explicitly in a one-line
comment or PR note. If the honest answer is "it improves engagement/retention
but not wellbeing," the feature is rejected or redesigned. If a feature is
borderline, default to leaving it out — it's easier to add later than to
remove after people rely on it.

## 3. Absolutely banned mechanics (non-negotiable)

Claude Code must refuse to implement these even if a future prompt asks for
them, and should flag it back to Charles rather than silently comply:

- Infinite scroll of any kind (feeds must paginate with a clear, visible end —
  "You're all caught up")
- Likes, hearts, upvotes, or any public tally on content
- Follower/following counts, or any visible popularity metric
- Engagement-optimised or outrage-optimised recommendation/ranking algorithms
- Streaks, badges, or notification mechanics designed to induce guilt/FOMO for
  returning ("your streak is about to end")
- Push notifications for anything other than: a direct message, a circle
  invite, or a safety/account matter the user explicitly opted into
- Behavioural advertising, third-party ad tracking SDKs, or selling/renting
  user data or metadata to anyone
- Dark patterns in onboarding, cancellation, or privacy settings (e.g. hard to
  find "delete my data," pre-ticked sharing defaults, confirm-shaming copy)
- Autoplay video with sound, or autoplay into the next piece of content

## 4. Data ownership & privacy — design commitments

- Users can export **all** their data (photos, videos, posts, metadata) in
  standard formats (zip of originals + JSON manifest) at any time, in one tap.
- Users can permanently delete their account and all associated data; deletion
  actually deletes (including from backups within a stated retention window
  disclosed in-app), it doesn't just hide.
- Default sharing scope is the smallest useful circle (e.g. "immediate family"),
  never "public," and every post shows its current audience plainly before and
  after posting.
- No third-party analytics/ad SDKs. If product analytics are needed, use
  self-hosted or privacy-preserving tooling (e.g. Plausible-style, or
  first-party aggregate counters) — never anything that fingerprints or
  cross-site tracks.
- Media storage should support end-to-end or at-rest encryption for
  circle-shared content where technically feasible; document the actual
  guarantee honestly in-app rather than overclaiming.

## 5. Core feature areas (roughly in build priority order)

1. **Circles** — small, named, mutually-visible groups (e.g. "Family,"
   "Grandparents," "School Friends"). All sharing happens into a circle, never
   to an undifferentiated public feed.
2. **Memories** — photo/video upload, light organisation (albums, dates,
   people tags), simple captions. This is the emotional core of the product.
3. **Wellbeing-respecting timeline** — reverse-chronological within a circle,
   paginated, no algorithmic ranking. A visible "you're caught up" end state.
4. **Direct & small-group messaging** — for coordinating around memories and
   family life.
5. **Civic/informed-citizenship module** — curated, source-transparent civic
   information (local government notices, verified news digests, voting
   reminders) with no engagement-bait framing; this is explicitly informational,
   not a feed to be scrolled.
6. **Sponsor & giving transparency page** — public-facing page listing current
   ethical sponsors and cumulative profit donated to mental health charities,
   updated on a real cadence (not vague "we care" copy).

## 6. Revenue model — how it must be implemented

- Sponsorship only, from a **screened allow-list** of ethical sponsors
  maintained outside the codebase (e.g. a config/CMS list Charles curates
  manually) — never programmatic ad auctions, never behavioural targeting.
- Sponsor content is clearly labelled, non-personalised (same sponsor content
  shown to everyone in a segment, not targeted via tracking), and never
  interleaved into the Memories/family feed — confine it to clearly separate
  surfaces (e.g. the civic module or a dedicated "Supported by" area).
- Build a simple ledger/report view (even a static page to start) showing
  sponsorship revenue and charity donations, since transparency is a stated
  product value, not just a slogan.

## 7. Design & UX principles

- Calm, unhurried visual language — no red badge counters, no urgent-red CTAs
  for routine actions, no artificial scarcity/urgency copy.
- Session should have a natural end; consider a gentle "you've seen everything
  new" state rather than always finding more to show.
- Accessibility and low-bandwidth/low-end-device support matter — many family
  users (grandparents, rural users) are on older phones and slower connections.
- Copy should be honest and plain, never manipulative ("are you sure?" dialogs
  should state real consequences, not guilt).

## 8. Technical architecture (recommended, adjust if Claude Code finds a
   concrete blocker — but flag the deviation and reason before proceeding)

- **App**: React Native + Expo (consistent with Charles's existing toolchain).
- **Backend**: Supabase — Postgres for relational data, Supabase Storage for
  media, Supabase Auth, and Row Level Security policies as the actual
  enforcement mechanism for circle-based access control (not just app-layer
  checks).
- **Media handling**: client-side compression before upload; server-side
  virus/abuse scanning hook left as a stub with a clear TODO if not
  implemented in early phases.
- **Hosting**: static/serverless where possible to keep costs low and
  ownership simple, consistent with the "static-first" preference already
  validated on other projects.
- **No ad SDKs, no analytics SDKs from ad-tech vendors**, ever, at the
  dependency level — this should be enforced by not installing them, not just
  by policy.

## 9. Working style for every session

- One contained, pre-scoped goal per session — no scope expansion mid-session.
- Claude Code has no memory between sessions: each prompt must be
  self-contained with enough context to execute without assuming prior state
  is remembered (though the codebase itself is persistent).
- Before implementation, restate the session's scope in one or two lines and
  confirm it doesn't include anything from the banned list above.
- Lead outputs with the decision/recommendation, then brief rationale.
- Flag ambiguous product decisions back to Charles rather than guessing on
  anything touching data retention, sponsor content, or deletion guarantees —
  these carry real trust and legal weight.

## 10. Repository layout

*Factual note added by the Phase 1 session, not policy. Sections 1–9 above are
the constitution and are unchanged.*

This repository holds two unrelated projects:

- `compass/` — **Compass**, the project this constitution governs. An Expo +
  TypeScript app with its Supabase schema in `compass/supabase/`. Start at
  `compass/README.md` and `compass/AGENTS.md`.
- `index.html`, `app.js`, `style.css`, `brandLists.js`, `README.md` at the root
  — an earlier, separate static EV charger route planner. Nothing to do with
  Compass; leave it alone unless asked.

Compass was placed in a subdirectory rather than at the root because the root
was already occupied by that project. If you would rather Compass owned the
repository root, say so and it can be moved.
