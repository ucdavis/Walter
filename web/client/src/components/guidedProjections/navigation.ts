export const planSections = {
  expenses: 'Expenses',
  funding: 'Funding',
  overview: 'Overview',
  'plan-details': 'Plan details',
  staffing: 'Staffing',
} as const;

export type PlanSection = keyof typeof planSections;
export type PlanView = { project?: string; section?: PlanSection };

export function validatePlanSearch(
  search: Record<string, unknown>
): PlanView & {
  plan?: 'default';
} {
  return {
    plan: search.plan === 'default' ? 'default' : undefined,
    project:
      typeof search.project === 'string' && search.project.length > 0
        ? search.project
        : undefined,
    section:
      typeof search.section === 'string' &&
      Object.hasOwn(planSections, search.section)
        ? (search.section as PlanSection)
        : undefined,
  };
}
