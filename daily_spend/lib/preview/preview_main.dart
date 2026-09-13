import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/app_user.dart';
import '../models/budget.dart';
import '../models/household.dart';
import '../models/spend_transaction.dart';
import '../providers/auth_provider.dart';
import '../providers/budget_provider.dart';
import '../providers/household_provider.dart';
import '../providers/service_providers.dart';
import '../providers/transactions_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/signup_screen.dart';
import '../screens/dashboard/dashboard_screen.dart';
import '../screens/onboarding/budget_setup_screen.dart';
import '../screens/onboarding/create_household_screen.dart';
import '../screens/onboarding/invite_partner_screen.dart';
import '../screens/settings/bank_accounts_screen.dart';
import '../screens/settings/settings_screen.dart';
import '../services/firestore_service.dart';
import '../theme/app_theme.dart';

/// A visual-only harness for looking at the app's screens without a real
/// Firebase project attached — NOT shipped to users, NOT part of the
/// production app (production starts from lib/main.dart). See the
/// top-level README's "Looking at the app without a backend yet".
///
/// Renders the exact same screen widgets used in production
/// (DashboardScreen, SettingsScreen, etc.) fed static sample data via
/// Riverpod overrides, rather than re-implementing any UI — what you see
/// running this is the real app, just with a fake household instead of
/// a connected one.
const String _previewHouseholdId = 'household-demo';
const String _myUid = 'uid-me';
const String _partnerUid = 'uid-partner';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Placeholder options — enough for FirebaseAuth.instance /
  // FirebaseFirestore.instance to construct without throwing (a couple
  // of screens read those services directly for their button actions),
  // but nothing here ever makes a real network call: every provider
  // that would otherwise fetch real data is overridden below.
  await Firebase.initializeApp(
    options: const FirebaseOptions(
      apiKey: 'preview',
      appId: '1:000000000000:web:0000000000000000',
      messagingSenderId: '000000000000',
      projectId: 'daily-spend-preview',
    ),
  );

  final now = DateTime.now();

  const household = Household(
    id: _previewHouseholdId,
    name: 'Alex & Sam',
    memberUids: [_myUid, _partnerUid],
    createdBy: _myUid,
  );

  final budget = Budget(
    monthlyBudgetCents: 300000,
    cycleStartDate: now.subtract(const Duration(days: 10)),
    nextPaydayDate: now.add(const Duration(days: 5)),
    cycleSpentCents: 148230,
  );

  final transactions = [
    SpendTransaction(
      id: 't1',
      householdId: _previewHouseholdId,
      spentByUid: _partnerUid,
      merchantName: 'Coffee Club',
      amountCents: 550,
      occurredAt: now.subtract(const Duration(minutes: 40)),
      bankProvider: 'mock',
      externalId: 't1',
    ),
    SpendTransaction(
      id: 't2',
      householdId: _previewHouseholdId,
      spentByUid: _myUid,
      merchantName: 'Woolworths',
      amountCents: 6420,
      occurredAt: now.subtract(const Duration(hours: 5)),
      bankProvider: 'mock',
      externalId: 't2',
    ),
    SpendTransaction(
      id: 't3',
      householdId: _previewHouseholdId,
      spentByUid: _partnerUid,
      merchantName: 'Uber',
      amountCents: 1830,
      occurredAt: now.subtract(const Duration(days: 1, hours: 2)),
      bankProvider: 'mock',
      externalId: 't3',
    ),
    SpendTransaction(
      id: 't4',
      householdId: _previewHouseholdId,
      spentByUid: _myUid,
      merchantName: 'Netflix',
      amountCents: 2299,
      occurredAt: now.subtract(const Duration(days: 2)),
      bankProvider: 'mock',
      externalId: 't4',
    ),
  ];

  runApp(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) => Stream.value(null)),
        currentAppUserProvider.overrideWith(
          (ref) => Stream.value(const AppUser(
            uid: _myUid,
            email: 'alex@example.com',
            displayName: 'Alex',
            householdId: _previewHouseholdId,
          )),
        ),
        currentHouseholdProvider.overrideWith((ref) => Stream.value(household)),
        currentBudgetProvider.overrideWith((ref) => Stream.value(budget)),
        recentTransactionsProvider.overrideWith((ref) => Stream.value(transactions)),
        householdMemberNamesProvider.overrideWith((ref) async => {_myUid: 'Alex', _partnerUid: 'Sam'}),
        firestoreServiceProvider.overrideWithValue(_PreviewFirestoreService(household)),
      ],
      child: MaterialApp(
        title: 'Daily Spend (Preview)',
        theme: AppTheme.light,
        home: const _PreviewHome(),
      ),
    ),
  );
}

/// Only overrides the one method a screen calls directly, bypassing the
/// higher-level providers already overridden above — see
/// invite_partner_screen.dart, which watches this rather than
/// `currentHouseholdProvider`.
class _PreviewFirestoreService extends FirestoreService {
  _PreviewFirestoreService(this._household);
  final Household _household;

  @override
  Stream<Household?> watchHousehold(String householdId) => Stream.value(_household);
}

class _PreviewHome extends StatelessWidget {
  const _PreviewHome();

  @override
  Widget build(BuildContext context) {
    final screens = <String, WidgetBuilder>{
      'Dashboard': (_) => const DashboardScreen(),
      'Settings': (_) => const SettingsScreen(),
      'Bank accounts': (_) => const BankAccountsScreen(),
      'Log in': (_) => const LoginScreen(),
      'Sign up': (_) => const SignupScreen(),
      'Create / join household': (_) => const CreateHouseholdScreen(),
      'Invite partner': (_) => const InvitePartnerScreen(householdId: _previewHouseholdId),
      'Budget setup (editing existing)': (_) => const BudgetSetupScreen(householdId: _previewHouseholdId),
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Daily Spend — screen preview')),
      body: ListView(
        children: screens.entries
            .map((entry) => ListTile(
                  title: Text(entry.key),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: entry.value)),
                ))
            .toList(),
      ),
    );
  }
}
