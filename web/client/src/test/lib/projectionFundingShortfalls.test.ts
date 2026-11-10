import { describe, expect, it } from 'vitest';
import {
  BALANCE_ADJUSTMENT_CATEGORY,
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
  type AppointmentFundingMonth,
  type PiProjectionRow,
} from '@/lib/piProjection.ts';
import {
  buildSourceFundingBalance,
  buildSourceFundingBalances,
  getAppointmentFundingShortfalls,
  getSourceFundingBasis,
} from '@/lib/projectionFundingBalances.ts';
import { createSalaryExample } from '@/test/fixtures/projections.ts';

const row = (
  fundingSourceId: number,
  month: string,
  remaining: number,
  expenditureCategory = SALARY_CATEGORY,
  projectedAmount = 0
): PiProjectionRow => ({
  actualAmount: 0,
  expenditureCategory,
  fundingSourceId,
  kind: 'projected',
  month,
  projectedAmount,
  remaining,
});
const source = (id = 1, projectType: string | null = 'Internal') => ({
  ...structuredClone(createSalaryExample().content.fundingSources[0]),
  id,
  projectType,
});
const budget = (expenditureCategory: string, amount = 100) => ({
  budget: amount,
  committed: 0,
  expenditureCategory,
  spentToDate: 0,
});
const funding = (
  month: string,
  fundingSourceId: number | null = 1,
  percent = 1
): AppointmentFundingMonth => ({
  appointmentId: 1,
  fundedPercent: percent,
  hasGap: percent < 1,
  hasOverlap: percent > 1,
  month,
  shares: [{ fundingSourceId, percent }],
});

describe('funding budgeting basis', () => {
  it.each([
    ['Sponsored', 'sponsored'],
    ['Sponsored Capital', 'sponsored'],
    [' sponsored capital ', 'sponsored'],
    ['Internal', 'general'],
    ['internal', 'general'],
    [null, 'unknown'],
    ['', 'unknown'],
    ['Other', 'unknown'],
    ['Sponsored Research', 'unknown'],
  ] as const)(
    'classifies %s without assuming an unknown imported type is unrestricted',
    (projectType, expected) => {
      expect(getSourceFundingBasis(source(1, projectType))).toBe(expected);
    }
  );
  it('treats planned funding as a general pool regardless of imported metadata', () => {
    expect(
      getSourceFundingBasis({
        ...source(1, 'Sponsored'),
        sourceKind: 'Planned',
      })
    ).toBe('general');
  });
});

