import { strict as assert } from 'assert';

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { simulateMockPurchaseCore } from './simulateMockPurchase';
import { ensureTestAppInitialized } from './testSupport/emulatorApp';

describe('simulateMockPurchaseCore (Firestore emulator)', function () {
  this.timeout(10000);

  before(() => {
    ensureTestAppInitialized();
  });

  const db = () => getFirestore();

  it('records a purchase against the caller\'s own household', async () => {
    const householdId = 'household-simulate';
    const uid = 'uid-simulate';

    await db().doc(`households/${householdId}`).set({
      name: 'Test household',
      memberUids: [uid],
      createdBy: uid,
      pendingInviteCode: null,
    });
    await db().doc(`households/${householdId}/budget/current`).set({
      monthlyBudgetCents: 300000,
      cycleStartDate: '2026-01-01',
      nextPaydayDate: '2026-01-16',
      cycleSpentCents: 0,
      currency: 'AUD',
    });
    await db().doc(`users/${uid}`).set({ email: 'demo@example.com', householdId });

    const result = await simulateMockPurchaseCore(uid, { merchantName: 'Test Cafe', amountCents: 1234 });

    assert.equal(result.recorded, true);
    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    assert.equal(budgetSnap.data()?.cycleSpentCents, 1234);
  });

  it('picks a random merchant/amount when none is given', async () => {
    const householdId = 'household-simulate-random';
    const uid = 'uid-simulate-random';

    await db().doc(`households/${householdId}`).set({
      name: 'Test household',
      memberUids: [uid],
      createdBy: uid,
      pendingInviteCode: null,
    });
    await db().doc(`households/${householdId}/budget/current`).set({
      monthlyBudgetCents: 300000,
      cycleStartDate: '2026-01-01',
      nextPaydayDate: '2026-01-16',
      cycleSpentCents: 0,
      currency: 'AUD',
    });
    await db().doc(`users/${uid}`).set({ email: 'demo2@example.com', householdId });

    const result = await simulateMockPurchaseCore(uid, {});
    assert.equal(result.recorded, true);

    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    const spent = budgetSnap.data()?.cycleSpentCents as number;
    assert.ok(spent >= 300 && spent <= 6300, `expected a plausible random amount, got ${spent}`);
  });

  it('rejects a caller who has not joined a household yet', async () => {
    const uid = 'uid-no-household';
    await db().doc(`users/${uid}`).set({ email: 'nohousehold@example.com' });

    try {
      await simulateMockPurchaseCore(uid, {});
      assert.fail('expected an HttpsError');
    } catch (err) {
      assert.ok(err instanceof HttpsError);
      assert.equal((err as HttpsError).code, 'failed-precondition');
    }
  });

  it('is idempotent-safe even if called twice quickly (each call is its own distinct purchase)', async () => {
    // Sanity check that two simulated purchases don't collide on the
    // same idempotency key (transactionWebhook.ts derives the doc ID
    // from provider+externalId, and this function generates a fresh
    // externalId per call) — unlike a real webhook redelivery, these
    // are meant to both apply.
    const householdId = 'household-simulate-twice';
    const uid = 'uid-simulate-twice';

    await db().doc(`households/${householdId}`).set({
      name: 'Test household',
      memberUids: [uid],
      createdBy: uid,
      pendingInviteCode: null,
    });
    await db().doc(`households/${householdId}/budget/current`).set({
      monthlyBudgetCents: 300000,
      cycleStartDate: '2026-01-01',
      nextPaydayDate: '2026-01-16',
      cycleSpentCents: 0,
      currency: 'AUD',
    });
    await db().doc(`users/${uid}`).set({ email: 'twice@example.com', householdId });

    await simulateMockPurchaseCore(uid, { amountCents: 500 });
    await simulateMockPurchaseCore(uid, { amountCents: 700 });

    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    assert.equal(budgetSnap.data()?.cycleSpentCents, 1200);
  });
});
