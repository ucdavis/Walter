import type { ProjectionDemoPlan } from '@/demo/projectionPlan.ts';
import {
  createProjectionPlan,
  projectGuidedPlan,
  migrateSavedPlan,
  staffValidation,
  type ProjectionPlan,
} from '@/components/guidedProjections/planModel.ts';

export function readSavedPlans(
  initial: ProjectionDemoPlan,
  key: string
): ProjectionPlan[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      Array.isArray(stored) &&
      stored.every(
        (plan: ProjectionPlan) =>
          plan &&
          typeof plan.id === 'string' &&
          typeof plan.name === 'string' &&
          [6, 12, 18].includes(plan.months) &&
          Number.isFinite(projectGuidedPlan(migrateSavedPlan(plan)).ending)
      )
    ) {
      return stored.map(migrateSavedPlan);
    }
  } catch {
    // An unavailable or older browser snapshot must not prevent opening the demo.
  }
  const baseline = createProjectionPlan(initial, 'Current staffing');
  baseline.note = 'Current people and project funding, carried forward.';
  const fieldwork = createProjectionPlan(initial, 'Next field season');
  fieldwork.note = 'Current staffing plus monthly lab supplies.';
  if (fieldwork.selectedFunding[0]) {
    fieldwork.expenses = [
      {
        amount: 500,
        frequency: 'monthly',
        fundingId: fieldwork.selectedFunding[0],
        id: crypto.randomUUID(),
        month: initial.asOf,
        name: 'Lab supplies',
      },
    ];
  }
  return [baseline, fieldwork];
}

export function planValidation(plan: ProjectionPlan) {
  if (!plan.name.trim()) {
    return 'Give your plan a name.';
  }
  if (!plan.selectedFunding.length) {
    return 'Include at least one funding source.';
  }
  if (plan.serverProjection) {
    const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    if (plan.name.trim().length > 200) {
      return 'Keep the plan name to 200 characters or fewer.';
    }
    if (plan.note.length > 2000) {
      return 'Keep plan notes to 2,000 characters or fewer.';
    }
    if (
      !validMonth(plan.startMonth) ||
      plan.startMonth < plan.serverProjection.seededAt.slice(0, 7)
    ) {
      return 'Start the plan in the snapshot month or later.';
    }
    if (
      !Number.isInteger(plan.months) ||
      plan.months < 1 ||
      plan.months > 120
    ) {
      return 'Choose a plan length between 1 and 120 months.';
    }
    if (
      ![3, 6, 12].includes(
        plan.historyMonths ?? plan.serverProjection.historyMonths
      )
    ) {
      return 'Choose a 3, 6, or 12 month spending history.';
    }
    if (
      plan.funding.some(
        (fund) =>
          !fund.name.trim() ||
          !fund.startDate ||
          !fund.endDate ||
          fund.startDate > fund.endDate ||
          !Number.isFinite(fund.startingBalance)
      )
    ) {
      return 'Check the name, dates, and balance for each funding source.';
    }
    if (
      plan.expenses.some(
        (expense) =>
          !validMonth(expense.month) ||
          !Number.isFinite(expense.amount) ||
          (expense.serverExpense?.endMonth &&
            expense.month > expense.serverExpense.endMonth.slice(0, 7))
      )
    ) {
      return 'Check each expense amount and date range.';
    }
  }
  for (const person of plan.staff.filter((row) => row.included)) {
    const error = staffValidation(person, plan);
    if (error) {
      return error;
    }
  }
  if (plan.expenses.some((expense) => !expense.name.trim() || !expense.month)) {
    return 'Give each expense a name and a starting month.';
  }
  return null;
}
