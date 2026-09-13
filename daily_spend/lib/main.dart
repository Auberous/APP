import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // No firebase_options.dart is checked in — this project isn't attached
  // to a real Firebase project yet. Run `flutterfire configure` once one
  // exists, then switch this to
  // `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)`.
  // Until then this relies on native config files
  // (android/app/google-services.json, ios/Runner/GoogleService-Info.plist)
  // being present, which is enough for Android/iOS but not Flutter web.
  // See daily_spend/README.md → "Getting this running for real".
  await Firebase.initializeApp();

  runApp(const ProviderScope(child: DailySpendApp()));
}
