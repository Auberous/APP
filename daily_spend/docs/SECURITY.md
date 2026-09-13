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

## Known gaps — read before going anywhere near production

- **Webhook signature verification is not implemented.** `basiqWebhook`
  and `adatreeWebhook` accept `BASIQ_WEBHOOK_SECRET`/
  `ADATREE_WEBHOOK_SECRET` as configured secrets but don't yet verify an
  incoming request's signature against them — the TODO is marked
  explicitly in `functions/src/index.ts`. **Do not deploy either webhook
  publicly until this is filled in** — an unverified webhook endpoint
  that writes financial data on request is an open door for anyone who
  finds the URL and account ID. Check each provider's current webhook
  docs for the exact HMAC/header scheme.
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
- **FCM tokens accumulate and are never pruned.** `addFcmToken` only ever
  appends (`arrayUnion`); a token for an uninstalled app/dead device
  stays in `fcmTokens` until FCM itself reports it invalid. Handle
  `sendEachForMulticast`'s per-token failure results (already logged in
  `notifications.ts`) by removing tokens that come back
  `messaging/registration-token-not-registered`.
- **Household size isn't capped.** `memberUids` is an unbounded array;
  the product is designed around two people, but nothing stops a third
  join if they get hold of the invite code before it's used. Consider
  capping `memberUids.length` in the `joinHousehold` function if that
  matters for the product.
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
