import { strict as assert } from 'assert';
import { createHmac } from 'crypto';

import { verifyHmacSignature } from './webhookSignature';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyHmacSignature', () => {
  const secret = 'test-webhook-secret';
  const body = JSON.stringify({ accountId: 'acct-1', transaction: { id: 'txn-1', amount: '-5.50' } });

  it('accepts a correctly signed payload', () => {
    assert.equal(verifyHmacSignature(body, sign(body, secret), secret), true);
  });

  it('rejects a missing signature header', () => {
    assert.equal(verifyHmacSignature(body, undefined, secret), false);
    assert.equal(verifyHmacSignature(body, null, secret), false);
    assert.equal(verifyHmacSignature(body, '', secret), false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    assert.equal(verifyHmacSignature(body, sign(body, 'wrong-secret'), secret), false);
  });

  it('rejects a signature for a different (e.g. tampered) body', () => {
    const tampered = JSON.stringify({ accountId: 'acct-1', transaction: { id: 'txn-1', amount: '-999999.00' } });
    assert.equal(verifyHmacSignature(tampered, sign(body, secret), secret), false);
  });

  it('rejects when the configured secret is empty — never a wildcard match', () => {
    assert.equal(verifyHmacSignature(body, sign(body, ''), ''), false);
  });

  it('rejects a garbage signature of a different length without throwing', () => {
    assert.equal(verifyHmacSignature(body, 'not-a-real-signature', secret), false);
  });

  it('is insensitive to surrounding whitespace some providers add to the header value', () => {
    assert.equal(verifyHmacSignature(body, `  ${sign(body, secret)}  `, secret), true);
  });

  it('works against a Buffer body identically to the equivalent string', () => {
    const buf = Buffer.from(body, 'utf8');
    assert.equal(verifyHmacSignature(buf, sign(body, secret), secret), true);
  });
});
