import { strict as assert } from 'assert';

import { availableTodayCents, daysRemaining, remainingCycleCents } from './budgetCalculator';
import { Budget } from './types';

/**
 * Fixtures mirror test/utils/budget_calculator_test.dart — same numbers
 * on both sides, since the Dart and TypeScript implementations of this
 * formula are meant to agree exactly (see docs/ARCHITECTURE.md).
 */
describe('budgetCalculator', () => {
  const specExampleBudget: Budget = {
    monthlyBudgetCents: 300000,
    cycleStartDate: '2026-01-01',
    nextPaydayDate: '2026-01-16',
    cycleSpentCents: 150000,
    currency: 'AUD',
  };
  const now = new Date('2026-01-01T00:00:00');

  describe('availableTodayCents', () => {
    it('matches the product spec worked example', () => {
      assert.equal(availableTodayCents(specExampleBudget, now), 10000);
    });

    it('goes negative (not clamped) once overspent', () => {
      const overspent: Budget = { ...specExampleBudget, cycleSpentCents: 310000 };
      assert.ok(availableTodayCents(overspent, now) < 0);
    });

    it('floors rather than rounds', () => {
      // remaining = 90, days = 4 -> 22.5 -> floor gives 22; round would give 23.
      const budget: Budget = {
        ...specExampleBudget,
        monthlyBudgetCents: 190,
        cycleSpentCents: 100,
        nextPaydayDate: '2026-01-05',
      };
      assert.equal(availableTodayCents(budget, now), 22);
    });
  });

  describe('daysRemaining', () => {
    it('never drops below 1, even on payday itself', () => {
      const onPayday: Budget = { ...specExampleBudget, nextPaydayDate: '2026-01-01' };
      assert.equal(daysRemaining(onPayday, now), 1);
    });

    it('never drops below 1, even past payday', () => {
      const pastPayday: Budget = { ...specExampleBudget, nextPaydayDate: '2025-12-30' };
      assert.equal(daysRemaining(pastPayday, now), 1);
    });
  });

  describe('remainingCycleCents', () => {
    it('matches the spec worked example', () => {
      assert.equal(remainingCycleCents(specExampleBudget), 150000);
    });

    it('reflects a purchase applied to cycleSpentCents', () => {
      const updated: Budget = { ...specExampleBudget, cycleSpentCents: specExampleBudget.cycleSpentCents + 2500 };
      assert.equal(remainingCycleCents(updated), 147500);
      // New available today: (300000 - 152500) / 15 = 9833.33.. -> floor 9833
      assert.equal(availableTodayCents(updated, now), 9833);
    });
  });
});
