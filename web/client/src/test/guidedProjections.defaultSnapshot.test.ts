import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareDefaultProjection } from '@/components/guidedProjections/defaultSnapshot.ts';
import {
  fromServerProjection,
  toServerProjection,
  withHistoryMonths,
} from '@/components/guidedProjections/serverPlan.ts';
import { projectGuidedPlan } from '@/components/guidedProjections/planModel.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import type {
  Projection,
  ProjectionJob,
  ProjectionProject,
} from '@/queries/projections.ts';

const category = '05 - Supplies';
function task(id: number, projectNumber = 'INTERNAL'): ProjectionProject {
  return {
    actuals: [
      { amount: 10 * id, expenditureCategory: category, month: '2026-10-01' },
    ],
    awardName: null,
    awardNumber: null,
    budgets: [
      {
        budget: 1000 * id,
        committed: 50 * id,
        expenditureCategory: category,
        isSeeded: true,
        spentToDate: 100 * id,
      },
    ],
    endDate: '2027-12-31',
    expenses: [
      {
        amount: 30 * id,
        description: null,
        endMonth: null,
        expenditureCategory: category,
        kind: 'Projected',
        startMonth: null,
      },
    ],
    id,
    isSeeded: true,
    projectName: projectNumber,
    projectNumber,
    projectType: projectNumber === 'INTERNAL' ? 'Internal' : 'Sponsored',
    runRates: [
      {
        expenditureCategory: category,
        historyMonths: 3,
        monthlyAmount: 30 * id,
      },
      {
        expenditureCategory: category,
        historyMonths: 6,
        monthlyAmount: 20 * id,
      },
    ],
    startDate: '2026-01-01',
    taskName: `Task ${id}`,
    taskNumber: String(id),
  };
}
function job(
  id: number,
  allocations: [number | null, number][]
): ProjectionJob {
  return {
    cbrRate: 0.3,
    colaMonth: 7,
    colaRate: 0,
    employeeId: String(id),
    endDate: null,
    feeRemissionMonthly: 0,
    fte: 1,
    fundingEntries: allocations.map(([projectId, percent]) => ({
      endDate: null,
      isSeeded: true,
      percent,
      projectId,
      startDate: null,
    })),
    id,
    isSeeded: true,
    jobCode: null,
    monthlySalary: 100,
    name: `Person ${id}`,
    positionNumber: String(id),
    rateSet: 'DVCMP',
    startDate: null,
    title: null,
    vacationAccrualRate: 0,
  };
}
function fixture(): Projection {
  return {
    createdAt: '2026-10-29T12:00:00Z',
    createdBy: null,
    historyMonths: 3,
    id: 0,
    jobs: [
      job(1, [
        [1, 0.2],
        [2, 0.3],
        [3, 0.25],
        [4, 0.15],
        [null, 0.1],
      ]),
      job(2, [[3, 1]]),
      job(3, [[4, 1]]),
    ],
    name: 'Default plan',
    piEmployeeId: 'PI',
    projects: [
      task(1),
      task(2),
      task(3),
      task(4, 'EXPIRED'),
      task(5, 'CURRENT'),
    ],
    seededAt: '2026-10-29T12:00:00Z',
    updatedAt: '2026-10-29T12:00:00Z',
    updatedBy: null,
  };
}
function portfolio(seed = fixture()) {
  return seed.projects.map((p) => ({
    awardEndDate: p.projectNumber === 'EXPIRED' ? '2026-10-28' : null,
    projectNumber: p.projectNumber!,
    projectType: p.projectType!,
    taskNum: p.taskNumber!,
    taskStatus: p.id === 3 ? 'Inactive' : 'Active',
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 29, 12));
});
afterEach(() => vi.useRealTimers());

