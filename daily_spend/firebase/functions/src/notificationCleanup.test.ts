import { strict as assert } from 'assert';

import { staleTokensToRemove, TokenSendOutcome } from './notificationCleanup';

describe('staleTokensToRemove', () => {
  it('returns nothing when every send succeeded', () => {
    const outcomes: TokenSendOutcome[] = [
      { ownerUid: 'uid-a', token: 't1', success: true },
      { ownerUid: 'uid-b', token: 't2', success: true },
    ];
    assert.deepEqual(staleTokensToRemove(outcomes), []);
  });

  it('flags a token that is no longer registered', () => {
    const outcomes: TokenSendOutcome[] = [
      { ownerUid: 'uid-a', token: 't1', success: false, errorCode: 'messaging/registration-token-not-registered' },
    ];
    assert.deepEqual(staleTokensToRemove(outcomes), [{ ownerUid: 'uid-a', token: 't1' }]);
  });

  it('flags an invalid registration token', () => {
    const outcomes: TokenSendOutcome[] = [
      { ownerUid: 'uid-a', token: 't1', success: false, errorCode: 'messaging/invalid-registration-token' },
    ];
    assert.deepEqual(staleTokensToRemove(outcomes), [{ ownerUid: 'uid-a', token: 't1' }]);
  });

  it('does NOT flag a transient failure — the token itself may still be good', () => {
    const outcomes: TokenSendOutcome[] = [
      { ownerUid: 'uid-a', token: 't1', success: false, errorCode: 'messaging/internal-error' },
      { ownerUid: 'uid-b', token: 't2', success: false, errorCode: 'messaging/quota-exceeded' },
      { ownerUid: 'uid-c', token: 't3', success: false }, // no error code at all
    ];
    assert.deepEqual(staleTokensToRemove(outcomes), []);
  });

  it('picks out only the stale tokens from a mixed batch, preserving owner attribution', () => {
    const outcomes: TokenSendOutcome[] = [
      { ownerUid: 'uid-a', token: 'good-1', success: true },
      { ownerUid: 'uid-a', token: 'stale-1', success: false, errorCode: 'messaging/registration-token-not-registered' },
      { ownerUid: 'uid-b', token: 'transient-1', success: false, errorCode: 'messaging/internal-error' },
      { ownerUid: 'uid-b', token: 'stale-2', success: false, errorCode: 'messaging/invalid-registration-token' },
    ];
    assert.deepEqual(staleTokensToRemove(outcomes), [
      { ownerUid: 'uid-a', token: 'stale-1' },
      { ownerUid: 'uid-b', token: 'stale-2' },
    ]);
  });
});
