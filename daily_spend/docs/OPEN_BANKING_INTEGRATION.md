# Open Banking integration plan

Target: Australian Consumer Data Right (CDR) banking data, via an
accredited data recipient — Basiq or Adatree. This app never becomes an
accredited data recipient itself; it's a client of one (or both).

## Why the abstraction exists

`lib/services/bank/bank_provider.dart` defines `BankProvider`
(`connectAccount` / `getTransactions` / `refreshTransactions`). Nothing
else in the app is allowed to call Basiq or Adatree directly. That buys:

- **Switching providers is a config change.** `bank_provider_factory.dart`
  is the only place that picks a concrete implementation.
- **Running both at once is possible**, e.g. each partner links through a
  different aggregator, without conditional logic elsewhere.
- **The client never holds an aggregator API key.** Every real network
  call to Basiq/Adatree happens in a Cloud Function using a secret
  (`BASIQ_API_KEY` / `ADATREE_API_KEY`, via `defineSecret` — see
  `firebase/functions/src/index.ts`); the Dart classes only call
  `FirebaseFunctions` callables.

## Current state (what's real vs. stubbed)

| Piece | Status |
|---|---|
| `BankProvider` interface | Real, stable |
| `MockBankProvider` | Real, fully working — used by default (`bankProviderKindProvider` in `service_providers.dart`) |
| `BasiqBankProvider`/`AdatreeBankProvider` (client) | Real shape, calls real callable names |
| `basiq*`/`adatree*` Cloud Functions (consent link, get transactions, refresh) | **Stubbed** — throw `unimplemented` until API credentials exist |
| `basiqWebhook`/`adatreeWebhook` | Real logic (account lookup → idempotent write → budget update → notify), payload shape **illustrative** — must be checked against each provider's current webhook docs before going live |
| `linkedAccounts` Firestore collection | Schema defined, not yet populated by anything (no consent flow to populate it from yet) |

## The consent flow (not yet implemented — this is the plan)

Open Banking consent is a **browser hand-off**, not an API call this app
can complete synchronously:

1. User taps "Connect a bank account" (`BankAccountsScreen`).
2. Client calls `basiqCreateConsentLink`/`adatreeCreateConsentLink`
   (callable). The function:
   a. Ensures a Basiq/Adatree "user" exists for this household member
      (creating one on first use, storing the aggregator's user ID
      somewhere — e.g. a new field on `users/{uid}`).
   b. Requests a consent link scoped to the data this app needs
      (transaction history on everyday/transaction accounts — the
      narrowest CDR consent scope that covers "what did we just spend").
   c. Returns that URL to the client.
3. Client opens the URL (system browser or in-app webview). The user
   authenticates with their *own bank*, not with this app, and approves
   the specific data being shared — this is a regulated CDR consent
   screen, not something to reimplement.
4. The aggregator redirects back (or calls a completion webhook) once
   consent is granted. A Cloud Function on that callback:
   a. Looks up which account(s) were authorized.
   b. Writes one `households/{householdId}/linkedAccounts/{accountId}`
      doc per account, with `linkedByUid` set to the initiating user.
   c. Optionally triggers an initial backfill via `getTransactions`.
5. From here, new purchases arrive via the webhook path described in
   `ARCHITECTURE.md`, not polling — `getTransactions`/`refreshTransactions`
   exist mainly for backfill and as a fallback if a webhook is missed.

This redirect/callback step (3→4) is the part most likely to need
adjusting once you're implementing against Basiq's or Adatree's actual
current docs — both vendors have gone through API revisions, and the
exact callback mechanics (redirect URL vs. server-to-server webhook vs.
polling a job status) should be confirmed there rather than assumed here.

## Consent renewal and revocation

CDR consent is time-limited and revocable by the user at any bank or via
the aggregator's own consent dashboard, both outside this app entirely.
Before going live, add:
- A scheduled function (or a check on each `getTransactions` failure)
  that detects an expired/revoked consent and flags the `linkedAccounts`
  doc so Settings can prompt the user to reconnect, rather than silently
  going quiet.
- A visible "connected since / expires" indicator in
  `BankAccountsScreen` once real consent metadata exists to show.

## Rate limits and the manual/mock fallback

Aggregators rate-limit both consent creation and transaction polling.
`refreshTransactions` is documented as best-effort for exactly this
reason. `FirestoreService.recordManualTransaction` exists at the service
layer so a cash purchase, or one from an account that isn't linked yet,
can always be logged by hand without waiting on the bank side — no
Settings screen calls it yet, since there's no linked account to make it
necessary until the consent flow above exists. Wiring a small "add
manual purchase" entry point is a natural next step once real accounts
are linked and gaps start showing up in practice.
