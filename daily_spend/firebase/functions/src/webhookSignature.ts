import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generic HMAC-SHA256 webhook signature verification — the shape shared
 * by most providers that sign webhooks (Stripe, GitHub, and, per their
 * published integration docs, Basiq and Adatree): the provider computes
 * HMAC-SHA256(secret, rawRequestBody) and sends the hex-encoded digest
 * in a header; the receiver recomputes the same HMAC over the exact
 * bytes it received and compares in constant time, so a network
 * observer (or a timing side-channel) can't forge a valid signature.
 *
 * TODO(basiq/adatree): this is written against the *common* shape, not
 * a confirmed spec for either provider — confirm the actual header
 * name, digest encoding (hex vs. base64), and whether the signed
 * payload is the raw body as-is or some derived string (some providers
 * sign `${timestamp}.${body}` to also guard against replay) against
 * each provider's current webhook documentation before relying on this
 * in production. See index.ts's basiqWebhook/adatreeWebhook for where
 * the header name is plugged in.
 *
 * Deliberately takes the raw bytes, not a parsed object: computing the
 * HMAC over `JSON.stringify(parsedBody)` would silently fail the moment
 * key ordering or whitespace differs from what the provider originally
 * sent, even though the payload is semantically identical — the
 * signature must be verified against the exact bytes that were signed.
 */
export function verifyHmacSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  if (!secret) return false; // an unconfigured secret must never verify as "valid"

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const given = Buffer.from(signatureHeader.trim(), 'utf8');

  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, and a length mismatch is itself not a secret worth leaking
  // via a thrown vs. returned distinction — so check it explicitly.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
