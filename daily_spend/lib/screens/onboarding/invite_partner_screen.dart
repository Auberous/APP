import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/service_providers.dart';

/// Shown right after creating a household: display the invite code and
/// wait for the partner to join. The router redirect in app.dart watches
/// `Household.isComplete` and moves on to budget setup by itself once
/// the second member joins — this screen just needs a manual "Continue"
/// for the case where budget setup happens before the invite is used.
class InvitePartnerScreen extends ConsumerWidget {
  const InvitePartnerScreen({required this.householdId, super.key});

  final String householdId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final householdStream = ref.watch(firestoreServiceProvider).watchHousehold(householdId);

    return Scaffold(
      appBar: AppBar(title: const Text('Invite your partner')),
      body: StreamBuilder(
        stream: householdStream,
        builder: (context, snapshot) {
          final household = snapshot.data;
          final code = household?.pendingInviteCode;

          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Share this code with your partner:'),
                    const SizedBox(height: 16),
                    if (code != null)
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                code,
                                style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold, letterSpacing: 4),
                              ),
                              IconButton(
                                icon: const Icon(Icons.copy),
                                onPressed: () => Clipboard.setData(ClipboardData(text: code)),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text("Your partner has already joined — you're all set!"),
                      ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () => context.go('/onboarding/budget/$householdId'),
                      child: const Text('Continue to budget setup'),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
