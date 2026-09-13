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

/// uid -> display name (falling back to the part of their email before
/// the @ if they never set one) for every member of the current
/// household. A one-off fetch per member rather than a live stream —
/// display names change rarely enough that this doesn't need to be
/// realtime, and re-fetches automatically whenever household membership
/// changes (e.g. a partner just joined).
final householdMemberNamesProvider = FutureProvider<Map<String, String>>((ref) async {
  final household = ref.watch(currentHouseholdProvider).valueOrNull;
  if (household == null) return const {};

  final firestoreService = ref.watch(firestoreServiceProvider);
  final entries = await Future.wait(household.memberUids.map((uid) async {
    final user = await firestoreService.getUser(uid);
    final displayName = user?.displayName?.trim();
    final fallback = user?.email.split('@').first ?? 'Member';
    return MapEntry(uid, (displayName != null && displayName.isNotEmpty) ? displayName : fallback);
  }));
  return Map.fromEntries(entries);
});
