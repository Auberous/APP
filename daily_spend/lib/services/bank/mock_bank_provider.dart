import 'dart:math';

import 'bank_provider.dart';

/// In-memory [BankProvider] for local development, demos, and widget/unit
/// tests. Simulates a linked account with a handful of plausible-looking
/// purchases so the dashboard has something to show without any backend
/// or real bank credentials.
class MockBankProvider implements BankProvider {
  MockBankProvider({Random? random}) : _random = random ?? Random();

  final Random _random;
  final Map<String, List<RawBankTransaction>> _transactionsByAccount = {};

  static const _merchants = [
    'Coffee Club',
    'Woolworths',
    'Uber',
    'Bunnings',
    'Netflix',
    'Local Cafe',
  ];

  @override
  String get id => 'mock';

  @override
  Future<LinkedAccount> connectAccount({required String householdMemberUid}) async {
    final accountId = 'mock-account-$householdMemberUid';
    _transactionsByAccount.putIfAbsent(accountId, () => []);
    return LinkedAccount(
      accountId: accountId,
      institutionName: 'Mock Bank',
      displayName: 'Everyday Account (••1234)',
    );
  }

  @override
  Future<List<RawBankTransaction>> getTransactions({
    required String accountId,
    DateTime? since,
  }) async {
    final all = _transactionsByAccount[accountId] ?? const [];
    if (since == null) return all;
    return all.where((t) => t.occurredAt.isAfter(since)).toList();
  }

  @override
  Future<void> refreshTransactions({required String accountId}) async {
    // Simulates a webhook delivering one new purchase, the way a real
    // provider would push (or a poll would discover) a fresh transaction.
    final list = _transactionsByAccount.putIfAbsent(accountId, () => []);
    list.add(
      RawBankTransaction(
        externalId: 'mock-${DateTime.now().microsecondsSinceEpoch}',
        merchantName: _merchants[_random.nextInt(_merchants.length)],
        amountCents: 300 + _random.nextInt(6000),
        occurredAt: DateTime.now(),
      ),
    );
  }

  /// Test/demo helper: inject a specific transaction rather than a random
  /// one.
  void seedTransaction(String accountId, RawBankTransaction transaction) {
    _transactionsByAccount.putIfAbsent(accountId, () => []).add(transaction);
  }
}
