import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionBudget,
  ProjectionExpense,
  ProjectionFundingEntry,
  ProjectionJob,
} from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';

const funding = (
  projectId: number | null,
  percent: number
): ProjectionFundingEntry => ({
  endDate: null,
  isSeeded: true,
  percent,
  projectId,
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
  kind: 'Monthly',
  startMonth: null,
  ...overrides,
});

const projection = ({
  actuals = [],
  endDate = '2027-03-31',
  expenses = [],
  jobs = [],
}: {
  actuals?: {
    amount: number;
    expenditureCategory?: string;
    month: string;
  }[];
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
      actuals: actuals.map((a) => ({
        ...a,
        expenditureCategory: a.expenditureCategory ?? SUPPLIES,
      })),
      awardName: null,
      awardNumber: null,
      budgets: [
        {
          budget: 1000,
          committed: 0,
          expenditureCategory: SUPPLIES,
          isSeeded: true,
          spentToDate: 0,
        },
      ],
      endDate,
      expenses,
      id: 1,
      isSeeded: true,
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

const budget = (
  expenditureCategory: string,
  amount: number,
  spentToDate: number,
  committed = 0
): ProjectionBudget => ({
  budget: amount,
  committed,
  expenditureCategory,
  isSeeded: true,
  spentToDate,
});

const octoberActual = (expenditureCategory: string, amount: number) => ({
  amount,
  expenditureCategory,
  month: '2026-10-01',
});

describe('computePiProjection', () => {
  it.each([
    {
      fringe: 700,
      fringeRemaining: 1900,
      monthlySalary: 2500,
      salary: 1500,
      salaryRemaining: 4500,
    },
    {
      fringe: 800,
      fringeRemaining: 1800,
      monthlySalary: 2750,
      salary: 1750,
      salaryRemaining: 4250,
    },
    {
      fringe: 60,
      fringeRemaining: 2540,
      monthlySalary: 900,
      salary: 0,
      salaryRemaining: 6000,
    },
  ])(
    'retains booked personnel costs and forecasts only the unbooked amount at salary $monthlySalary',
    ({ fringe, fringeRemaining, monthlySalary, salary, salaryRemaining }) => {
      const p = projection({
        actuals: [
          octoberActual(SALARY_CATEGORY, 1000),
          octoberActual(FRINGE_CATEGORY, 300),
        ],
        jobs: [job({ cbrRate: 0.3, monthlySalary, vacationAccrualRate: 0.1 })],
      });
      p.projects[0].budgets = [
        budget(SALARY_CATEGORY, 10_000, 3000, 1000),
        budget(FRINGE_CATEGORY, 4000, 1000, 400),
      ];
      const rows = computePiProjection(p).rows;
      const at = (category: string, month: string) =>
        rows.find(
          (row) => row.expenditureCategory === category && row.month === month
        );

      expect(at(SALARY_CATEGORY, '2026-10')).toMatchObject({
        actualAmount: 1000,
        kind: 'blended',
        projectedAmount: salary,
        remaining: salaryRemaining,
      });
      expect(at(FRINGE_CATEGORY, '2026-10')).toMatchObject({
        actualAmount: 300,
        projectedAmount: fringe,
        remaining: fringeRemaining,
      });
      expect(at(SALARY_CATEGORY, '2026-11')).toMatchObject({
        actualAmount: 0,
        kind: 'projected',
        projectedAmount: monthlySalary,
      });
    }
  );

  it('uses the full personnel target when the snapshot month has no booked costs', () => {
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

  it.each([
    {
      fringe: 40,
      fringeRemaining: 2600,
      monthlySalary: 0,
      salary: 100,
      salaryRemaining: 6000,
    },
    {
      fringe: 440,
      fringeRemaining: 2200,
      monthlySalary: 1000,
      salary: 1100,
      salaryRemaining: 5000,
    },
  ])(
    'retains booked credits and subtracts them from the full-month target at salary $monthlySalary',
    ({ fringe, fringeRemaining, monthlySalary, salary, salaryRemaining }) => {
      const p = projection({
        actuals: [
          octoberActual(SALARY_CATEGORY, -100),
          octoberActual(FRINGE_CATEGORY, -40),
        ],
        jobs: [job({ cbrRate: 0.4, monthlySalary })],
      });
      p.projects[0].budgets = [
        budget(SALARY_CATEGORY, 10_000, 2900, 1000),
        budget(FRINGE_CATEGORY, 4000, 960, 400),
      ];
      const october = computePiProjection(p).rows.filter(
        (row) => row.month === '2026-10'
      );
      expect(october).toEqual([
        expect.objectContaining({
          actualAmount: -100,
          expenditureCategory: SALARY_CATEGORY,
          projectedAmount: salary,
          remaining: salaryRemaining,
        }),
        expect.objectContaining({
          actualAmount: -40,
          expenditureCategory: FRINGE_CATEGORY,
          projectedAmount: fringe,
          remaining: fringeRemaining,
        }),
      ]);
    }
  );

  it('nets snapshot salary and fringe credits after the project has ended', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, -100),
        octoberActual(FRINGE_CATEGORY, -40),
      ],
      endDate: '2026-09-30',
      jobs: [job({ cbrRate: 0.4, monthlySalary: 1000 })],
    });
    p.projects[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 2900, 1000),
      budget(FRINGE_CATEGORY, 4000, 960, 400),
    ];
    const captured = structuredClone(p);

    expect(computePiProjection(p).rows).toEqual([
      {
        actualAmount: -100,
        expenditureCategory: SALARY_CATEGORY,
        kind: 'blended',
        month: '2026-10',
        projectedAmount: 100,
        projectId: 1,
        remaining: 6000,
      },
      {
        actualAmount: -40,
        expenditureCategory: FRINGE_CATEGORY,
        kind: 'blended',
        month: '2026-10',
        projectedAmount: 40,
        projectId: 1,
        remaining: 2600,
      },
    ]);
    expect(p).toEqual(captured);
  });

  it('nets aggregated job targets once per project and category', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, 600),
        octoberActual(SALARY_CATEGORY, 400),
        octoberActual(FRINGE_CATEGORY, 700),
      ],
      jobs: [
        job({
          cbrRate: 0.2,
          fundingEntries: [funding(1, 0.5), funding(2, 0.5)],
          monthlySalary: 1500,
        }),
        job({
          cbrRate: 0.4,
          fundingEntries: [funding(1, 0.5), funding(2, 0.5)],
          id: 2,
          monthlySalary: 2500,
        }),
      ],
    });
    p.projects[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 3000),
      budget(FRINGE_CATEGORY, 4000, 1000),
    ];
    p.projects.push({
      ...p.projects[0],
      actuals: [
        octoberActual(SALARY_CATEGORY, 2500),
        octoberActual(FRINGE_CATEGORY, 100),
      ],
      id: 2,
    });
    const october = computePiProjection(p).rows.filter(
      (row) => row.month === '2026-10'
    );

    expect(october).toEqual([
      expect.objectContaining({
        actualAmount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        projectedAmount: 1000,
        projectId: 1,
        remaining: 6000,
      }),
      expect.objectContaining({
        actualAmount: 700,
        expenditureCategory: FRINGE_CATEGORY,
        projectedAmount: 0,
        projectId: 1,
        remaining: 3000,
      }),
      expect.objectContaining({
        actualAmount: 2500,
        expenditureCategory: SALARY_CATEGORY,
        projectedAmount: 0,
        projectId: 2,
        remaining: 7000,
      }),
      expect.objectContaining({
        actualAmount: 100,
        expenditureCategory: FRINGE_CATEGORY,
        projectedAmount: 550,
        projectId: 2,
        remaining: 2450,
      }),
    ]);
  });

  it('keeps explicit expenses additive across the personnel clamp and leaves fee forecasts unchanged', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, 1000),
        octoberActual(FRINGE_CATEGORY, 400),
        octoberActual(FEE_REMISSION_CATEGORY, 750),
        { amount: 100, month: '2026-10-01' },
      ],
      expenses: [
        expense({
          amount: 500,
          expenditureCategory: SALARY_CATEGORY,
          kind: 'OneTime',
          startMonth: '2026-10-01',
        }),
        expense({ amount: 310, expenditureCategory: SALARY_CATEGORY }),
        expense({ amount: 62, expenditureCategory: FRINGE_CATEGORY }),
        expense({ amount: 310 }),
        expense({
          amount: 310,
          expenditureCategory: FEE_REMISSION_CATEGORY,
          kind: 'Projected',
        }),
      ],
      jobs: [
        job({ cbrRate: 0.4, feeRemissionMonthly: 1500, monthlySalary: 900 }),
      ],
    });
    p.projects[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 3000),
      budget(FRINGE_CATEGORY, 4000, 1000),
      budget(FEE_REMISSION_CATEGORY, 10_000, 2000),
      budget(SUPPLIES, 1000, 200),
    ];
    const rows = computePiProjection(p).rows;
    const at = (category: string, month: string) =>
      rows.find(
        (row) => row.expenditureCategory === category && row.month === month
      );

    expect(at(SALARY_CATEGORY, '2026-10')).toMatchObject({
      actualAmount: 1000,
      projectedAmount: 650,
      remaining: 6350,
    });
    expect(at(FRINGE_CATEGORY, '2026-10')).toMatchObject({
      actualAmount: 400,
      projectedAmount: 30,
      remaining: 2970,
    });
    expect(at(SUPPLIES, '2026-10')).toMatchObject({
      actualAmount: 100,
      projectedAmount: 150,
      remaining: 650,
    });
    expect(at(FEE_REMISSION_CATEGORY, '2026-10')).toMatchObject({
      actualAmount: 750,
      projectedAmount: 1650,
      remaining: 6350,
    });
    expect(at(SALARY_CATEGORY, '2026-11')).toMatchObject({
      projectedAmount: 1210,
    });
    expect(at(FRINGE_CATEGORY, '2026-11')).toMatchObject({
      projectedAmount: 422,
    });
    expect(at(FEE_REMISSION_CATEGORY, '2026-11')).toMatchObject({
      projectedAmount: 1810,
    });
  });

  it('retains actual-only categories without deducting their booked snapshot costs again', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, 1000),
        { amount: 300, month: '2026-10-01' },
      ],
    });
    p.projects[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 2000),
      budget(SUPPLIES, 1000, 400),
    ];
    const rows = computePiProjection(p).rows;
    expect(rows.filter((row) => row.month === '2026-10')).toEqual([
      expect.objectContaining({
        actualAmount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        projectedAmount: 0,
        remaining: 8000,
      }),
      expect.objectContaining({
        actualAmount: 300,
        expenditureCategory: SUPPLIES,
        projectedAmount: 0,
        remaining: 600,
      }),
    ]);
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
        expense({ amount: 62, kind: 'Projected' }),
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

  it('treats null salary as zero and preserves the supplied vacation rate when CBR is zero', () => {
    const noSalary = projection({ jobs: [job({ monthlySalary: null })] });
    const noCbr = projection({
      jobs: [job({ cbrRate: 0, vacationAccrualRate: 0.1 })],
    });

    expect(
      computePiProjection(noSalary)
        .rows.filter((r) => r.expenditureCategory === SALARY_CATEGORY)
        .every((r) => r.projectedAmount === 0)
    ).toBe(true);
    expect(projected(noCbr, FRINGE_CATEGORY, '2026-11')).toBe(100);
  });

  it('deducts only remaining forecasts from a balance that already includes snapshot actuals', () => {
    const p = projection({
      actuals: [
        { amount: 40, month: '2026-09-01' },
        { amount: 100, month: '2026-10-01' },
      ],
      expenses: [expense({ amount: 310 })],
    });
    p.projects[0].budgets = [budget(SUPPLIES, 1000, 140)];
    const rows = computePiProjection(p).rows.filter(
      (r) => r.expenditureCategory === SUPPLIES
    );
    const at = (month: string) => rows.find((r) => r.month === month);

    expect(at('2026-09')).toMatchObject({
      actualAmount: 40,
      kind: 'actual',
      remaining: 860,
    });
    expect(at('2026-10')).toMatchObject({
      actualAmount: 100,
      kind: 'blended',
      remaining: 710,
    });
    expect(at('2026-11')).toMatchObject({ kind: 'projected', remaining: 400 });
  });

  it('projects 12 months when a project has no end date', () => {
    const rows = computePiProjection(
      projection({ endDate: null, expenses: [expense({ amount: 1 })] })
    ).rows;

    expect(rows.at(-1)?.month).toBe('2027-10');
  });
});
