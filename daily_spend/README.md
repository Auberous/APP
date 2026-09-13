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
  type-checks clean; `npm test` passes 7/7 unit tests on the TypeScript
  twin of the same budget math (`src/budgetCalculator.test.ts`), using
  the identical fixtures as the Dart tests so both sides are checked
  against the same numbers.
- **The webhook idempotency guard**, specifically — the thing most worth
  distrusting in this codebase, since a bug there means double-charging
  a household's tracked spend: `npm run test:integration` runs
  `src/transactionWebhook.integration.test.ts` against a real Firestore
  emulator (via `firebase emulators:exec`, no manual setup) and confirms
  a redelivered webhook moves the budget once, not twice, and notifies
  once, not twice — plus first-delivery, two-distinct-purchases, and
  no-budget-yet cases. 4/4 passing.

What's *not* verified: the app hasn't been run on a device/emulator or
against a real Firebase project (no `google-services.json`/
`GoogleService-Info.plist`, no `flutterfire configure` output — see
`docs/BUILD_ORDER.md` steps 2-4), and real bank integration (Basiq/Adatree)
needs live API credentials that weren't available here. The `BankProvider`
abstraction and a fully working `MockBankProvider` are real and usable
today; the Basiq/Adatree Cloud Functions are real-shaped but throw
`unimplemented` until API keys are configured — see
`docs/OPEN_BANKING_INTEGRATION.md` for exactly what's left.

## Quickest path to seeing it run

See `docs/BUILD_ORDER.md` steps 2-4 — attach a Firebase project, deploy
the backend, run against the built-in mock bank provider (no bank
credentials needed to see the whole flow work end-to-end with fake
purchases).
