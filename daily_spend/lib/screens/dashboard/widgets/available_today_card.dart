import 'package:flutter/material.dart';

import '../../../models/budget.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/budget_calculator.dart';
import '../../../utils/formatters.dart';

/// The one primary metric the whole app exists to show. Big number,
/// status color, nothing else competing for attention — per spec: no pie
/// charts, no categories, no financial jargon.
class AvailableTodayCard extends StatelessWidget {
  const AvailableTodayCard({required this.budget, super.key});

  final Budget budget;

  @override
  Widget build(BuildContext context) {
    final availableToday = BudgetCalculator.availableTodayCents(budget);
    final status = BudgetCalculator.statusFor(budget);
    final color = switch (status) {
      BudgetStatus.onTrack => AppColors.onTrack,
      BudgetStatus.warning => AppColors.warning,
      BudgetStatus.overBudget => AppColors.overBudget,
    };
    final label = switch (status) {
      BudgetStatus.onTrack => 'On track',
      BudgetStatus.warning => 'Getting tight',
      BudgetStatus.overBudget => 'Over budget',
    };

    return Card(
      color: color.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 16),
        child: Column(
          children: [
            const Text('AVAILABLE TODAY', style: TextStyle(letterSpacing: 2, fontSize: 12)),
            const SizedBox(height: 8),
            Text(
              Formatters.money(availableToday, currency: budget.currency),
              style: Theme.of(context).textTheme.displayLarge?.copyWith(color: color),
            ),
            const SizedBox(height: 8),
            Chip(
              label: Text(label, style: TextStyle(color: color)),
              backgroundColor: color.withValues(alpha: 0.12),
              side: BorderSide.none,
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _Stat(label: 'Remaining this cycle', value: Formatters.money(budget.remainingCycleCents, currency: budget.currency)),
                _Stat(label: 'Days until payday', value: '${budget.daysRemaining()}'),
                _Stat(label: 'Spent this cycle', value: Formatters.money(budget.cycleSpentCents, currency: budget.currency)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(label, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
      ],
    );
  }
}
