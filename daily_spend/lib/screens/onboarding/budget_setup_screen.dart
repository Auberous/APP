import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/budget.dart';
import '../../providers/service_providers.dart';

/// Final onboarding step, and also reachable later from Settings to
/// start a fresh cycle. Takes exactly the two inputs the spec calls for:
/// monthly discretionary budget and next payday date.
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

  @override
  void dispose() {
    _budgetController.dispose();
    super.dispose();
  }

  Future<void> _pickPayday() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) setState(() => _paydayDate = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _paydayDate == null) {
      if (_paydayDate == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pick your next payday date.')),
        );
      }
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      final dollars = double.parse(_budgetController.text);
      final budget = Budget(
        monthlyBudgetCents: (dollars * 100).round(),
        cycleStartDate: DateTime.now(),
        nextPaydayDate: _paydayDate!,
        cycleSpentCents: 0,
      );
      await ref.read(firestoreServiceProvider).setBudget(widget.householdId, budget);
      if (mounted) context.go('/dashboard');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Set your budget')),
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
                  Text('How much can you both spend this cycle?',
                      style: Theme.of(context).textTheme.titleLarge),
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
                    onPressed: _isSubmitting ? null : _submit,
                    child: _isSubmitting
                        ? const SizedBox(
                            height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Start tracking'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
