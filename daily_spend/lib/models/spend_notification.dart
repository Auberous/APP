/// A record of a push notification sent to the household, kept mostly for
/// the in-app notification history / debugging. Mirrors
/// `households/{householdId}/notifications/{notificationId}`.
class SpendNotification {
  const SpendNotification({
    required this.id,
    required this.transactionId,
    required this.title,
    required this.body,
    required this.sentAt,
    required this.recipientUids,
  });

  final String id;
  final String transactionId;
  final String title;
  final String body;
  final DateTime sentAt;
  final List<String> recipientUids;

  factory SpendNotification.fromJson(String id, Map<String, dynamic> json) {
    return SpendNotification(
      id: id,
      transactionId: json['transactionId'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      sentAt: DateTime.parse(json['sentAt'] as String),
      recipientUids: (json['recipientUids'] as List<dynamic>).cast<String>(),
    );
  }

  Map<String, dynamic> toJson() => {
        'transactionId': transactionId,
        'title': title,
        'body': body,
        'sentAt': sentAt.toIso8601String(),
        'recipientUids': recipientUids,
      };
}
