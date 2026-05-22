import {
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfMonth,
} from 'date-fns';
import type { PersonnelRecord } from '@/queries/personnel.ts';

export interface ProjectBurndownPersonnelCost {
  fringe: number;
  id: string;
  label: string;
  salary: number;
  total: number;
}

export interface ProjectBurndownPoint {
  isStartingBalance: boolean;
  label: string;
  month: string;
  monthLabel: string;
  personnel: ProjectBurndownPersonnelCost[];
  remainingBalance: number;
  totalSpend: number;
}

interface CreateProjectBurndownOptions {
  maxMonths?: number;
  personnel: PersonnelRecord[];
  projectEndDate: string | null;
  startDate?: Date | string;
  startingBalance: number;
}

const DEFAULT_MAX_MONTHS = 12;

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    const time = value.getTime();
    return Number.isNaN(time) ? null : value;
  }

  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function isSameOrBefore(left: Date, right: Date) {
  return isBefore(left, right) || isEqual(left, right);
}

function isSameOrAfter(left: Date, right: Date) {
  return isAfter(left, right) || isEqual(left, right);
}

function overlapsMonth(
  monthStart: Date,
  windowStartValue: string | null,
  windowEndValue: string | null
) {
  const monthEnd = endOfMonth(monthStart);
  const windowStart = parseDate(windowStartValue);
  const windowEnd = parseDate(windowEndValue);

  return (
    (!windowStart || isSameOrBefore(windowStart, monthEnd)) &&
    (!windowEnd || isSameOrAfter(windowEnd, monthStart))
  );
}

function toNumber(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPersonnelCost(
  record: PersonnelRecord
): ProjectBurndownPersonnelCost {
  const salary =
    toNumber(record.monthlyRate) *
    toNumber(record.fte) *
    (toNumber(record.distributionPercent) / 100);
  const fringe = salary * toNumber(record.compositeBenefitRate);
  const label = record.name
    ? `${record.name} - ${record.positionDescription}`
    : `Open position - ${record.positionDescription || record.positionNumber}`;

  return {
    fringe,
    id: [
      record.employeeId || 'open',
      record.positionNumber,
      record.projectId,
      record.fundingEffectiveDate ?? '',
      record.fundingEndDate ?? '',
    ].join(':'),
    label,
    salary,
    total: salary + fringe,
  };
}

function contributesInMonth(record: PersonnelRecord, monthStart: Date) {
  return (
    overlapsMonth(
      monthStart,
      record.fundingEffectiveDate,
      record.fundingEndDate
    ) && overlapsMonth(monthStart, record.jobEffectiveDate, record.jobEndDate)
  );
}

function buildPoint(
  monthStart: Date,
  remainingBalance: number,
  totalSpend: number,
  personnel: ProjectBurndownPersonnelCost[],
  isStartingBalance: boolean
): ProjectBurndownPoint {
  return {
    isStartingBalance,
    label: isStartingBalance ? 'Start' : format(monthStart, 'MMM yyyy'),
    month: format(monthStart, 'yyyy-MM-dd'),
    monthLabel: format(monthStart, 'MMMM yyyy'),
    personnel,
    remainingBalance,
    totalSpend,
  };
}

export function createProjectBurndown({
  maxMonths = DEFAULT_MAX_MONTHS,
  personnel,
  projectEndDate,
  startDate = new Date(),
  startingBalance,
}: CreateProjectBurndownOptions): ProjectBurndownPoint[] {
  const start = startOfMonth(parseDate(startDate) ?? new Date());
  const end = parseDate(projectEndDate);
  const endMonth = end ? startOfMonth(end) : null;
  const points = [buildPoint(start, startingBalance, 0, [], true)];
  let remainingBalance = startingBalance;

  for (let offset = 1; offset <= maxMonths; offset += 1) {
    const monthStart = addMonths(start, offset);

    if (endMonth && isAfter(monthStart, endMonth)) {
      break;
    }

    const monthPersonnel = personnel
      .filter((record) => contributesInMonth(record, monthStart))
      .map(getPersonnelCost)
      .filter((cost) => cost.total !== 0);
    const totalSpend = monthPersonnel.reduce(
      (sum, cost) => sum + cost.total,
      0
    );

    remainingBalance -= totalSpend;
    points.push(
      buildPoint(
        monthStart,
        remainingBalance,
        totalSpend,
        monthPersonnel,
        false
      )
    );
  }

  return points;
}
