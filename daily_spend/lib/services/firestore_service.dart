import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../models/app_user.dart';
import '../models/budget.dart';
import '../models/household.dart';
import '../models/spend_transaction.dart';

/// Every Firestore read/write the app makes, in one place, so the
/// collection layout (see `docs/FIRESTORE_SCHEMA.md`) is only known here
/// and in `firebase/firestore.rules` / the Cloud Functions.
///
/// Layout:
///   users/{uid}
///   households/{householdId}
///   households/{householdId}/budget/current
///   households/{householdId}/transactions/{transactionId}
///   households/{householdId}/notifications/{notificationId}
class FirestoreService {
  FirestoreService({FirebaseFirestore? firestore, FirebaseFunctions? functions})
      : _db = firestore ?? FirebaseFirestore.instance,
        _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  // --- users ---------------------------------------------------------

  DocumentReference<Map<String, dynamic>> _userDoc(String uid) =>
      _db.collection('users').doc(uid);

  Future<void> createUser(AppUser user) => _userDoc(user.uid).set(user.toJson());

  Stream<AppUser?> watchUser(String uid) {
    return _userDoc(uid).snapshots().map(
          (doc) => doc.exists ? AppUser.fromJson(doc.id, doc.data()!) : null,
        );
  }

  Future<void> setUserHousehold(String uid, String householdId) {
    return _userDoc(uid).update({'householdId': householdId});
  }

  Future<void> addFcmToken(String uid, String token) {
    return _userDoc(uid).update({
      'fcmTokens': FieldValue.arrayUnion([token]),
    });
  }

  Future<void> setNotificationsEnabled(String uid, bool enabled) {
    return _userDoc(uid).update({'notificationsEnabled': enabled});
  }

  // --- households ------------------------------------------------------

  CollectionReference<Map<String, dynamic>> get _households =>
      _db.collection('households');

  Future<Household> createHousehold({
    required String name,
    required String createdByUid,
    required String inviteCode,
  }) async {
    final doc = _households.doc();
    final household = Household(
      id: doc.id,
      name: name,
      memberUids: [createdByUid],
      createdBy: createdByUid,
      pendingInviteCode: inviteCode,
    );
    await doc.set(household.toJson());
    await setUserHousehold(createdByUid, doc.id);
    return household;
  }

  /// Joins an existing household by invite code, via the `joinHousehold`
  /// Cloud Function (see `firebase/functions/src/index.ts`).
  ///
  /// This has to be server-side, not a direct client write: the joining
  /// user isn't a household member yet, so `firestore.rules` can't grant
  /// them read/write access to look the household up by code themselves
  /// without also exposing every household to unauthenticated-into-it
  /// queries. The Cloud Function uses the Admin SDK (which bypasses
  /// rules entirely) to validate the code and add the member atomically.
  ///
  /// Returns null if no household is waiting on that code (already used,
  /// or never existed).
  Future<Household?> joinHouseholdByInviteCode({
    required String inviteCode,
    required String joiningUid,
  }) async {
    try {
      final callable = _functions.httpsCallable('joinHousehold');
      final result = await callable.call<Map<String, dynamic>>({'inviteCode': inviteCode});
      final data = result.data;
      return Household(
        id: data['householdId'] as String,
        name: data['name'] as String,
        memberUids: (data['memberUids'] as List<dynamic>).cast<String>(),
        createdBy: data['createdBy'] as String,
      );
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'not-found') return null;
      rethrow;
    }
  }

  Stream<Household?> watchHousehold(String householdId) {
    return _households.doc(householdId).snapshots().map(
          (doc) => doc.exists ? Household.fromJson(doc.id, doc.data()!) : null,
        );
  }

  // --- budget ----------------------------------------------------------

  DocumentReference<Map<String, dynamic>> _budgetDoc(String householdId) =>
      _households.doc(householdId).collection('budget').doc('current');

  Future<void> setBudget(String householdId, Budget budget) {
    return _budgetDoc(householdId).set(budget.toJson());
  }

  Stream<Budget?> watchBudget(String householdId) {
    return _budgetDoc(householdId).snapshots().map(
          (doc) => doc.exists ? Budget.fromJson(doc.data()!) : null,
        );
  }

  /// Client-side convenience for manual/offline adjustments (e.g. a cash
  /// purchase entered by hand). The real-time bank-driven path instead
  /// goes through the `recalculateBudget` Cloud Function so the increment
  /// is atomic with writing the transaction — see
  /// `firebase/functions/src/transactionWebhook.ts`.
  Future<void> incrementCycleSpent(String householdId, int amountCents) {
    return _budgetDoc(householdId).update({
      'cycleSpentCents': FieldValue.increment(amountCents),
    });
  }

  // --- transactions ------------------------------------------------------

  CollectionReference<Map<String, dynamic>> _transactions(String householdId) =>
      _households.doc(householdId).collection('transactions');

  Stream<List<SpendTransaction>> watchRecentTransactions(
    String householdId, {
    int limit = 25,
  }) {
    return _transactions(householdId)
        .orderBy('occurredAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs.map((d) => SpendTransaction.fromJson(d.id, d.data())).toList());
  }

  /// Manual entry path (e.g. cash spend, or a dev/demo build with no bank
  /// linked). The bank-driven path writes transactions from the
  /// `transactionWebhook` Cloud Function instead, keyed by
  /// `(bankProvider, externalId)` for idempotency.
  Future<void> recordManualTransaction(SpendTransaction transaction) {
    return _transactions(transaction.householdId).doc(transaction.id).set(transaction.toJson());
  }
}
