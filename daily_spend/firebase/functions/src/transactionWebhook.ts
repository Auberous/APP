import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { sendPurchaseNotification } from './notifications';
import { availableTodayCents } from './budgetCalculator';
import { Budget, LinkedAccount, SpendTransaction } from './types';

export interface IncomingPurchase {
  provider: 'basiq' | 'adatree' | 'mock';
  externalAccountId: string;
  externalId: string;
  merchantName: string;
  amountCents: number;
  occurredAt: string; // ISO datetime
  rawCategory?: string | null;
}

/** Looks up which household + member a provider's account ID belongs to. */
export async function findLinkedAccount(
  provider: string,
  externalAccountId: string
): Promise<{ householdId: string; account: LinkedAccount } | null> {
  const db = getFirestore();
  const query = await db
    .collectionGroup('linkedAccounts')
    .where('provider', '==', provider)
    .where('externalAccountId', '==', externalAccountId)
    .limit(1)
    .get();

  if (query.empty) return null;

  const doc = query.docs[0];
  // households/{householdId}/linkedAccounts/{accountDocId}
  const householdId = doc.ref.parent.parent?.id;
  if (!householdId) return null;

  return { householdId, account: doc.data() as LinkedAccount };
}

/**
 * The real-time flow's core step: given a purchase that's already been
 * attributed to a household member, atomically (a) records the
 * transaction, (b) rolls it into the household's current-cycle spend,
 * then (c) fires the push notification to both partners.
 *
 * Idempotent against webhook retries and backfills: the transaction
 * document ID is deterministic (`${provider}_${externalId}`), and a
 * create-only Firestore transaction means a redelivered webhook for the
 * same purchase is a silent no-op rather than double-counted spend.
 *
 * `notify` defaults to the real `sendPurchaseNotification` (which calls
 * live FCM) and is only ever overridden in tests — see
 * `transactionWebhook.test.ts`, which runs the Firestore transaction
 * logic above against the emulator but stubs this out rather than
 * sending real push notifications from a test run.
 */
export async function recordTransactionAndNotify(
  householdId: string,
  spentByUid: string,
  purchase: IncomingPurchase,
  notify: typeof sendPurchaseNotification = sendPurchaseNotification
): Promise<{ recorded: boolean }> {
  const db = getFirestore();
  const docId = `${purchase.provider}_${purchase.externalId}`;
  const txnRef = db.doc(`households/${householdId}/transactions/${docId}`);
  const budgetRef = db.doc(`households/${householdId}/budget/current`);

  const result = await db.runTransaction(async (tx) => {
    const [existingTxnSnap, budgetSnap] = await Promise.all([tx.get(txnRef), tx.get(budgetRef)]);

    if (existingTxnSnap.exists) {
      return { recorded: false, updatedBudget: null as Budget | null };
    }

    const transaction: SpendTransaction = {
      householdId,
      spentByUid,
      merchantName: purchase.merchantName,
      amountCents: purchase.amountCents,
      occurredAt: purchase.occurredAt,
      bankProvider: purchase.provider === 'mock' ? 'mock' : purchase.provider,
      externalId: purchase.externalId,
      rawCategory: purchase.rawCategory ?? null,
      appliedToBudget: budgetSnap.exists,
    };
    tx.set(txnRef, transaction);

    let updatedBudget: Budget | null = null;
    if (budgetSnap.exists) {
      const budget = budgetSnap.data() as Budget;
      updatedBudget = { ...budget, cycleSpentCents: budget.cycleSpentCents + purchase.amountCents };
      tx.update(budgetRef, { cycleSpentCents: updatedBudget.cycleSpentCents });
    } else {
      logger.warn(`recordTransactionAndNotify: household ${householdId} has no budget yet — spend not applied`);
    }

    return { recorded: true, updatedBudget };
  });

  if (result.recorded && result.updatedBudget) {
    const transactionForNotification: SpendTransaction = {
      householdId,
      spentByUid,
      merchantName: purchase.merchantName,
      amountCents: purchase.amountCents,
      occurredAt: purchase.occurredAt,
      bankProvider: purchase.provider,
      externalId: purchase.externalId,
      rawCategory: purchase.rawCategory ?? null,
    };
    await notify(
      householdId,
      docId,
      transactionForNotification,
      result.updatedBudget,
      availableTodayCents(result.updatedBudget)
    );
  } else if (!result.recorded) {
    logger.info(`recordTransactionAndNotify: duplicate delivery for ${docId}, ignored`);
  }

  return { recorded: result.recorded };
}

/** Firestore write timestamp helper — kept here since it's only used by
 *  the manual-entry callable, not the webhook path (which stores the
 *  bank's own `occurredAt`). */
export function nowIso(): string {
  return Timestamp.now().toDate().toISOString();
}
