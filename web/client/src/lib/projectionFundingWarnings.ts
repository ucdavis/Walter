import type { AppointmentFundingMonth } from '@/lib/piProjection.ts';

type FundingWarning = 'Partially allocated' | 'Unallocated' | 'Overallocated';
export interface FundingWarningRange {
  endMonth: string;
  startMonth: string;
  status: FundingWarning;
}

const monthIndex = (month: string) =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

/** Missing or healthy months break ranges; daily flags take precedence over monthly averages. */
export function getAppointmentFundingWarnings(
  months: AppointmentFundingMonth[]
) {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));
  const group = (
    statusOf: (month: AppointmentFundingMonth) => FundingWarning | null
  ) => {
    const ranges: FundingWarningRange[] = [];
    for (const month of ordered) {
      const status = statusOf(month);
      if (!status) {
        continue;
      }
      const previous = ranges.at(-1);
      if (
        previous?.status === status &&
        monthIndex(month.month) === monthIndex(previous.endMonth) + 1
      ) {
        previous.endMonth = month.month;
      } else {
        ranges.push({ endMonth: month.month, startMonth: month.month, status });
      }
    }
    return ranges;
  };
  return {
    gaps: group(({ fundedPercent, hasGap }) =>
      hasGap
        ? fundedPercent === 0
          ? 'Unallocated'
          : 'Partially allocated'
        : null
    ),
    overlaps: group(({ hasOverlap }) => (hasOverlap ? 'Overallocated' : null)),
  };
}

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

export function fundingWarningLabel({
  endMonth,
  startMonth,
  status,
}: FundingWarningRange) {
  const startYear = startMonth.slice(0, 4);
  const endYear = endMonth.slice(0, 4);
  const period =
    startMonth === endMonth
      ? `${monthName(startMonth)} ${startYear}`
      : startYear === endYear
        ? `${monthName(startMonth)}–${monthName(endMonth)} ${endYear}`
        : `${monthName(startMonth)} ${startYear}–${monthName(endMonth)} ${endYear}`;
  return `${status} ${period}`;
}
