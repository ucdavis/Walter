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
  ProjectionFundingAllocation,
  ProjectionAppointment,
} from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';

const funding = (
  fundingSourceId: number | null,
  percent: number
): ProjectionFundingAllocation => ({
  endDate: null,
  fundingSourceId,
  isSeeded: true,
  percent,
  startDate: null,
});

const appointment = (
  overrides: Partial<ProjectionAppointment>
): ProjectionAppointment => ({
  allocations: [funding(1, 1)],
  cbrRate: 0,
  colaMonth: 7,
  colaRate: 0,
  employeeId: 'E1',
  endDate: null,
  feeRemissionMonthly: null,
  fte: 1,
  hasUnmatchedFunding: false,
  id: 1,
  isSeeded: true,
  jobCode: null,
  monthlySalary: 1000,
  name: 'Person',
  positionNumber: 'X1',
  rateSet: 'DVCMP',
  sourceProjectNumbers: ['P1'],
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
  appointments = [],
  endDate = '2027-03-31',
  expenses = [],
}: {
  actuals?: {
    amount: number;
    expenditureCategory?: string;
    month: string;
  }[];
  appointments?: ProjectionAppointment[];
  endDate?: string | null;
  expenses?: ProjectionExpense[];
} = {}): Projection => ({
  appointments,
  createdAt: '2026-10-16T00:00:00Z',
  createdBy: null,
  fundingSources: [
    {
      actuals: actuals.map((a) => ({
        ...a,
        expenditureCategory: a.expenditureCategory ?? SUPPLIES,
      })),
      awardName: null,
      awardNumber: null,
      balanceAdjustment: 0,
      budgets: [
        {
          budget: 1000,
          committed: 0,
          expenditureCategory: SUPPLIES,
          isSeeded: true,
          spentToDate: 0,
        },
      ],
      capturedAt: '2026-10-16T00:00:00Z',
      capturedEndDate: endDate,
      capturedStartDate: null,
      endDate,
      expenses,
      id: 1,
      isSeeded: true,
      projectName: 'Project 1',
      projectNumber: 'P1',
      projectType: null,
      runRates: [],
      sourceKind: 'Task',
      startDate: null,
      taskName: null,
      taskNumber: 'TASK01',
    },
  ],
  historyMonths: 3,
  id: 1,
  name: 'Plan',
  piEmployeeId: 'PI',
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
        appointments: [
          appointment({
            cbrRate: 0.3,
            monthlySalary,
            vacationAccrualRate: 0.1,
          }),
        ],
      });
      p.fundingSources[0].budgets = [
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
      appointments: [
        appointment({
          allocations: [funding(1, 0.5)],
          cbrRate: 0.3,
          fte: 0.5,
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
        appointments: [appointment({ cbrRate: 0.4, monthlySalary })],
      });
      p.fundingSources[0].budgets = [
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

  it('nets snapshot salary and fringe credits after the source has ended', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, -100),
        octoberActual(FRINGE_CATEGORY, -40),
      ],
      appointments: [appointment({ cbrRate: 0.4, monthlySalary: 1000 })],
      endDate: '2026-09-30',
    });
    p.fundingSources[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 2900, 1000),
      budget(FRINGE_CATEGORY, 4000, 960, 400),
    ];
    const captured = structuredClone(p);

    expect(computePiProjection(p).rows).toEqual([
      {
        actualAmount: -100,
        expenditureCategory: SALARY_CATEGORY,
        fundingSourceId: 1,
        kind: 'blended',
        month: '2026-10',
        projectedAmount: 100,
        remaining: 6000,
      },
      {
        actualAmount: -40,
        expenditureCategory: FRINGE_CATEGORY,
        fundingSourceId: 1,
        kind: 'blended',
        month: '2026-10',
        projectedAmount: 40,
        remaining: 2600,
      },
    ]);
    expect(p).toEqual(captured);
  });

  it('nets aggregated appointment targets once per source and category', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, 600),
        octoberActual(SALARY_CATEGORY, 400),
        octoberActual(FRINGE_CATEGORY, 700),
      ],
      appointments: [
        appointment({
          allocations: [funding(1, 0.5), funding(2, 0.5)],
          cbrRate: 0.2,
          monthlySalary: 1500,
        }),
        appointment({
          allocations: [funding(1, 0.5), funding(2, 0.5)],
          cbrRate: 0.4,
          id: 2,
          monthlySalary: 2500,
        }),
      ],
    });
    p.fundingSources[0].budgets = [
      budget(SALARY_CATEGORY, 10_000, 3000),
      budget(FRINGE_CATEGORY, 4000, 1000),
    ];
    p.fundingSources.push({
      ...p.fundingSources[0],
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
        fundingSourceId: 1,
        projectedAmount: 1000,
        remaining: 6000,
      }),
      expect.objectContaining({
        actualAmount: 700,
        expenditureCategory: FRINGE_CATEGORY,
        fundingSourceId: 1,
        projectedAmount: 0,
        remaining: 3000,
      }),
      expect.objectContaining({
        actualAmount: 2500,
        expenditureCategory: SALARY_CATEGORY,
        fundingSourceId: 2,
        projectedAmount: 0,
        remaining: 7000,
      }),
      expect.objectContaining({
        actualAmount: 100,
        expenditureCategory: FRINGE_CATEGORY,
        fundingSourceId: 2,
        projectedAmount: 550,
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
      appointments: [
        appointment({
          cbrRate: 0.4,
          feeRemissionMonthly: 1500,
          monthlySalary: 900,
        }),
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
    });
    p.fundingSources[0].budgets = [
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

  it('splits appointment fee costs by funding share without FTE or COLA scaling', () => {
    const p = projection({
      appointments: [
        appointment({
          allocations: [funding(1, 0.5), funding(null, 0.5)],
          colaMonth: 11,
          colaRate: 0.03,
          feeRemissionMonthly: 1500,
          fte: 0.5,
        }),
      ],
    });
    expect(projected(p, FEE_REMISSION_CATEGORY, '2026-10')).toBe(750);
    expect(projected(p, FEE_REMISSION_CATEGORY, '2026-11')).toBe(750);
    p.appointments[0].fte = 0.8;
    p.appointments[0].monthlySalary = 2000;
    expect(projected(p, FEE_REMISSION_CATEGORY, '2026-11')).toBe(750);
  });

  it('retains actual-only categories without deducting their booked snapshot costs again', () => {
    const p = projection({
      actuals: [
        octoberActual(SALARY_CATEGORY, 1000),
        { amount: 300, month: '2026-10-01' },
      ],
    });
    p.fundingSources[0].budgets = [
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
      appointments: [appointment({ colaMonth: 7, colaRate: 0.03 })],
      endDate: '2027-12-31',
    });

    expect(projected(p, SALARY_CATEGORY, '2027-06')).toBe(1000);
    expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(1030);
  });

  it('uses a future hypothetical hire starting rate before compounding later annual COLAs', () => {
    const p = projection({
      appointments: [
        appointment({
          cbrRate: 0.3,
          colaRate: 0.03,
          employeeId: null,
          isSeeded: false,
          monthlySalary: 10_000,
          startDate: '2026-08-01',
          vacationAccrualRate: 0.083,
        }),
      ],
      endDate: '2028-08-31',
    });
    p.seededAt = '2026-01-16T00:00:00Z';
    p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));

    expect(projected(p, SALARY_CATEGORY, '2026-08')).toBe(10_000);
    expect(projected(p, SALARY_CATEGORY, '2027-06')).toBe(10_000);
    expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(10_300);
    expect(projected(p, SALARY_CATEGORY, '2028-07')).toBeCloseTo(10_609);
    expect(projected(p, FRINGE_CATEGORY, '2026-08')).toBeCloseTo(3830);
    expect(projected(p, FRINGE_CATEGORY, '2027-07')).toBeCloseTo(3944.9);
  });

  it.each([
    { firstMonthSalary: 10_000, startDate: '2026-07-01' },
    { firstMonthSalary: (10_000 * 16) / 31, startDate: '2026-07-16' },
  ])(
    'prorates a $startDate hire at its starting rate and waits until next year for July COLA',
    ({ firstMonthSalary, startDate }) => {
      const p = projection({
        appointments: [
          appointment({
            cbrRate: 0.3,
            colaRate: 0.03,
            employeeId: null,
            isSeeded: false,
            monthlySalary: 10_000,
            startDate,
          }),
        ],
        endDate: '2027-08-31',
      });
      p.seededAt = '2026-01-16T00:00:00Z';
      p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));

      expect(projected(p, SALARY_CATEGORY, '2026-07')).toBeCloseTo(
        firstMonthSalary
      );
      expect(projected(p, FRINGE_CATEGORY, '2026-07')).toBeCloseTo(
        firstMonthSalary * 0.3
      );
      expect(projected(p, SALARY_CATEGORY, '2026-08')).toBe(10_000);
      expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(10_300);
    }
  );

  it('keeps a seeded salary based on the snapshot when its appointment start is moved into the future', () => {
    const p = projection({
      appointments: [
        appointment({
          colaRate: 0.03,
          monthlySalary: 10_000,
          startDate: '2026-08-01',
        }),
      ],
      endDate: '2027-08-31',
    });
    p.seededAt = '2026-01-16T00:00:00Z';
    p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));

    expect(projected(p, SALARY_CATEGORY, '2026-08')).toBeCloseTo(10_300);
    expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(10_609);
  });

  it.each(['source', 'funding'])(
    'keeps COLA tied to the hire when the %s starts later',
    (laterStart) => {
      const p = projection({
        appointments: [
          appointment({
            colaRate: 0.03,
            employeeId: null,
            isSeeded: false,
            monthlySalary: 10_000,
            startDate: '2026-08-01',
          }),
        ],
        endDate: '2028-08-31',
      });
      p.seededAt = '2026-01-16T00:00:00Z';
      p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));
      if (laterStart === 'source') {
        p.fundingSources[0].startDate = '2027-08-01';
      } else {
        p.appointments[0].allocations[0].startDate = '2027-08-01';
      }

      expect(projected(p, SALARY_CATEGORY, '2027-07')).toBe(0);
      expect(projected(p, SALARY_CATEGORY, '2027-08')).toBeCloseTo(10_300);
      expect(projected(p, SALARY_CATEGORY, '2028-07')).toBeCloseTo(10_609);
    }
  );

  it('moves the starting-rate baseline when a hypothetical hire moves past a COLA month', () => {
    const p = projection({
      appointments: [
        appointment({
          colaRate: 0.03,
          employeeId: null,
          isSeeded: false,
          monthlySalary: 10_000,
          startDate: '2026-06-01',
        }),
      ],
      endDate: '2027-08-31',
    });
    p.seededAt = '2026-01-16T00:00:00Z';
    p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));

    expect(projected(p, SALARY_CATEGORY, '2026-08')).toBeCloseTo(10_300);

    p.appointments[0].startDate = '2026-08-01';

    expect(projected(p, SALARY_CATEGORY, '2026-08')).toBe(10_000);
    expect(projected(p, SALARY_CATEGORY, '2027-07')).toBeCloseTo(10_300);
  });

  it.each([null, '2025-06-01', '2026-01-01'])(
    'uses the snapshot salary for a manual appointment starting %s',
    (startDate) => {
      const p = projection({
        appointments: [
          appointment({
            colaRate: 0.03,
            employeeId: null,
            isSeeded: false,
            monthlySalary: 10_000,
            startDate,
          }),
        ],
        endDate: '2026-08-31',
      });
      p.seededAt = '2026-01-16T00:00:00Z';
      p.fundingSources.forEach((source) => (source.capturedAt = p.seededAt));

      expect(projected(p, SALARY_CATEGORY, '2026-01')).toBe(10_000);
      expect(projected(p, SALARY_CATEGORY, '2026-07')).toBeCloseTo(10_300);
    }
  );

  it('does not charge outside-portfolio funding but counts it as funded', () => {
    const p = projection({
      appointments: [
        appointment({ allocations: [funding(null, 0.4), funding(1, 0.6)] }),
      ],
    });
    const result = computePiProjection(p);

    expect(projected(p, SALARY_CATEGORY, '2026-11')).toBe(600);
    expect(
      result.appointmentFunding.find((f) => f.month === '2026-11')
        ?.fundedPercent
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
    const noSalary = projection({
      appointments: [appointment({ monthlySalary: null })],
    });
    const noCbr = projection({
      appointments: [appointment({ cbrRate: 0, vacationAccrualRate: 0.1 })],
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
    p.fundingSources[0].budgets = [budget(SUPPLIES, 1000, 140)];
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

  it('fundingSources 12 months when a source has no end date', () => {
    const rows = computePiProjection(
      projection({ endDate: null, expenses: [expense({ amount: 1 })] })
    ).rows;

    expect(rows.at(-1)?.month).toBe('2027-10');
  });
});
