import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions/v2';

import { formatMoney } from './formatters';
import { staleTokensToRemove, TokenSendOutcome } from './notificationCleanup';
import { AppUser, Budget, SpendTransaction } from './types';

/**
 * Composes and sends the "a purchase happened" push to both partners, and
 * records it under `households/{householdId}/notifications` for history.
 *
 * Message shape follows the product spec exactly:
 *
 *   ✅ Coffee Club - $5.50
 *   Remaining Today: $94.50
 *   Cycle Remaining: $1,394.50
 *
 * Called from `transactionWebhook.ts` right after the budget increment
 * commits, so the figures shown are always the post-purchase ones.
 */
export async function sendPurchaseNotification(
  householdId: string,
  transactionId: string,
  transaction: SpendTransaction,
  updatedBudget: Budget,
  availableTodayCents: number
): Promise<void> {
  const db = getFirestore();

  const householdSnap = await db.doc(`households/${householdId}`).get();
  const memberUids = (householdSnap.data()?.memberUids as string[] | undefined) ?? [];
  if (memberUids.length === 0) {
    logger.warn(`sendPurchaseNotification: household ${householdId} has no members`);
    return;
  }

  const userSnaps = await Promise.all(memberUids.map((uid) => db.doc(`users/${uid}`).get()));
  const recipientUids: string[] = [];
  const tokens: string[] = [];
  const tokenOwners: string[] = []; // parallel to `tokens`, for mapping FCM's per-token results back to a user doc
  for (const snap of userSnaps) {
    if (!snap.exists) continue;
    const user = snap.data() as AppUser;
    if (user.notificationsEnabled === false) continue;
    if (user.fcmTokens?.length) {
      recipientUids.push(snap.id);
      for (const token of user.fcmTokens) {
        tokens.push(token);
        tokenOwners.push(snap.id);
      }
    }
  }

  const remainingCycleCents = updatedBudget.monthlyBudgetCents - updatedBudget.cycleSpentCents;
  const title = `✅ ${transaction.merchantName} - ${formatMoney(transaction.amountCents, updatedBudget.currency)}`;
  const body =
    `Remaining Today: ${formatMoney(availableTodayCents, updatedBudget.currency)}\n` +
    `Cycle Remaining: ${formatMoney(remainingCycleCents, updatedBudget.currency)}`;

  if (tokens.length > 0) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { transactionId, householdId },
    });
    if (response.failureCount > 0) {
      const outcomes: TokenSendOutcome[] = response.responses.map((r, i) => ({
        ownerUid: tokenOwners[i],
        token: tokens[i],
        success: r.success,
        errorCode: r.error?.code,
      }));
      outcomes.forEach((o, i) => {
        if (!o.success) logger.warn(`FCM send failed for token index ${i}`, response.responses[i].error);
      });

      const stale = staleTokensToRemove(outcomes);
      await Promise.all(
        stale.map((s) =>
          db.doc(`users/${s.ownerUid}`).update({ fcmTokens: FieldValue.arrayRemove(s.token) })
        )
      );
      if (stale.length > 0) {
        logger.info(`sendPurchaseNotification: pruned ${stale.length} stale FCM token(s)`);
      }
    }
  } else {
    logger.info(`sendPurchaseNotification: no eligible recipients for household ${householdId}`);
  }

  await db.collection(`households/${householdId}/notifications`).add({
    transactionId,
    title,
    body,
    sentAt: new Date().toISOString(),
    recipientUids,
  });
}
