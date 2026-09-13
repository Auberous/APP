/// The household's current spending cycle. Mirrors
/// `households/{householdId}/budget/current`.
///
/// Money is stored in minor units (cents) everywhere to avoid floating
/// point drift — see `lib/utils/formatters.dart` for display conversion.
class Budget {
  const Budget({
    required this.monthlyBudgetCents,
    required this.cycleStartDate,
    required this.nextPaydayDate,
    required this.cycleSpentCents,
    this.currency = 'AUD',
  });

  /// The full discretionary amount for one pay cycle, in cents.
  final int monthlyBudgetCents;

  /// When the current cycle began (usually the last payday).
  final DateTime cycleStartDate;

  /// When the current cycle ends and the budget resets.
  final DateTime nextPaydayDate;

  /// Sum of every transaction recorded so far this cycle, in cents.
  final int cycleSpentCents;

  /// ISO 4217 currency code. Defaults to AUD (MVP launches in Australia).
  final String currency;

  int get remainingCycleCents => monthlyBudgetCents - cycleSpentCents;

  /// Whole days left in the cycle, counting today. Never less than 1 so
  /// division never blows up on payday itself.
  int daysRemaining({DateTime? now}) {
    final today = _dateOnly(now ?? DateTime.now());
    final payday = _dateOnly(nextPaydayDate);
    final diff = payday.difference(today).inDays;
    return diff < 1 ? 1 : diff;
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  factory Budget.fromJson(Map<String, dynamic> json) {
    return Budget(
      monthlyBudgetCents: json['monthlyBudgetCents'] as int,
      cycleStartDate: DateTime.parse(json['cycleStartDate'] as String),
      nextPaydayDate: DateTime.parse(json['nextPaydayDate'] as String),
      cycleSpentCents: json['cycleSpentCents'] as int? ?? 0,
      currency: json['currency'] as String? ?? 'AUD',
    );
  }

  Map<String, dynamic> toJson() => {
        'monthlyBudgetCents': monthlyBudgetCents,
        'cycleStartDate': cycleStartDate.toIso8601String(),
        'nextPaydayDate': nextPaydayDate.toIso8601String(),
        'cycleSpentCents': cycleSpentCents,
        'currency': currency,
      };

  Budget copyWith({
    int? monthlyBudgetCents,
    DateTime? cycleStartDate,
    DateTime? nextPaydayDate,
    int? cycleSpentCents,
    String? currency,
  }) {
    return Budget(
      monthlyBudgetCents: monthlyBudgetCents ?? this.monthlyBudgetCents,
      cycleStartDate: cycleStartDate ?? this.cycleStartDate,
      nextPaydayDate: nextPaydayDate ?? this.nextPaydayDate,
      cycleSpentCents: cycleSpentCents ?? this.cycleSpentCents,
      currency: currency ?? this.currency,
    );
  }
}
