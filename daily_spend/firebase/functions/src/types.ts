/**
 * Shared shapes for the Cloud Functions side. Deliberately mirrors
 * lib/models/*.dart field-for-field — if you add a field on one side,
 * add it on the other, or the two ends of the read/write path silently
 * disagree about the document shape.
 */

export interface Household {
  name: string;
  memberUids: string[];
  createdBy: string;
  pendingInviteCode: string | null;
}

export interface Budget {
  monthlyBudgetCents: number;
  cycleStartDate: string; // ISO date
  nextPaydayDate: string; // ISO date
  cycleSpentCents: number;
  currency: string;
}

export interface SpendTransaction {
  householdId: string;
  spentByUid: string;
  merchantName: string;
  amountCents: number;
  occurredAt: string; // ISO datetime
  bankProvider: 'mock' | 'basiq' | 'adatree';
  externalId: string;
  rawCategory: string | null;
  /** Set by transactionWebhook's Firestore transaction once the budget
   *  increment has been applied — the idempotency guard against retried
   *  triggers double-counting a purchase. Not present on client-written
   *  (manual) transactions until this function processes them too. */
  appliedToBudget?: boolean;
}

export interface LinkedAccount {
  provider: 'basiq' | 'adatree';
  externalAccountId: string;
  linkedByUid: string;
  institutionName: string;
  displayName: string;
}

export interface AppUser {
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  householdId: string | null;
  fcmTokens: string[];
  notificationsEnabled: boolean;
}
