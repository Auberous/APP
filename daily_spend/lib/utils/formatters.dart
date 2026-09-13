import 'package:intl/intl.dart';

/// Money is stored in cents everywhere (see `models/budget.dart`); these
/// helpers are the only place that should format it for display.
class Formatters {
  const Formatters._();

  static String money(int cents, {String currency = 'AUD'}) {
    final format = NumberFormat.simpleCurrency(name: currency);
    return format.format(cents / 100);
  }

  /// Same as [money] but always shows a sign, for notification bodies like
  /// "-$5.50" next to "Remaining Today: $94.50".
  static String signedMoney(int cents, {String currency = 'AUD'}) {
    final sign = cents < 0 ? '-' : '';
    return '$sign${money(cents.abs(), currency: currency)}';
  }
}
