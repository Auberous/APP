import { initializeApp } from 'firebase-admin/app';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';

import { joinHouseholdCore } from './joinHousehold';
import { simulateMockPurchaseCore } from './simulateMockPurchase';
import { findLinkedAccount, recordTransactionAndNotify, IncomingPurchase } from './transactionWebhook';
import { verifyHmacSignature } from './webhookSignature';

initializeApp();

// ---------------------------------------------------------------------
// Household invites
// ---------------------------------------------------------------------

/**
 * Joins the calling user to the household waiting on `inviteCode`. Runs
 * as a callable (Admin SDK, bypasses firestore.rules) because the
 * joining user isn't a household member yet and so can't be granted
 * direct read/write access to look the household up themselves without
 * exposing every household to an unauthenticated-into-it query — see
 * `firebase/firestore.rules` and `docs/FIRESTORE_SCHEMA.md`. The actual
 * logic lives in `joinHouseholdCore` (joinHousehold.ts) so it can be
 * unit-tested against the Firestore emulator without going through the
 * callable wire protocol.
 */
export const joinHousehold = onCall<{ inviteCode: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!request.data.inviteCode) throw new HttpsError('invalid-argument', 'inviteCode is required.');

  return joinHouseholdCore(uid, request.data.inviteCode);
});

// ---------------------------------------------------------------------
// Demo convenience — see simulateMockPurchase.ts's doc comment.
// ---------------------------------------------------------------------

export const simulateMockPurchase = onCall<{ merchantName?: string; amountCents?: number }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return simulateMockPurchaseCore(uid, request.data ?? {});
});

// ---------------------------------------------------------------------
// Bank webhooks — the real-time ingestion path
// ---------------------------------------------------------------------

const BASIQ_WEBHOOK_SECRET = defineSecret('BASIQ_WEBHOOK_SECRET');
const ADATREE_WEBHOOK_SECRET = defineSecret('ADATREE_WEBHOOK_SECRET');

/**
 * Basiq's webhook delivery for a new transaction. The exact payload
 * shape below is illustrative — verify it against Basiq's current
 * webhook documentation before going live, and configure the matching
 * webhook secret in the Basiq dashboard.
 *
 * TODO(basiq): `X-Basiq-Signature` below is a placeholder header name —
 * confirm the actual header Basiq sends (and its digest encoding) in
 * their current webhook docs; `verifyHmacSignature` implements the
 * verification mechanics generically, but the header name is the one
 * piece specific to Basiq that still needs confirming against a real
 * account before this can be trusted in production.
 */
export const basiqWebhook = onRequest({ secrets: [BASIQ_WEBHOOK_SECRET] }, async (req, res) => {
  if (!verifyHmacSignature(req.rawBody, req.get('X-Basiq-Signature'), BASIQ_WEBHOOK_SECRET.value())) {
    logger.warn('basiqWebhook: rejected request with missing or invalid signature');
    res.status(401).send('invalid signature');
    return;
  }

  try {
    const body = req.body as {
      accountId: string;
      transaction: { id: string; description: string; amount: string; postDate: string; class?: string };
    };

    const linked = await findLinkedAccount('basiq', body.accountId);
    if (!linked) {
      logger.warn(`basiqWebhook: no linkedAccount found for Basiq account ${body.accountId}`);
      res.status(202).send('ignored: unrecognized account');
      return;
    }

    // Basiq reports amounts as a signed decimal string, negative for
    // outgoing spend — this app only tracks spend, so a positive
    // (incoming) amount is deliberately ignored rather than recorded as
    // a negative purchase.
    const amountDecimal = parseFloat(body.transaction.amount);
    if (amountDecimal >= 0) {
      res.status(202).send('ignored: not an outgoing transaction');
      return;
    }

    const purchase: IncomingPurchase = {
      provider: 'basiq',
      externalAccountId: body.accountId,
      externalId: body.transaction.id,
      merchantName: body.transaction.description,
      amountCents: Math.round(Math.abs(amountDecimal) * 100),
      occurredAt: new Date(body.transaction.postDate).toISOString(),
      rawCategory: body.transaction.class ?? null,
    };

    await recordTransactionAndNotify(linked.householdId, linked.account.linkedByUid, purchase);
    res.status(200).send('ok');
  } catch (err) {
    logger.error('basiqWebhook failed', err);
    res.status(500).send('internal error');
  }
});

