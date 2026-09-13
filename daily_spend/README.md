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

## A note on what hasn't been verified

This was built in an environment with **no Flutter/Dart SDK installed**,
so the Dart code has been hand-written carefully but never run through
`flutter analyze`, `flutter pub get`, or a real compile. Before relying on
it:

```bash
cd daily_spend
flutter create . --platforms=android,ios   # adds android/, ios/, etc. around the existing lib/
flutter pub get
flutter analyze
```

The **Cloud Functions TypeScript has been verified** — `npm install &&
npx tsc --noEmit` in `firebase/functions/` passes clean in this
environment, since Node was available here.

Real bank integration (Basiq/Adatree) needs live API credentials that
weren't available here either: the `BankProvider` abstraction and a fully
working `MockBankProvider` are real and usable today; the Basiq/Adatree
Cloud Functions are real-shaped but throw `unimplemented` until API keys
are configured — see `docs/OPEN_BANKING_INTEGRATION.md` for exactly what's
left and `docs/BUILD_ORDER.md` for the order to tackle it in.

## Quickest path to seeing it run

See `docs/BUILD_ORDER.md` steps 1-4 — compile, attach a Firebase project,
deploy the backend, run against the built-in mock bank provider (no bank
credentials needed to see the whole flow work end-to-end with fake
purchases).
