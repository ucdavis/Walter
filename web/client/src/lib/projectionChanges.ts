import { compareAllocationSchedules } from '@/lib/projectionAllocations.ts';
import { buildSourceFundingBalance } from '@/lib/projectionFundingBalances.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type {
  CapturedFundingSource,
  ProjectionAppointment,
  ProjectionDraft,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

export const changePercent = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 12, style: 'percent' });
const calendar = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});
export const changeDate = (date: string) => calendar.format(new Date(date));
const monthName = (month: number) =>
  new Date(Date.UTC(2000, month - 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

export interface AssumptionChange {
  label: string;
  original: string | null;
  planned: string | null;
}

function appointmentAssumptions(
  original: ProjectionAppointment | undefined,
  planned: ProjectionAppointment
) {
  const rows: AssumptionChange[] = [];
  function add<K extends keyof ProjectionAppointment>(
    key: K,
    label: string,
    format: (value: NonNullable<ProjectionAppointment[K]>) => string
  ) {
    const from = original?.[key];
    const to = planned[key];
    if (from === to || (from == null && to == null)) {
      return;
    }
    rows.push({
      label,
      original: from == null ? null : format(from),
      planned: to == null ? null : format(to),
    });
  }
  add('startDate', 'Appointment start date', changeDate);
  add('endDate', 'Appointment end date', changeDate);
  add(
    'monthlySalary',
    'Full-time base salary assumption',
    (n) => formatCurrency(n) + ' / month'
  );
  add('fte', 'Appointment FTE', changePercent);
  add('cbrRate', 'Composite benefit rate', changePercent);
  add('vacationAccrualRate', 'Vacation accrual rate', changePercent);
  add('feeRemissionMonthly', 'Monthly fee remission', (n) => formatCurrency(n));
  add('colaRate', 'Annual salary adjustment', changePercent);
  add('colaMonth', 'Annual adjustment month', monthName);
  add('rateSet', 'Benefit rate set', (value) => value);
  return rows;
}

type ChangeKind = 'added' | 'changed' | 'excluded';

export interface StaffingChange {
  allocations: ReturnType<typeof compareAllocationSchedules>;
  appointment: ProjectionAppointment;
  assumptions: AssumptionChange[];
  kind: ChangeKind;
}

export interface BudgetChange {
  adjustment: number;
  category: string;
  original: number | null;
  revised: number;
}

export interface FundingChange {
  categories: BudgetChange[];
  dates: AssumptionChange[];
  importedAt?: string;
  kind: ChangeKind;
  plannedSource: boolean;
  source: CapturedFundingSource;
  total: BudgetChange | null;
}

function compareFunding(
  source: ProjectionFundingSource,
  added: boolean
): FundingChange | null {
  const plannedSource = source.sourceKind === 'Planned';
  const dates: AssumptionChange[] = [];
  function dateChange(
    label: string,
    captured: string | null,
    planned: string | null
  ) {
    if (added || captured !== planned) {
      dates.push({
        label,
        original: plannedSource || !captured ? null : changeDate(captured),
        planned: planned ? changeDate(planned) : null,
      });
    }
  }
  dateChange('Funding start date', source.capturedStartDate, source.startDate);
  dateChange('Funding end date', source.capturedEndDate, source.endDate);

  const categories: BudgetChange[] = [];
  const balances = buildSourceFundingBalance(source, []).categories;
  const total = {
    adjustment: 0,
    category: 'Source total',
    original: 0,
    revised: 0,
  };
  for (const row of balances) {
    total.original += row.capturedAvailable;
    total.adjustment += row.adjustment;
    total.revised += row.revisedAvailable;
    // The general-pool adjustment belongs to the source total, not to a financial category.
    if (row.isBalanceAdjustment) {
      continue;
    }
    const established = !row.budgetRecorded && row.hasBudget;
    if (row.adjustment || established || (added && row.hasBudget)) {
      categories.push({
        adjustment: row.adjustment,
        category: row.expenditureCategory,
        original: row.budgetRecorded ? row.capturedAvailable : null,
        revised: Math.round(row.revisedAvailable * 100) / 100,
      });
    }
  }
  // Net cents determine whether a source grew, shrank, or only redistributed its budget.
  total.adjustment = Math.round(total.adjustment * 100) / 100;
  total.original = Math.round(total.original * 100) / 100;
  total.revised = Math.round(total.revised * 100) / 100;
  const showBudget =
    added || categories.length > 0 || source.balanceAdjustment !== 0;
  if (!showBudget && !dates.length) {
    return null;
  }
  return {
    categories,
    dates,
    importedAt: added && !plannedSource ? source.capturedAt : undefined,
    kind: added ? 'added' : 'changed',
    plannedSource,
    source,
    total: showBudget ? total : null,
  };
}

/** Derive the final report only from the original capture and applied workspace content. */
export function buildPlanChanges(plan: ProjectionDraft) {
  const { appointments, comparison, fundingSources } = plan.content;
  const originals = new Map(comparison.appointments.map((a) => [a.id, a]));
  const staffing: StaffingChange[] = [];
  for (const appointment of appointments) {
    const original = originals.get(appointment.id);
    originals.delete(appointment.id);
    const assumptions = appointmentAssumptions(original, appointment);
    const allocations = compareAllocationSchedules(
      original?.allocations ?? [],
      appointment.allocations
    );
    if (!original || assumptions.length || allocations.length) {
      staffing.push({
        allocations,
        appointment,
        assumptions,
        kind: original ? 'changed' : 'added',
      });
    }
  }
  for (const appointment of originals.values()) {
    staffing.push({
      allocations: [],
      appointment,
      assumptions: [],
      kind: 'excluded',
    });
  }

  const captured = new Map(comparison.fundingSources.map((s) => [s.id, s]));
  const funding: FundingChange[] = [];
  for (const source of fundingSources) {
    const included = captured.delete(source.id);
    const change = compareFunding(source, !included);
    if (change) {
      funding.push(change);
    }
  }
  for (const source of captured.values()) {
    funding.push({
      categories: [],
      dates: [],
      kind: 'excluded',
      plannedSource: false,
      source,
      total: null,
    });
  }
  const sourceNames = new Map(
    [...comparison.fundingSources, ...fundingSources].map((s) => [
      s.id,
      [s.name, s.projectNumber, s.taskNumber && 'Task ' + s.taskNumber]
        .filter(Boolean)
        .join(' · '),
    ])
  );
  const affectedSources = new Set(funding.map((c) => c.source.id));
  for (const change of staffing) {
    for (const period of change.allocations) {
      for (const share of period.shares) {
        if (share.fundingSourceId !== null) {
          affectedSources.add(share.fundingSourceId);
        }
      }
    }
  }
  return {
    funding,
    fundingSourceCount: affectedSources.size,
    sourceNames,
    staffing,
  };
}
