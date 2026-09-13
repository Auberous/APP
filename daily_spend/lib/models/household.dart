/// A two-person (or more, though the MVP assumes two) shared household.
/// Mirrors `households/{householdId}`.
class Household {
  const Household({
    required this.id,
    required this.name,
    required this.memberUids,
    required this.createdBy,
    this.pendingInviteCode,
  });

  final String id;
  final String name;
  final List<String> memberUids;
  final String createdBy;

  /// A short code shared out-of-band (link/text) so a partner can join.
  /// Cleared once the second member joins.
  final String? pendingInviteCode;

  factory Household.fromJson(String id, Map<String, dynamic> json) {
    return Household(
      id: id,
      name: json['name'] as String,
      memberUids: (json['memberUids'] as List<dynamic>).cast<String>(),
      createdBy: json['createdBy'] as String,
      pendingInviteCode: json['pendingInviteCode'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'memberUids': memberUids,
        'createdBy': createdBy,
        'pendingInviteCode': pendingInviteCode,
      };

  bool get isComplete => memberUids.length >= 2;
}
