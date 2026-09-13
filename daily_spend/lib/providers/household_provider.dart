import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/household.dart';
import 'auth_provider.dart';
import 'service_providers.dart';

/// The signed-in user's household, or null until `currentAppUserProvider`
/// resolves a `householdId` (i.e. before onboarding is complete).
final currentHouseholdProvider = StreamProvider<Household?>((ref) {
  final user = ref.watch(currentAppUserProvider).valueOrNull;
  final householdId = user?.householdId;
  if (householdId == null) return Stream.value(null);
  return ref.watch(firestoreServiceProvider).watchHousehold(householdId);
});
