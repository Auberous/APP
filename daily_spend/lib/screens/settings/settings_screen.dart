import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/household_provider.dart';
import '../../providers/service_providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentAppUserProvider).valueOrNull;
    final household = ref.watch(currentHouseholdProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          if (household != null)
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined),
              title: const Text('Budget & payday'),
              subtitle: const Text('Update this cycle\'s amount and payday date'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/onboarding/budget/${household.id}'),
            ),
          ListTile(
            leading: const Icon(Icons.link),
            title: const Text('Linked bank accounts'),
            subtitle: const Text('Connect an account to auto-track purchases'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/bank-accounts'),
          ),
          SwitchListTile(
            secondary: const Icon(Icons.notifications_outlined),
            title: const Text('Purchase notifications'),
            subtitle: const Text('Get notified when either of you makes a purchase'),
            value: user?.notificationsEnabled ?? true,
            onChanged: user == null
                ? null
                : (value) => ref.read(firestoreServiceProvider).setNotificationsEnabled(user.uid, value),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Log out'),
            onTap: () => ref.read(authServiceProvider).signOut(),
          ),
        ],
      ),
    );
  }
}