describe('staffing funding warnings', () => {
  it('uses general-source totals, treats zero as healthy, and clears recovered months', () => {
    const balances = buildSourceFundingBalances(
      [source(1), source(2)],
      [
        row(1, '2026-01', -100),
        row(1, '2026-01', 100, SUPPLIES_CATEGORY),
        row(1, '2026-02', -101),
        row(1, '2026-02', 100, SUPPLIES_CATEGORY),
        row(1, '2026-03', 50),
        row(2, '2026-02', 10_000),
      ]
    );
    expect(
      [...balances.get(1)!.months.values()].map(({ remaining }) => remaining)
    ).toEqual([0, -1, 50]);
    expect(
      getAppointmentFundingShortfalls(
        ['2026-01', '2026-02', '2026-03'].map((month) => funding(month)),
        balances
      )
    ).toEqual([
      {
        basis: 'general',
        fundingSourceId: 1,
        month: '2026-02',
        personnelDeficits: [],
        remaining: -1,
      },
    ]);
  });

  it.each(['Sponsored', 'Sponsored Capital'])(
    'checks salary and fringe independently for %s despite positive totals',
    (projectType) => {
      const sponsored = source(1, projectType);
      sponsored.budgets = [
        budget(SALARY_CATEGORY),
        budget(FRINGE_CATEGORY),
        budget(SUPPLIES_CATEGORY, 10_000),
      ];
      const balances = buildSourceFundingBalances(
        [sponsored],
        [
          row(1, '2026-01', -100),
          row(1, '2026-01', 10, FRINGE_CATEGORY),
          row(1, '2026-01', 10_000, SUPPLIES_CATEGORY),
          row(1, '2026-02', 0),
          row(1, '2026-02', -50, FRINGE_CATEGORY),
          row(1, '2026-02', 10_000, SUPPLIES_CATEGORY),
          row(1, '2026-03', -20),
          row(1, '2026-03', -30, FRINGE_CATEGORY),
          row(1, '2026-03', 10_000, SUPPLIES_CATEGORY),
          row(1, '2026-04', 0),
          row(1, '2026-04', 0, FRINGE_CATEGORY),
          row(1, '2026-04', 10_000, SUPPLIES_CATEGORY),
        ]
      );
      const warnings = getAppointmentFundingShortfalls(
        ['2026-01', '2026-02', '2026-03', '2026-04'].map((month) =>
          funding(month)
        ),
        balances
      );
      expect(
        warnings.map(({ personnelDeficits }) =>
          personnelDeficits.map(({ category }) => category)
        )
      ).toEqual([['salary'], ['fringe'], ['salary', 'fringe']]);
      expect(warnings.map(({ remaining }) => remaining)).toEqual([
        9910, 9950, 9950,
      ]);
    }
  );

  it('shares a source/month warning with every positive allocation and excludes outside, zero, and absent months', () => {
    const sponsored = source(1, 'Sponsored');
    const balances = buildSourceFundingBalances(
      [sponsored, source(2)],
      [row(1, '2026-01', -100), row(2, '2026-01', 1000)]
    );
    for (const percent of [0.01, 0.5, 1.5]) {
      const warnings = getAppointmentFundingShortfalls(
        [funding('2026-01', 1, percent)],
        balances
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0].personnelDeficits[0].remaining).toBe(-100);
    }
    expect(
      getAppointmentFundingShortfalls(
        [
          funding('2026-01', null),
          funding('2026-01', 1, 0),
          funding('2026-01', 2),
          funding('2026-02'),
        ],
        balances
      )
    ).toEqual([]);
  });

  it('does not infer general-pool affordability for unknown imported types', () => {
    const balances = buildSourceFundingBalances(
      [source(1, null)],
      [row(1, '2026-01', -100)]
    );
    expect(balances.get(1)?.basis).toBe('unknown');
    expect(balances.get(1)?.months.get('2026-01')?.remaining).toBe(-100);
    expect(
      getAppointmentFundingShortfalls([funding('2026-01')], balances)
    ).toEqual([]);
  });

  it('does not use fees or a total-only adjustment to decide sponsored personnel affordability', () => {
    const sponsored = source(1, 'Sponsored');
    sponsored.budgets = [budget(SALARY_CATEGORY), budget(FRINGE_CATEGORY)];
    sponsored.balanceAdjustment = 10_000;
    const balances = buildSourceFundingBalances(
      [sponsored],
      [
        row(1, '2026-01', 10),
        row(1, '2026-01', 10, FRINGE_CATEGORY),
        row(1, '2026-01', -20_000, FEE_REMISSION_CATEGORY),
        row(1, '2026-01', 10_000, BALANCE_ADJUSTMENT_CATEGORY),
        row(1, '2026-02', -10),
        row(1, '2026-02', 10, FRINGE_CATEGORY),
        row(1, '2026-02', 10_000, BALANCE_ADJUSTMENT_CATEGORY),
      ]
    );
    expect(
      getAppointmentFundingShortfalls(
        [funding('2026-01'), funding('2026-02')],
        balances
      )
    ).toEqual([
      {
        basis: 'sponsored',
        fundingSourceId: 1,
        month: '2026-02',
        personnelDeficits: [
          {
            category: 'salary',
            expenditureCategory: SALARY_CATEGORY,
            missingBudget: false,
            remaining: -10,
          },
        ],
        remaining: 10_000,
      },
    ]);
  });

  it('warns for missing used salary/fringe budgets, but not an unused absent category', () => {
    const sponsored = source(1, 'Sponsored');
    sponsored.budgets = [budget(SUPPLIES_CATEGORY, 10_000)];
    const balances = buildSourceFundingBalances(
      [sponsored],
      [
        row(1, '2026-01', -100, SALARY_CATEGORY, 100),
        row(1, '2026-01', 10_000, SUPPLIES_CATEGORY),
        row(1, '2026-02', -100),
        row(1, '2026-02', -30, FRINGE_CATEGORY, 30),
        row(1, '2026-02', 10_000, SUPPLIES_CATEGORY),
      ]
    );
    const warnings = getAppointmentFundingShortfalls(
      [funding('2026-01'), funding('2026-02')],
      balances
    );
    expect(warnings[0].personnelDeficits).toEqual([
      {
        category: 'salary',
        expenditureCategory: SALARY_CATEGORY,
        missingBudget: true,
        remaining: -100,
      },
    ]);
    expect(
      warnings[1].personnelDeficits.map(({ category, missingBudget }) => [
        category,
        missingBudget,
      ])
    ).toEqual([
      ['salary', true],
      ['fringe', true],
    ]);
    expect(balances.get(1)?.months.get('2026-01')?.fringeRemaining).toBe(0);
  });

  it('clears a missing-budget warning in unused or recovered months without inventing a deficit', () => {
    const sponsored = source(1, 'Sponsored');
    sponsored.budgets = [budget(SUPPLIES_CATEGORY, 1000)];
    const balances = buildSourceFundingBalances(
      [sponsored],
      [
        { ...row(1, '2026-01', 0), actualAmount: 100 },
        row(1, '2026-02', 0),
        row(1, '2026-03', -100, SALARY_CATEGORY, 100),
        row(1, '2026-04', 0, SALARY_CATEGORY, -100),
      ]
    );
    const warnings = getAppointmentFundingShortfalls(
      ['2026-01', '2026-02', '2026-03', '2026-04'].map((month) =>
        funding(month)
      ),
      balances
    );
    expect(warnings.map(({ month }) => month)).toEqual(['2026-01', '2026-03']);
    expect(warnings[0].personnelDeficits[0]).toMatchObject({
      missingBudget: true,
      remaining: 0,
    });
    expect(warnings[1].personnelDeficits[0]).toMatchObject({
      missingBudget: true,
      remaining: -100,
    });
  });

  it('retains missing-budget evidence when booked salary fully nets the snapshot forecast', () => {
    const plan = createSalaryExample();
    const sponsored = plan.content.fundingSources[0];
    sponsored.projectType = 'Sponsored';
    sponsored.budgets = [budget(SUPPLIES_CATEGORY, 100_000)];
    sponsored.actuals = [
      {
        amount: 2500,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const results = computePiProjection(plan);
    const balances = buildSourceFundingBalances(
      plan.content.fundingSources,
      results.rows
    );
    const salary = balances
      .get(sponsored.id)!
      .categories.find(
        ({ expenditureCategory }) => expenditureCategory === SALARY_CATEGORY
      )!;
    expect(salary).toMatchObject({
      budgetRecorded: false,
      capturedAvailable: 0,
      hasCharges: true,
    });
    expect(balances.get(sponsored.id)?.months.get('2026-01')).toMatchObject({
      personnelDeficits: [
        { category: 'salary', missingBudget: true, remaining: 0 },
      ],
      salaryRemaining: 0,
    });
    const warnings = getAppointmentFundingShortfalls(
      results.appointmentFunding,
      balances
    );
    expect(
      warnings.find(({ month }) => month === '2026-01')?.personnelDeficits[0]
        .remaining
    ).toBe(0);
    const snapshot = results.rows.find(
      ({ expenditureCategory, fundingSourceId, month }) =>
        fundingSourceId === sponsored.id &&
        month === '2026-01' &&
        expenditureCategory === SALARY_CATEGORY
    )!;
    expect(snapshot).toMatchObject({
      actualAmount: 2500,
      projectedAmount: 0,
      remaining: 0,
    });
  });

  it('keeps a captured sponsored deficit visible when booked costs leave no additional snapshot forecast', () => {
    const plan = createSalaryExample();
    const sponsored = plan.content.fundingSources[0];
    sponsored.projectType = 'Sponsored';
    sponsored.budgets = [
      { ...budget(SALARY_CATEGORY, 2000), spentToDate: 2500 },
      budget(SUPPLIES_CATEGORY, 100_000),
    ];
    sponsored.actuals = [
      {
        amount: 2500,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const results = computePiProjection(plan);
    const before = JSON.stringify(results);
    const balances = buildSourceFundingBalances(
      plan.content.fundingSources,
      results.rows
    );
    expect(
      balances.get(sponsored.id)?.months.get('2026-01')?.personnelDeficits
    ).toEqual([
      {
        category: 'salary',
        expenditureCategory: SALARY_CATEGORY,
        missingBudget: false,
        remaining: -500,
      },
    ]);
    expect(JSON.stringify(results)).toBe(before);
  });
});

describe('source category balances', () => {
  it('keeps category capture, net costs, ending balances, and adjustment separate and reconciled', () => {
    const plan = createSalaryExample();
    const sponsored = plan.content.fundingSources[0];
    sponsored.projectType = 'Sponsored';
    sponsored.balanceAdjustment = 500;
    sponsored.budgets = [
      budget(SUPPLIES_CATEGORY, 1000),
      budget(FRINGE_CATEGORY, 1000),
      { ...budget(SALARY_CATEGORY, 12_000), committed: 500, spentToDate: 1000 },
    ];
    sponsored.actuals = [
      {
        amount: 1000,
        expenditureCategory: SALARY_CATEGORY,
        month: '2026-01-01',
      },
    ];
    const results = computePiProjection(plan);
    const balance = buildSourceFundingBalance(sponsored, results.rows);
    expect(
      balance.categories.map(({ expenditureCategory }) => expenditureCategory)
    ).toEqual([
      SALARY_CATEGORY,
      FRINGE_CATEGORY,
      SUPPLIES_CATEGORY,
      BALANCE_ADJUSTMENT_CATEGORY,
    ]);
    expect(balance.categories[0]).toMatchObject({
      capturedAvailable: 10_500,
      endRemaining: -3500,
      firstDeficitMonth: '2026-05',
      forecast: 14_000,
    });
    expect(balance.categories.at(-1)).toMatchObject({
      capturedAvailable: 500,
      endRemaining: 500,
      forecast: 0,
      isBalanceAdjustment: true,
    });
    expect(
      balance.categories.reduce(
        (sum, category) => sum + category.capturedAvailable,
        0
      )
    ).toBe(13_000);
    expect(
      balance.categories.reduce(
        (sum, category) => sum + (category.endRemaining ?? 0),
        0
      )
    ).toBe(balance.months.get('2026-12')?.remaining);
  });

  it('does not invent monthly availability for a source outside the forecast period', () => {
    const plan = createSalaryExample();
    const future = plan.content.fundingSources[0];
    future.projectType = 'Sponsored';
    future.capturedAt = '2028-01-01T00:00:00Z';
    const balance = buildSourceFundingBalance(
      future,
      computePiProjection(plan).rows
    );
    expect(balance.months.size).toBe(0);
    expect(
      balance.categories.every(
        ({ endRemaining, firstDeficitMonth }) =>
          endRemaining === null && firstDeficitMonth === null
      )
    ).toBe(true);
  });

  it('includes other appointments and added expenses without cutting off assigned salary', () => {
    const plan = createSalaryExample();
    plan.content.fundingSources.forEach((source) => {
      source.projectType = 'Internal';
    });
    const first = plan.content.fundingSources[0];
    first.budgets = [budget(SALARY_CATEGORY, 10_000)];
    first.actuals = [];
    first.expenses = [
      {
        amount: 6000,
        description: 'Equipment purchase',
        endMonth: null,
        expenditureCategory: SUPPLIES_CATEGORY,
        id: 1,
        kind: 'OneTime',
        startMonth: '2026-02-01',
      },
    ];
    plan.content.appointments.push({
      ...structuredClone(plan.content.appointments[0]),
      id: 102,
    });
    const results = computePiProjection(plan);
    const balances = buildSourceFundingBalances(
      plan.content.fundingSources,
      results.rows
    );
    for (const appointment of plan.content.appointments) {
      const warnings = getAppointmentFundingShortfalls(
        results.appointmentFunding.filter(
          ({ appointmentId }) => appointmentId === appointment.id
        ),
        balances
      );
      expect(warnings[0]).toMatchObject({
        basis: 'general',
        fundingSourceId: 1,
        month: '2026-02',
        remaining: -6000,
      });
    }
    expect(
      results.rows.find(
        ({ expenditureCategory, fundingSourceId, month }) =>
          fundingSourceId === 1 &&
          month === '2026-03' &&
          expenditureCategory === SALARY_CATEGORY
      )?.projectedAmount
    ).toBe(5000);
    expect(
      results.appointmentFunding.find(({ month }) => month === '2026-03')
        ?.fundedPercent
    ).toBe(1);
  });
});
