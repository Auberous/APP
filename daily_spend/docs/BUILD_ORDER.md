# Step-by-step build order

Steps 2-3 (attach a real Firebase project, deploy the backend) still need
to be done by you — they need credentials/logins this environment
doesn't have. Step 1 (make it compile) has already been done and
verified here; it's kept below as a record of what was run, not as a
remaining to-do.

## 0. What's already here

- Flutter app skeleton: models, services, Riverpod providers, screens,
  routing (`daily_spend/lib/`), plus generated Android/iOS platform
  scaffolding (`android/`, `ios/`).
- `BankProvider` abstraction with a working mock and real-shaped
  Basiq/Adatree stubs (`lib/services/bank/`).
- Firestore rules + indexes + schema doc (`firebase/firestore.*`,
  `docs/FIRESTORE_SCHEMA.md`).
- Cloud Functions: household join (capped at two members), signature-
  verified bank webhooks, atomic budget recalculation, FCM push with
  stale-token pruning (`firebase/functions/src/`) — type-checks clean
  and unit-tested (`npx tsc --noEmit`, `npm test`: 20/20), not deployed.
- `test/utils/budget_calculator_test.dart` and
  `firebase/functions/src/budgetCalculator.test.ts` — the same fixtures
  checked against both implementations of the budget formula, all
  passing (12/12 Dart, 7/7 TypeScript, both counted in the totals above).
- Firestore-emulator-backed integration tests (`npm run test:integration`:
  9/9) covering the webhook idempotency guard and the household-join
  logic (unknown/reused code, duplicate member, the two-member cap).

## 1. Make it compile ✅ done

```bash
cd daily_spend
flutter create . --platforms=android,ios   # fills in android/, ios/, etc. around the existing lib/
flutter pub get
flutter analyze
flutter test
```

Ran clean end to end: `flutter analyze` → **No issues found!**;
`flutter test` → **12/12 passing**. `flutter create .` on an existing
project only adds the missing platform scaffolding (android/, ios/, etc.)
— it left `lib/`, `pubspec.yaml`, and `analysis_options.yaml` untouched
apart from appending `build/`, `android/`, `ios/` to the analyzer's
exclude list, which is expected and harmless.

Two real issues turned up and were fixed: a deprecated `Color.withOpacity`
call (switched to `.withValues(alpha:)`, and bumped the Dart SDK floor in
`pubspec.yaml` to `>=3.6.0` to match), and a `catchError` callback in
`auth_service.dart` that didn't return a value on its error path. Nothing
else needed changing — the hand-written Dart compiled correctly on the
first real run against it.

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

## 5. Confirm the webhook signature header names

The verification mechanism itself is implemented and unit tested
(`webhookSignature.ts`'s `verifyHmacSignature`, wired into both webhooks
in `index.ts`) — both webhooks already reject a request with a missing
or invalid signature. What's *not* confirmed: `X-Basiq-Signature` and
`X-Adatree-Signature` are placeholder header names (marked `TODO` at each
call site). Before either webhook is reachable from the real internet,
check each provider's current webhook docs for the actual header name
and digest encoding they use, and update the two `req.get(...)` calls in
`index.ts` accordingly. This is a hard blocker per `docs/SECURITY.md` —
do this before step 6, not after.

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

- ~~Replace the placeholder "Partner" label in `DashboardScreen`~~ ✅
  done — `householdMemberNamesProvider` resolves each member's
  `displayName` (falling back to the part of their email before the @).
  Fixing this surfaced a real gap: `users/{uid}` was only ever created by
  the email/password signup screen — Google/Apple sign-in had no
  "create account" step of their own, so the first Google/Apple sign-in
  would have hit a Firestore `update`-on-nonexistent-doc error the
  moment `createHousehold` ran. `currentAppUserProvider` now bootstraps
  the doc (merge-only, so it never clobbers `householdId`/`fcmTokens`/
  `notificationsEnabled` on an existing one) regardless of sign-in
  method.
- ~~Add the cycle-rollover flow~~ ✅ done, manually — `BudgetSetupScreen`
  now distinguishes "Save changes" (edits amount/payday, keeps tracked
  spend) from "Start new cycle now" (confirmed, calls
  `BudgetCalculator.rollCycle`, resets `cycleSpentCents`). This also
  fixed a real bug: the screen previously created a brand-new `Budget`
  unconditionally, so editing the amount mid-cycle silently wiped
  tracked spend to $0 — worth knowing if you're reviewing the diff.
  *Not* done: **automatic** rollover (a scheduled Cloud Function that
  fires on `nextPaydayDate` without a partner having to tap anything) —
  still open, and still needs the product decision the original bullet
  called out: automatic rollover needs *some* notion of pay frequency
  (weekly/fortnightly/monthly) to pick the next date on its own, which
  the current one-shot "next payday date" input doesn't capture.
- ~~Prune stale FCM tokens on send failure~~ ✅ done —
  `notificationCleanup.ts`'s `staleTokensToRemove` (pure function, unit
  tested independently of Firestore/Messaging) picks out tokens that
  failed with `messaging/registration-token-not-registered` or
  `messaging/invalid-registration-token` specifically — not every
  failure, since a transient error (rate limiting, a momentary backend
  error) says nothing about whether the token itself is still good.
  `sendPurchaseNotification` removes those via `arrayRemove` after each
  send.
- Add the lock-screen widget (iOS: WidgetKit; Android: App Widgets)
  showing "Today: $X left" — this needs native platform channels or a
  Flutter widget package and isn't started here, but every number it
  needs is already computed by `BudgetCalculator`.
- ~~Write unit tests for `BudgetCalculator`~~ ✅ done —
  `test/utils/budget_calculator_test.dart` and
  `src/budgetCalculator.test.ts`, same fixtures on both sides.
- ~~Write a Firestore-emulator-backed test for `recordTransactionAndNotify`'s
  idempotency guard~~ ✅ done — `src/transactionWebhook.integration.test.ts`,
  run via `npm run test:integration` (wraps `firebase emulators:exec`, no
  manual emulator start/stop needed). Covers first delivery, a redelivered
  duplicate (asserts the budget moves once, not twice, and the partner
  notification fires once, not twice), two distinct purchases both
  applying, and the no-budget-yet fallback path. A second file,
  `joinHousehold.integration.test.ts`, covers the household-join logic
  the same way — writing it caught a real bug (`tx.update()` on a
  `users/{uid}` doc that might not exist yet, fixed to `set()` with
  merge) that a mocked Firestore would not have caught.
