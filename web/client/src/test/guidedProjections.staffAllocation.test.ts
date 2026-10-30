import { describe, expect, it } from 'vitest';
import type { PlanStaff } from '@/components/guidedProjections/planModel.ts';
import {
  allocationInMonth,
  replaceStaffAllocation,
} from '@/components/guidedProjections/staffAllocation.ts';

function person(): PlanStaff {
  return {
    annualSalary: 72_000,
    endMonth: '2026-12',
    fringeRate: 25,
    fundingId: 'a',
    id: 'person',
    included: true,
    name: 'Researcher',
    percent: 100,
    splits: [
      {
        endMonth: '2026-12',
        fundingId: 'a',
        id: 'a',
        percent: 60,
        startMonth: '2026-01',
      },
      {
        endMonth: '2026-05',
        fundingId: 'b',
        id: 'b',
        percent: 40,
        startMonth: '2026-03',
      },
    ],
    startMonth: '2026-01',
  };
}

describe('Replacing monthly staff allocations', () => {
  it('splits overlapping shares and retains allocations on either side', () => {
    const original = person();
    const updated = replaceStaffAllocation(
      original,
      [{ fundingId: 'c', id: 'c', percent: 100 }],
      '2026-04',
      '2026-05'
    );
    const shares = (month: string) =>
      allocationInMonth(updated, month).map(({ fundingId, percent }) => ({
        fundingId,
        percent,
      }));
    expect(shares('2026-03')).toEqual([
      { fundingId: 'a', percent: 60 },
      { fundingId: 'b', percent: 40 },
    ]);
    expect(shares('2026-04')).toEqual([{ fundingId: 'c', percent: 100 }]);
    expect(shares('2026-05')).toEqual([{ fundingId: 'c', percent: 100 }]);
    expect(shares('2026-06')).toEqual([{ fundingId: 'a', percent: 60 }]);
    expect(original.splits).toHaveLength(2);
    expect(new Set(updated.splits.map((split) => split.id)).size).toBe(
      updated.splits.length
    );
  });

  it('retains unbounded funding before and after a replacement beyond the original horizon', () => {
    const original = person();
    original.splits = [
      {
        ...original.splits[0],
        serverEndMonth: '2026-12',
        serverEntry: {
          endDate: null,
          isSeeded: true,
          percent: 0.6,
          projectId: 1,
          startDate: null,
        },
        serverStartMonth: '2026-01',
      },
    ];
    const updated = replaceStaffAllocation(original, [], '2027-01', '2027-02');
    expect(allocationInMonth(updated, '2025-12')[0].percent).toBe(60);
    expect(allocationInMonth(updated, '2026-12')[0].percent).toBe(60);
    expect(allocationInMonth(updated, '2027-01')).toEqual([]);
    expect(allocationInMonth(updated, '2027-02')).toEqual([]);
    expect(allocationInMonth(updated, '2027-03')[0].percent).toBe(60);
    expect(updated.splits[0].serverEntry).toMatchObject({
      endDate: '2026-12-31',
      startDate: null,
    });
    expect(updated.splits[1].serverEntry).toMatchObject({
      endDate: null,
      startDate: '2027-03-01',
    });
  });

  it('keeps unrelated shares and handles a one-month gap at a year boundary', () => {
    const original = person();
    const updated = replaceStaffAllocation(original, [], '2026-12', '2026-12');
    expect(updated.splits).toContain(original.splits[1]);
    expect(allocationInMonth(updated, '2026-11')[0].percent).toBe(60);
    expect(allocationInMonth(updated, '2026-12')).toEqual([]);
    expect(allocationInMonth(updated, '2027-01')).toEqual([]);
  });
});
