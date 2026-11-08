import { describe, expect, it } from 'vitest';
import {
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionExpense,
  ProjectionFundingEntry,
  ProjectionJob,
  ProjectionProject,
} from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';

const funding = (
  projectId: number | null = 1,
  percent = 1,
  dates: Partial<ProjectionFundingEntry> = {}
): ProjectionFundingEntry => ({
  endDate: null,
  isSeeded: true,
  percent,
  projectId,
  startDate: null,
  ...dates,
});

const job = (overrides: Partial<ProjectionJob> = {}): ProjectionJob => ({
  cbrRate: 0.3,
  colaMonth: 7,
  colaRate: 0,
  employeeId: null,
  endDate: null,
  feeRemissionMonthly: null,
  fte: 1,
  fundingEntries: [funding()],
  id: 1,
  isSeeded: true,
  jobCode: null,
  monthlySalary: 5000,
  name: 'Example appointment',
  positionNumber: null,
  rateSet: 'DVCMP',
  startDate: null,
  title: null,
  vacationAccrualRate: 0.1,
  ...overrides,
});

const project = (
  overrides: Partial<ProjectionProject> = {}
): ProjectionProject => ({
  actuals: [],
  awardName: null,
  awardNumber: null,
  budgets: [
    SALARY_CATEGORY,
    FRINGE_CATEGORY,
    SUPPLIES,
    FEE_REMISSION_CATEGORY,
  ].map((expenditureCategory) => ({
    budget: 10_000,
    committed: 0,
    expenditureCategory,
    isSeeded: true,
    spentToDate: 0,
  })),
  endDate: '2026-12-31',
  expenses: [],
  id: 1,
  isSeeded: true,
  projectName: 'Example project',
  projectNumber: null,
  projectType: null,
  runRates: [],
  startDate: null,
  taskName: null,
  taskNumber: null,
  ...overrides,
});

const expense = (
  overrides: Partial<ProjectionExpense> = {}
): ProjectionExpense => ({
  amount: 310,
  description: 'Example expense',
  endMonth: null,
  expenditureCategory: SUPPLIES,
  kind: 'Monthly',
  startMonth: null,
  ...overrides,
});

const plan = (overrides: Partial<Projection> = {}): Projection => ({
  createdAt: '2026-01-16T00:00:00Z',
  createdBy: null,
  historyMonths: 3,
  id: 1,
  jobs: [job()],
  name: 'Date examples',
  piEmployeeId: 'PI',
  projects: [project()],
  seededAt: '2026-01-16T00:00:00Z',
  updatedAt: '2026-01-16T00:00:00Z',
  updatedBy: null,
  ...overrides,
});

const row = (
  result: ReturnType<typeof computePiProjection>,
  month: string,
  expenditureCategory = SALARY_CATEGORY,
  projectId = 1
) =>
  result.rows.find(
    (candidate) =>
      candidate.month === month &&
      candidate.expenditureCategory === expenditureCategory &&
      candidate.projectId === projectId
  );

