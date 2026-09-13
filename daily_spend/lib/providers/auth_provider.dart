import 'dart:async';

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

  final firestoreService = ref.watch(firestoreServiceProvider);
  // Google/Apple sign-in hand back an already-authenticated user with no
  // separate "create account" step of their own (unlike email/password,
  // which creates its doc explicitly in SignupScreen) — without this,
  // the very first Google/Apple sign-in would have no `users/{uid}` doc
  // for createHousehold's later `.update()` call to find. Fire-and-forget
  // is fine: it's a merge-only write (see ensureUserDocExists), and
  // watchUser's snapshot listener below picks up the result as soon as
  // it lands.
  unawaited(firestoreService.ensureUserDocExists(
    uid: authState.uid,
    email: authState.email,
    displayName: authState.displayName,
    photoUrl: authState.photoURL,
  ));

  return firestoreService.watchUser(authState.uid);
});
