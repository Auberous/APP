import 'package:cloud_functions/cloud_functions.dart';

import 'bank_provider.dart';

/// [BankProvider] backed by Adatree (an alternative Australian Open
/// Banking / Consumer Data Right accredited data recipient).
///
/// Mirrors [BasiqBankProvider] exactly in shape — see that file's doc
/// comment for why the real API calls live in Cloud Functions rather
/// than here. Kept as a separate class (rather than one provider with a
/// vendor flag) so the two can be A/B tested, or run one-per-partner,
/// without conditional logic scattered through the app.
class AdatreeBankProvider implements BankProvider {
  AdatreeBankProvider({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  @override
  String get id => 'adatree';

  @override
  Future<LinkedAccount> connectAccount({required String householdMemberUid}) async {
    // TODO(adatree): wire to adatreeCreateConsentLink once Adatree API
    // credentials are configured; see BasiqBankProvider.connectAccount
    // for the equivalent flow and docs/OPEN_BANKING_INTEGRATION.md.
    throw UnimplementedError(
      'AdatreeBankProvider.connectAccount requires the CDR consent-link '
      'flow described in docs/OPEN_BANKING_INTEGRATION.md.',
    );
  }

  @override
  Future<List<RawBankTransaction>> getTransactions({
    required String accountId,
    DateTime? since,
  }) async {
    final callable = _functions.httpsCallable('adatreeGetTransactions');
    final result = await callable.call<Map<String, dynamic>>({
      'accountId': accountId,
      if (since != null) 'since': since.toIso8601String(),
    });
    final rows = (result.data['transactions'] as List<dynamic>).cast<Map<String, dynamic>>();
    return rows
        .map((row) => RawBankTransaction(
              externalId: row['transactionId'] as String,
              merchantName: row['reference'] as String,
              amountCents: (row['amountCents'] as num).round(),
              occurredAt: DateTime.parse(row['executionDateTime'] as String),
              rawCategory: row['type'] as String?,
            ))
        .toList();
  }

  @override
  Future<void> refreshTransactions({required String accountId}) async {
    final callable = _functions.httpsCallable('adatreeRefreshConnection');
    await callable.call<void>({'accountId': accountId});
  }
}
