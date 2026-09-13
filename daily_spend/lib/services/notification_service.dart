import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'firestore_service.dart';

/// Handles the device side of push notifications: requesting permission,
/// registering this device's FCM token against the signed-in user, and
/// showing a local notification when a message arrives in the foreground
/// (FCM only auto-displays notifications while the app is backgrounded).
///
/// The *sending* side — composing "✅ Coffee Club - $5.50 / Remaining
/// Today: $94.50" and delivering it to both partners' devices — lives in
/// `firebase/functions/src/notifications.ts`, triggered off new
/// transaction writes. This class never sends; it only receives and
/// registers.
class NotificationService {
  NotificationService({
    FirebaseMessaging? messaging,
    FirestoreService? firestoreService,
  })  : _messaging = messaging ?? FirebaseMessaging.instance,
        _firestore = firestoreService ?? FirestoreService();

  final FirebaseMessaging _messaging;
  final FirestoreService _firestore;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  Future<void> initialize({required String uid}) async {
    await _messaging.requestPermission(alert: true, badge: true, sound: true);

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    final token = await _messaging.getToken();
    if (token != null) {
      await _firestore.addFcmToken(uid, token);
    }
    // Tokens can rotate (reinstall, app data cleared, etc.) — keep the
    // stored list current for as long as this service is alive.
    _messaging.onTokenRefresh.listen((newToken) {
      _firestore.addFcmToken(uid, newToken);
    });

    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    const androidDetails = AndroidNotificationDetails(
      'daily_spend_purchases',
      'Purchases',
      channelDescription: 'A purchase was made and the budget was updated.',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(android: androidDetails, iOS: DarwinNotificationDetails());

    await _localNotifications.show(
      message.hashCode,
      notification.title,
      notification.body,
      details,
    );
  }
}
