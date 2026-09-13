import { strict as assert } from 'assert';

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { joinHouseholdCore } from './joinHousehold';
import { ensureTestAppInitialized } from './testSupport/emulatorApp';

describe('joinHouseholdCore (Firestore emulator)', function () {
  this.timeout(10000);

  before(() => {
    ensureTestAppInitialized();
  });

  const db = () => getFirestore();

  async function seedHousehold(id: string, overrides: Record<string, unknown> = {}) {
    await db()
      .doc(`households/${id}`)
      .set({
        name: 'Test household',
        memberUids: ['uid-creator'],
        createdBy: 'uid-creator',
        pendingInviteCode: 'ABC123',
        ...overrides,
      });
  }

  async function expectHttpsError(promise: Promise<unknown>, code: string) {
    try {
      await promise;
      assert.fail(`expected an HttpsError with code "${code}", but it resolved`);
    } catch (err) {
      assert.ok(err instanceof HttpsError, `expected an HttpsError, got ${err}`);
      assert.equal((err as HttpsError).code, code);
    }
  }

  it('joins the waiting household and links the user doc', async () => {
    const householdId = 'household-join-success';
    await seedHousehold(householdId);

    const result = await joinHouseholdCore('uid-partner', 'abc123'); // lowercase/whitespace-tolerant
    assert.equal(result.householdId, householdId);
    assert.deepEqual(result.memberUids, ['uid-creator', 'uid-partner']);

    const householdSnap = await db().doc(`households/${householdId}`).get();
    assert.equal(householdSnap.data()?.pendingInviteCode, null);

    const userSnap = await db().doc('users/uid-partner').get();
    assert.equal(userSnap.data()?.householdId, householdId);
  });

  it('rejects an unknown invite code as not-found', async () => {
    await expectHttpsError(joinHouseholdCore('uid-x', 'NOSUCHCODE'), 'not-found');
  });

  it('rejects a code that has already been used', async () => {
    const householdId = 'household-already-used';
    await seedHousehold(householdId, { pendingInviteCode: 'USEDCODE' });

    // First use succeeds and clears pendingInviteCode...
    await joinHouseholdCore('uid-second', 'USEDCODE');
    // ...so a second attempt with the same code finds no waiting
    // household at all, same as an unknown code.
    await expectHttpsError(joinHouseholdCore('uid-third', 'USEDCODE'), 'not-found');
  });

  it('rejects joining a household you are already a member of', async () => {
    const householdId = 'household-already-member';
    await seedHousehold(householdId, { memberUids: ['uid-creator'], pendingInviteCode: 'DUPCODE' });

    await expectHttpsError(joinHouseholdCore('uid-creator', 'DUPCODE'), 'failed-precondition');

    const householdSnap = await db().doc(`households/${householdId}`).get();
    // Rejected before anything was touched — the code is still pending.
    assert.equal(householdSnap.data()?.pendingInviteCode, 'DUPCODE');
  });

  it('rejects a third member — household is capped at two', async () => {
    const householdId = 'household-at-cap';
    await seedHousehold(householdId, { memberUids: ['uid-a', 'uid-b'], pendingInviteCode: 'FULLCODE' });
    await expectHttpsError(joinHouseholdCore('uid-c', 'FULLCODE'), 'failed-precondition');

    const householdSnap = await db().doc(`households/${householdId}`).get();
    assert.deepEqual(householdSnap.data()?.memberUids, ['uid-a', 'uid-b']);
  });
});
