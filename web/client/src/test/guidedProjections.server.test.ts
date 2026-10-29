import { describe, expect, it } from 'vitest';
import {
  projectGuidedPlan,
  staffValidation,
} from '@/components/guidedProjections/planModel.ts';
import {
  fromServerProjection,
  toServerProjection,
  withHistoryMonths,
} from '@/components/guidedProjections/serverPlan.ts';
import {
  computePiProjection,
  FRINGE_CATEGORY,
  SALARY_CATEGORY,
} from '@/lib/piProjection.ts';
import type { Projection } from '@/queries/projections.ts';

const SUPPLIES = '05 - Supplies';
const fixture = (): Projection => ({
  createdAt: '2026-10-16T12:00:00Z',
  createdBy: 'creator',
  historyMonths: 3,
  id: 8,
  jobs: [
    {
      cbrRate: 0.3,
      colaMonth: 7,
      colaRate: 0.03,
      employeeId: '1234',
      endDate: '2027-12-15',
      feeRemissionMonthly: 120,
      fte: 0.5,
      fundingEntries: [
        {
          endDate: null,
          isSeeded: true,
          percent: 0.6,
          projectId: 2,
          startDate: '2026-08-17',
        },
        {
          endDate: null,
          isSeeded: true,
          percent: 0.4,
          projectId: null,
          startDate: null,
        },
      ],
      id: 4,
      isSeeded: true,
      jobCode: 'A1',
      monthlySalary: 6000.01,
      name: 'Test Person',
      positionNumber: 'P1',
      rateSet: 'DVCMP',
      startDate: '2026-01-12',
      title: 'Researcher',
      vacationAccrualRate: 0.1,
    },
  ],
  name: 'Existing plan',
  piEmployeeId: 'PI',
  projects: [
    {
      actuals: [
        { amount: 100, expenditureCategory: SUPPLIES, month: '2026-10-01' },
      ],
      awardName: 'Award',
      awardNumber: 'A1',
      budgets: [
        {
          budget: 10_000,
          committed: 200,
          expenditureCategory: SUPPLIES,
          isSeeded: true,
          spentToDate: 1000,
        },
      ],
      endDate: null,
      expenses: [
        {
          amount: 310,
          description: null,
          endMonth: null,
          expenditureCategory: SUPPLIES,
          kind: 'Projected',
          startMonth: null,
        },
      ],
      id: 2,
      isSeeded: true,
      projectName: 'Project',
      projectNumber: 'P42',
      projectType: 'Sponsored',
      runRates: [
        { expenditureCategory: SUPPLIES, historyMonths: 3, monthlyAmount: 310 },
        { expenditureCategory: SUPPLIES, historyMonths: 6, monthlyAmount: 155 },
      ],
      startDate: '2026-01-15',
      taskName: 'Research',
      taskNumber: '01',
    },
  ],
  seededAt: '2026-10-16T12:00:00Z',
  settings: {
    excludedJobIds: [],
    months: 12,
    note: 'Original notes',
    selectedProjectIds: [2],
    startMonth: '2026-10',
  },
  updatedAt: '2026-10-16T12:00:00Z',
  updatedBy: 'creator',
});

