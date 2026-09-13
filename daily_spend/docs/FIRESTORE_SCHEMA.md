# Firestore schema

All money fields are integer **cents** (never floats) to avoid rounding
drift across thousands of small purchases. All timestamps are ISO-8601
strings written by the client/function that created them (kept as strings
rather than `Timestamp` for simplicity in this MVP — see the note at the
bottom).

```
users/{uid}
  email: string
  displayName: string | null
  photoUrl: string | null
  householdId: string | null      # null until onboarding completes
  fcmTokens: string[]             # one per device
  notificationsEnabled: boolean   # default true

households/{householdId}
  name: string
  memberUids: string[]            # 1 while waiting for a partner, 2+ once joined
  createdBy: string               # uid
  pendingInviteCode: string | null

  budget/current                  # single doc, not a growing collection
    monthlyBudgetCents: int
    cycleStartDate: string (ISO date)
    nextPaydayDate: string (ISO date)
    cycleSpentCents: int          # resets to 0 on cycle rollover
    currency: string              # ISO 4217, default "AUD"

  transactions/{transactionId}    # append-only
    householdId: string
    spentByUid: string
    merchantName: string
    amountCents: int              # always positive
    occurredAt: string (ISO datetime)
    bankProvider: string          # "mock" | "basiq" | "adatree"
    externalId: string            # provider's own transaction id
    rawCategory: string | null

  notifications/{notificationId}  # write-only from Cloud Functions
    transactionId: string
    title: string
    body: string
    sentAt: string (ISO datetime)
    recipientUids: string[]

  linkedAccounts/{accountDocId}   # write-only from Cloud Functions
    provider: string              # "basiq" | "adatree"
    externalAccountId: string     # the provider's own account id
    linkedByUid: string           # which partner linked this account
    institutionName: string
    displayName: string
```

## Why `transactions/{id}` isn't keyed by `externalId` directly

Firestore document IDs can't contain certain characters some providers use
in transaction IDs, and different providers could theoretically reuse an
ID space. Instead, `transactionWebhook` (see
`functions/src/transactionWebhook.ts`) derives a deterministic doc ID as
`${bankProvider}_${externalId}` and uses a **create-only** write (fails if
the doc already exists) as the idempotency guard against webhook retries
and overlapping backfills — see that file for the exact logic.

## Why ISO strings instead of Firestore `Timestamp`

Kept as strings in this MVP purely so the same `Budget`/`SpendTransaction`
model code can be unit-tested without a Firestore emulator (`DateTime.parse`
has no SDK dependency). If query performance on date ranges becomes a
concern, migrate `occurredAt`/`cycleStartDate`/`nextPaydayDate` to native
`Timestamp` fields — Firestore indexes and orders them more efficiently
than string comparison, though ISO-8601's lexicographic order happens to
match chronological order so correctness isn't at stake, only performance.

## Why `linkedAccounts` needs an explicit collection-group index

`transactionWebhook.ts`'s `findLinkedAccount` runs a `collectionGroup('linkedAccounts')`
query filtering on `provider` + `externalAccountId` to map an incoming
webhook's account ID back to a household — across *all* households, since
the webhook doesn't know which one ahead of time. Collection-group queries
need an explicit index (see `firestore.indexes.json`); a same-named
subcollection existing elsewhere in the database means Firestore won't
infer one automatically the way it does for a plain single-collection
query.

## Security

See `firebase/firestore.rules`. Summary: a user can only read/write their
own `users/{uid}` doc and anything under a household they belong to.
Joining a household (by invite code) and all bank/notification writes go
through Cloud Functions using the Admin SDK, not direct client writes —
see `docs/SECURITY.md` for why.
