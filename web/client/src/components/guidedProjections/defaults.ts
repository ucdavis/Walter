import type { ProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import type { FundingSource } from '@/components/projections/projection.ts';
import type {
  ProjectionExpense,
  ProjectionProject,
} from '@/queries/projections.ts';

export type PlanFunding = FundingSource & {
  serverProject?: ProjectionProject;
};

export type LegacyStaff = {
  annualSalary: number;
  endMonth: string;
  fringeRate: number;
  fundingId: string;
  id: string;
  included: boolean;
  name: string;
  percent: number;
  startMonth: string;
};

export type PlanExpense = {
  amount: number;
  frequency: 'monthly' | 'once';
  fundingId: string;
  id: string;
  month: string;
  name: string;
  serverExpense?: ProjectionExpense;
};

export type LegacyPlan = {
  expenses: PlanExpense[];
  funding: PlanFunding[];
  id: string;
  months: number;
  name: string;
  note: string;
  selectedFunding: string[];
  staff: LegacyStaff[];
  startMonth: string;
};

export const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);

export const shortMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 1,
    notation: 'compact',
    style: 'currency',
  }).format(value);

export function createPlanDefaults(
  data: ProjectionDemoPlan,
  name = 'Untitled plan'
): LegacyPlan {
  return {
    expenses: [],
    funding: structuredClone(data.fundingSources),
    id: crypto.randomUUID(),
    months: 12,
    name,
    note: '',
    selectedFunding: data.fundingSources.map((source) => source.id),
    staff: data.people.map((person) => {
      const rows = data.allocations
        .filter((row) => row.personId === person.id)
        .sort((a, b) => a.month.localeCompare(b.month));
      return {
        ...person,
        endMonth: rows.at(-1)?.month ?? data.planningEndDate.slice(0, 7),
        fundingId: rows[0]?.fundingSourceId ?? data.fundingSources[0]?.id ?? '',
        included: true,
        percent: rows[0]?.percent ?? 0,
        startMonth: rows[0]?.month ?? data.asOf,
      };
    }),
    startMonth: data.asOf,
  };
}
