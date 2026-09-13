import 'package:cloud_functions/cloud_functions.dart';

import 'bank_provider.dart';

/// [BankProvider] backed by Basiq (an Australian Open Banking / Consumer
/// Data Right aggregator).
///
/// Basiq's API key is a server secret and must never ship in the app —
/// every call here goes through a Cloud Function, which holds the real
/// Basiq client and does the actual HTTP calls. See
/// `firebase/functions/src/index.ts` (`basiqCreateConsentLink`,
/// `basiqGetTransactions`, `basiqRefreshConnection`) and
/// `docs/OPEN_BANKING_INTEGRATION.md` for the full consent flow, which is
/// a browser hand-off (the user authenticates with their own bank on a
/// Basiq-hosted page), not something this class can do synchronously.
///
/// This class is a thin, typed wrapper so the rest of the app never
/// imports `cloud_functions` directly for bank operations — swapping
/// providers, or running both at once (each partner on a different one),
/// stays a `BankProvider` choice instead of a call-site change.
class BasiqBankProvider implements BankProvider {
  BasiqBankProvider({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  @override
  String get id => 'basiq';

  @override
  Future<LinkedAccount> connectAccount({required String householdMemberUid}) async {
    // The Cloud Function creates a Basiq user + consent link and returns
    // it; the caller (a screen, not this class) is responsible for
    // opening it in a webview/browser and polling or waiting on the
    // `accountLinked` Firestore field the webhook sets on completion.
    // TODO(basiq): once linking completes, resolve this Future with the
    // real LinkedAccount the webhook recorded — for now this throws so
    // callers don't silently treat an unfinished OAuth hand-off as done.
    throw UnimplementedError(
      'BasiqBankProvider.connectAccount requires the consent-link webview '
      'flow described in docs/OPEN_BANKING_INTEGRATION.md; wire this up to '
      'basiqCreateConsentLink once Basiq API credentials are configured.',
    );
  }

  @override
  Future<List<RawBankTransaction>> getTransactions({
    required String accountId,
    DateTime? since,
  }) async {
    final callable = _functions.httpsCallable('basiqGetTransactions');
    final result = await callable.call<Map<String, dynamic>>({
      'accountId': accountId,
      if (since != null) 'since': since.toIso8601String(),
    });
    final rows = (result.data['transactions'] as List<dynamic>).cast<Map<String, dynamic>>();
    return rows
        .map((row) => RawBankTransaction(
              externalId: row['id'] as String,
              merchantName: row['description'] as String,
              amountCents: (row['amountCents'] as num).round(),
              occurredAt: DateTime.parse(row['postDate'] as String),
              rawCategory: row['class'] as String?,
            ))
        .toList();
  }

  @override
  Future<void> refreshTransactions({required String accountId}) async {
    final callable = _functions.httpsCallable('basiqRefreshConnection');
    await callable.call<void>({'accountId': accountId});
  }
}
