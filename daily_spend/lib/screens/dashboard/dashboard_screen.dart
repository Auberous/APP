import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/budget_provider.dart';
import '../../providers/household_provider.dart';
import '../../providers/transactions_provider.dart';
import 'widgets/available_today_card.dart';
import 'widgets/recent_purchases_list.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budgetAsync = ref.watch(currentBudgetProvider);
    final transactionsAsync = ref.watch(recentTransactionsProvider);
    final household = ref.watch(currentHouseholdProvider).valueOrNull;
    final myUid = ref.watch(authStateProvider).valueOrNull?.uid;
    final memberNames = ref.watch(householdMemberNamesProvider).valueOrNull;

    String memberDisplayName(String uid) {
      if (uid == myUid) return 'You';
      // Falls back to "Partner" only while names are still loading —
      // householdMemberNamesProvider resolves quickly once the household
      // is known, so this is a brief flash, not a stuck placeholder.
      return memberNames?[uid] ?? 'Partner';
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(household?.name ?? 'Daily Spend'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(currentBudgetProvider);
          ref.invalidate(recentTransactionsProvider);
        },
        child: budgetAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Something went wrong: $err')),
          data: (budget) {
            if (budget == null) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('No budget set up yet.'),
                    const SizedBox(height: 12),
                    if (household != null)
                      FilledButton(
                        onPressed: () => context.push('/onboarding/budget/${household.id}'),
                        child: const Text('Set up budget'),
                      ),
                  ],
                ),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                AvailableTodayCard(budget: budget),
                const SizedBox(height: 24),
                Text('Recent Purchases', style: Theme.of(context).textTheme.titleMedium),
                transactionsAsync.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (err, _) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text('Could not load purchases: $err'),
                  ),
                  data: (transactions) => RecentPurchasesList(
                    transactions: transactions,
                    memberDisplayName: memberDisplayName,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
