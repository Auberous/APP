import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { recordTransactionAndNotify } from './transactionWebhook';

const DEMO_MERCHANTS = ['Coffee Club', 'Woolworths', 'Uber', 'Bunnings', 'Netflix', 'Local Cafe'];

export interface SimulateMockPurchaseInput {
  merchantName?: string;
  amountCents?: number;
}

/**
 * Demo/dev convenience: exercises the exact real ingestion pipeline
 * (`recordTransactionAndNotify` — the same function `basiqWebhook`/
 * `adatreeWebhook` call) without a real linked bank account, so a fresh
 * deploy is actually demoable end-to-end (dashboard update + push
 * notification) before any Open Banking integration is wired up.
 *
 * Deliberately an authenticated *callable*, not a webhook — there's no
 * external party to verify an HMAC signature against here, the caller's
 * own Firebase Auth token is the trust boundary.
 */
export async function simulateMockPurchaseCore(
  uid: string,
  input: SimulateMockPurchaseInput
): Promise<{ recorded: boolean }> {
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const householdId = userSnap.data()?.householdId as string | undefined;
  if (!householdId) {
    throw new HttpsError('failed-precondition', 'Join or create a household first.');
  }

  const merchantName = input.merchantName?.trim() || DEMO_MERCHANTS[Math.floor(Math.random() * DEMO_MERCHANTS.length)];
  const amountCents = input.amountCents ?? 300 + Math.floor(Math.random() * 6000);

  return recordTransactionAndNotify(householdId, uid, {
    provider: 'mock',
    externalAccountId: 'mock-demo-account',
    externalId: `mock-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    merchantName,
    amountCents,
    occurredAt: new Date().toISOString(),
  });
}
