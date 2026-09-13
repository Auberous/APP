import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import 'providers/household_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/signup_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'screens/onboarding/budget_setup_screen.dart';
import 'screens/onboarding/create_household_screen.dart';
import 'screens/onboarding/invite_partner_screen.dart';
import 'screens/settings/bank_accounts_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'theme/app_theme.dart';

/// Bridges Riverpod's `ref.listen` to `GoRouter`'s `Listenable`-based
/// `refreshListenable`, so a redirect gets re-evaluated the moment auth,
/// the user doc, or the household doc changes — not just on navigation.
class _RouterRefreshNotifier extends ChangeNotifier {
  void refresh() => notifyListeners();
}

final _routerRefreshProvider = Provider<_RouterRefreshNotifier>((ref) {
  final notifier = _RouterRefreshNotifier();
  ref.listen(authStateProvider, (_, __) => notifier.refresh());
  ref.listen(currentAppUserProvider, (_, __) => notifier.refresh());
  ref.listen(currentHouseholdProvider, (_, __) => notifier.refresh());
  ref.onDispose(notifier.dispose);
  return notifier;
});

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = ref.watch(_routerRefreshProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final authUser = ref.read(authStateProvider).valueOrNull;

      if (authUser == null) {
        final onAuthScreen = location == '/login' || location == '/signup';
        return onAuthScreen ? null : '/login';
      }

      // Signed in, but the `users/{uid}` doc hasn't loaded yet — stay put
      // (splash) rather than bounce to onboarding prematurely.
      final appUserAsync = ref.read(currentAppUserProvider);
      if (!appUserAsync.hasValue) return null;
      final appUser = appUserAsync.value;

      final onOnboardingFlow = location.startsWith('/onboarding') || location.startsWith('/invite');
      if (appUser?.householdId == null) {
        return onOnboardingFlow ? null : '/onboarding';
      }

      final onAuthOrRootScreen =
          location == '/' || location == '/login' || location == '/signup' || location == '/onboarding';
      if (onAuthOrRootScreen) return '/dashboard';

      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const _SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/signup', builder: (context, state) => const SignupScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const CreateHouseholdScreen()),
      GoRoute(
        path: '/invite/:householdId',
        builder: (context, state) => InvitePartnerScreen(householdId: state.pathParameters['householdId']!),
      ),
      GoRoute(
        path: '/onboarding/budget/:householdId',
        builder: (context, state) => BudgetSetupScreen(householdId: state.pathParameters['householdId']!),
      ),
      GoRoute(path: '/dashboard', builder: (context, state) => const DashboardScreen()),
      GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
      GoRoute(path: '/settings/bank-accounts', builder: (context, state) => const BankAccountsScreen()),
    ],
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

class DailySpendApp extends ConsumerWidget {
  const DailySpendApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Daily Spend',
      debugShowCheckedModeBanner: kDebugMode,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: router,
    );
  }
}
