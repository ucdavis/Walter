import { describe, expect, it } from 'vitest';
import { createDemoData } from '@/demo/data.ts';
import { createProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import { projectPlan } from '@/components/projections/projection.ts';

describe('ProjectionLab demo data', () => {
  it('combines all tasks and categories into one funding balance per active project', () => {
    for (const [seed, asOf] of [
      [42, '2026-09'],
      [107, '2027-12'],
    ] as const) {
      const data = createDemoData(seed, asOf);
      const plan = createProjectionDemoPlan(data);
      expect(plan.fundingSources.map((source) => source.id)).toEqual([
        'DEMOSPN001',
        'DEMOINT001',
      ]);
      expect(plan.people).toHaveLength(6);
      expect(
        plan.fundingSources.some((source) => source.id.startsWith('DEMOCLO'))
      ).toBe(false);
      for (const source of plan.fundingSources) {
        const rows = data.projects.filter(
          (row) => row.projectNumber === source.id
        );
        expect(Math.round(source.startingBalance * 100)).toBe(
          rows.reduce((total, row) => total + Math.round(row.balance * 100), 0)
        );
        expect(source.startDate).toBe(`${asOf}-01`);
      }
    }
  });

  it('assigns each person to the same project as the personnel table', () => {
    const data = createDemoData(42, '2026-09');
    const plan = createProjectionDemoPlan(data);
    const result = projectPlan(plan);
    expect(result.invalidAllocations).toEqual([]);
    expect(
      result.allocationValidations.some((value) => value.overAllocated)
    ).toBe(false);

    for (const appointment of data.personnel) {
      const allocations = plan.allocations.filter(
        (allocation) => allocation.personId === appointment.employeeId
      );
      expect(allocations).toHaveLength(11);
      expect(allocations[0].month).toBe('2026-09');
      expect(allocations.at(-1)?.month).toBe('2027-07');
      expect(
        allocations.every(
          (allocation) => allocation.fundingSourceId === appointment.projectId
        )
      ).toBe(true);
      const drawdown = result.drawdowns.find(
        (cost) => cost.personId === appointment.employeeId
      )!;
      const salary =
        (appointment.monthlyRate *
          appointment.fte *
          appointment.distributionPercent) /
        100;
      expect(drawdown.salaryCost).toBeCloseTo(salary);
      expect(drawdown.fringeCost).toBeCloseTo(
        salary * appointment.compositeBenefitRate
      );
      expect(drawdown.indirectCost).toBeCloseTo(
        salary *
          (1 + appointment.compositeBenefitRate) *
          (appointment.projectId === 'DEMOINT001' ? 0 : 0.6)
      );
    }
  });

  it('stops at the earliest funding, job, or project end and skips expired appointments', () => {
    const data = createDemoData(42, '2026-09');
    data.personnel[0].jobEndDate = '2026-10-15';
    data.personnel[1].fundingEndDate = '2026-08-31';
    const plan = createProjectionDemoPlan(data);
    expect(
      plan.allocations
        .filter((allocation) => allocation.personId === 'DEMO-EMP-1')
        .map((allocation) => allocation.month)
    ).toEqual(['2026-09', '2026-10']);
    expect(plan.people.some((person) => person.id === 'DEMO-EMP-2')).toBe(
      false
    );
    expect(
      plan.allocations.some(
        (allocation) => allocation.personId === 'DEMO-EMP-2'
      )
    ).toBe(false);
  });

  it('builds a fresh editable plan without changing the regular demo records', () => {
    const data = createDemoData(42, '2026-09');
    const before = structuredClone(data);
    const plan = createProjectionDemoPlan(data);
    plan.fundingSources[0].startingBalance = 1;
    plan.people[0].annualSalary = 1;
    plan.allocations[0].percent = 1;
    expect(data).toEqual(before);
    expect(createProjectionDemoPlan(data)).not.toEqual(plan);
  });
});
