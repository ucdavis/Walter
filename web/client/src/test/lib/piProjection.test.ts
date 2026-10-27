import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionExpense,
  ProjectionFundingEntry,
  ProjectionJob,
} from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';

const funding = (
  projectionProjectId: number | null,
  percent: number
): ProjectionFundingEntry => ({
  endDate: null,
  id: 1,
  isSeeded: true,
  percent,
  projectionJobId: 1,
  projectionProjectId,
  startDate: null,
});

const job = (overrides: Partial<ProjectionJob>): ProjectionJob => ({
  cbrRate: 0,
  colaMonth: 7,
  colaRate: 0,
  employeeId: 'E1',
  endDate: null,
  feeRemissionMonthly: null,
  fte: 1,
  fundingEntries: [funding(1, 1)],
  id: 1,
  isSeeded: true,
  jobCode: null,
  monthlySalary: 1000,
  name: 'Person',
  positionNumber: 'X1',
  projectionId: 1,
  rateSet: 'DVCMP',
  startDate: null,
  title: null,
  vacationAccrualRate: 0,
  ...overrides,
});

const expense = (overrides: Partial<ProjectionExpense>): ProjectionExpense => ({
  amount: 0,
  description: null,
  endMonth: null,
  expenditureCategory: SUPPLIES,
  id: 1,
  kind: 'Monthly',
  projectionProjectId: 1,
  startMonth: null,
  ...overrides,
});

const projection = ({
  actuals = [],
  endDate = '2027-03-31',
  expenses = [],
  jobs = [],
}: {
  actuals?: { amount: number; month: string }[];
  endDate?: string | null;
  expenses?: ProjectionExpense[];
  jobs?: ProjectionJob[];
} = {}): Projection => ({
  createdAt: '2026-10-16T00:00:00Z',
  createdBy: null,
  historyMonths: 3,
  id: 1,
  jobs,
  name: 'Plan',
  piEmployeeId: 'PI',
  projects: [
    {
      actuals: actuals.map((a, i) => ({
        ...a,
        expenditureCategory: SUPPLIES,
        id: i,
        projectionProjectId: 1,
      })),
      awardName: null,
      awardNumber: null,
      budgets: [
        {
          budget: 1000,
          committed: 0,
          expenditureCategory: SUPPLIES,
          id: 1,
          isSeeded: true,
          projectionProjectId: 1,
          spentToDate: 0,
        },
      ],
      endDate,
      expenses,
      id: 1,
      isSeeded: true,
      projectionId: 1,
      projectName: 'Project 1',
      projectNumber: 'P1',
      projectType: null,
      runRates: [],
      startDate: null,
      taskName: null,
      taskNumber: 'TASK01',
    },
  ],
  seededAt: '2026-10-16T00:00:00Z',
  updatedAt: '2026-10-16T00:00:00Z',
  updatedBy: null,
});

const projected = (p: Projection, category: string, month: string) =>
  computePiProjection(p).rows.find(
    (r) => r.expenditureCategory === category && r.month === month
  )?.projectedAmount;

describe('computePiProjection', () => {
  it('charges salary and fringe through funding entries, whole month in the seed month', () => {
    const p = projection({
      jobs: [
        job({
          cbrRate: 0.3,
          fte: 0.5,
          fundingEntries: [funding(1, 0.5)],
          monthlySalary: 6000,
          vacationAccrualRate: 0.1,
        }),
      ],
    });

    expect(projected(p, SALARY_CATEGORY, '2026-10')).toBe(1500);
    expect(projected(p, FRINGE_CATEGORY, '2026-10')).toBe(600);
  });

  it('applies COLA in and after the COLA month', () => {
    const p = projection({
      endDate: '2027-12-31',
      jobs: [job({ colaMonth: 7, colaRate: 0.03 })],
    });

    expect(projected(p, SALARY_CATEGORY, '2027-06')).toBe(1000);
    expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(1030);
  });

  it('does not charge outside-portfolio funding but counts it as funded', () => {
    const p = projection({
      jobs: [job({ fundingEntries: [funding(null, 0.4), funding(1, 0.6)] })],
    });
    const result = computePiProjection(p);

    expect(projected(p, SALARY_CATEGORY, '2026-11')).toBe(600);
    expect(
      result.jobFunding.find((f) => f.month === '2026-11')?.fundedPercent
    ).toBe(1);
  });

  it('prorates monthly and projected expenses in the seed month only', () => {
    const p = projection({
      expenses: [
        expense({ amount: 310, kind: 'Monthly' }),
        expense({ amount: 62, id: 2, kind: 'Projected' }),
      ],
    });

    expect(projected(p, SUPPLIES, '2026-10')).toBeCloseTo(150 + 30);
    expect(projected(p, SUPPLIES, '2026-11')).toBe(310 + 62);
  });

  it('respects monthly start and end months and one-time months', () => {
    const p = projection({
      expenses: [
        expense({
          amount: 100,
          endMonth: '2027-01-01',
          startMonth: '2026-12-01',
        }),
        expense({
          amount: 500,
          id: 2,
          kind: 'OneTime',
          startMonth: '2027-02-01',
        }),
      ],
    });

    expect(
      ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((m) =>
        projected(p, SUPPLIES, m)
      )
    ).toEqual([0, 100, 100, 500, 0]);
  });

  it('treats null salary and null cbr as zero', () => {
    const noSalary = projection({ jobs: [job({ monthlySalary: null })] });
    const noCbr = projection({
      jobs: [job({ cbrRate: null, vacationAccrualRate: 0.1 })],
    });

    expect(
      computePiProjection(noSalary)
        .rows.filter((r) => r.expenditureCategory === SALARY_CATEGORY)
        .every((r) => r.projectedAmount === 0)
    ).toBe(true);
    expect(projected(noCbr, FRINGE_CATEGORY, '2026-11')).toBe(100);
  });

  it('runs remaining down from the budget remaining', () => {
    const p = projection({
      actuals: [
        { amount: 40, month: '2026-09-01' },
        { amount: 100, month: '2026-10-01' },
      ],
      expenses: [expense({ amount: 310 })],
    });
    const rows = computePiProjection(p).rows.filter(
      (r) => r.expenditureCategory === SUPPLIES
    );
    const at = (month: string) => rows.find((r) => r.month === month);

    expect(at('2026-09')).toMatchObject({
      actualAmount: 40,
      kind: 'actual',
      remaining: 1000,
    });
    expect(at('2026-10')).toMatchObject({ kind: 'blended', remaining: 750 });
    expect(at('2026-11')).toMatchObject({ kind: 'projected', remaining: 440 });
  });

  it('projects 12 months when a project has no end date', () => {
    const rows = computePiProjection(
      projection({ endDate: null, expenses: [expense({ amount: 1 })] })
    ).rows;

    expect(rows.at(-1)?.month).toBe('2027-10');
  });
});
