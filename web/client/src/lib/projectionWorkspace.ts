import {
  computePiProjection,
  type PiProjectionRow,
} from '@/lib/piProjection.ts';
import type { Projection } from '@/queries/projections.ts';

export interface ProjectionSession {
  baseline: Projection;
  draft: Projection;
  revision: number;
}

export interface SalaryChange {
  jobId: number;
  /** Full-time monthly dollars, before FTE and appointment funding shares. */
  monthlySalary: number;
}

export function createProjectionSession(plan: Projection): ProjectionSession {
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
            historyMonths: current.draft.historyMonths,
            jobs: current.draft.jobs,
            name: current.draft.name,
            projects: current.draft.projects,
          },
  };
}

/** Changes the assumed rate from the fixed snapshot onward; captured actuals are untouched. */
export function setJobMonthlySalary(
  session: ProjectionSession,
  change: SalaryChange
): { error: string; ok: false } | { ok: true; session: ProjectionSession } {
  if (
    !Number.isFinite(change.monthlySalary) ||
    change.monthlySalary < 0 ||
    change.monthlySalary > Number.MAX_SAFE_INTEGER / 12
  ) {
    return { error: 'Enter a valid salary of zero or more.', ok: false };
  }
  const job = session.draft.jobs.find(({ id }) => id === change.jobId);
  if (!job) {
    return { error: 'This job is no longer in the plan.', ok: false };
  }
  if (job.monthlySalary === change.monthlySalary) {
    return { ok: true, session };
  }
  return {
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        jobs: session.draft.jobs.map((candidate) =>
          candidate.id === change.jobId
            ? { ...candidate, monthlySalary: change.monthlySalary }
            : candidate
        ),
      },
      revision: session.revision + 1,
    },
  };
}

export interface ProjectionLocation {
  issues: string[];
  jobId: number | null;
  projectId: number | null;
  section: 'overview' | 'staffing' | null;
}

export interface ProjectionNavigation {
  job?: number;
  project?: number;
  section: 'overview' | 'staffing';
}

export function readProjectionLocation(
  search: Record<string, unknown>,
  plan: Projection
): ProjectionLocation {
  const issues: string[] = [];
  const targetId = (key: 'job' | 'project') => {
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
  const jobId = targetId('job');
  const projectId = targetId('project');
  const section =
    search.section ?? (search.job === undefined ? 'overview' : 'staffing');
  if (section !== 'overview' && section !== 'staffing') {
    issues.push('This plan section does not exist.');
  }
  if (jobId !== null && !plan.jobs.some(({ id }) => id === jobId)) {
    issues.push(`Job ${jobId} is not in this plan.`);
  }
  if (projectId !== null && !plan.projects.some(({ id }) => id === projectId)) {
    issues.push(`Project ${projectId} is not in this plan.`);
  }
  if (jobId !== null && section !== 'staffing') {
    issues.push('A salary editor must be opened in Staffing.');
  }
  return {
    issues,
    jobId,
    projectId,
    section: section === 'overview' || section === 'staffing' ? section : null,
  };
}

export type ProjectionResults = ReturnType<typeof computePiProjection>;

export interface PendingSalaryEditor {
  hasChanges: boolean;
  jobId: number;
  validationMessage: string | null;
}

export interface ProjectionPersistenceStatus {
  conflict: 'conflict' | 'snapshotChanged' | 'deleted' | null;
  conflictOpen: boolean;
  error: string | null;
  reloading: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  saving: boolean;
}

/** Salary is the only editable assumption in this stage. Restoring it clears dirty status. */
export function isProjectionDirty(session: ProjectionSession): boolean {
  const original = new Map(
    session.baseline.jobs.map((job) => [job.id, job.monthlySalary])
  );
  return session.draft.jobs.some(
    (job) => job.monthlySalary !== original.get(job.id)
  );
}

/** Composes the current view on demand without keeping a second workspace document. */
export function readProjectionWorkspace(
  session: ProjectionSession,
  location: ProjectionLocation,
  results: ProjectionResults,
  pendingEditor: PendingSalaryEditor | null,
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

export type ProjectionWorkspaceSnapshot = ReturnType<
  typeof readProjectionWorkspace
>;

/** Shows the snapshot month onward; prior-month costs remain in the saved plan and calculator. */
export function getProjectOutlook(rows: PiProjectionRow[], projectId: number) {
  const months = new Map<
    string,
    { actual: number; forecast: number; month: string; remaining: number }
  >();
  for (const row of rows) {
    if (row.projectId !== projectId || row.kind === 'actual') {
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
