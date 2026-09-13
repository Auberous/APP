import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/spend_transaction.dart';
import 'household_provider.dart';
import 'service_providers.dart';

/// The household's most recent purchases, newest first — feeds the
/// dashboard's "Recent Purchases" list.
final recentTransactionsProvider = StreamProvider<List<SpendTransaction>>((ref) {
  final household = ref.watch(currentHouseholdProvider).valueOrNull;
  if (household == null) return Stream.value(const []);
  return ref.watch(firestoreServiceProvider).watchRecentTransactions(household.id);
});