describe('projection date rules', () => {
  it('charges salary and benefits only for the inclusive intersection of job, funding, and project dates', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-10',
            fundingEntries: [
              funding(1, 0.5, {
                endDate: '2026-03-05',
                startDate: '2026-02-20',
              }),
            ],
            startDate: '2026-02-15',
          }),
        ],
        projects: [project({ endDate: '2026-03-06', startDate: '2026-02-18' })],
      })
    );

    expect(row(result, '2026-02')?.projectedAmount).toBeCloseTo(
      803.571_428_571_4,
      8
    );
    expect(
      row(result, '2026-02', FRINGE_CATEGORY)?.projectedAmount
    ).toBeCloseTo(321.428_571_428_6, 8);
    expect(row(result, '2026-03')?.projectedAmount).toBeCloseTo(
      403.225_806_451_6,
      8
    );
    expect(
      row(result, '2026-03', FRINGE_CATEGORY)?.projectedAmount
    ).toBeCloseTo(161.290_322_580_6, 8);
  });

  it('does not charge funding that starts after the job ends in the same month', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-10',
            fundingEntries: [funding(1, 1, { startDate: '2026-03-31' })],
          }),
        ],
      })
    );

    expect(row(result, '2026-03')?.projectedAmount).toBe(0);
    expect(row(result, '2026-03', FRINGE_CATEGORY)?.projectedAmount).toBe(0);
    expect(result.jobFunding.find(({ month }) => month === '2026-03')).toEqual({
      fundedPercent: 0,
      jobId: 1,
      month: '2026-03',
    });
  });

  it('bounds an otherwise open job and funding entry by the project dates', () => {
    const result = computePiProjection(
      plan({
        jobs: [job({ monthlySalary: 3100 })],
        projects: [project({ endDate: '2026-03-25', startDate: '2026-03-20' })],
      })
    );

    expect(row(result, '2026-02')?.projectedAmount).toBe(0);
    expect(row(result, '2026-03')?.projectedAmount).toBe(600);
    expect(row(result, '2026-03', FRINGE_CATEGORY)?.projectedAmount).toBe(240);
  });

  it('includes the single day on which job, funding, and project endpoints meet', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-20',
            fundingEntries: [funding(1, 1, { startDate: '2026-03-20' })],
            monthlySalary: 3100,
          }),
        ],
        projects: [project({ endDate: '2026-03-20', startDate: '2026-03-20' })],
      })
    );

    expect(row(result, '2026-03')?.projectedAmount).toBe(100);
    expect(row(result, '2026-03', FRINGE_CATEGORY)?.projectedAmount).toBe(40);
  });

  it.each([
    {
      end: '2028-03-01',
      firstAmount: 100,
      firstMonth: '2028-02',
      monthlySalary: 2900,
      secondAmount: 93.548_387_096_8,
      secondMonth: '2028-03',
      seed: '2028-01-16T00:00:00Z',
      start: '2028-02-29',
    },
    {
      end: '2027-01-01',
      firstAmount: 100,
      firstMonth: '2026-12',
      monthlySalary: 3100,
      secondAmount: 100,
      secondMonth: '2027-01',
      seed: '2026-11-16T00:00:00Z',
      start: '2026-12-31',
    },
  ])(
    'counts the inclusive days from $start through $end across calendar boundaries',
    ({
      end,
      firstAmount,
      firstMonth,
      monthlySalary,
      secondAmount,
      secondMonth,
      seed,
      start,
    }) => {
      const result = computePiProjection(
        plan({
          jobs: [job({ endDate: end, monthlySalary, startDate: start })],
          projects: [project({ endDate: end })],
          seededAt: seed,
        })
      );

      expect(row(result, firstMonth)?.projectedAmount).toBeCloseTo(
        firstAmount,
        8
      );
      expect(row(result, secondMonth)?.projectedAmount).toBeCloseTo(
        secondAmount,
        8
      );
    }
  );

  it.each([
    {
      coverage: 1,
      description: 'a continuous switch',
      secondStart: '2026-03-16',
      secondTarget: 2580.645_161_290_3,
    },
    {
      coverage: 0.967_741_935_5,
      description: 'a one-day funding gap',
      secondStart: '2026-03-17',
      secondTarget: 2419.354_838_709_7,
    },
    {
      coverage: 1.032_258_064_5,
      description: 'a one-day funding overlap',
      secondStart: '2026-03-15',
      secondTarget: 2741.935_483_871,
    },
  ])(
    'preserves allocation shares and costs for $description',
    ({ coverage, secondStart, secondTarget }) => {
      const draft = plan({
        jobs: [
          job({
            fte: 0.5,
            fundingEntries: [
              funding(1, 1, {
                endDate: '2026-03-15',
                startDate: '2026-03-01',
              }),
              funding(2, 1, {
                endDate: '2026-03-31',
                startDate: secondStart,
              }),
            ],
            monthlySalary: 10_000,
          }),
        ],
        projects: [project(), project({ id: 2 })],
      });
      const captured = structuredClone(draft);
      const result = computePiProjection(draft);

      expect(row(result, '2026-03')?.projectedAmount).toBeCloseTo(
        2419.354_838_709_7,
        8
      );
      expect(
        row(result, '2026-03', SALARY_CATEGORY, 2)?.projectedAmount
      ).toBeCloseTo(secondTarget, 8);
      expect(
        result.jobFunding.find(({ month }) => month === '2026-03')
          ?.fundedPercent
      ).toBeCloseTo(coverage, 8);
      expect(draft).toEqual(captured);
    }
  );

  it('counts a fully funded partial-month job as fully covered over its active days', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-20',
            monthlySalary: 3100,
            startDate: '2026-03-10',
          }),
        ],
      })
    );

    expect(row(result, '2026-03')?.projectedAmount).toBe(1100);
    expect(result.jobFunding.find(({ month }) => month === '2026-03')).toEqual({
      fundedPercent: 1,
      jobId: 1,
      month: '2026-03',
    });
  });

  it('counts explicit outside funding while project coverage stops at project end', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-20',
            fundingEntries: [funding(1, 0.6), funding(null, 0.4)],
            monthlySalary: 3100,
            startDate: '2026-03-10',
          }),
        ],
        projects: [project({ endDate: '2026-03-15' })],
      })
    );

    expect(row(result, '2026-03')?.projectedAmount).toBe(360);
    expect(
      result.jobFunding.find(({ month }) => month === '2026-03')?.fundedPercent
    ).toBeCloseTo(0.727_272_727_3, 8);
    expect(result.rows.every(({ projectId }) => projectId === 1)).toBe(true);
  });

  it('keeps open project, job, and funding bounds active through the forecast horizon', () => {
    const result = computePiProjection(
      plan({ projects: [project({ endDate: null })] })
    );

    expect(row(result, '2026-02')?.projectedAmount).toBe(5000);
    expect(row(result, '2027-01')?.projectedAmount).toBe(5000);
    expect(result.rows.at(-1)?.month).toBe('2027-01');
  });

  it('nets booked costs against the whole eligible snapshot-month target even after the project has ended', () => {
    const snapshotProject = project({
      actuals: [
        {
          amount: 800,
          expenditureCategory: SALARY_CATEGORY,
          month: '2026-03-01',
        },
        {
          amount: 320,
          expenditureCategory: FRINGE_CATEGORY,
          month: '2026-03-01',
        },
      ],
      endDate: '2026-03-10',
    });
    snapshotProject.budgets[0].spentToDate = 800;
    snapshotProject.budgets[1].spentToDate = 320;
    const draft = plan({
      jobs: [job({ monthlySalary: 3100 })],
      projects: [snapshotProject],
      seededAt: '2026-03-20T00:00:00Z',
    });
    const captured = structuredClone(draft);
    const result = computePiProjection(draft);

    expect(row(result, '2026-03')).toMatchObject({
      actualAmount: 800,
      projectedAmount: 200,
      remaining: 9000,
    });
    expect(row(result, '2026-03', FRINGE_CATEGORY)).toMatchObject({
      actualAmount: 320,
      projectedAmount: 80,
      remaining: 9600,
    });
    expect(draft).toEqual(captured);
  });

  it('retains the accepted snapshot credit adjustment when dates produce no personnel target', () => {
    const result = computePiProjection(
      plan({
        projects: [
          project({
            actuals: [
              {
                amount: -100,
                expenditureCategory: SALARY_CATEGORY,
                month: '2026-03-01',
              },
              {
                amount: -40,
                expenditureCategory: FRINGE_CATEGORY,
                month: '2026-03-01',
              },
            ],
            endDate: '2026-02-28',
          }),
        ],
        seededAt: '2026-03-20T00:00:00Z',
      })
    );

    expect(row(result, '2026-03')).toMatchObject({
      actualAmount: -100,
      projectedAmount: 100,
    });
    expect(row(result, '2026-03', FRINGE_CATEGORY)).toMatchObject({
      actualAmount: -40,
      projectedAmount: 40,
    });
  });

  it.each([
    { end: '2026-10-31', expected: 150, start: null },
    { end: '2026-10-20', expected: 40, start: null },
    { end: '2026-10-31', expected: 120, start: '2026-10-20' },
    { end: '2026-10-16', expected: 0, start: null },
  ])(
    'restricts snapshot recurring expenses to project days after the snapshot: $start through $end',
    ({ end, expected, start }) => {
      for (const kind of ['Monthly', 'Projected'] as const) {
        const result = computePiProjection(
          plan({
            jobs: [],
            projects: [
              project({
                endDate: end,
                expenses: [expense({ kind })],
                startDate: start,
              }),
            ],
            seededAt: '2026-10-16T00:00:00Z',
          })
        );

        expect(row(result, '2026-10', SUPPLIES)?.projectedAmount).toBe(
          expected
        );
      }
    }
  );

  it.each(['Monthly', 'Projected'] as const)(
    'prorates later %s expenses by project dates while preserving their month limits',
    (kind) => {
      const result = computePiProjection(
        plan({
          jobs: [],
          projects: [
            project({
              endDate: '2028-03-10',
              expenses: [
                expense({
                  amount: 290,
                  endMonth: '2028-02-01',
                  kind,
                  startMonth: '2028-02-01',
                }),
              ],
              startDate: '2028-02-20',
            }),
          ],
          seededAt: '2028-01-16T00:00:00Z',
        })
      );

      expect(row(result, '2028-01', SUPPLIES)?.projectedAmount).toBe(0);
      expect(row(result, '2028-02', SUPPLIES)?.projectedAmount).toBe(100);
      expect(row(result, '2028-03', SUPPLIES)?.projectedAmount).toBe(0);
    }
  );

  it('keeps a full one-time expense in an eligible snapshot month even when the project already ended', () => {
    const result = computePiProjection(
      plan({
        jobs: [],
        projects: [
          project({
            actuals: [
              {
                amount: 250,
                expenditureCategory: SUPPLIES,
                month: '2026-10-01',
              },
            ],
            endDate: '2026-10-10',
            expenses: [
              expense({
                amount: 1000,
                kind: 'OneTime',
                startMonth: '2026-10-01',
              }),
            ],
          }),
        ],
        seededAt: '2026-10-16T00:00:00Z',
      })
    );

    expect(row(result, '2026-10', SUPPLIES)).toMatchObject({
      actualAmount: 250,
      projectedAmount: 1000,
    });
  });

  it('retains one-time entries outside the eligible project months without forecasting their amounts', () => {
    const draft = plan({
      jobs: [],
      projects: [
        project({
          endDate: '2026-04-10',
          expenses: [
            '2025-12-01',
            '2026-02-01',
            '2026-04-01',
            '2026-05-01',
          ].map((startMonth) =>
            expense({ amount: 1000, kind: 'OneTime', startMonth })
          ),
          startDate: '2026-04-05',
        }),
      ],
    });
    const captured = structuredClone(draft);
    const result = computePiProjection(draft);

    expect(row(result, '2026-02', SUPPLIES)?.projectedAmount).toBe(0);
    expect(row(result, '2026-04', SUPPLIES)?.projectedAmount).toBe(1000);
    expect(
      result.rows.filter(({ projectedAmount }) => projectedAmount !== 0)
    ).toEqual([
      expect.objectContaining({ month: '2026-04', projectedAmount: 1000 }),
    ]);
    expect(draft).toEqual(captured);
  });

  it('allocates monthly fees over the inclusive job, funding, and project intersection', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-04-30',
            feeRemissionMonthly: 1500,
            fundingEntries: [
              funding(1, 0.5, {
                endDate: '2026-04-24',
                startDate: '2026-04-01',
              }),
            ],
            startDate: '2026-04-10',
          }),
        ],
        projects: [project({ endDate: '2026-04-30', startDate: '2026-04-01' })],
      })
    );

    expect(
      row(result, '2026-04', FEE_REMISSION_CATEGORY)?.projectedAmount
    ).toBe(375);
  });

  it.each([
    { endDate: '2026-04-30', startDate: '2026-04-16' },
    { endDate: '2026-04-15', startDate: '2026-04-01' },
  ])('bounds fees by project dates $startDate through $endDate', (dates) => {
    const result = computePiProjection(
      plan({
        jobs: [job({ feeRemissionMonthly: 1500 })],
        projects: [project(dates)],
      })
    );

    expect(
      row(result, '2026-04', FEE_REMISSION_CATEGORY)?.projectedAmount
    ).toBe(750);
  });

  it('does not charge fees when funding and job dates never meet within the month', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2026-03-10',
            feeRemissionMonthly: 1500,
            fundingEntries: [funding(1, 1, { startDate: '2026-03-11' })],
          }),
        ],
      })
    );

    expect(
      row(result, '2026-03', FEE_REMISSION_CATEGORY)?.projectedAmount
    ).toBe(0);
  });

  it('charges one inclusive fee day when all endpoints meet on leap day', () => {
    const result = computePiProjection(
      plan({
        jobs: [
          job({
            endDate: '2028-02-29',
            feeRemissionMonthly: 2900,
            fundingEntries: [funding(1, 1, { startDate: '2028-02-29' })],
          }),
        ],
        projects: [project({ endDate: '2028-02-29', startDate: '2028-02-29' })],
        seededAt: '2028-01-16T00:00:00Z',
      })
    );

    expect(
      row(result, '2028-02', FEE_REMISSION_CATEGORY)?.projectedAmount
    ).toBe(100);
  });

  it.each([
    { expectedSalary: 0, fte: 1, monthlySalary: null },
    { expectedSalary: 0, fte: 0, monthlySalary: 10_000 },
    { expectedSalary: 5500, fte: 0.5, monthlySalary: 10_000 },
  ])(
    'keeps appointment fees independent of salary $monthlySalary, FTE $fte, and COLA',
    ({ expectedSalary, fte, monthlySalary }) => {
      const result = computePiProjection(
        plan({
          jobs: [
            job({
              colaRate: 0.1,
              feeRemissionMonthly: 1500,
              fte,
              monthlySalary,
            }),
          ],
        })
      );

      expect(
        row(result, '2026-07', FEE_REMISSION_CATEGORY)?.projectedAmount
      ).toBe(1500);
      expect(row(result, '2026-07')?.projectedAmount).toBeCloseTo(
        expectedSalary
      );
    }
  );

  it.each([
    {
      description: 'a continuous switch',
      secondFee: 750,
      secondStart: '2026-04-16',
    },
    { description: 'a one-day gap', secondFee: 700, secondStart: '2026-04-17' },
    {
      description: 'a one-day overlap',
      secondFee: 800,
      secondStart: '2026-04-15',
    },
  ])(
    'charges each fee allocation as entered with $description',
    ({ secondFee, secondStart }) => {
      const draft = plan({
        jobs: [
          job({
            feeRemissionMonthly: 1500,
            fundingEntries: [
              funding(1, 1, { endDate: '2026-04-15', startDate: '2026-04-01' }),
              funding(2, 1, { endDate: '2026-04-30', startDate: secondStart }),
            ],
          }),
        ],
        projects: [project(), project({ id: 2 })],
      });
      const captured = structuredClone(draft);
      const result = computePiProjection(draft);

      expect(
        row(result, '2026-04', FEE_REMISSION_CATEGORY)?.projectedAmount
      ).toBe(750);
      expect(
        row(result, '2026-04', FEE_REMISSION_CATEGORY, 2)?.projectedAmount
      ).toBe(secondFee);
      expect(draft).toEqual(captured);
    }
  );

  it.each([
    {
      actual: 800,
      endDate: '2026-04-30',
      fee: 1500,
      remaining: 6400,
      spentToDate: 2000,
    },
    {
      actual: 800,
      endDate: '2026-04-10',
      fee: 500,
      remaining: 7400,
      spentToDate: 2000,
    },
    {
      actual: -100,
      endDate: '2026-04-10',
      fee: 500,
      remaining: 8300,
      spentToDate: 1100,
    },
  ])(
    'adds all eligible April fees through $endDate without netting booked category08 amount $actual',
    ({ actual, endDate, fee, remaining, spentToDate }) => {
      const result = computePiProjection(
        plan({
          jobs: [job({ feeRemissionMonthly: 1500 })],
          projects: [
            project({
              actuals: [
                {
                  amount: actual,
                  expenditureCategory: FEE_REMISSION_CATEGORY,
                  month: '2026-04-01',
                },
              ],
              budgets: [
                {
                  budget: 10_000,
                  committed: 100,
                  expenditureCategory: FEE_REMISSION_CATEGORY,
                  isSeeded: true,
                  spentToDate,
                },
              ],
              endDate,
            }),
          ],
          seededAt: '2026-04-20T00:00:00Z',
        })
      );

      expect(row(result, '2026-04', FEE_REMISSION_CATEGORY)).toMatchObject({
        actualAmount: actual,
        projectedAmount: fee,
        remaining,
      });
    }
  );

  it('adds employee fees alongside historical category08 estimates and explicit expenses', () => {
    const draft = plan({
      jobs: [job({ feeRemissionMonthly: 1500 })],
      projects: [
        project({
          actuals: [
            {
              amount: 750,
              expenditureCategory: FEE_REMISSION_CATEGORY,
              month: '2026-10-01',
            },
          ],
          budgets: [
            {
              budget: 10_000,
              committed: 0,
              expenditureCategory: FEE_REMISSION_CATEGORY,
              isSeeded: true,
              spentToDate: 2000,
            },
          ],
          endDate: '2026-11-30',
          expenses: [
            expense({
              amount: 310,
              expenditureCategory: FEE_REMISSION_CATEGORY,
              kind: 'Projected',
            }),
            expense({
              amount: 62,
              expenditureCategory: FEE_REMISSION_CATEGORY,
              kind: 'Monthly',
            }),
            expense({
              amount: 200,
              expenditureCategory: FEE_REMISSION_CATEGORY,
              kind: 'OneTime',
              startMonth: '2026-10-01',
            }),
          ],
        }),
      ],
      seededAt: '2026-10-16T00:00:00Z',
    });
    const captured = structuredClone(draft);
    const result = computePiProjection(draft);

    expect(row(result, '2026-10', FEE_REMISSION_CATEGORY)).toMatchObject({
      actualAmount: 750,
      projectedAmount: 1880,
      remaining: 6120,
    });
    expect(row(result, '2026-11', FEE_REMISSION_CATEGORY)).toMatchObject({
      projectedAmount: 1872,
      remaining: 4248,
    });
    expect(draft).toEqual(captured);
  });
});