describe('server guided projection plans', () => {
  it('round trips the complete server snapshot, preserving raw dates, null bounds and outside funding', () => {
    const source = fixture();
    const plan = fromServerProjection(source);
    expect(plan.staff[0].splits.map((s) => s.percent)).toEqual([30, 20]);
    expect(toServerProjection(plan)).toEqual(source);
    expect(staffValidation(plan.staff[0], plan)).toBeNull();
  });

  it('preserves unknown salary and benefit rates without turning them into known zeroes', () => {
    const source = fixture();
    source.jobs[0].monthlySalary = null;
    source.jobs[0].cbrRate = null;
    const plan = fromServerProjection(source);
    expect(plan.staff[0].salaryMissing).toBe(true);
    expect(toServerProjection(plan).jobs[0]).toEqual(source.jobs[0]);
    plan.staff[0].salaryMissing = false;
    expect(toServerProjection(plan).jobs[0].monthlySalary).toBe(0);
  });

  it('retains excluded data and stores the horizon, notes and inclusions', () => {
    const plan = fromServerProjection(fixture());
    plan.selectedFunding = [];
    plan.staff[0].included = false;
    plan.months = 18;
    plan.note = 'A separate scenario';
    const saved = toServerProjection(plan);
    expect(saved.projects).toHaveLength(1);
    expect(saved.jobs).toHaveLength(1);
    expect(saved.settings).toMatchObject({
      excludedJobIds: [4],
      months: 18,
      note: plan.note,
      selectedProjectIds: [],
    });
    expect(fromServerProjection(saved)).toMatchObject({
      months: 18,
      selectedFunding: [],
      staff: [{ included: false }],
    });
    expect(projectGuidedPlan(plan).ending).toBe(0);
  });

  it('adds hypothetical IDs and balance adjustments without overwriting category history', () => {
    const source = fixture();
    const plan = fromServerProjection(source);
    plan.funding[0].startingBalance += 250;
    plan.funding.push({
      color: '#000',
      endDate: '2027-03-31',
      id: 'new-fund',
      indirectRate: 0,
      name: 'New grant',
      startDate: '2027-01-01',
      startingBalance: 3000,
    });
    plan.selectedFunding.push('new-fund');
    plan.staff[0].splits[0].fundingId = 'new-fund';
    const saved = toServerProjection(plan);
    expect(saved.projects[0].budgets[0]).toEqual(source.projects[0].budgets[0]);
    expect(saved.projects[0].budgets[1].budget).toBe(250);
    expect(saved.projects[0].actuals).toEqual(source.projects[0].actuals);
    expect(saved.projects[1]).toMatchObject({
      id: 3,
      isSeeded: false,
      projectNumber: null,
    });
    expect(saved.jobs[0].fundingEntries[0].projectId).toBe(3);
    expect(toServerProjection(fromServerProjection(saved))).toEqual(saved);
  });

  it('changes run-rate windows while retaining manual expenses and historical rates', () => {
    const plan = fromServerProjection(fixture());
    plan.expenses.push({
      amount: 700,
      frequency: 'once',
      fundingId: plan.funding[0].id,
      id: 'manual',
      month: '2026-12',
      name: 'Purchase',
    });
    const changed = withHistoryMonths(plan, 6);
    expect(changed.expenses.map((e) => e.amount)).toEqual([700, 155]);
    const saved = toServerProjection(changed);
    expect(saved.historyMonths).toBe(6);
    expect(saved.projects[0].expenses.map((e) => e.kind)).toEqual([
      'OneTime',
      'Projected',
    ]);
    expect(saved.projects[0].runRates).toEqual(fixture().projects[0].runRates);
  });

  it('uses the shared PI calculation with FTE, outside funding, vacation, COLA, fees and actuals', () => {
    const source = fixture();
    const plan = fromServerProjection(source);
    const result = projectGuidedPlan(plan);
    const rows = computePiProjection(source, { endMonth: '2027-09' }).rows;
    for (const point of result.chart) {
      expect(point.balance).toBeCloseTo(
        rows
          .filter((row) => row.month === point.month)
          .reduce((total, row) => total + row.remaining, 0)
      );
    }
    expect(result.funds[0].staff[0].cost).toBeGreaterThan(0);
    const fund = result.funds[0];
    expect(fund.fees).toBeCloseTo(120 * 0.6 * 12);
    expect(fund.salary + fund.fringe + fund.fees + fund.other).toBeCloseTo(
      fund.spending
    );
    expect(fund.startingBalance - fund.spending).toBeCloseTo(fund.ending);
    expect(result.chart[0].personnel).toBeCloseTo(
      6000.01 * 0.5 * 0.6 * 1.4 + 120 * 0.6
    );
    expect(result.chart.at(-1)!.personnel).toBeGreaterThan(
      result.chart[0].personnel
    );
  });

  it('carries the final balance through a horizon after a project closes', () => {
    const source = fixture();
    source.projects[0].endDate = '2026-12-31';
    source.settings!.startMonth = '2027-02';
    const plan = fromServerProjection(source);
    const rows = computePiProjection(source).rows.filter(
      (r) => r.month === '2026-12'
    );
    expect(projectGuidedPlan(plan).chart[0].balance).toBeCloseTo(
      rows.reduce((sum, row) => sum + row.remaining, 0)
    );
  });

  it('keeps two unsaved hires with the same name separate in project costs', () => {
    const source = fixture();
    source.jobs = [];
    const plan = fromServerProjection(source);
    const person = fromServerProjection(fixture()).staff[0];
    plan.staff = [
      {
        ...structuredClone(person),
        annualSalary: 12_000,
        id: 'hire-a',
        name: 'Planned hire',
        serverJob: { ...person.serverJob!, id: 0, isSeeded: false },
      },
      {
        ...structuredClone(person),
        annualSalary: 24_000,
        id: 'hire-b',
        name: 'Planned hire',
        serverJob: { ...person.serverJob!, id: 0, isSeeded: false },
      },
    ];
    const people = projectGuidedPlan(plan).funds[0].staff;
    expect(people).toHaveLength(2);
    expect(people[1].cost).toBeGreaterThan(people[0].cost);
  });

  it('validates unbounded funding entries throughout an extended horizon', () => {
    const plan = fromServerProjection(fixture());
    plan.months = 18;
    plan.staff[0].splits.push({
      endMonth: '2028-01',
      fundingId: plan.funding[0].id,
      id: 'extra',
      percent: 10,
      startMonth: '2027-10',
    });
    expect(staffValidation(plan.staff[0], plan)).toContain('50% or less');
  });

  it('counts outside funding against the appointment limit', () => {
    const plan = fromServerProjection(fixture());
    plan.staff[0].splits[0].percent = 40;
    expect(staffValidation(plan.staff[0], plan)).toContain('50% or less');
  });
});

