import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { Household } from './types';

export interface JoinedHousehold {
  householdId: string;
  name: string;
  memberUids: string[];
  createdBy: string;
}

/**
 * The business logic behind the `joinHousehold` callable (see index.ts),
 * split out so it can be unit-tested against the Firestore emulator
 * directly — invoking it through the real callable protocol would mean
 * simulating Cloud Functions' auth-context wire format for no benefit,
 * since none of the logic worth testing here is about that transport.
 *
 * Runs with the Admin SDK (bypasses firestore.rules) because the
 * joining user isn't a household member yet — see the doc comment on
 * `joinHousehold` in index.ts and `firebase/firestore.rules` for why
 * that has to be true.
 */
export async function joinHouseholdCore(uid: string, rawInviteCode: string): Promise<JoinedHousehold> {
  const inviteCode = rawInviteCode.trim().toUpperCase();
  if (!inviteCode) throw new HttpsError('invalid-argument', 'inviteCode is required.');

  const db = getFirestore();
  const query = await db.collection('households').where('pendingInviteCode', '==', inviteCode).limit(1).get();

  if (query.empty) {
    throw new HttpsError('not-found', 'No household is waiting on that invite code.');
  }

  const doc = query.docs[0];

  const updatedHousehold = await db.runTransaction(async (tx) => {
    const snap = await tx.get(doc.ref);
    const household = snap.data() as Household;

    if (!household.pendingInviteCode) {
      // Someone else joined between our query and this transaction.
      throw new HttpsError('failed-precondition', 'That invite code has already been used.');
    }
    if (household.memberUids.includes(uid)) {
      throw new HttpsError('failed-precondition', "You're already a member of this household.");
    }
    // The product is designed around exactly two people; capped here
    // rather than left unbounded, since nothing else in the schema or
    // UI (the dashboard's "You" / partner split, the notification
    // recipient list) is written to handle a third.
    if (household.memberUids.length >= 2) {
      throw new HttpsError('failed-precondition', 'This household already has two members.');
    }

    const memberUids = [...household.memberUids, uid];
    tx.update(doc.ref, { memberUids, pendingInviteCode: null });
    // set+merge, not update: the joining user's `users/{uid}` doc is
    // bootstrapped client-side as a fire-and-forget write on sign-in
    // (see currentAppUserProvider.ensureUserDocExists) rather than
    // awaited before they can reach this screen, so it isn't guaranteed
    // to exist yet by the time this runs — update() would throw
    // NOT_FOUND in that race, where set+merge just creates it.
    tx.set(db.doc(`users/${uid}`), { householdId: doc.id }, { merge: true });

    return { ...household, memberUids, pendingInviteCode: null };
  });

  return {
    householdId: doc.id,
    name: updatedHousehold.name,
    memberUids: updatedHousehold.memberUids,
    createdBy: updatedHousehold.createdBy,
  };
}
