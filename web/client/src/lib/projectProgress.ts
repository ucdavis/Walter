import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

export interface BudgetProgressSummary {
  budget: number;
  committed: number;
  committedPercent: number;
  overrun: number;
  remaining: number;
  remainingPercent: number;
  spent: number;
  spentPercent: number;
}

export interface TimeProgressSummary {
  elapsedMonths: number;
  elapsedPercent: number;
  remainingMonths: number;
  remainingPercent: number;
  totalMonths: number;
}

function nonnegative(value: number) {
  return Math.max(0, value);
}

function progressPercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function parseProjectDate(value: string | null) {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getBudgetProgressSummary(
  categories: ProjectProjectionCategory[]
): BudgetProgressSummary {
  const budget = categories.reduce(
    (sum, category) => sum + nonnegative(category.budget),
    0
  );
  const spent = categories.reduce(
    (sum, category) => sum + nonnegative(category.spentToDate),
    0
  );
  const committed = categories.reduce(
    (sum, category) => sum + nonnegative(category.committed),
    0
  );
  const remaining = categories.reduce(
    (sum, category) => sum + nonnegative(category.remainingNow),
    0
  );
  const balanceOverrun = categories.reduce(
    (sum, category) =>
      sum + (category.remainingNow < 0 ? Math.abs(category.remainingNow) : 0),
    0
  );
  const overrun = Math.max(balanceOverrun, spent + committed - budget, 0);
  const total = Math.max(budget, spent + committed + remaining, 1);

  return {
    budget,
    committed,
    committedPercent: progressPercent(committed, total),
    overrun,
    remaining,
    remainingPercent: progressPercent(remaining, total),
    spent,
    spentPercent: progressPercent(spent, total),
  };
}

export function getTimeProgressSummary(
  awardStartDate: string | null,
  awardEndDate: string | null,
  asOf: Date = new Date()
): TimeProgressSummary | null {
  const start = parseProjectDate(awardStartDate);
  const end = parseProjectDate(awardEndDate);

  if (!start || !end || end < start) {
    return null;
  }

  const totalMonths = monthIndex(end) - monthIndex(start) + 1;
  const elapsedMonths =
    asOf >= end
      ? totalMonths
      : asOf < start
        ? 0
        : clamp(monthIndex(asOf) - monthIndex(start), 0, totalMonths);
  const remainingMonths = totalMonths - elapsedMonths;

  return {
    elapsedMonths,
    elapsedPercent: progressPercent(elapsedMonths, totalMonths),
    remainingMonths,
    remainingPercent: progressPercent(remainingMonths, totalMonths),
    totalMonths,
  };
}
