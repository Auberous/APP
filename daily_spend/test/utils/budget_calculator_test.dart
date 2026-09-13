import 'package:flutter_test/flutter_test.dart';

import 'package:daily_spend/models/budget.dart';
import 'package:daily_spend/utils/budget_calculator.dart';

/// Fixtures mirror `firebase/functions/src/budgetCalculator.test.ts` —
/// same numbers on both sides, since the two implementations are meant
/// to agree exactly (see docs/ARCHITECTURE.md's note on why the formula
/// is duplicated rather than shared).
void main() {
  // The exact numbers from the product spec: $3000 budget, $1500 spent,
  // 15 days until payday → $100 available today.
  final specExampleBudget = Budget(
    monthlyBudgetCents: 300000,
    cycleStartDate: DateTime(2026, 1, 1),
    nextPaydayDate: DateTime(2026, 1, 16),
    cycleSpentCents: 150000,
  );
  final now = DateTime(2026, 1, 1);

  group('availableTodayCents', () {
    test('matches the product spec worked example', () {
      expect(BudgetCalculator.availableTodayCents(specExampleBudget, now: now), 10000);
    });

    test('goes negative (not clamped) once overspent', () {
      final overspent = specExampleBudget.copyWith(cycleSpentCents: 310000);
      expect(BudgetCalculator.availableTodayCents(overspent, now: now), lessThan(0));
    });

    test('floors rather than rounds', () {
      // remaining = 90, days = 4 -> 22.5 -> floor gives 22; round would give 23.
      final budget = specExampleBudget.copyWith(
        monthlyBudgetCents: 190,
        cycleSpentCents: 100,
        nextPaydayDate: now.add(const Duration(days: 4)),
      );
      expect(BudgetCalculator.availableTodayCents(budget, now: now), 22);
    });
  });

  group('daysRemaining', () {
    test('never drops below 1, even on payday itself', () {
      final onPayday = specExampleBudget.copyWith(nextPaydayDate: now);
      expect(onPayday.daysRemaining(now: now), 1);
    });

    test('never drops below 1, even past payday', () {
      final pastPayday = specExampleBudget.copyWith(nextPaydayDate: now.subtract(const Duration(days: 2)));
      expect(pastPayday.daysRemaining(now: now), 1);
    });
  });

  group('applyTransaction', () {
    test('increases cycleSpentCents by the purchase amount, spec worked example', () {
      final updated = BudgetCalculator.applyTransaction(specExampleBudget, amountCents: 2500);
      expect(updated.cycleSpentCents, 152500);
      // New available today: (300000 - 152500) / 15 = 9833.33.. -> floor 9833
      expect(BudgetCalculator.availableTodayCents(updated, now: now), 9833);
    });

    test('does not mutate the original budget', () {
      BudgetCalculator.applyTransaction(specExampleBudget, amountCents: 2500);
      expect(specExampleBudget.cycleSpentCents, 150000);
    });
  });

  group('statusFor', () {
    test('onTrack when comfortably within the flat daily rate', () {
      expect(BudgetCalculator.statusFor(specExampleBudget, now: now), BudgetStatus.onTrack);
    });

    test('overBudget once available today goes negative', () {
      final overspent = specExampleBudget.copyWith(cycleSpentCents: 310000);
      expect(BudgetCalculator.statusFor(overspent, now: now), BudgetStatus.overBudget);
    });

    test('warning once available today drops below half the flat daily rate', () {
      // Flat daily rate = 300000 / 30 = 10000. Half of that = 5000.
      // Push availableToday under 5000 without going negative: e.g. remaining
      // 4000 over 1 day.
      final tight = specExampleBudget.copyWith(
        cycleSpentCents: 296000, // remaining = 4000
        nextPaydayDate: now.add(const Duration(days: 1)),
      );
      expect(BudgetCalculator.statusFor(tight, now: now), BudgetStatus.warning);
    });
  });

  group('rollCycle', () {
    test('resets spend and moves the cycle window forward', () {
      final rolled = BudgetCalculator.rollCycle(
        specExampleBudget,
        newPaydayDate: DateTime(2026, 2, 16),
      );
      expect(rolled.cycleSpentCents, 0);
      expect(rolled.cycleStartDate, specExampleBudget.nextPaydayDate);
      expect(rolled.nextPaydayDate, DateTime(2026, 2, 16));
      // Budget amount carries over unless a new one is supplied.
      expect(rolled.monthlyBudgetCents, specExampleBudget.monthlyBudgetCents);
    });

    test('accepts a new monthly amount at rollover', () {
      final rolled = BudgetCalculator.rollCycle(
        specExampleBudget,
        newPaydayDate: DateTime(2026, 2, 16),
        newMonthlyBudgetCents: 350000,
      );
      expect(rolled.monthlyBudgetCents, 350000);
    });
  });
}
