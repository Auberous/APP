import 'package:firebase_auth/firebase_auth.dart' as fb_auth;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/app_user.dart';
import 'service_providers.dart';

/// The Firebase Auth user, or null if signed out. Screens that gate on
/// auth state (the root router redirect, mainly) watch this.
final authStateProvider = StreamProvider<fb_auth.User?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges();
});

/// The corresponding Firestore `users/{uid}` document, which carries the
/// `householdId` the router also needs (to decide: onboarding vs.
/// dashboard). Null while signed out or before the doc has been created.
final currentAppUserProvider = StreamProvider<AppUser?>((ref) {
  final authState = ref.watch(authStateProvider).valueOrNull;
  if (authState == null) return Stream.value(null);
  return ref.watch(firestoreServiceProvider).watchUser(authState.uid);
});
