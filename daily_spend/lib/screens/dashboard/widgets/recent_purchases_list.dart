import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../models/spend_transaction.dart';
import '../../../utils/formatters.dart';

class RecentPurchasesList extends StatelessWidget {
  const RecentPurchasesList({
    required this.transactions,
    required this.memberDisplayName,
    super.key,
  });

  final List<SpendTransaction> transactions;

  /// Resolves a `spentByUid` to a short display name ("You" / partner's
  /// name) — kept as a callback so this widget doesn't need to know about
  /// the household/auth providers.
  final String Function(String uid) memberDisplayName;

  @override
  Widget build(BuildContext context) {
    if (transactions.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(child: Text('No purchases yet this cycle.')),
      );
    }

    return Column(
      children: [
        for (final transaction in transactions)
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.shopping_bag_outlined)),
            title: Text(transaction.merchantName),
            subtitle: Text(
              '${memberDisplayName(transaction.spentByUid)} · ${timeago.format(transaction.occurredAt)}',
            ),
            trailing: Text(
              Formatters.signedMoney(-transaction.amountCents),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }
}
