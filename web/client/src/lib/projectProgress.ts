import type { ProjectProjectionCategory } from '@/queries/projectProjection.ts';

export interface BudgetProgressSummary {
  budget: number;
  committed: number;
  committedPercent: number;
  overrun: number;
  overrunPercent: number;
  remaining: number;
  remainingPercent: number;
  spent: number;
  spentPercent: number;
}

export interface CategoryBudgetProgress {
  available: number;
  budget: number;
  committed: number;
  overrun: number;
  spent: number;
  total: number;
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

function hasBudgetProgressData(category: ProjectProjectionCategory) {
  return (
    category.budget !== 0 ||
    category.committed !== 0 ||
    category.remainingNow !== 0 ||
    category.spentToDate !== 0
  );
}

export function getCategoryBudgetProgress(
  category: ProjectProjectionCategory
): CategoryBudgetProgress {
  const available = nonnegative(category.remainingNow);
  const budget = nonnegative(category.budget);
  const committed = nonnegative(category.committed);
  const spent = nonnegative(category.spentToDate);
  const overrun = Math.max(
    category.remainingNow < 0 ? Math.abs(category.remainingNow) : 0,
    spent + committed - budget,
    0
  );
  const total = Math.max(budget + overrun, spent + committed + available, 1);

  return { available, budget, committed, overrun, spent, total };
}

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(year, month, 0).getDate();
}

function parseProjectDate(value: string | null) {
  if (!value) {
    return null;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const year = Number(dateMatch?.[1]);
  const month = Number(dateMatch?.[2]);
  const day = Number(dateMatch?.[3]);

  if (dateMatch && !isValidCalendarDate(year, month, day)) {
    return null;
  }

  const parsed =
    dateMatch && value === dateMatch[0]
      ? new Date(year, month - 1, day)
      : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getBudgetProgressSummary(
  categories: ProjectProjectionCategory[]
): BudgetProgressSummary {
  const categoryProgress = categories
    .filter(hasBudgetProgressData)
    .map(getCategoryBudgetProgress);
  const budget = categoryProgress.reduce(
    (sum, category) => sum + category.budget,
    0
  );
  const spent = categoryProgress.reduce(
    (sum, category) => sum + category.spent,
    0
  );
  const committed = categoryProgress.reduce(
    (sum, category) => sum + category.committed,
    0
  );
  const netRemaining = categoryProgress.reduce(
    (sum, category) => sum + category.available - category.overrun,
    0
  );
  const overrun = nonnegative(-netRemaining);
  const remaining = nonnegative(netRemaining);
  const total = Math.max(spent + committed + remaining, budget + overrun, 1);
  const percentTotal = overrun > 0 && budget > 0 ? budget : total;

  return {
    budget,
    committed,
    committedPercent: progressPercent(committed, percentTotal),
    overrun,
    overrunPercent: progressPercent(overrun, percentTotal),
    remaining,
    remainingPercent: progressPercent(remaining, percentTotal),
    spent,
    spentPercent: progressPercent(spent, percentTotal),
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
