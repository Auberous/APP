import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/auth_provider.dart';
import '../../providers/service_providers.dart';
import '../../services/bank/bank_provider.dart';

/// Drives the `BankProvider.connectAccount` hand-off. With the default
/// `mock` provider (see `service_providers.dart`) this completes
/// immediately; with `BasiqBankProvider`/`AdatreeBankProvider` it should
/// open the consent URL a Cloud Function hands back — see
/// `docs/OPEN_BANKING_INTEGRATION.md` for that flow, which isn't wired up
/// here yet (both throw `UnimplementedError` until real API credentials
/// are configured).
class BankAccountsScreen extends ConsumerStatefulWidget {
  const BankAccountsScreen({super.key});

  @override
  ConsumerState<BankAccountsScreen> createState() => _BankAccountsScreenState();
}

class _BankAccountsScreenState extends ConsumerState<BankAccountsScreen> {
  LinkedAccount? _linkedAccount;
  bool _isLinking = false;
  String? _errorMessage;

  Future<void> _connect() async {
    final uid = ref.read(authStateProvider).valueOrNull?.uid;
    if (uid == null) return;

    setState(() {
      _isLinking = true;
      _errorMessage = null;
    });
    try {
      final account = await ref.read(bankProvider).connectAccount(householdMemberUid: uid);
      setState(() => _linkedAccount = account);
    } catch (e) {
      setState(() => _errorMessage = e.toString());
    } finally {
      if (mounted) setState(() => _isLinking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = ref.watch(bankProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Linked bank accounts')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Provider: ${provider.id}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            if (_linkedAccount case final account?)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.account_balance),
                  title: Text(account.institutionName),
                  subtitle: Text(account.displayName),
                  trailing: const Icon(Icons.check_circle, color: Colors.green),
                ),
              )
            else
              FilledButton.icon(
                onPressed: _isLinking ? null : _connect,
                icon: _isLinking
                    ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.add_link),
                label: const Text('Connect a bank account'),
              ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 16),
              Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    );
  }
}