describe('snapshot calculation corrections', () => {
  it('treats datetime2 snapshot times without a timezone as UTC at month boundaries', () => {
    const source = fixture();
    source.seededAt = '2026-10-31T23:30:00';
    const withoutZone = computePiProjection(source, { endMonth: '2026-11' });
    const explicitUtc = computePiProjection(
      { ...source, seededAt: `${source.seededAt}Z` },
      { endMonth: '2026-11' }
    );
    expect(withoutZone).toEqual(explicitUtc);
    expect(withoutZone.rows.find((row) => row.kind === 'blended')?.month).toBe(
      '2026-10'
    );
  });

  it('does not subtract current-month actuals twice from spent-to-date', () => {
    const source = fixture();
    source.jobs = [];
    source.projects[0].expenses = [];
    const row = computePiProjection(source).rows.find(
      (r) => r.month === '2026-10' && r.expenditureCategory === SUPPLIES
    )!;
    expect(row.remaining).toBe(8800);
  });

  it('still subtracts actual costs in a category with no budget row', () => {
    const source = fixture();
    source.jobs = [];
    source.projects[0].budgets = [];
    source.projects[0].expenses = [];
    const row = computePiProjection(source).rows.find(
      (r) => r.month === '2026-10' && r.expenditureCategory === SUPPLIES
    )!;
    expect(row.remaining).toBe(-100);
    expect(row.actualAmount).toBe(100);
  });

  it('replaces current-month personnel actuals with the whole projected payroll month', () => {
    const source = fixture();
    source.projects[0].budgets.push({
      budget: 10_000,
      committed: 0,
      expenditureCategory: SALARY_CATEGORY,
      isSeeded: true,
      spentToDate: 1000,
    });
    source.projects[0].actuals.push({
      amount: 1000,
      expenditureCategory: SALARY_CATEGORY,
      month: '2026-10-01',
    });
    const row = computePiProjection(source).rows.find(
      (r) => r.month === '2026-10' && r.expenditureCategory === SALARY_CATEGORY
    )!;
    expect(row.actualAmount).toBe(0);
    expect(row.remaining).toBeCloseTo(10_000 - 6000.01 * 0.5 * 0.6);
  });

  it('respects project start dates and limits distant dates to the requested horizon', () => {
    const source = fixture();
    source.projects[0].startDate = '2027-01-01';
    source.projects[0].endDate = '9999-12-31';
    const rows = computePiProjection(source, { endMonth: '2027-03' }).rows;
    expect(
      rows
        .filter((r) => r.month === '2026-11')
        .every((r) => r.projectedAmount === 0)
    ).toBe(true);
    expect(rows.at(-1)!.month).toBe('2027-03');
    expect(
      rows.find(
        (r) =>
          r.month === '2027-01' && r.expenditureCategory === FRINGE_CATEGORY
      )!.projectedAmount
    ).toBeGreaterThan(0);
  });
});
