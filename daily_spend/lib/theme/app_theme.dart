import 'package:flutter/material.dart';

/// Deliberately restrained: one big number, a status color, and not much
/// else — per spec this should feel like "how much can we spend today?",
/// not financial-management software.
class AppColors {
  const AppColors._();

  static const onTrack = Color(0xFF2E7D32); // green
  static const warning = Color(0xFFE8A33D); // orange
  static const overBudget = Color(0xFFC62828); // red
  static const background = Color(0xFFFAFAF8);
}

class AppTheme {
  const AppTheme._();

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      colorSchemeSeed: AppColors.onTrack,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.background,
    );
    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        // The "Available Today" figure — the one thing this app is for.
        displayLarge: base.textTheme.displayLarge?.copyWith(
          fontWeight: FontWeight.w700,
          fontSize: 72,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: Colors.black87,
        elevation: 0,
      ),
    );
  }

  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: AppColors.onTrack,
      brightness: Brightness.dark,
    );
  }
}
