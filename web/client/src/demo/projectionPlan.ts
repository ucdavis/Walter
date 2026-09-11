import { monthAt, type DemoData } from '@/demo/data.ts';
import {
  monthsBetweenInclusive,
  type FundingSource,
  type MonthlyAllocation,
  type Person,
} from '@/components/projections/projection.ts';

export type ProjectionDemoPlan = {
  allocations: MonthlyAllocation[];
  asOf: string;
  fundingSources: FundingSource[];
  ownerName: string;
  people: Person[];
  planningEndDate: string;
};

const colors = [
  '#2f7f79',
  '#62a94b',
  '#ed9451',
  '#9470c8',
  '#5f7fd3',
  '#bb6283',
  '#8b793a',
  '#4e929e',
  '#697d57',
];

export function createProjectionDemoPlan(data: DemoData): ProjectionDemoPlan {
  const planningEndDate = `${monthAt(data.asOf, 13)}-28`;
  const sources = new Map<string, FundingSource>();

  for (const row of data.projects) {
    if (
      row.projectStatusCode !== 'ACTIVE' ||
      (row.awardEndDate && row.awardEndDate.slice(0, 7) < data.asOf)
    ) {
      continue;
    }

    // Combine every task and expenditure category into the project's available
    // balance so each project has one editable funding row.
    const id = row.projectNumber;
    let source = sources.get(id);
    if (!source) {
      source = {
        color: colors[sources.size % colors.length],
        description: row.projectNumber,
        endDate: row.awardEndDate ?? planningEndDate,
        id,
        indirectRate: Number(row.projectBurdenCostRate ?? 0) * 100,
        name: row.displayName,
        // The balance is already net of actuals and commitments. Starting at
        // the snapshot avoids charging historical personnel costs a second time.
        startDate:
          row.awardStartDate && row.awardStartDate.slice(0, 7) > data.asOf
            ? row.awardStartDate
            : `${data.asOf}-01`,
        startingBalance: 0,
      };
      sources.set(id, source);
    }
    source.startingBalance =
      Math.round((source.startingBalance + row.balance) * 100) / 100;
  }

  const people = new Map<string, Person>();
  const allocations: MonthlyAllocation[] = [];
  for (const appointment of data.personnel) {
    const source = sources.get(appointment.projectId);
    if (!source) {
      continue;
    }

    const startMonth = [
      data.asOf,
      source.startDate.slice(0, 7),
      appointment.fundingEffectiveDate?.slice(0, 7),
      appointment.jobEffectiveDate?.slice(0, 7),
    ]
      .filter(Boolean)
      .sort()
      .at(-1)!;
    const endMonth = [
      source.endDate.slice(0, 7),
      appointment.fundingEndDate?.slice(0, 7),
      appointment.jobEndDate?.slice(0, 7),
    ]
      .filter(Boolean)
      .sort()[0]!;
    if (startMonth > endMonth) {
      continue;
    }

    people.set(appointment.employeeId, {
      annualSalary: appointment.monthlyRate * 12,
      fringeRate: appointment.compositeBenefitRate * 100,
      id: appointment.employeeId,
      name: appointment.name,
    });
    for (const month of monthsBetweenInclusive(startMonth, endMonth)) {
      allocations.push({
        fundingSourceId: source.id,
        month,
        // Annual salary is the full-time rate. Carry FTE in the allocation
        // once, matching monthlyRate * fte * distributionPercent in Walter.
        percent: appointment.fte * appointment.distributionPercent,
        personId: appointment.employeeId,
      });
    }
  }

  return {
    allocations,
    asOf: data.asOf,
    fundingSources: [...sources.values()],
    ownerName: data.user.name,
    people: [...people.values()],
    planningEndDate,
  };
}
