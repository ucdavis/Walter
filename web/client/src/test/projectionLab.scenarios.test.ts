import { describe, expect, it } from 'vitest';
import { createDemoData } from '@/demo/data.ts';
import { createProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import {
  compareScenario,
  previewScenario,
  projectionFacts,
  type Scenario,
} from '@/components/projections/scenarios.ts';

const original = () => createProjectionDemoPlan(createDemoData(42, '2026-09'));
const hire: Scenario = {
  assumptions: ['Eligible grant work'],
  operations: [
    {
      annualSalary: 98_400,
      endMonth: '2027-06',
      fringeRate: 2,
      fundingSourceId: 'DEMOSPN001',
      name: 'Casey',
      percent: 50,
      personId: 'new-grad',
      startMonth: '2027-01',
      type: 'hire',
    },
  ],
  title: 'Hire Casey',
};

describe('projection scenarios', () => {
  it('previews a hire without changing the original and includes fringe and indirect once', () => {
    const plan = original();
    const before = structuredClone(plan);
    const draft = previewScenario(plan, hire, '2026-09');
    const comparison = compareScenario(plan, draft);
    expect(plan).toEqual(before);
    expect(draft.people).toHaveLength(7);
    expect(
      draft.allocations.filter((row) => row.personId === 'new-grad')
    ).toHaveLength(6);
    expect(comparison.sources[0].costChange).toBeCloseTo(40_147.2);
    expect(comparison.sources[0].proposed.remainingBalance).toBeCloseTo(
      12_213.33
    );
    expect(comparison.sources[1].balanceChange).toBe(0);
  });

  it('replaces the proposal when shortened instead of stacking another hire', () => {
    const plan = original();
    const shorter = structuredClone(hire);
    if (shorter.operations[0].type === 'hire') {
      shorter.operations[0].endMonth = '2027-03';
    }
    const draft = previewScenario(plan, shorter);
    expect(draft.people).toHaveLength(7);
    expect(compareScenario(plan, draft).sources[0].costChange).toBeCloseTo(
      20_073.6
    );
  });

  it('moves an appointment while preserving earlier months and shows added indirect cost', () => {
    const plan = original();
    const scenario: Scenario = {
      assumptions: [],
      operations: [
        {
          endMonth: '2027-07',
          personId: 'DEMO-EMP-4',
          splits: [{ fundingSourceId: 'DEMOSPN001', percent: 50 }],
          startMonth: '2027-01',
          type: 'allocate',
        },
      ],
      title: 'Move Alex',
    };
    const draft = previewScenario(plan, scenario);
    const comparison = compareScenario(plan, draft);
    expect(comparison.sources[0].costChange).toBeCloseTo(45_838.8);
    expect(comparison.sources[1].costChange).toBeCloseTo(-28_649.25);
    expect(
      comparison.sources.reduce((sum, row) => sum + row.costChange, 0)
    ).toBeCloseTo(17_189.55);
    expect(
      draft.allocations.filter(
        (row) => row.personId === 'DEMO-EMP-4' && row.month < '2027-01'
      )
    ).toEqual(
      plan.allocations.filter(
        (row) => row.personId === 'DEMO-EMP-4' && row.month < '2027-01'
      )
    );
    expect(
      draft.allocations
        .filter(
          (row) => row.personId === 'DEMO-EMP-4' && row.month >= '2027-01'
        )
        .every((row) => row.fundingSourceId === 'DEMOSPN001')
    ).toBe(true);
  });

  it('grounds the shortfall in months with actual personnel costs', () => {
    const facts = projectionFacts(original());
    expect(facts[1].firstDeficitMonth).toBe('2027-01');
    expect(facts[1].averageMonthlyCost).toBeCloseTo(19_142.75);
    expect(facts[1].spendingMonthCount).toBe(11);
    expect(facts[1].monthlyReductionToBreakEven).toBeCloseTo(11_232.03);
    expect(
      facts[1].people.reduce((sum, person) => sum + person.totalCost, 0)
    ).toBeCloseTo(facts[1].totalDrawdown);
  });

  it('rejects dates outside the fund and overallocated replacements without mutating the plan', () => {
    const plan = original();
    const before = structuredClone(plan);
    const outOfRange = structuredClone(hire);
    if (outOfRange.operations[0].type === 'hire') {
      outOfRange.operations[0].endMonth = '2028-01';
    }
    expect(() => previewScenario(plan, outOfRange)).toThrow('funding dates');
    const scenario: Scenario = {
      assumptions: [],
      operations: [
        {
          endMonth: '2027-07',
          personId: 'DEMO-EMP-4',
          splits: [
            { fundingSourceId: 'DEMOSPN001', percent: 80 },
            { fundingSourceId: 'DEMOINT001', percent: 50 },
          ],
          startMonth: '2027-01',
          type: 'allocate',
        },
      ],
      title: 'Invalid split',
    };
    expect(() => previewScenario(plan, scenario)).toThrow('100%');
    expect(plan).toEqual(before);
  });

  it('rejects changing a funding end date when it would strand existing allocations', () => {
    const plan = original();
    const source = plan.fundingSources[0];
    expect(() =>
      previewScenario(plan, {
        assumptions: [],
        operations: [
          {
            endDate: '2026-12-31',
            fundingSourceId: source.id,
            indirectRate: source.indirectRate,
            startDate: source.startDate,
            startingBalance: source.startingBalance,
            type: 'funding',
          },
        ],
        title: 'End grant',
      })
    ).toThrow('funding dates');
  });
});
