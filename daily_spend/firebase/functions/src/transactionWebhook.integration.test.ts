import { strict as assert } from 'assert';

import { getFirestore } from 'firebase-admin/firestore';
import * as sinon from 'sinon';

import { ensureTestAppInitialized } from './testSupport/emulatorApp';
import { Budget } from './types';
import { IncomingPurchase, recordTransactionAndNotify } from './transactionWebhook';

/**
 * Runs against a real Firestore emulator (see the `test:integration` npm
 * script, which wraps this in `firebase emulators:exec`) rather than a
 * hand-rolled fake — the thing under test is a multi-document Firestore
 * transaction, and a fake Firestore client is exactly the kind of thing
 * that quietly stops matching real transaction semantics over time.
 *
 * `recordTransactionAndNotify`'s FCM step is stubbed via its `notify`
 * parameter (see transactionWebhook.ts) rather than mocked at the module
 * level — there's no messaging emulator, and this suite cares about the
 * Firestore side only.
 */
describe('recordTransactionAndNotify (Firestore emulator)', function () {
  this.timeout(10000);

  before(() => {
    ensureTestAppInitialized();
  });

  const db = () => getFirestore();

  async function seedHousehold(householdId: string, budget?: Partial<Budget>) {
    await db().doc(`households/${householdId}`).set({
      name: 'Test household',
      memberUids: ['uid-a', 'uid-b'],
      createdBy: 'uid-a',
      pendingInviteCode: null,
    });
    if (budget) {
      await db()
        .doc(`households/${householdId}/budget/current`)
        .set({
          monthlyBudgetCents: 300000,
          cycleStartDate: '2026-01-01',
          nextPaydayDate: '2026-01-16',
          cycleSpentCents: 0,
          currency: 'AUD',
          ...budget,
        });
    }
  }

  function makePurchase(overrides: Partial<IncomingPurchase> = {}): IncomingPurchase {
    return {
      provider: 'mock',
      externalAccountId: 'acct-1',
      externalId: 'txn-1',
      merchantName: 'Coffee Club',
      amountCents: 550,
      occurredAt: '2026-01-02T09:00:00.000Z',
      ...overrides,
    };
  }

  it('records the transaction and increments the budget on first delivery', async () => {
    const householdId = 'household-first-delivery';
    await seedHousehold(householdId, { cycleSpentCents: 150000 });
    const notify = sinon.fake.resolves(undefined);

    const result = await recordTransactionAndNotify(householdId, 'uid-a', makePurchase(), notify);

    assert.equal(result.recorded, true);
    sinon.assert.calledOnce(notify);

    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    assert.equal(budgetSnap.data()?.cycleSpentCents, 150550);

    const txnSnap = await db().doc(`households/${householdId}/transactions/mock_txn-1`).get();
    assert.equal(txnSnap.exists, true);
    assert.equal(txnSnap.data()?.appliedToBudget, true);
  });

  it('is idempotent: a redelivered webhook does not double-count spend or re-notify', async () => {
    const householdId = 'household-redelivery';
    await seedHousehold(householdId, { cycleSpentCents: 150000 });
    const notify = sinon.fake.resolves(undefined);
    const purchase = makePurchase();

    const first = await recordTransactionAndNotify(householdId, 'uid-a', purchase, notify);
    const second = await recordTransactionAndNotify(householdId, 'uid-a', purchase, notify);

    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    sinon.assert.calledOnce(notify); // not called again for the duplicate

    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    // 150000 + 550 once, NOT twice.
    assert.equal(budgetSnap.data()?.cycleSpentCents, 150550);
  });

  it('two different purchases both apply (sanity check against a too-broad idempotency key)', async () => {
    const householdId = 'household-two-purchases';
    await seedHousehold(householdId, { cycleSpentCents: 0 });
    const notify = sinon.fake.resolves(undefined);

    await recordTransactionAndNotify(householdId, 'uid-a', makePurchase({ externalId: 'txn-a', amountCents: 500 }), notify);
    await recordTransactionAndNotify(householdId, 'uid-a', makePurchase({ externalId: 'txn-b', amountCents: 700 }), notify);

    sinon.assert.calledTwice(notify);
    const budgetSnap = await db().doc(`households/${householdId}/budget/current`).get();
    assert.equal(budgetSnap.data()?.cycleSpentCents, 1200);
  });

  it('records the purchase but skips the budget increment and notification when no budget exists yet', async () => {
    const householdId = 'household-no-budget';
    await seedHousehold(householdId); // no budget/current doc
    const notify = sinon.fake.resolves(undefined);

    const result = await recordTransactionAndNotify(householdId, 'uid-a', makePurchase(), notify);

    assert.equal(result.recorded, true);
    sinon.assert.notCalled(notify);

    const txnSnap = await db().doc(`households/${householdId}/transactions/mock_txn-1`).get();
    assert.equal(txnSnap.data()?.appliedToBudget, false);
  });
});
