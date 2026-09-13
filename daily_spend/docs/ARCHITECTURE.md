# Architecture

## The one formula this app is built around

```
Available Today = (Monthly Budget − Spent This Cycle) ÷ Days Until Payday
```

Implemented twice, deliberately kept in lockstep rather than shared as a
package (Dart and TypeScript can't share code here):
- `lib/utils/budget_calculator.dart` — client-side, for instant display.
- `firebase/functions/src/budgetCalculator.ts` — server-side, for the
  figures baked into push notifications.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Flutter app (lib/)                                          │
│                                                                │
│  screens/  ──uses──▶  providers/ (Riverpod)  ──uses──▶ services/
│                                                                │
│  services/bank/BankProvider  ← abstraction, never called      │
│  directly outside this interface (mock / basiq / adatree)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Firebase Auth, Firestore (realtime
                              │ listeners), Cloud Functions (callables)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Firebase project                                             │
│                                                                │
│  Firestore  ← source of truth, read directly by the client    │
│              via realtime listeners (that's how both partners │
│              see an update "immediately" with no polling)     │
│                                                                │
│  Cloud Functions (firebase/functions/)                        │
│    - joinHousehold            (callable)                      │
│    - basiqWebhook/adatreeWebhook (HTTP, bank → us)             │
│    - recordTransactionAndNotify (shared logic, atomic)         │
│    - sendPurchaseNotification (FCM)                            │
│    - basiq*/adatree* callables (client → bank aggregator,      │
│      currently unimplemented — need API credentials)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 Basiq / Adatree (Australian Open Banking /
                 Consumer Data Right accredited data recipients)
```

## Folder structure

```
daily_spend/
  pubspec.yaml
  lib/
    main.dart                    # Firebase init, runApp
    app.dart                     # MaterialApp.router + go_router redirect logic
    theme/app_theme.dart
    models/                      # plain Dart classes, hand-written toJson/fromJson
      app_user.dart
      household.dart
      budget.dart
      spend_transaction.dart
      spend_notification.dart
    services/
      auth_service.dart          # Firebase Auth wrapper (email/Google/Apple)
      firestore_service.dart     # every Firestore read/write, in one place
      notification_service.dart  # FCM token registration + foreground display
      bank/
        bank_provider.dart       # the BankProvider abstraction
        mock_bank_provider.dart  # in-memory, for dev/demo
        basiq_bank_provider.dart # calls Cloud Functions, real API TODO
        adatree_bank_provider.dart
        bank_provider_factory.dart
    providers/                   # Riverpod: service singletons + Firestore streams
    screens/
      auth/                      # login, signup
      onboarding/                # create/join household, budget setup
      dashboard/                 # Available Today + recent purchases
      settings/                  # budget/payday, linked accounts, notifications
    utils/
      budget_calculator.dart
      formatters.dart
      date_utils.dart
  firebase/
    firebase.json
    firestore.rules
    firestore.indexes.json
    functions/
      src/
        index.ts                 # exported Cloud Functions
        transactionWebhook.ts    # the atomic record-and-notify core
        notifications.ts         # FCM composition + send
        budgetCalculator.ts      # TS twin of the Dart calculator
        formatters.ts
        types.ts                 # shared shapes, mirrors lib/models/
  docs/
    ARCHITECTURE.md               (this file)
    FIRESTORE_SCHEMA.md
    OPEN_BANKING_INTEGRATION.md
    SECURITY.md
    BUILD_ORDER.md
```

## The real-time flow, end to end

1. A partner taps to pay (Apple Pay / Google Pay, on a linked card).
2. Their bank posts the transaction; Basiq or Adatree picks it up and
   delivers a webhook to `basiqWebhook`/`adatreeWebhook`.
3. The webhook handler maps the provider's account ID to a household via
   `linkedAccounts` (a collection-group query — see
   `docs/FIRESTORE_SCHEMA.md`), then calls `recordTransactionAndNotify`.
4. That function, inside one Firestore transaction: writes the purchase
   (idempotently — see below) and increments the household's
   `cycleSpentCents`.
5. Immediately after, it composes and sends one FCM push to every device
   token on file for both partners (skipping anyone with notifications
   off), and logs the notification for history.
6. Both partners' dashboards update the moment the transaction commits —
   they're watching the same Firestore documents via realtime listeners,
   not polling, so there's no separate "refresh" step.

## Idempotency

Bank aggregators redeliver webhooks and support backfill/polling
fallbacks — the same purchase can arrive more than once. The transaction
document ID is deterministic (`${provider}_${externalId}`), and the write
happens inside a Firestore transaction that checks for an existing
document first: a redelivered webhook becomes a silent no-op instead of
double-counted spend or a duplicate notification.

## Why Riverpod without codegen

`riverpod_generator`/`freezed` are listed as dev dependencies for later,
but every provider in this MVP is hand-written (`Provider`,
`StreamProvider`) rather than `@riverpod`-annotated, and every model has
hand-written `toJson`/`fromJson` rather than `@freezed`. That was a
deliberate choice to keep the project's very first compile independent of
a `build_runner` codegen step — one less moving part while nothing else
about the app is validated yet (see the top-level README's "What's been
verified"). Switching to codegen later is a mechanical refactor, not an
architecture change; running `dart run build_runner build` after adding
`@riverpod`/`@freezed` annotations is all it takes.