/**
 * Adatree's webhook delivery for a new transaction. Same caveats as
 * `basiqWebhook` — `X-Adatree-Signature` is a placeholder header name;
 * confirm it against Adatree's current webhook docs before going live.
 */
export const adatreeWebhook = onRequest({ secrets: [ADATREE_WEBHOOK_SECRET] }, async (req, res) => {
  if (!verifyHmacSignature(req.rawBody, req.get('X-Adatree-Signature'), ADATREE_WEBHOOK_SECRET.value())) {
    logger.warn('adatreeWebhook: rejected request with missing or invalid signature');
    res.status(401).send('invalid signature');
    return;
  }

  try {
    const body = req.body as {
      accountId: string;
      transaction: { transactionId: string; reference: string; amountCents: number; executionDateTime: string; type?: string };
    };

    const linked = await findLinkedAccount('adatree', body.accountId);
    if (!linked) {
      logger.warn(`adatreeWebhook: no linkedAccount found for Adatree account ${body.accountId}`);
      res.status(202).send('ignored: unrecognized account');
      return;
    }

    if (body.transaction.amountCents >= 0) {
      res.status(202).send('ignored: not an outgoing transaction');
      return;
    }

    const purchase: IncomingPurchase = {
      provider: 'adatree',
      externalAccountId: body.accountId,
      externalId: body.transaction.transactionId,
      merchantName: body.transaction.reference,
      amountCents: Math.abs(body.transaction.amountCents),
      occurredAt: new Date(body.transaction.executionDateTime).toISOString(),
      rawCategory: body.transaction.type ?? null,
    };

    await recordTransactionAndNotify(linked.householdId, linked.account.linkedByUid, purchase);
    res.status(200).send('ok');
  } catch (err) {
    logger.error('adatreeWebhook failed', err);
    res.status(500).send('internal error');
  }
});

// ---------------------------------------------------------------------
// Bank aggregator callables — thin wrappers the Flutter client calls
// through BasiqBankProvider / AdatreeBankProvider (see
// lib/services/bank/). Consent-link creation is intentionally left
// unimplemented until real API credentials exist; wiring it up is
// mostly plumbing once BASIQ_API_KEY / ADATREE_API_KEY secrets are set
// and the exact current API shape is confirmed against each provider's
// docs — see docs/OPEN_BANKING_INTEGRATION.md.
// ---------------------------------------------------------------------

const BASIQ_API_KEY = defineSecret('BASIQ_API_KEY');
const ADATREE_API_KEY = defineSecret('ADATREE_API_KEY');

export const basiqCreateConsentLink = onCall({ secrets: [BASIQ_API_KEY] }, async () => {
  throw new HttpsError(
    'unimplemented',
    'basiqCreateConsentLink needs a configured BASIQ_API_KEY and the current ' +
      'Basiq user-creation + consent-link API shape — see docs/OPEN_BANKING_INTEGRATION.md.'
  );
});

export const basiqGetTransactions = onCall<{ accountId: string; since?: string }>(
  { secrets: [BASIQ_API_KEY] },
  async () => {
    throw new HttpsError('unimplemented', 'basiqGetTransactions requires a configured BASIQ_API_KEY.');
  }
);

export const basiqRefreshConnection = onCall<{ accountId: string }>({ secrets: [BASIQ_API_KEY] }, async () => {
  throw new HttpsError('unimplemented', 'basiqRefreshConnection requires a configured BASIQ_API_KEY.');
});

export const adatreeCreateConsentLink = onCall({ secrets: [ADATREE_API_KEY] }, async () => {
  throw new HttpsError(
    'unimplemented',
    'adatreeCreateConsentLink needs a configured ADATREE_API_KEY and the current ' +
      'Adatree consent-link API shape — see docs/OPEN_BANKING_INTEGRATION.md.'
  );
});

export const adatreeGetTransactions = onCall<{ accountId: string; since?: string }>(
  { secrets: [ADATREE_API_KEY] },
  async () => {
    throw new HttpsError('unimplemented', 'adatreeGetTransactions requires a configured ADATREE_API_KEY.');
  }
);

export const adatreeRefreshConnection = onCall<{ accountId: string }>(
  { secrets: [ADATREE_API_KEY] },
  async () => {
    throw new HttpsError('unimplemented', 'adatreeRefreshConnection requires a configured ADATREE_API_KEY.');
  }
);
