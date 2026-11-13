import type {
  ProjectionContent,
  ProjectionDraft,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
export const DEFAULT_FORECAST_MONTHS = 12;
export const FORECAST_MONTH_OPTIONS = [12, 18] as const;
export const MAX_PLAN_NAME_LENGTH = 200;
export const MAX_PLAN_NOTES_LENGTH = 2000;

export type PlanDetailsInputs = Pick<
  ProjectionContent,
  'forecastMonths' | 'notes'
> &
  Pick<ProjectionDraft, 'name'>;
export type PlanDetailsOperationResult<
  T extends ProjectionDraft = ProjectionDraft,
> = { error: string; ok: false } | { ok: true; session: ProjectionSession<T> };

export type PlanDetailsOperation = <T extends ProjectionDraft>(
  session: ProjectionSession<T>
) => PlanDetailsOperationResult<T>;

export function validatePlanDetails(
  inputs: PlanDetailsInputs,
  seededAt?: string
): string | null {
  if (
    typeof inputs.name !== 'string' ||
    !inputs.name.trim() ||
    inputs.name.length > MAX_PLAN_NAME_LENGTH
  ) {
    return `Enter a plan name of 1 to ${MAX_PLAN_NAME_LENGTH} characters.`;
  }
  if (
    !FORECAST_MONTH_OPTIONS.some((months) => months === inputs.forecastMonths)
  ) {
    return 'Choose a forecast duration of 12 or 18 months.';
  }
  if (
    inputs.notes !== null &&
    (typeof inputs.notes !== 'string' ||
      inputs.notes.length > MAX_PLAN_NOTES_LENGTH)
  ) {
    return `Plan notes can contain up to ${MAX_PLAN_NOTES_LENGTH} characters.`;
  }
  if (seededAt) {
    const start =
      Number(seededAt.slice(0, 4)) * 12 + Number(seededAt.slice(5, 7)) - 1;
    if (
      !Number.isFinite(start) ||
      start + inputs.forecastMonths - 1 > 9999 * 12 + 11
    ) {
      return 'The forecast period must end by December 9999.';
    }
  }
  return null;
}

/** Plan metadata changes leave captured inputs and stored appointment/expense schedules intact. */
export function editPlanDetails<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  inputs: PlanDetailsInputs
): PlanDetailsOperationResult<T> {
  const error = validatePlanDetails(inputs, session.draft.seededAt);
  if (error) {
    return { error, ok: false };
  }
  const changes: PlanDetailsInputs = {
    forecastMonths: inputs.forecastMonths,
    name: inputs.name.trim(),
    notes: inputs.notes?.trim() ? inputs.notes : null,
  };
  if (
    changes.name === session.draft.name &&
    changes.notes === session.draft.content.notes &&
    changes.forecastMonths === session.draft.content.forecastMonths
  ) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        content: {
          ...session.draft.content,
          forecastMonths: changes.forecastMonths,
          notes: changes.notes,
        },
        name: changes.name,
      },
      revision: session.revision + 1,
    },
  };
}
