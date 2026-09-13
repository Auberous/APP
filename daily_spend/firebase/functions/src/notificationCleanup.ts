/**
 * Deciding which FCM tokens to prune after a send, split out as a pure
 * function so it's testable without touching Firestore or Messaging —
 * see notificationCleanup.test.ts.
 */

/** One token's outcome from an `sendEachForMulticast` call, with the
 *  owning user re-attached (the Admin SDK's response only has indices
 *  lined up against the flat `tokens` array that was sent). */
export interface TokenSendOutcome {
  ownerUid: string;
  token: string;
  success: boolean;
  errorCode?: string;
}

/**
 * FCM error codes that specifically mean "this token will never work
 * again" (uninstalled app, cleared app data, token rotated out from
 * under us) — as opposed to a transient failure (rate limiting, a
 * momentary backend error) that says nothing about the token itself and
 * shouldn't cause it to be removed.
 */
const UNRECOVERABLE_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export interface StaleToken {
  ownerUid: string;
  token: string;
}

/** Picks out exactly the tokens that should be pruned from their owner's
 *  `fcmTokens` array, from a full batch of send outcomes. */
export function staleTokensToRemove(outcomes: TokenSendOutcome[]): StaleToken[] {
  return outcomes
    .filter((o) => !o.success && o.errorCode !== undefined && UNRECOVERABLE_TOKEN_ERROR_CODES.has(o.errorCode))
    .map((o) => ({ ownerUid: o.ownerUid, token: o.token }));
}
