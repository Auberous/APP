import 'package:cloud_functions/cloud_functions.dart';

/// Calls the `simulateMockPurchase` Cloud Function — a demo/dev
/// convenience that exercises the exact real ingestion pipeline
/// (`recordTransactionAndNotify`, the same code the Basiq/Adatree
/// webhooks call) without a real linked bank account.
///
/// Exists so a fresh deploy is actually demoable end-to-end (dashboard
/// update + push notification) before any Open Banking integration is
/// wired up — see `docs/OPEN_BANKING_INTEGRATION.md`. Kept as its own
/// small class, not folded into `MockBankProvider`, since it deliberately
/// goes through the real Cloud Function/Firestore path rather than
/// `MockBankProvider`'s purely in-memory simulation — see
/// `BankAccountsScreen`, which offers both.
class MockPurchaseSimulator {
  MockPurchaseSimulator({FirebaseFunctions? functions}) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<void> simulate({String? merchantName, int? amountCents}) async {
    final callable = _functions.httpsCallable('simulateMockPurchase');
    await callable.call<Map<String, dynamic>>({
      if (merchantName != null) 'merchantName': merchantName,
      if (amountCents != null) 'amountCents': amountCents,
    });
  }
}
