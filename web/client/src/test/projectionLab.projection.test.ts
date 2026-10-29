import { describe, expect, it } from 'vitest';
import {
  applyAllocationRun,
  deriveTimelineMonths,
  isFundingSourceActiveInMonth,
  projectPlan,
  type FundingSource,
  type MonthlyAllocation,
  type Person,
} from '@/components/projections/projection.ts';

const fundingSources: FundingSource[] = [
  {
    color: '#62bd5b',
    endDate: '2026-08-20',
    id: 'nih',
    indirectRate: 10,
    name: 'NIH grant',
    startDate: '2026-02-15',
    startingBalance: 120_000,
  },
  {
    color: '#8c5fd3',
    endDate: '2026-12-31',
    id: 'nsf',
    indirectRate: 0,
    name: 'NSF grant',
    startDate: '2026-04-01',
    startingBalance: 90_000,
  },
];

const people: Person[] = [
  {
    annualSalary: 120_000,
    fringeRate: 25,
    id: 'susan',
    name: 'Susan',
  },
];

describe('projection domain', () => {
  it('derives a timeline from source ranges and allocation months with a buffer', () => {
    const months = deriveTimelineMonths(fundingSources, [
      {
        fundingSourceId: 'nih',
        month: '2027-01',
        percent: 50,
        personId: 'susan',
      },
    ]);

    expect(months[0]).toBe('2026-01');
    expect(months.at(-1)).toBe('2027-02');
  });

  it('treats mid-month source dates as active for the full planning month', () => {
    expect(isFundingSourceActiveInMonth(fundingSources[0], '2026-02')).toBe(
      true
    );
    expect(isFundingSourceActiveInMonth(fundingSources[0], '2026-08')).toBe(
      true
    );
    expect(isFundingSourceActiveInMonth(fundingSources[0], '2026-09')).toBe(
      false
    );
  });

  it('calculates salary, fringe, indirect, and drawdown by monthly allocation', () => {
    const result = projectPlan({
      allocations: [
        {
          fundingSourceId: 'nih',
          month: '2026-04',
          percent: 50,
          personId: 'susan',
        },
      ],
      fundingSources,
      months: ['2026-04'],
      people,
    });

    expect(result.drawdowns).toHaveLength(1);
    expect(result.drawdowns[0]).toMatchObject({
      directCost: 6250,
      fringeCost: 1250,
      indirectCost: 625,
      salaryCost: 5000,
      totalCost: 6875,
    });
    expect(
      result.fundingSummaries.find((summary) => summary.sourceId === 'nih')
    ).toMatchObject({
      remainingBalance: 113_125,
      totalDrawdown: 6875,
    });
  });

  it('flags allocations outside a funding source range and excludes them from drawdown', () => {
    const result = projectPlan({
      allocations: [
        {
          fundingSourceId: 'nih',
          month: '2026-10',
          percent: 100,
          personId: 'susan',
        },
      ],
      fundingSources,
      months: ['2026-10'],
      people,
    });

    expect(result.invalidAllocations).toEqual([
      {
        fundingSourceId: 'nih',
        month: '2026-10',
        percent: 100,
        personId: 'susan',
        reason: 'funding-source-inactive',
      },
    ]);
    expect(result.drawdowns).toHaveLength(0);
  });

  it('allows projected deficits instead of blocking the plan', () => {
    const result = projectPlan({
      allocations: [
        {
          fundingSourceId: 'nih',
          month: '2026-04',
          percent: 100,
          personId: 'susan',
        },
      ],
      fundingSources: [{ ...fundingSources[0], startingBalance: 5000 }],
      months: ['2026-04'],
      people,
    });

    expect(result.fundingSummaries[0].remainingBalance).toBeLessThan(0);
    expect(result.fundingSummaries[0].deficitMonths).toEqual(['2026-04']);
    expect(result.fundingMonths[0].deficit).toBe(true);
  });

  it('replaces existing monthly allocations when applying an allocation run', () => {
    const existing: MonthlyAllocation[] = [
      {
        fundingSourceId: 'nih',
        month: '2026-04',
        percent: 100,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nih',
        month: '2026-05',
        percent: 100,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nih',
        month: '2026-08',
        percent: 100,
        personId: 'susan',
      },
    ];

    const next = applyAllocationRun(existing, {
      endMonth: '2026-05',
      personId: 'susan',
      splits: [
        { fundingSourceId: 'nih', percent: 50 },
        { fundingSourceId: 'nsf', percent: 50 },
      ],
      startMonth: '2026-04',
    });

    expect(next).toEqual([
      {
        fundingSourceId: 'nih',
        month: '2026-08',
        percent: 100,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nih',
        month: '2026-04',
        percent: 50,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nsf',
        month: '2026-04',
        percent: 50,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nih',
        month: '2026-05',
        percent: 50,
        personId: 'susan',
      },
      {
        fundingSourceId: 'nsf',
        month: '2026-05',
        percent: 50,
        personId: 'susan',
      },
    ]);
  });

  it('allows under-allocated runs and rejects runs above 100%', () => {
    expect(() =>
      applyAllocationRun([], {
        endMonth: '2026-04',
        personId: 'susan',
        splits: [{ fundingSourceId: 'nih', percent: 75 }],
        startMonth: '2026-04',
      })
    ).not.toThrow();

    expect(() =>
      applyAllocationRun([], {
        endMonth: '2026-04',
        personId: 'susan',
        splits: [
          { fundingSourceId: 'nih', percent: 80 },
          { fundingSourceId: 'nsf', percent: 40 },
        ],
        startMonth: '2026-04',
      })
    ).toThrow('Allocation run total cannot exceed 100%');
  });
});
