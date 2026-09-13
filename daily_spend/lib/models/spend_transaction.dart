/// A single card purchase, ingested from a linked bank account. Mirrors
/// `households/{householdId}/transactions/{transactionId}`.
///
/// Named `SpendTransaction` (not `Transaction`) to avoid colliding with
/// `dart:async`'s `Zone`-scoped `Transaction`-shaped types and Firestore's
/// own transaction APIs.
class SpendTransaction {
  const SpendTransaction({
    required this.id,
    required this.householdId,
    required this.spentByUid,
    required this.merchantName,
    required this.amountCents,
    required this.occurredAt,
    required this.bankProvider,
    required this.externalId,
    this.rawCategory,
  });

  final String id;
  final String householdId;

  /// Which household member's linked account the purchase came from.
  final String spentByUid;

  final String merchantName;

  /// Always positive; this app only tracks outgoing spend.
  final int amountCents;

  final DateTime occurredAt;

  /// Which `BankProvider` implementation supplied this row
  /// (e.g. "basiq", "adatree", "mock") — kept for debugging/reconciliation.
  final String bankProvider;

  /// The provider's own transaction id, used to de-duplicate webhook
  /// retries and backfills. Unique per (bankProvider, externalId).
  final String externalId;

  /// The bank's own category label, if any. Deliberately unused by the
  /// UI (no budgeting categories in this app) but kept for future use.
  final String? rawCategory;

  factory SpendTransaction.fromJson(String id, Map<String, dynamic> json) {
    return SpendTransaction(
      id: id,
      householdId: json['householdId'] as String,
      spentByUid: json['spentByUid'] as String,
      merchantName: json['merchantName'] as String,
      amountCents: json['amountCents'] as int,
      occurredAt: DateTime.parse(json['occurredAt'] as String),
      bankProvider: json['bankProvider'] as String,
      externalId: json['externalId'] as String,
      rawCategory: json['rawCategory'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'householdId': householdId,
        'spentByUid': spentByUid,
        'merchantName': merchantName,
        'amountCents': amountCents,
        'occurredAt': occurredAt.toIso8601String(),
        'bankProvider': bankProvider,
        'externalId': externalId,
        'rawCategory': rawCategory,
      };
}
