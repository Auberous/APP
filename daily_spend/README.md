# Daily Spend

A shared budget app for couples, built around one question: **"how much
can we spend today?"** — not a full budgeting app. Enter a monthly
discretionary budget and a payday date; as linked-bank purchases come in
in near-real-time, both partners get a push notification and see the
same "Available Today" figure update immediately.

```
Available Today = (Monthly Budget − Spent This Cycle) ÷ Days Until Payday
```

Large number, one status color (green/on track, orange/getting tight,
red/over budget), no pie charts, no spending categories.

## What's in this project

| Path | What it is |
|---|---|
| `lib/` | The Flutter app — screens, Riverpod state, Firebase services, the `BankProvider` abstraction. |
| `firebase/firestore.rules`, `firestore.indexes.json` | Firestore security rules and indexes. |
| `firebase/functions/` | Cloud Functions (TypeScript): household invites, bank webhooks, the atomic budget-recalculation + push-notification flow. |
| `docs/ARCHITECTURE.md` | System diagram, folder structure, the real-time flow end to end. |
| `docs/FIRESTORE_SCHEMA.md` | Every collection and field. |
| `docs/OPEN_BANKING_INTEGRATION.md` | The Basiq/Adatree consent-flow plan, and exactly what's real vs. stubbed today. |
| `docs/SECURITY.md` | What's implemented, and — importantly — what isn't yet (read before deploying the webhooks publicly). |
| `docs/BUILD_ORDER.md` | Step-by-step: from this scaffold to a running app to a real bank integration. |

Tech stack: **Flutter + Riverpod** on the client; **Firebase** (Auth,
Firestore, Cloud Functions, Cloud Messaging) on the backend; **Basiq** and
**Adatree** as pluggable Australian Open Banking (Consumer Data Right)
aggregators behind a common `BankProvider` interface.

## What's been verified

Both sides of the stack now compile and pass tests, checked directly in
this environment:

- **Flutter/Dart**: `flutter create . --platforms=android,ios` (adds
  `android/`, `ios/`, etc. around the existing `lib/`), `flutter pub get`,
  and `flutter analyze` all run clean — **no issues found**. `flutter test`
  passes 12/12 unit tests on `BudgetCalculator`
  (`test/utils/budget_calculator_test.dart`).
- **Cloud Functions (TypeScript)**: `npm install && npx tsc --noEmit`
  type-checks clean; `npm test` passes **20/20** unit tests — the
  TypeScript twin of the budget math (`budgetCalculator.test.ts`, same
  fixtures as the Dart tests), the webhook HMAC signature verification
  (`webhookSignature.test.ts`, 8 cases: correct signature, tampered body,
  wrong secret, empty-secret-never-matches, etc.), and stale-FCM-token
  pruning logic (`notificationCleanup.test.ts`, 5 cases).
- **The stuff most worth distrusting in this codebase, specifically** —
  bugs here mean double-charging a household's spend or letting a third
  person into someone's household: `npm run test:integration` runs two
  suites against a real Firestore emulator (via `firebase emulators:exec`,
  no manual setup), **9/9 passing**. `transactionWebhook.integration.test.ts`
  confirms a redelivered webhook moves the budget once, not twice, and
  notifies once, not twice. `joinHousehold.integration.test.ts` confirms
  an unknown/reused invite code is rejected, a duplicate member is
  rejected, and a third join is rejected once a household has two members
  — and caught a real bug while being written: joining used `.update()`
  on a `users/{uid}` doc that isn't guaranteed to exist yet (the doc is
  bootstrapped client-side as a fire-and-forget write on sign-in), which
  would have thrown `NOT_FOUND` in that race. Fixed to `.set()` with
  merge. A mocked Firestore would not have caught this — it was the
  emulator's real transaction semantics that did.

What's *not* verified: the app hasn't been run on a device/emulator or
against a real Firebase project (no `google-services.json`/
`GoogleService-Info.plist`, no `flutterfire configure` output — see
`docs/BUILD_ORDER.md` steps 2-4), and real bank integration (Basiq/Adatree)
needs live API credentials that weren't available here. The `BankProvider`
abstraction and a fully working `MockBankProvider` are real and usable
today; the Basiq/Adatree Cloud Functions are real-shaped but throw
`unimplemented` until API keys are configured — see
`docs/OPEN_BANKING_INTEGRATION.md` for exactly what's left.

## Looking at the screens without a Firebase project

`lib/preview/preview_main.dart` is a separate entry point — not shipped,
not part of the production app — that renders the real screens
(`DashboardScreen`, `SettingsScreen`, etc.; nothing is re-implemented)
fed static sample data via Riverpod overrides, with a one-screen menu to
jump between them. No Firebase project, no login, no bank credentials
needed:

```bash
cd daily_spend
flutter run -d chrome --target=lib/preview/preview_main.dart
```

or, to view it as a static build:

```bash
flutter build web --target=lib/preview/preview_main.dart
# then serve build/web/ with any static file server
```

**Why this repo can't just hand you screenshots**: Flutter's web target
dynamically loads the Firebase JS SDK from `www.gstatic.com` at runtime
(this happens regardless of the preview harness above, and regardless of
whether you're pointed at a real project or an emulator — it's how
FlutterFire's web plugins work) — the sandbox this was built in blocks
that domain at the network policy level (confirmed: a `403` on the
`CONNECT`, not a flaky timeout), so the app can compile and build cleanly
here but can't actually boot in a browser *in this environment*. It boots
fine anywhere with normal internet access, e.g. your own machine. The
Android/iOS builds don't have this problem — their Firebase SDKs are
bundled natively rather than fetched at runtime — but this environment
also has no Android/iOS emulator to run them on to prove it.

## Quickest path to seeing it run for real

See `docs/BUILD_ORDER.md` steps 2-4 — attach a Firebase project, deploy
the backend, run against the built-in mock bank provider (no bank
credentials needed to see the whole flow work end-to-end with fake
purchases).
