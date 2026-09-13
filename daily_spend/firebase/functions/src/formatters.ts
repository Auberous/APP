/** Server-side twin of lib/utils/formatters.dart's `Formatters.money`. */
export function formatMoney(cents: number, currency = 'AUD'): string {
  const format = new Intl.NumberFormat('en-AU', { style: 'currency', currency });
  return format.format(cents / 100);
}
