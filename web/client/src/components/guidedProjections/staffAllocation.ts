import {
  splitActive,
  type FundingSplit,
  type PlanStaff,
} from '@/components/guidedProjections/planModel.ts';
import {
  indexToMonth,
  monthToIndex,
} from '@/components/projections/projection.ts';

export type StaffAllocation = Pick<
  FundingSplit,
  'fundingId' | 'id' | 'percent'
>;

export function allocationInMonth(person: PlanStaff, month: string) {
  const shares = new Map<string, StaffAllocation>();
  for (const split of person.splits.filter((row) => splitActive(row, month))) {
    const existing = shares.get(split.fundingId);
    shares.set(split.fundingId, {
      fundingId: split.fundingId,
      id: existing?.id ?? split.id,
      percent: (existing?.percent ?? 0) + split.percent,
    });
  }
  return [...shares.values()];
}

/** Replaces only the selected months, retaining both sides of overlapping shares. */
export function replaceStaffAllocation(
  person: PlanStaff,
  shares: StaffAllocation[],
  startMonth: string,
  endMonth: string
): PlanStaff {
  const before = indexToMonth(monthToIndex(startMonth) - 1);
  const after = indexToMonth(monthToIndex(endMonth) + 1);
  const retained = person.splits.flatMap((split) => {
    const from =
      split.serverEntry?.startDate === null &&
      split.startMonth === split.serverStartMonth
        ? ''
        : split.startMonth;
    const through =
      split.serverEntry?.endDate === null &&
      split.endMonth === split.serverEndMonth
        ? '9999-12'
        : split.endMonth;
    if (from > endMonth || through < startMonth) {
      return [split];
    }
    const fragments: FundingSplit[] = [];
    if (from < startMonth) {
      const lastDay = new Date(
        Date.UTC(Number(before.slice(0, 4)), Number(before.slice(5, 7)), 0)
      )
        .toISOString()
        .slice(0, 10);
      fragments.push({
        ...split,
        endMonth: before,
        // Persist a real boundary so an originally open-ended share cannot grow back.
        serverEndMonth: before,
        serverEntry: split.serverEntry
          ? { ...split.serverEntry, endDate: lastDay }
          : undefined,
      });
    }
    if (through > endMonth) {
      fragments.push({
        ...split,
        id: crypto.randomUUID(),
        serverEntry: split.serverEntry
          ? { ...split.serverEntry, startDate: `${after}-01` }
          : undefined,
        serverStartMonth: after,
        startMonth: after,
      });
    }
    return fragments;
  });
  return {
    ...person,
    splits: [
      ...retained,
      ...shares
        .filter((share) => share.percent > 0)
        .map((share) => ({
          ...share,
          endMonth,
          id: crypto.randomUUID(),
          startMonth,
        })),
    ],
  };
}
