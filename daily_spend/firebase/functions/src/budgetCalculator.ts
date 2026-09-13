import { Budget } from './types';

/**
 * The server-side twin of lib/utils/budget_calculator.dart's
 * `BudgetCalculator`. Same formula, same rounding (floor), same "at
 * least 1 day" floor so division never blows up on payday itself — kept
 * in sync deliberately rather than sharing code across Dart/TypeScript,
 * since the two runtimes can't share a package here. If you change the
 * math on one side, change it on the other and update both test suites.
 */

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysRemaining(budget: Budget, now: Date = new Date()): number {
  const today = dateOnly(now);
  const payday = dateOnly(new Date(budget.nextPaydayDate));
  const diffMs = payday.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays < 1 ? 1 : diffDays;
}

export function remainingCycleCents(budget: Budget): number {
  return budget.monthlyBudgetCents - budget.cycleSpentCents;
}

export function availableTodayCents(budget: Budget, now: Date = new Date()): number {
  return Math.floor(remainingCycleCents(budget) / daysRemaining(budget, now));
}
