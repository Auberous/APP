import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/budget.dart';
import '../utils/budget_calculator.dart';
import 'household_provider.dart';
import 'service_providers.dart';

/// The household's live budget document. Any partner's device gets this
/// update the moment the `recalculateBudget` Cloud Function writes it —
/// that's the whole "both partners see it update immediately" behavior,
/// no polling involved.
final currentBudgetProvider = StreamProvider<Budget?>((ref) {
  final household = ref.watch(currentHouseholdProvider).valueOrNull;
  if (household == null) return Stream.value(null);
  return ref.watch(firestoreServiceProvider).watchBudget(household.id);
});

/// Derived "Available Today", in cents. Watches [currentBudgetProvider]
/// and re-derives on every emission — the arithmetic itself is the same
/// `BudgetCalculator` used server-side, so this is purely for display
/// smoothing (e.g. a local clock tick at midnight), never the source of
/// truth for `cycleSpentCents`.
final availableTodayCentsProvider = Provider<int?>((ref) {
  final budget = ref.watch(currentBudgetProvider).valueOrNull;
  if (budget == null) return null;
  return BudgetCalculator.availableTodayCents(budget);
});

final budgetStatusProvider = Provider<BudgetStatus?>((ref) {
  final budget = ref.watch(currentBudgetProvider).valueOrNull;
  if (budget == null) return null;
  return BudgetCalculator.statusFor(budget);
});
