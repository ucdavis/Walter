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
