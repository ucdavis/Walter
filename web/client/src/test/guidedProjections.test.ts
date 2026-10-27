import { describe, expect, it } from 'vitest';
import { createDemoData } from '@/demo/data.ts';
import {
  createProjectionDemoPlan,
  type ProjectionDemoPlan,
} from '@/demo/projectionPlan.ts';
import { createPlanDefaults } from '@/components/guidedProjections/defaults.ts';
import {
  createProjectionPlan,
  projectGuidedPlan,
  migrateSavedPlan,
  staffValidation,
} from '@/components/guidedProjections/planModel.ts';
import { readSavedPlans } from '@/components/guidedProjections/savedPlans.ts';

function fixture(): ProjectionDemoPlan {
  return {
    allocations: ['2026-01', '2026-02', '2026-03'].flatMap((month) => [
      { fundingSourceId: 'A', month, percent: 60, personId: 'person' },
      { fundingSourceId: 'B', month, percent: 40, personId: 'person' },
    ]),
    asOf: '2026-01',
    fundingSources: [
      {
        color: '#000',
        endDate: '2026-12-31',
        id: 'A',
        indirectRate: 60,
        name: 'Project A',
        startDate: '2026-01-01',
        startingBalance: 30_000,
      },
      {
        color: '#fff',
        endDate: '2026-12-31',
        id: 'B',
        indirectRate: 0,
        name: 'Project B',
        startDate: '2026-01-01',
        startingBalance: 200_000,
      },
    ],
    ownerName: 'Demo',
    people: [
      { annualSalary: 120_000, fringeRate: 25, id: 'person', name: 'Person' },
    ],
    planningEndDate: '2026-12-31',
  };
}

describe('Guided workspace funding splits', () => {
  it('preserves concurrent project assignments and each project indirect rate', () => {
    const plan = createProjectionPlan(fixture());
    expect(plan.staff[0].splits).toHaveLength(2);
    const result = projectGuidedPlan(plan);
    // $10,000 salary per month: 60% + 25% fringe + 60% indirect = $12,000 on A.
    expect(result.funds[0].chart[0]).toMatchObject({
      fringe: 1500,
      indirect: 4500,
      personnel: 12_000,
      salary: 6000,
    });
    expect(result.funds[1].chart[0]).toMatchObject({
      fringe: 1000,
      indirect: 0,
      personnel: 5000,
      salary: 4000,
    });
    expect(result.personnel).toBe(51_000);
    expect(staffValidation(plan.staff[0], plan)).toBeNull();
  });

  it('keeps a project shortfall visible when the combined balance is positive', () => {
    const result = projectGuidedPlan(createProjectionPlan(fixture()));
    expect(result.ending).toBe(179_000);
    expect(result.firstDeficit).toBeUndefined();
    expect(result.funds[0].firstDeficit).toBe('2026-03');
    expect(result.funds[0].chart[2].balance).toBe(-6000);
    expect(result.funds[1].firstDeficit).toBeUndefined();
    result.chart.forEach((point, index) => {
      expect(point.balance).toBe(
        result.funds.reduce(
          (total, fund) => total + fund.chart[index].balance,
          0
        )
      );
    });
  });

  it('preserves changes in effort and missing months in an imported snapshot', () => {
    const initial = fixture();
    initial.allocations = [
      {
        fundingSourceId: 'A',
        month: '2026-01',
        percent: 60,
        personId: 'person',
      },
      {
        fundingSourceId: 'A',
        month: '2026-02',
        percent: 40,
        personId: 'person',
      },
      {
        fundingSourceId: 'A',
        month: '2026-04',
        percent: 40,
        personId: 'person',
      },
    ];
    const plan = createProjectionPlan(initial);
    expect(plan.staff[0].splits).toHaveLength(3);
    expect(
      projectGuidedPlan(plan)
        .funds[0].chart.slice(0, 4)
        .map((point) => point.personnel)
    ).toEqual([12_000, 8000, 0, 8000]);
  });

  it('flags overlapping effort above 100%, but allows successive assignments', () => {
    const plan = createProjectionPlan(fixture());
    plan.staff[0].splits[1].percent = 50;
    expect(staffValidation(plan.staff[0], plan)).toContain('110% in Jan 2026');
    plan.staff[0].splits[1].startMonth = '2026-04';
    plan.staff[0].splits[1].endMonth = '2026-06';
    expect(staffValidation(plan.staff[0], plan)).toBeNull();
  });

  it('assigns expenses only to their project and stops charging at project end', () => {
    const plan = createProjectionPlan(fixture());
    plan.funding[0].endDate = '2026-02-28';
    plan.expenses = [
      {
        amount: 500,
        frequency: 'monthly',
        fundingId: 'A',
        id: 'supplies',
        month: '2026-01',
        name: 'Supplies',
      },
      {
        amount: 200,
        frequency: 'once',
        fundingId: 'B',
        id: 'travel',
        month: '2026-02',
        name: 'Travel',
      },
    ];
    const result = projectGuidedPlan(plan);
    expect(result.funds[0].other).toBe(1000);
    expect(result.funds[0].personnel).toBe(24_000);
    expect(result.funds[0].chart[2].personnel).toBe(0);
    expect(result.funds[1].other).toBe(200);
    expect(result.other).toBe(1200);
  });

  it('retains current demo balances when migrating saved single-project plans', () => {
    const initial = createProjectionDemoPlan(createDemoData(42, '2026-09'));
    const previous = createPlanDefaults(initial, 'My saved plan');
    previous.expenses = [
      {
        amount: 500,
        frequency: 'monthly',
        fundingId: previous.selectedFunding[0],
        id: 'expense',
        month: initial.asOf,
        name: 'Supplies',
      },
    ];
    const migrated = migrateSavedPlan(previous);
    const after = projectGuidedPlan(migrated);
    expect(migrated.name).toBe('My saved plan');
    expect(after.ending).toBeCloseTo(-77_191.81, 2);
    expect(after.funds[1].firstDeficit).toBe('2027-01');
    expect(after.funds[1].ending).toBeCloseTo(-123_552.34, 2);
  });

  it('reopens legacy and split plans without losing their allocations', () => {
    const initial = fixture();
    const legacy = createPlanDefaults(initial);
    const split = createProjectionPlan(initial);
    const key = 'hybrid-test-plans';
    localStorage.setItem(key, JSON.stringify([legacy, split]));
    const read = readSavedPlans(initial, key);
    expect(read[0].staff[0].splits).toHaveLength(1);
    expect(read[1].staff[0].splits).toEqual(split.staff[0].splits);
    expect(projectGuidedPlan(read[1]).ending).toBe(179_000);
    localStorage.removeItem(key);
  });
});
