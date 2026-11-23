import { compareAllocationSchedules } from '@/lib/projectionAllocations.ts';
import { sumCategoryBudgets } from '@/lib/projectionBudgets.ts';
import { buildSourceFundingBalance } from '@/lib/projectionFundingBalances.ts';
import { sourceKey } from '@/lib/projectionSources.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type {
  CapturedAppointment,
  ProjectionDraft,
  ProjectionFundingAllocation,
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
  original: CapturedAppointment | undefined,
  planned: CapturedAppointment
) {
  const rows: AssumptionChange[] = [];
  function add<K extends keyof CapturedAppointment>(
    key: K,
    label: string,
    format: (value: NonNullable<CapturedAppointment[K]>) => string
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
    (n) => formatCurrency(n * 12) + ' / year'
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
  allocationCaptureUnavailable: boolean;
  allocations: ReturnType<typeof compareAllocationSchedules>;
  appointment: CapturedAppointment;
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
  capturedAt: string;
  categories: BudgetChange[];
  dates: AssumptionChange[];
  plannedSource: boolean;
  source: ProjectionFundingSource;
  total: BudgetChange;
}

function compareFunding(source: ProjectionFundingSource): FundingChange | null {
  const plannedSource = source.sourceKind === 'Planned';
  function dateRow(
    label: string,
    captured: string | null,
    planned: string | null
  ) {
    return {
      label,
      original: plannedSource || !captured ? null : changeDate(captured),
      planned: planned ? changeDate(planned) : null,
    };
  }

  const categories: BudgetChange[] = [];
  const balances = buildSourceFundingBalance(source, []).categories;
  let original = 0;
  for (const row of balances) {
    original += row.capturedAvailable;
    // The general-pool adjustment belongs to the source total, not to a financial category.
    if (row.isBalanceAdjustment) {
      continue;
    }
    const established = !row.budgetRecorded && row.hasBudget;
    if (row.adjustment || established || (plannedSource && row.hasBudget)) {
      categories.push({
        adjustment: row.adjustment,
        category: row.expenditureCategory,
        original: row.budgetRecorded ? row.capturedAvailable : null,
        revised: row.revisedAvailable,
      });
    }
  }
  if (
    !plannedSource &&
    !categories.length &&
    source.balanceAdjustment === 0 &&
    source.capturedStartDate === source.startDate &&
    source.capturedEndDate === source.endDate
  ) {
    return null;
  }
  const adjustment =
    sumCategoryBudgets(source.categoryAdjustments) + source.balanceAdjustment;
  return {
    capturedAt: source.capturedAt,
    categories,
    dates: [
      dateRow('Funding start date', source.capturedStartDate, source.startDate),
      dateRow('Funding end date', source.capturedEndDate, source.endDate),
    ],
    plannedSource,
    source,
    total: {
      adjustment,
      category: 'Source total',
      original,
      revised: original + adjustment,
    },
  };
}

/** Derive the final report only from the original capture and applied workspace content. */
export function buildPlanChanges(plan: ProjectionDraft) {
  const { appointments, comparison, fundingSources } = plan.content;
  const allSources = [...comparison.fundingSources, ...fundingSources];
  const sourcesByKey = new Map(
    allSources.map((source) => [sourceKey(source), source])
  );
  const sourceIds = new Map(
    allSources.map((source) => [
      source.id,
      sourcesByKey.get(sourceKey(source))!.id,
    ])
  );
  function canonicalAllocations(
    allocations: ProjectionFundingAllocation[] | null
  ) {
    return allocations === null
      ? null
      : allocations.map((allocation) => ({
          ...allocation,
          fundingSourceId:
            allocation.fundingSourceId === null
              ? null
              : sourceIds.get(allocation.fundingSourceId)!,
        }));
  }
  const originals = new Map(comparison.appointments.map((a) => [a.id, a]));
  const staffing: StaffingChange[] = [];
  for (const appointment of appointments) {
    const original = originals.get(appointment.id);
    originals.delete(appointment.id);
    const assumptions = appointmentAssumptions(original, appointment);
    const originalAllocations = original ? original.allocations : [];
    const allocations = compareAllocationSchedules(
      canonicalAllocations(originalAllocations),
      appointment.allocations
    );
    if (!original || assumptions.length || allocations.length) {
      staffing.push({
        allocationCaptureUnavailable: originalAllocations === null,
        allocations,
        appointment,
        assumptions,
        kind: original ? 'changed' : 'added',
      });
    }
  }
  for (const appointment of originals.values()) {
    staffing.push({
      allocationCaptureUnavailable: appointment.allocations === null,
      allocations: compareAllocationSchedules(
        canonicalAllocations(appointment.allocations),
        []
      ),
      appointment,
      assumptions: [],
      kind: 'excluded',
    });
  }

  const funding: FundingChange[] = [];
  for (const source of fundingSources) {
    const change = compareFunding(source);
    if (change) {
      funding.push(change);
    }
  }
  const sourceNames = new Map(
    [...sourcesByKey.values()].map((s) => [
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
