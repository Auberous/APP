import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/budget.dart';
import '../../providers/budget_provider.dart';
import '../../providers/service_providers.dart';
import '../../utils/budget_calculator.dart';
import '../../utils/formatters.dart';

/// First-time onboarding step, and also reachable later from Settings to
/// edit the current budget/payday or deliberately start a new cycle.
/// Takes exactly the two inputs the spec calls for: monthly discretionary
/// budget and next payday date.
///
/// Important distinction this screen has to make: editing the amount or
/// payday date mid-cycle should NOT reset what's already been tracked as
/// spent — only an explicit "start a new cycle" action does that (via
/// `BudgetCalculator.rollCycle`). Conflating the two would mean a partner
/// nudging the monthly amount up by $50 silently wipes the household's
/// tracked spend for the cycle, which defeats the entire point of the app.
class BudgetSetupScreen extends ConsumerStatefulWidget {
  const BudgetSetupScreen({required this.householdId, super.key});

  final String householdId;

  @override
  ConsumerState<BudgetSetupScreen> createState() => _BudgetSetupScreenState();
}

class _BudgetSetupScreenState extends ConsumerState<BudgetSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _budgetController = TextEditingController();
  DateTime? _paydayDate;
  bool _isSubmitting = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _budgetController.dispose();
    super.dispose();
  }

  /// Fills the form from an existing budget exactly once, the first time
  /// one loads — after that, further provider emissions (e.g. from the
  /// household member's own save) shouldn't stomp on what's being typed.
  void _prefillIfNeeded(Budget? existing) {
    if (_prefilled || existing == null) return;
    _prefilled = true;
    _budgetController.text = (existing.monthlyBudgetCents / 100).toStringAsFixed(2);
    _paydayDate = existing.nextPaydayDate;
  }

  Future<void> _pickPayday() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _paydayDate ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _paydayDate = picked);
  }

  bool _validate() {
    if (!_formKey.currentState!.validate()) return false;
    if (_paydayDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pick your next payday date.')),
      );
      return false;
    }
    return true;
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _isSubmitting = true);
    try {
      await action();
      if (mounted) context.go('/dashboard');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  /// First-time setup, or editing amount/payday without touching what's
  /// already been tracked as spent this cycle.
  Future<void> _saveChanges(Budget? existing) async {
    if (!_validate()) return;
    final dollars = double.parse(_budgetController.text);
    final monthlyBudgetCents = (dollars * 100).round();

    final budget = existing == null
        ? Budget(
            monthlyBudgetCents: monthlyBudgetCents,
            cycleStartDate: DateTime.now(),
            nextPaydayDate: _paydayDate!,
            cycleSpentCents: 0,
          )
        : existing.copyWith(monthlyBudgetCents: monthlyBudgetCents, nextPaydayDate: _paydayDate!);

    await _run(() => ref.read(firestoreServiceProvider).setBudget(widget.householdId, budget));
  }

  /// Deliberately resets tracked spend to $0 and starts a fresh cycle
  /// window — the only path that should ever do that.
  Future<void> _startNewCycle(Budget existing) async {
    if (!_validate()) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Start a new cycle?'),
        content: Text(
          'This resets tracked spend for this cycle back to ${Formatters.money(0, currency: existing.currency)}. '
          'The ${Formatters.money(existing.cycleSpentCents, currency: existing.currency)} already spent this '
          'cycle stays in your purchase history, but stops counting against the budget.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Start new cycle')),
        ],
      ),
    );
    if (confirmed != true) return;

    final dollars = double.parse(_budgetController.text);
    final rolled = BudgetCalculator.rollCycle(
      existing,
      newPaydayDate: _paydayDate!,
      newMonthlyBudgetCents: (dollars * 100).round(),
    );
    await _run(() => ref.read(firestoreServiceProvider).setBudget(widget.householdId, rolled));
  }

  @override
  Widget build(BuildContext context) {
    final existingBudget = ref.watch(currentBudgetProvider).valueOrNull;
    _prefillIfNeeded(existingBudget);
    final isEditingExisting = existingBudget != null;

    return Scaffold(
      appBar: AppBar(title: Text(isEditingExisting ? 'Budget & payday' : 'Set your budget')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    isEditingExisting
                        ? 'Update this cycle\'s amount or payday'
                        : 'How much can you both spend this cycle?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _budgetController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Monthly discretionary budget',
                      prefixText: '\$ ',
                    ),
                    validator: (v) {
                      final parsed = double.tryParse(v ?? '');
                      if (parsed == null || parsed <= 0) return 'Enter an amount greater than 0';
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Next payday'),
                    subtitle: Text(_paydayDate == null
                        ? 'Not set'
                        : '${_paydayDate!.year}-${_paydayDate!.month.toString().padLeft(2, '0')}-${_paydayDate!.day.toString().padLeft(2, '0')}'),
                    trailing: const Icon(Icons.calendar_today),
                    onTap: _pickPayday,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _isSubmitting ? null : () => _saveChanges(existingBudget),
                    child: _isSubmitting
                        ? const SizedBox(
                            height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(isEditingExisting ? 'Save changes' : 'Start tracking'),
                  ),
                  if (isEditingExisting) ...[
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: _isSubmitting ? null : () => _startNewCycle(existingBudget),
                      child: const Text('Start new cycle now'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
