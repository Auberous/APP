import '../models/budget.dart';

/// The one piece of math the whole app is built around:
///
///     Available Today = Remaining Budget ÷ Remaining Days
///
/// Kept as a pure, dependency-free function (no Firebase, no BuildContext)
/// so it's trivial to unit test and so the Cloud Functions side (which
/// re-implements the same formula in TypeScript — see
/// `firebase/functions/src/budgetCalculator.ts`) can be checked against it
/// with the same fixtures.
class BudgetCalculator {
  const BudgetCalculator._();

  /// Returns "available today", in cents. Never negative in the arithmetic
  /// sense that matters for display — a household that has overspent gets
  /// a negative number back, and the UI is expected to render that as a
  /// red "over budget" state rather than clamp it to zero, since hiding
  /// the true shortfall would defeat the point of the app.
  static int availableTodayCents(Budget budget, {DateTime? now}) {
    final remaining = budget.remainingCycleCents;
    final days = budget.daysRemaining(now: now);
    return (remaining / days).floor();
  }

  /// Applies a new purchase to a budget, returning the updated budget.
  /// Pure — callers persist the result themselves (see
  /// `BudgetProvider`/the Cloud Function equivalent).
  static Budget applyTransaction(Budget budget, {required int amountCents}) {
    return budget.copyWith(cycleSpentCents: budget.cycleSpentCents + amountCents);
  }

  /// Starts a fresh cycle once `nextPaydayDate` has passed: the spend
  /// counter resets to zero, the old payday becomes the new cycle start,
  /// and the caller supplies the new payday (the app doesn't guess pay
  /// frequency in the MVP — Settings just asks again).
  static Budget rollCycle(
    Budget budget, {
    required DateTime newPaydayDate,
    int? newMonthlyBudgetCents,
  }) {
    return budget.copyWith(
      cycleStartDate: budget.nextPaydayDate,
      nextPaydayDate: newPaydayDate,
      cycleSpentCents: 0,
      monthlyBudgetCents: newMonthlyBudgetCents,
    );
  }

  /// Three-way status used to color the dashboard (green/orange/red) per
  /// spec — no charts, no categories, just "are we OK".
  static BudgetStatus statusFor(Budget budget, {DateTime? now}) {
    final availableToday = availableTodayCents(budget, now: now);
    if (availableToday < 0) return BudgetStatus.overBudget;

    // "Warning" = today's allowance has shrunk to less than half of the
    // flat daily rate (monthly budget / days in a notional 30-day cycle) —
    // a simple, explainable heuristic rather than a forecast model.
    final flatDailyRateCents = budget.monthlyBudgetCents / 30;
    if (availableToday < flatDailyRateCents * 0.5) return BudgetStatus.warning;

    return BudgetStatus.onTrack;
  }
}

enum BudgetStatus { onTrack, warning, overBudget }
