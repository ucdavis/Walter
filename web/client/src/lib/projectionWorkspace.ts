import {
  computePiProjection,
  type PiProjectionRow,
} from '@/lib/piProjection.ts';
import type { Projection, ProjectionDraft } from '@/queries/projections.ts';

export interface ProjectionSession<T extends ProjectionDraft = Projection> {
  baseline: T;
  draft: T;
  revision: number;
}

export function createProjectionSession<T extends ProjectionDraft>(
  plan: T
): ProjectionSession<T> {
  return { baseline: plan, draft: plan, revision: 0 };
}

/** Acknowledges exactly the submitted revision while retaining edits applied during its request. */
export function acknowledgeProjectionSave(
  current: ProjectionSession,
  submitted: ProjectionSession,
  saved: Projection
): ProjectionSession {
  return {
    ...current,
    baseline: saved,
    draft:
      current.revision === submitted.revision
        ? saved
        : {
            ...saved,
            appointments: current.draft.appointments,
            fundingSources: current.draft.fundingSources,
            historyMonths: current.draft.historyMonths,
            name: current.draft.name,
          },
  };
}

export interface ProjectionLocation {
  appointmentId: number | null;
  fundingSourceId: number | null;
  issues: string[];
  section: 'overview' | 'funding' | 'staffing' | null;
}

export interface ProjectionNavigation {
  appointment?: number;
  section: 'overview' | 'funding' | 'staffing';
  source?: number;
}

export function readProjectionLocation(
  search: Record<string, unknown>,
  plan: ProjectionDraft
): ProjectionLocation {
  const issues: string[] = [];
  const parseTarget = (key: 'appointment' | 'source') => {
    if (search[key] === undefined) {
      return null;
    }
    const value = search[key];
    if (
      !['string', 'number'].includes(typeof value) ||
      !/^[1-9]\d*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value))
    ) {
      issues.push(`The ${key} target is malformed.`);
      return null;
    }
    return Number(value);
  };
  const appointmentId = parseTarget('appointment');
  const fundingSourceId = parseTarget('source');
  const section =
    search.section ??
    (search.appointment === undefined ? 'overview' : 'staffing');
  if (
    section !== 'overview' &&
    section !== 'funding' &&
    section !== 'staffing'
  ) {
    issues.push('This plan section does not exist.');
  }
  if (
    appointmentId !== null &&
    !plan.appointments.some(({ id }) => id === appointmentId)
  ) {
    issues.push(`Appointment ${appointmentId} is not in this plan.`);
  }
  if (
    fundingSourceId !== null &&
    !plan.fundingSources.some(({ id }) => id === fundingSourceId)
  ) {
    issues.push(`Funding source ${fundingSourceId} is not in this plan.`);
  }
  if (appointmentId !== null && section !== 'staffing') {
    issues.push('An appointment editor must be opened in Staffing.');
  }
  return {
    appointmentId,
    fundingSourceId,
    issues,
    section:
      section === 'overview' || section === 'funding' || section === 'staffing'
        ? section
        : null,
  };
}

export type ProjectionResults = ReturnType<typeof computePiProjection>;

export interface PendingAppointmentEditor {
  appointmentId: number | null;
  hasChanges: boolean;
  kind: 'appointment';
  validationMessage: string | null;
}

export interface PendingSourceEditor {
  fundingSourceId: number | null;
  hasChanges: boolean;
  kind: 'source';
  validationMessage: string | null;
}

export type PendingProjectionEditor =
  | PendingAppointmentEditor
  | PendingSourceEditor;

export interface ProjectionPersistenceStatus {
  conflict: 'conflict' | 'snapshotChanged' | 'deleted' | null;
  conflictOpen: boolean;
  error: string | null;
  reloading: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  saving: boolean;
}

function serializeEditableProjection(plan: ProjectionDraft) {
  const document = {
    appointments: plan.appointments,
    fundingSources: plan.fundingSources,
    historyMonths: plan.historyMonths,
    name: plan.name,
  };
  return JSON.stringify(document, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        )
      : value
  );
}

/** Compare editable content, excluding server audit tokens and local revision bookkeeping. */
export function isProjectionDirty(
  session: ProjectionSession<ProjectionDraft>
): boolean {
  return (
    session.draft !== session.baseline &&
    serializeEditableProjection(session.draft) !==
      serializeEditableProjection(session.baseline)
  );
}

/** Composes the current view on demand without keeping a second workspace document. */
export function readProjectionWorkspace<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  location: ProjectionLocation,
  results: ProjectionResults,
  pendingEditor: PendingProjectionEditor | null,
  persistence: ProjectionPersistenceStatus | null = null
) {
  return structuredClone({
    dirty: isProjectionDirty(session),
    draft: session.draft,
    location,
    pendingEditor,
    persistence,
    results,
    revision: session.revision,
  });
}

export type ProjectionWorkspaceSnapshot<
  T extends ProjectionDraft = Projection,
> = ReturnType<typeof readProjectionWorkspace<T>>;

/** Combines category rows into each funding source's monthly outlook. */
export function getFundingSourceOutlook(
  rows: PiProjectionRow[],
  fundingSourceId: number
) {
  const months = new Map<
    string,
    { actual: number; forecast: number; month: string; remaining: number }
  >();
  for (const row of rows) {
    if (row.fundingSourceId !== fundingSourceId) {
      continue;
    }
    const month = months.get(row.month) ?? {
      actual: 0,
      forecast: 0,
      month: row.month,
      remaining: 0,
    };
    month.actual += row.actualAmount;
    month.forecast += row.projectedAmount;
    month.remaining += row.remaining;
    months.set(row.month, month);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
