# Step-by-step build order

Everything below "Where this scaffold stops" is written, but **not
compiled or run** in this environment (no Flutter/Dart SDK — see the
top-level README). Steps 1-3 make it actually runnable; the rest is the
order a fresh team would tackle the real feature work in.

## 0. What's already here

- Flutter app skeleton: models, services, Riverpod providers, screens,
  routing (`daily_spend/lib/`).
- `BankProvider` abstraction with a working mock and real-shaped
  Basiq/Adatree stubs (`lib/services/bank/`).
- Firestore rules + indexes + schema doc (`firebase/firestore.*`,
  `docs/FIRESTORE_SCHEMA.md`).
- Cloud Functions: household join, bank webhooks, atomic budget
  recalculation, FCM push (`firebase/functions/src/`) — type-checks
  clean (`npx tsc --noEmit`), not deployed.

## 1. Make it compile

```bash
cd daily_spend
flutter create . --platforms=android,ios   # fills in android/, ios/, etc. around the existing lib/
flutter pub get
flutter analyze                             # fix whatever the real SDK's analyzer flags
```

`flutter create .` on an existing project only adds the missing
platform scaffolding (android/, ios/, web/ directories, launcher icons,
etc.) — it doesn't touch `lib/`. This step hasn't been run here because
no Flutter SDK is installed in this environment.

## 2. Attach a real Firebase project

```bash
firebase login
firebase projects:create daily-spend-dev     # or use an existing project
cd daily_spend
flutterfire configure                        # generates lib/firebase_options.dart
```

Then switch `lib/main.dart` from `Firebase.initializeApp()` to
`Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`
as its own comment says.

Enable in the Firebase console: Authentication (Email/Password, Google,
Apple providers), Firestore (production mode), Cloud Messaging.

## 3. Deploy the backend

```bash
cd firebase
firebase deploy --only firestore:rules,firestore:indexes
firebase functions:secrets:set BASIQ_WEBHOOK_SECRET   # placeholder values are fine for now
firebase functions:secrets:set ADATREE_WEBHOOK_SECRET
firebase functions:secrets:set BASIQ_API_KEY
firebase functions:secrets:set ADATREE_API_KEY
firebase deploy --only functions
```

At this point `joinHousehold` works end-to-end against a real project;
`basiq*`/`adatree*` callables still throw `unimplemented` until step 6.

## 4. Run it against the mock bank provider

`bankProviderKindProvider` in `lib/providers/service_providers.dart`
defaults to `BankProviderKind.mock`. With steps 1-3 done:

```bash
flutter run
```

Sign up, create a household, invite a second (real or test) account,
set a budget. In Settings → Linked bank accounts, "Connect a bank
account" completes instantly against the mock provider. To see a
purchase actually flow through, call
`MockBankProvider.seedTransaction`/`refreshTransactions` from a debug
button or test — the mock provider is entirely client-side today, so it
doesn't exercise the Cloud Functions webhook path (see step 6 for that).

## 5. Fill in the webhook signature verification

Before either webhook is reachable from the real internet: implement the
TODOs in `functions/src/index.ts` (`basiqWebhook`/`adatreeWebhook`) per
each provider's current signing scheme. This is a hard blocker per
`docs/SECURITY.md` — do this before step 6, not after.

## 6. Wire up real Basiq or Adatree credentials

1. Get sandbox API credentials from whichever provider you're starting
   with (Basiq's sandbox is generally the faster path to a first working
   integration).
2. Confirm the exact current API shape for: creating a user, creating a
   consent link, listing transactions, and the webhook payload — the
   code in `functions/src/index.ts`/`transactionWebhook.ts` has the
   intended shape and clear TODOs, but every field name should be
   checked against the provider's live docs before trusting it.
3. Implement `basiqCreateConsentLink` (or `adatreeCreateConsentLink`)
   for real, following the flow in
   `docs/OPEN_BANKING_INTEGRATION.md`.
4. Point `bankProviderKindProvider` at `BankProviderKind.basiq` (or
   `.adatree`) once the consent flow round-trips.
5. Register the webhook URL in the provider's dashboard pointing at your
   deployed `basiqWebhook`/`adatreeWebhook` function.

## 7. Polish pass

- Replace the placeholder "Partner" label in `DashboardScreen` with the
  partner's real `displayName` (already on `AppUser`, just not looked up
  there yet).
- Add the cycle-rollover flow: `BudgetCalculator.rollCycle` exists but
  nothing calls it yet — decide whether rollover is automatic (a
  scheduled Cloud Function that fires on `nextPaydayDate`) or manual (a
  "start new cycle" button in Settings), and wire it.
- Prune stale FCM tokens on send failure (see `docs/SECURITY.md`).
- Add the lock-screen widget (iOS: WidgetKit; Android: App Widgets)
  showing "Today: $X left" — this needs native platform channels or a
  Flutter widget package and isn't started here, but every number it
  needs is already computed by `BudgetCalculator`.
- Write unit tests for `BudgetCalculator` (Dart) and
  `budgetCalculator.ts` (TypeScript) against the same fixtures, so the
  two stay in sync as the formula evolves (see `docs/ARCHITECTURE.md`'s
  note on why they're not shared code).
- Write a Firestore-emulator-backed test for
  `recordTransactionAndNotify`'s idempotency guard (send the same
  webhook payload twice, assert the budget only moves once).
