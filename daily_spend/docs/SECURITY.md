# Security considerations

## What's implemented

- **Firestore rules scope everything by household membership.** A user
  can read/write their own `users/{uid}` doc and anything under a
  household listed in their `memberUids`, nothing else. See
  `firebase/firestore.rules` for the exact rules and reasoning.
- **Household joins never expose an unlinked lookup to clients.** Joining
  by invite code runs server-side (`joinHousehold` Cloud Function, Admin
  SDK) specifically so a signed-in-but-not-yet-a-member user is never
  granted a Firestore query that could enumerate households. See the
  comment in `firestore.rules` and `FIRESTORE_SCHEMA.md`.
- **Bank aggregator API keys never reach the client.** `BasiqBankProvider`
  and `AdatreeBankProvider` only call Cloud Functions callables; the real
  HTTP calls to Basiq/Adatree, and the secrets they require, live
  server-side (`defineSecret` in `functions/src/index.ts`).
- **Transactions are append-only.** Firestore rules disallow client
  update/delete on `transactions/*` — a purchase, once recorded, can't be
  edited or removed by either partner (disputing a charge is a bank-side
  action, not an in-app one).
- **Money is stored as integer cents everywhere**, avoiding float-rounding
  bugs that could (over many small transactions) silently drift a
  household's real balance from what the app displays.
- **Notification opt-out is per-person, not per-household** —
  `sendPurchaseNotification` checks each recipient's own
  `notificationsEnabled` rather than an all-or-nothing household switch,
  so muting your own phone doesn't need your partner's agreement.
- **Webhook requests are signature-verified.** `basiqWebhook` and
  `adatreeWebhook` reject any request with a missing or invalid HMAC-SHA256
  signature (constant-time compared, computed over the exact raw request
  bytes — see `webhookSignature.ts`, unit tested against 8 cases including
  tampered-body and wrong-secret) before touching Firestore. **The
  mechanism is real; the header name is not yet confirmed** —
  `X-Basiq-Signature`/`X-Adatree-Signature` are placeholders (marked
  `TODO` at each call site in `index.ts`) until checked against each
  provider's current webhook docs. Confirm those before relying on this
  in production; don't assume the placeholder names are correct.

## Known gaps — read before going anywhere near production
- **No rate limiting on Cloud Functions endpoints** beyond Firebase's
  platform defaults. Consider App Check on callables, and either a
  managed API gateway or a simple in-function counter (keyed by IP or
  account ID) on the two webhook endpoints once they're signature-verified.
- **Consent revocation isn't monitored.** See
  `OPEN_BANKING_INTEGRATION.md`'s "Consent renewal and revocation" —
  right now a revoked consent just makes future syncs quietly fail rather
  than surfacing to the user.
- **No audit log of who changed the budget/payday date.** Both partners
  can edit `budget/current` freely (by design — it's a shared budget);
  if that ever needs a "who changed what, when" trail, add it as a
  Cloud Function–only write path with a change log, rather than a direct
  client write.
- ~~**FCM tokens accumulate and are never pruned.**~~ Fixed —
  `sendPurchaseNotification` now removes a token from its owner's
  `fcmTokens` the moment FCM reports it unrecoverable (see
  `notificationCleanup.ts`'s `staleTokensToRemove`, unit tested). A
  token can still sit unused between the moment an app is uninstalled
  and the next purchase notification, since pruning is a side effect of
  sending, not a standalone sweep — a scheduled cleanup function would
  close that last gap but wasn't judged worth the added complexity yet.
- ~~**Household size isn't capped.**~~ Fixed — `joinHouseholdCore`
  rejects a third join attempt once `memberUids.length >= 2`, tested
  against the emulator.
- **This has not been through a real security review.** It's an MVP
  scaffold — treat every point above as "must resolve before handling
  real linked bank accounts," not as a checklist that's already done.

## Data sensitivity

This app handles two categories of sensitive data: authentication
credentials (delegated to Firebase Auth / Google / Apple — not stored
directly) and financial transaction data (merchant names, amounts,
timing — stored in Firestore, transmitted via CDR-regulated aggregators).
Treat the Firestore project and its Cloud Functions secrets with the same
care as any system holding real transaction history: restrict IAM access
to the Firebase project, never log full transaction payloads at `info`
level in a way that could leak into shared logs (the current
`notifications.ts`/`transactionWebhook.ts` logging sticks to IDs and
counts, not merchant/amount detail, deliberately).