describe('default projection portfolio', () => {
  it('excludes hidden tasks and expired awards before combining projects and staffing', () => {
    const seed = fixture();
    const original = structuredClone(seed);
    const result = prepareDefaultProjection(seed, portfolio());
    expect(result.projects.map((p) => p.projectNumber)).toEqual([
      'INTERNAL',
      'CURRENT',
    ]);
    const internal = result.projects[0];
    expect(internal.taskNumber).toBeNull();
    expect(internal.taskName).toBeNull();
    expect(internal.budgets).toEqual([
      {
        budget: 3000,
        committed: 150,
        expenditureCategory: category,
        isSeeded: true,
        spentToDate: 300,
      },
    ]);
    expect(internal.actuals[0].amount).toBe(30);
    expect(internal.expenses[0].amount).toBe(90);
    expect(internal.runRates.map((r) => r.monthlyAmount)).toEqual([90, 60]);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].fundingEntries).toEqual([
      {
        endDate: null,
        isSeeded: true,
        percent: 0.5,
        projectId: 1,
        startDate: null,
      },
      {
        endDate: null,
        isSeeded: true,
        percent: 0.5,
        projectId: null,
        startDate: null,
      },
    ]);
    expect(seed).toEqual(original);
  });

  it('matches the sum of eligible task calculations without double counting shared categories', () => {
    const seed = fixture();
    const eligible = {
      ...seed,
      jobs: seed.jobs.slice(0, 1),
      projects: seed.projects.filter((p) => [1, 2, 5].includes(p.id)),
    };
    const result = prepareDefaultProjection(seed, portfolio());
    const options = { endMonth: '2027-09' };
    const before = computePiProjection(eligible, options);
    const after = computePiProjection(result, options);
    for (const month of new Set(before.rows.map((r) => r.month))) {
      for (const field of [
        'remaining',
        'actualAmount',
        'projectedAmount',
      ] as const) {
        const total = (rows: typeof before.rows) =>
          rows
            .filter((r) => r.month === month)
            .reduce((sum, r) => sum + r[field], 0);
        expect(total(after.rows)).toBeCloseTo(total(before.rows), 8);
      }
    }
    const plan = fromServerProjection(result);
    expect(projectGuidedPlan(plan).funds.map((f) => f.name)).toEqual([
      'INTERNAL',
      'CURRENT',
    ]);
    const saved = toServerProjection(plan);
    expect(saved.projects).toHaveLength(2);
    expect(toServerProjection(fromServerProjection(saved))).toEqual(saved);
    expect(
      withHistoryMonths(plan, 6).expenses.find(
        (e) => e.fundingId === 'project-1'
      )?.amount
    ).toBe(60);
  });

  it('uses award expiry, keeps today and missing dates, and matches the latest award date rule', () => {
    const seed = fixture();
    const rows = portfolio();
    rows.find((r) => r.projectNumber === 'CURRENT')!.awardEndDate =
      '2026-10-29T00:00:00';
    rows.push({
      ...rows.find((r) => r.projectNumber === 'EXPIRED')!,
      awardEndDate: '2026-10-30',
    });
    // The sponsored table filters by award date, even when a project end date is earlier.
    seed.projects[4].endDate = '2026-09-01';
    const result = prepareDefaultProjection(seed, rows);
    expect(result.projects.map((p) => p.projectNumber)).toEqual([
      'INTERNAL',
      'EXPIRED',
      'CURRENT',
    ]);
    expect(result.projects[0].budgets[0].budget).toBe(3000);
  });

  it('preserves distinct funding periods when merging allocations to the same project', () => {
    const seed = fixture();
    seed.jobs[0].fundingEntries[0].endDate = '2026-12-31';
    seed.jobs[0].fundingEntries[1].startDate = '2027-01-01';
    const result = prepareDefaultProjection(seed, portfolio());
    expect(
      result.jobs[0].fundingEntries.filter((f) => f.projectId === 1)
    ).toEqual([
      {
        endDate: '2026-12-31',
        isSeeded: true,
        percent: 0.2,
        projectId: 1,
        startDate: null,
      },
      {
        endDate: null,
        isSeeded: true,
        percent: 0.3,
        projectId: 1,
        startDate: '2027-01-01',
      },
    ]);
  });

  it('returns an empty plan when no seed tasks belong to the visible dashboard portfolio', () => {
    const result = prepareDefaultProjection(fixture(), []);
    expect(result.projects).toEqual([]);
    expect(result.jobs).toEqual([]);
    expect(projectGuidedPlan(fromServerProjection(result)).ending).toBe(0);
  });
});
