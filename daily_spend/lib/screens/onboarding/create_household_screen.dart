import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_provider.dart';
import '../../providers/service_providers.dart';

/// First onboarding step: create a household, or join a partner's with a
/// code they already have. Whichever happens, the router redirect (see
/// app.dart) moves on to budget setup once `householdId` is set.
class CreateHouseholdScreen extends ConsumerStatefulWidget {
  const CreateHouseholdScreen({super.key});

  @override
  ConsumerState<CreateHouseholdScreen> createState() => _CreateHouseholdScreenState();
}

class _CreateHouseholdScreenState extends ConsumerState<CreateHouseholdScreen> {
  final _nameController = TextEditingController(text: 'Our household');
  final _joinCodeController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _nameController.dispose();
    _joinCodeController.dispose();
    super.dispose();
  }

  String _generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
    final rand = Random.secure();
    return List.generate(6, (_) => chars[rand.nextInt(chars.length)]).join();
  }

  Future<void> _create() async {
    final uid = ref.read(authStateProvider).valueOrNull?.uid;
    if (uid == null) return;
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      final household = await ref.read(firestoreServiceProvider).createHousehold(
            name: _nameController.text.trim(),
            createdByUid: uid,
            inviteCode: _generateInviteCode(),
          );
      if (mounted) context.go('/invite/${household.id}');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _join() async {
    final uid = ref.read(authStateProvider).valueOrNull?.uid;
    if (uid == null) return;
    final code = _joinCodeController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      final household = await ref.read(firestoreServiceProvider).joinHouseholdByInviteCode(
            inviteCode: code,
            joiningUid: uid,
          );
      if (household == null) {
        setState(() => _errorMessage = "That code didn't match a household. Double check it?");
        return;
      }
      // Router redirect takes it from here (household is now complete).
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Set up your household')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Start a household', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                const Text("You'll get an invite code to share with your partner."),
                const SizedBox(height: 16),
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Household name'),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _isSubmitting ? null : _create,
                  child: const Text('Create household'),
                ),
                const SizedBox(height: 32),
                const Row(children: [
                  Expanded(child: Divider()),
                  Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('or')),
                  Expanded(child: Divider()),
                ]),
                const SizedBox(height: 32),
                Text('Join your partner', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                const Text('Enter the invite code they sent you.'),
                const SizedBox(height: 16),
                TextField(
                  controller: _joinCodeController,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(labelText: 'Invite code'),
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: _isSubmitting ? null : _join,
                  child: const Text('Join household'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
