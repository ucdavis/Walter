import { describe, expect, it } from 'vitest';
import {
  BALANCE_ADJUSTMENT_CATEGORY,
  computePiProjection,
  FEE_REMISSION_CATEGORY,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
  SUPPLIES_CATEGORY,
} from '@/lib/piProjection.ts';
import { buildProjectionOutlook } from '@/lib/projectionOutlook.ts';
import type {
  ProjectionAppointment,
  ProjectionDraft,
  ProjectionExpense,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

const snapshot = '2026-01-16T00:00:00Z';

function source(
  id: number,
  overrides: Partial<ProjectionFundingSource> = {}
): ProjectionFundingSource {
  return {
    actuals: [],
    awardName: null,
    awardNumber: null,
    balanceAdjustment: 0,
    budgets: [
      {
        budget: 1000,
        committed: 0,
        expenditureCategory: SALARY_CATEGORY,
        spentToDate: 0,
      },
    ],
    capturedAt: snapshot,
    capturedEndDate: null,
    capturedStartDate: null,
    endDate: null,
    expenses: [],
    historicalExpenseOverrides: [],
    id,
    name: 'Field research',
    projectName: 'Field research',
    projectNumber: 'P1',
    projectType: 'Internal',
    runRates: [],
    sourceKind: 'Task',
    startDate: null,
    taskName: null,
    taskNumber: `T${id}`,
    ...overrides,
  };
}

function appointment(
  id: number,
  overrides: Partial<ProjectionAppointment> = {}
): ProjectionAppointment {
  return {
    allocations: [],
    cbrRate: 0,
    colaMonth: 7,
    colaRate: 0,
    employeeId: null,
    endDate: null,
    feeRemissionMonthly: null,
    fte: 1,
    hasUnmatchedFunding: false,
    id,
    isSeeded: true,
    jobCode: null,
    monthlySalary: 0,
    name: `Appointment ${id}`,
    positionNumber: null,
    rateSet: 'DVCMP',
    startDate: null,
    title: null,
    vacationAccrualRate: 0,
    ...overrides,
  };
}

function expense(id: number, amount: number, month: string): ProjectionExpense {
  return {
    amount,
    description: amount < 0 ? 'Planned credit' : 'Planned cost',
    endMonth: null,
    expenditureCategory: SUPPLIES_CATEGORY,
    id,
    kind: 'OneTime',
    startMonth: `${month}-01`,
  };
}

function plan(
  sources: ProjectionFundingSource[],
  appointments: ProjectionAppointment[] = []
): ProjectionDraft {
  return {
    content: {
      appointments,
      forecastMonths: 12,
      fundingSources: sources,
      historyMonths: 3,
      notes: null,
    },
    name: 'Research plan',
    seededAt: snapshot,
  };
}

function outlook(draft: ProjectionDraft) {
  return buildProjectionOutlook(draft, computePiProjection(draft));
}

describe('funding outlook presentation', () => {
  it('keeps a recovered task shortfall visible despite positive project and plan totals', () => {
    const result = outlook(
      plan([
        source(1, {
          expenses: [
            expense(1, 1000, '2026-01'),
            expense(2, 50, '2026-02'),
            expense(3, -100, '2026-03'),
          ],
        }),
        source(2),
      ])
    );
    expect(result.groups).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      endBalance: 50,
      firstShortfallMonth: '2026-02',
      minBalance: -50,
    });
    expect(result.sources[0].months[0].remaining).toBe(0);
    expect(result.groups[0]).toMatchObject({
      endBalance: 1050,
      firstShortfallMonth: '2026-02',
      projectNumber: 'P1',
    });
    expect(
      result.groups[0].shortfallSources.map(({ source }) => source.id)
    ).toEqual([1]);
    expect(result.months.every(({ remaining }) => remaining >= 0)).toBe(true);
    expect(result.firstShortfallMonth).toBe('2026-02');
    expect(result.shortfallSources.map(({ source }) => source.id)).toEqual([1]);
  });

  it('groups imported sources by project identity and keeps same-named planned funding separate', () => {
    const result = outlook(
      plan([
        source(1),
        source(2, { name: 'Renamed task', projectName: 'Field research' }),
        source(3, { projectNumber: 'P2' }),
        source(4, {
          balanceAdjustment: 100,
          budgets: [],
          projectName: null,
          projectNumber: null,
          sourceKind: 'Planned',
          startDate: '2026-01-01',
          taskNumber: null,
        }),
        source(5, {
          balanceAdjustment: 200,
          budgets: [],
          projectName: null,
          projectNumber: null,
          sourceKind: 'Planned',
          startDate: '2026-01-01',
          taskNumber: null,
        }),
      ])
    );
    expect(result.groups.map(({ id }) => id)).toEqual([
      'project:P1',
      'project:P2',
      'source:4',
      'source:5',
    ]);
    expect(result.groups.map(({ sources }) => sources.length)).toEqual([
      2, 1, 1, 1,
    ]);
    expect(result.groups[0].label).toBe('Field research');
    expect(result.sources[1].label).toBe('Renamed task · Task T2');
    expect(result.forecast).toBe(0);
    expect(result.planningBalance).toBe(3300);
    expect(result.endBalance).toBe(3300);
  });

  it('adds later captures and planned funding only in their calculated months', () => {
    const result = outlook(
      plan([
        source(1, { capturedAt: '2026-03-10T00:00:00Z' }),
        source(2, {
          balanceAdjustment: 500,
          budgets: [],
          projectNumber: null,
          sourceKind: 'Planned',
          startDate: '2026-07-15',
          taskNumber: null,
        }),
        source(3, { capturedAt: '2027-01-01T00:00:00Z' }),
        source(4, {
          balanceAdjustment: 10_000,
          budgets: [],
          projectNumber: null,
          sourceKind: 'Planned',
          startDate: '2027-01-01',
          taskNumber: null,
        }),
      ])
    );
    expect(result.sources[0].months[0]).toMatchObject({
      month: '2026-03',
      remaining: 1000,
    });
    expect(result.sources[1].months[0]).toMatchObject({
      month: '2026-07',
      remaining: 500,
    });
    expect(
      result.months.map(({ month, remaining }) => [month, remaining])
    ).toEqual([
      ['2026-03', 1000],
      ['2026-04', 1000],
      ['2026-05', 1000],
      ['2026-06', 1000],
      ['2026-07', 1500],
      ['2026-08', 1500],
      ['2026-09', 1500],
      ['2026-10', 1500],
      ['2026-11', 1500],
      ['2026-12', 1500],
    ]);
    expect(result.sources[2]).toMatchObject({
      endBalance: null,
      months: [],
      outside: true,
      planningBalance: 1000,
    });
    expect(result.sources[3]).toMatchObject({
      endBalance: null,
      months: [],
      outside: true,
      planningBalance: 10_000,
    });
    expect(result.planningBalance).toBe(1500);
    expect(result.endBalance).toBe(1500);
    expect(result.groups[0].planningBalance).toBe(1000);
  });

  it('keeps snapshot actuals separate from signed forecast costs and excludes balance adjustments from cost categories', () => {
    const draft = plan(
      [
        source(1, {
          actuals: [
            {
              amount: 1000,
              expenditureCategory: SALARY_CATEGORY,
              month: '2026-01-01',
            },
            {
              amount: 200,
              expenditureCategory: FRINGE_CATEGORY,
              month: '2026-01-01',
            },
          ],
          balanceAdjustment: 400,
          budgets: [
            {
              budget: 5000,
              committed: 500,
              expenditureCategory: SALARY_CATEGORY,
              spentToDate: 1000,
            },
            {
              budget: 1000,
              committed: 0,
              expenditureCategory: FRINGE_CATEGORY,
              spentToDate: 200,
            },
          ],
          endDate: '2026-01-31',
          expenses: [expense(1, -50, '2026-01')],
        }),
      ],
      [
        appointment(1, {
          allocations: [
            {
              endDate: null,
              fundingSourceId: 1,
              percent: 1,
              startDate: null,
            },
          ],
          cbrRate: 0.2,
          endDate: '2026-01-31',
          feeRemissionMonthly: 100,
          monthlySalary: 1500,
        }),
      ]
    );
    const results = computePiProjection(draft);
    const original = structuredClone({ draft, results });
    const result = buildProjectionOutlook(draft, results);
    expect(result.sources[0].categories).toEqual([
      { expenditureCategory: SALARY_CATEGORY, forecast: 500 },
      { expenditureCategory: FRINGE_CATEGORY, forecast: 100 },
      { expenditureCategory: SUPPLIES_CATEGORY, forecast: -50 },
      { expenditureCategory: FEE_REMISSION_CATEGORY, forecast: 100 },
    ]);
    expect(
      results.rows.some(
        (row) => row.expenditureCategory === BALANCE_ADJUSTMENT_CATEGORY
      )
    ).toBe(true);
    expect(result.sources[0].months[0]).toEqual({
      actual: 1200,
      forecast: 650,
      month: '2026-01',
      remaining: 4050,
    });
    expect(result.planningBalance).toBe(4700);
    expect(result.forecast).toBe(650);
    expect(result.endBalance).toBe(4050);
    expect({ draft, results }).toEqual(original);
  });

  it('counts each appointment once per issue and keeps gaps separate from overlaps', () => {
    const result = outlook(
      plan(
        [source(1)],
        [
          appointment(1, {
            allocations: [
              {
                endDate: '2026-06-30',
                fundingSourceId: 1,
                percent: 0.5,
                startDate: '2026-01-01',
              },
              {
                endDate: null,
                fundingSourceId: 1,
                percent: 1.5,
                startDate: '2026-07-01',
              },
            ],
          }),
          appointment(2),
          appointment(3, {
            allocations: [
              {
                endDate: null,
                fundingSourceId: null,
                percent: 1,
                startDate: null,
              },
            ],
          }),
          appointment(4, { startDate: '2027-01-01' }),
        ]
      )
    );
    expect(result.gapAppointmentIds).toEqual([1, 2]);
    expect(result.overlapAppointmentIds).toEqual([1]);
    expect(result.shortfallSources).toEqual([]);
  });

  it('has no financial timeline or implied funding when the plan has no sources', () => {
    expect(outlook(plan([]))).toEqual({
      endBalance: null,
      firstShortfallMonth: null,
      forecast: 0,
      gapAppointmentIds: [],
      groups: [],
      months: [],
      overlapAppointmentIds: [],
      planningBalance: 0,
      shortfallSources: [],
      sources: [],
    });
  });
});
