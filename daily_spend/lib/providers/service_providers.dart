import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/auth_service.dart';
import '../services/bank/bank_provider.dart';
import '../services/bank/bank_provider_factory.dart';
import '../services/firestore_service.dart';
import '../services/notification_service.dart';

/// Plain singleton providers for the service layer. Kept as hand-written
/// `Provider`s (not `riverpod_generator` codegen) so this project has no
/// build_runner step to run before it compiles — see the top-level
/// README for why.
final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final firestoreServiceProvider = Provider<FirestoreService>((ref) => FirestoreService());

final notificationServiceProvider = Provider<NotificationService>(
  (ref) => NotificationService(firestoreService: ref.watch(firestoreServiceProvider)),
);

/// Which bank aggregator the app is configured to use. Swap this single
/// provider (e.g. via `overrideWithValue` in a flavor's bootstrap, or a
/// remote config read) to change providers app-wide.
final bankProviderKindProvider = Provider<BankProviderKind>((ref) => BankProviderKind.mock);

final bankProvider = Provider<BankProvider>(
  (ref) => BankProviderFactory.create(ref.watch(bankProviderKindProvider)),
);
