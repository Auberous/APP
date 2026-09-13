/// Small date helpers so screens don't reach for a full date-math package
/// for two operations.
class AppDateUtils {
  const AppDateUtils._();

  static DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  static int daysBetween(DateTime from, DateTime to) {
    return dateOnly(to).difference(dateOnly(from)).inDays;
  }
}
