import '../../models/spend_transaction.dart';

/// A bank-linked transaction as it comes off the wire, before it's been
/// attributed to a household and written to Firestore. Deliberately
/// separate from [SpendTransaction], which is the *stored* shape.
class RawBankTransaction {
  const RawBankTransaction({
    required this.externalId,
    required this.merchantName,
    required this.amountCents,
    required this.occurredAt,
    this.rawCategory,
  });

  final String externalId;
  final String merchantName;
  final int amountCents;
  final DateTime occurredAt;
  final String? rawCategory;
}

/// A linked bank account, in whatever shape the provider hands back from
/// its OAuth/consent flow. Only the fields this app actually uses.
class LinkedAccount {
  const LinkedAccount({
    required this.accountId,
    required this.institutionName,
    required this.displayName,
  });

  final String accountId;
  final String institutionName;
  final String displayName;
}

/// Abstraction over "a service that can tell us about card transactions on
/// a linked bank account". The app must never talk to Basiq, Adatree, or
/// any other aggregator directly outside of one of these implementations —
/// that's what keeps switching (or supporting several at once, e.g. one
/// partner on each) a config change instead of a rewrite.
///
/// Implementations:
///  - [MockBankProvider] — in-memory, for local dev/demo builds.
///  - `BasiqBankProvider` — Australian Open Banking (CDR) via Basiq.
///  - `AdatreeBankProvider` — Australian Open Banking (CDR) via Adatree.
///
/// All network-facing implementations live behind Cloud Functions, not in
/// the Flutter client — see `firebase/functions/src/transactionWebhook.ts`
/// and `docs/OPEN_BANKING_INTEGRATION.md`. The Dart-side interface exists
/// so the client can (a) drive the initial account-linking / consent
/// handoff, and (b) be unit-testable against [MockBankProvider] without a
/// backend at all.
abstract class BankProvider {
  /// Human-readable id used for the `bankProvider` field on stored
  /// transactions and for provider selection in Settings.
  String get id;

  /// Starts (or resumes) the consent flow for linking a new account.
  /// Real implementations typically return a URL to open in a webview or
  /// the system browser; the mock completes immediately.
  Future<LinkedAccount> connectAccount({required String householdMemberUid});

  /// Fetches transactions for an already-linked account, optionally only
  /// those after [since] (exclusive). Used for backfill and for any
  /// polling fallback when a webhook is missed.
  Future<List<RawBankTransaction>> getTransactions({
    required String accountId,
    DateTime? since,
  });

  /// Forces a provider-side refresh of an account's transaction feed
  /// ahead of the next scheduled sync. Real Open Banking aggregators rate
  /// limit this — implementations should treat it as best-effort.
  Future<void> refreshTransactions({required String accountId});
}
