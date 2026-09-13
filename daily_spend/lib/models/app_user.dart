/// A signed-in person. Mirrors `users/{uid}` in Firestore.
class AppUser {
  const AppUser({
    required this.uid,
    required this.email,
    this.displayName,
    this.photoUrl,
    this.householdId,
    this.fcmTokens = const [],
    this.notificationsEnabled = true,
  });

  final String uid;
  final String email;
  final String? displayName;
  final String? photoUrl;

  /// Null until the user has created or joined a household.
  final String? householdId;

  /// One or more device push tokens — a user may have several devices.
  final List<String> fcmTokens;

  /// Settings screen toggle. The `notifications.ts` Cloud Function checks
  /// this per-recipient before sending, so muting is per-person, not
  /// per-household.
  final bool notificationsEnabled;

  factory AppUser.fromJson(String uid, Map<String, dynamic> json) {
    return AppUser(
      uid: uid,
      email: json['email'] as String,
      displayName: json['displayName'] as String?,
      photoUrl: json['photoUrl'] as String?,
      householdId: json['householdId'] as String?,
      fcmTokens: (json['fcmTokens'] as List<dynamic>?)?.cast<String>() ?? const [],
      notificationsEnabled: json['notificationsEnabled'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'email': email,
        'displayName': displayName,
        'photoUrl': photoUrl,
        'householdId': householdId,
        'fcmTokens': fcmTokens,
        'notificationsEnabled': notificationsEnabled,
      };

  AppUser copyWith({
    String? displayName,
    String? photoUrl,
    String? householdId,
    List<String>? fcmTokens,
    bool? notificationsEnabled,
  }) {
    return AppUser(
      uid: uid,
      email: email,
      displayName: displayName ?? this.displayName,
      photoUrl: photoUrl ?? this.photoUrl,
      householdId: householdId ?? this.householdId,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
    );
  }
}
