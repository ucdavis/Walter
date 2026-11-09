import type {
  Projection,
  ProjectionFundingSource,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';

export interface SourceInputs {
  balance: number;
  endDate: string | null;
  name: string;
  startDate: string | null;
}

export type SourceOperationResult =
  | { error: string; ok: false }
  | { fundingSourceId?: number; ok: true; session: ProjectionSession };

export type SourceOperation = (
  session: ProjectionSession
) => SourceOperationResult;

export const sourceCapturedBalance = (source: ProjectionFundingSource) =>
  source.budgets.reduce(
    (total, row) => total + row.budget - row.spentToDate - row.committed,
    0
  );

export const sourcePlanningBalance = (source: ProjectionFundingSource) =>
  sourceCapturedBalance(source) + source.balanceAdjustment;

export const sourceLabel = (source: ProjectionFundingSource) =>
  [
    source.projectName,
    source.taskNumber && `Task ${source.taskNumber}`,
    source.taskName,
  ]
    .filter(Boolean)
    .join(' · ');

export const sourceKey = (source: ProjectionFundingSource) =>
  source.projectNumber
    ? JSON.stringify([source.projectNumber, source.taskNumber ?? ''])
    : `planned:${source.id}`;

type SourceIdentity = Pick<
  ProjectionFundingSource,
  'projectNumber' | 'taskNumber'
>;

/** A project/task's captured financial inputs may appear only once in the plan. */
export function sourcesOverlap(a: SourceIdentity, b: SourceIdentity) {
  return (
    Boolean(a.projectNumber) &&
    a.projectNumber === b.projectNumber &&
    (a.taskNumber ?? '') === (b.taskNumber ?? '')
  );
}

function validDate(value: string | null) {
  if (value === null) {
    return true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validation(inputs: SourceInputs, planned: boolean) {
  if (!inputs.name.trim() || inputs.name.trim().length > 200) {
    return 'Enter a funding source name of 1 to 200 characters.';
  }
  if (!Number.isFinite(inputs.balance)) {
    return 'Enter a finite available balance.';
  }
  if (
    !validDate(inputs.startDate) ||
    !validDate(inputs.endDate) ||
    (inputs.startDate && inputs.endDate && inputs.startDate > inputs.endDate) ||
    (planned && !inputs.startDate)
  ) {
    return 'Choose valid dates with the end on or after the start.';
  }
  return null;
}

function changed(
  session: ProjectionSession,
  draft: Projection
): SourceOperationResult {
  return {
    ok: true,
    session: { ...session, draft, revision: session.revision + 1 },
  };
}

function nextId(session: ProjectionSession) {
  return Math.max(0, ...session.draft.fundingSources.map(({ id }) => id)) + 1;
}

export function editProjectionSource(
  session: ProjectionSession,
  fundingSourceId: number,
  inputs: SourceInputs
): SourceOperationResult {
  const source = session.draft.fundingSources.find(
    ({ id }) => id === fundingSourceId
  );
  if (!source) {
    return {
      error: 'This funding source is no longer in the plan.',
      ok: false,
    };
  }
  const error = validation(inputs, source.sourceKind === 'Planned');
  if (error) {
    return { error, ok: false };
  }
  const balanceAdjustment = inputs.balance - sourceCapturedBalance(source);
  if (!Number.isFinite(balanceAdjustment)) {
    return { error: 'Enter a finite available balance.', ok: false };
  }
  if (
    inputs.name.trim() === source.projectName &&
    inputs.startDate === source.startDate &&
    inputs.endDate === source.endDate &&
    balanceAdjustment === source.balanceAdjustment
  ) {
    return { ok: true, session };
  }
  return changed(session, {
    ...session.draft,
    fundingSources: session.draft.fundingSources.map((candidate) =>
      candidate.id === fundingSourceId
        ? {
            ...candidate,
            balanceAdjustment,
            endDate: inputs.endDate,
            projectName: inputs.name.trim(),
            startDate: inputs.startDate,
          }
        : candidate
    ),
  });
}

export function addPlannedSource(
  session: ProjectionSession,
  inputs: SourceInputs
): SourceOperationResult {
  const error = validation(inputs, true);
  if (error) {
    return { error, ok: false };
  }
  const id = nextId(session);
  const source: ProjectionFundingSource = {
    actuals: [],
    awardName: null,
    awardNumber: null,
    balanceAdjustment: inputs.balance,
    budgets: [],
    capturedAt: session.draft.seededAt,
    capturedEndDate: null,
    capturedStartDate: null,
    endDate: inputs.endDate,
    expenses: [],
    id,
    isSeeded: false,
    projectName: inputs.name.trim(),
    projectNumber: null,
    projectType: null,
    runRates: [],
    sourceKind: 'Planned',
    startDate: inputs.startDate,
    taskName: null,
    taskNumber: null,
  };
  return {
    fundingSourceId: id,
    ok: true,
    session: {
      ...session,
      draft: {
        ...session.draft,
        fundingSources: [...session.draft.fundingSources, source],
      },
      revision: session.revision + 1,
    },
  };
}

/** Adds captured financial inputs only; employee assumptions and allocations are unchanged. */
export function addImportedSources(
  session: ProjectionSession,
  sources: ProjectionFundingSource[]
): SourceOperationResult {
  if (sources.length === 0) {
    return { ok: true, session };
  }
  const fundingSources = [...session.draft.fundingSources];
  let id = nextId(session);
  for (const source of sources) {
    const error = validation(
      {
        balance: sourcePlanningBalance(source),
        endDate: source.endDate,
        name: source.projectName,
        startDate: source.startDate,
      },
      false
    );
    if (error) {
      return { error, ok: false };
    }
    if (
      !source.projectNumber ||
      !source.capturedAt ||
      !Number.isFinite(Date.parse(source.capturedAt))
    ) {
      return {
        error: 'This source is missing its captured source data.',
        ok: false,
      };
    }
    if (fundingSources.some((existing) => sourcesOverlap(existing, source))) {
      return {
        error: 'This source or task is already included in the plan.',
        ok: false,
      };
    }
    fundingSources.push({ ...structuredClone(source), id: id++ });
  }
  return {
    fundingSourceId: fundingSources.at(-1)!.id,
    ok: true,
    session: {
      ...session,
      draft: { ...session.draft, fundingSources },
      revision: session.revision + 1,
    },
  };
}

/** Removing a source leaves its former staffing share unallocated; it does not invent outside funding. */
export function removeProjectionSource(
  session: ProjectionSession,
  fundingSourceId: number
): SourceOperationResult {
  if (!session.draft.fundingSources.some(({ id }) => id === fundingSourceId)) {
    return {
      error: 'This funding source is no longer in the plan.',
      ok: false,
    };
  }
  return changed(session, {
    ...session.draft,
    appointments: session.draft.appointments.map((appointment) => ({
      ...appointment,
      allocations: appointment.allocations.filter(
        (allocation) => allocation.fundingSourceId !== fundingSourceId
      ),
    })),
    fundingSources: session.draft.fundingSources.filter(
      ({ id }) => id !== fundingSourceId
    ),
  });
}

/** Called once when initial source selection finishes. Later removals must retain the roster. */
export function selectInitialSources(
  session: ProjectionSession,
  fundingSourceIds: number[]
): SourceOperationResult {
  const ids = new Set(fundingSourceIds);
  if (
    fundingSourceIds.some(
      (id) => !session.draft.fundingSources.some((source) => source.id === id)
    )
  ) {
    return {
      error: 'A selected funding source is no longer available.',
      ok: false,
    };
  }
  const fundingSources = session.draft.fundingSources.filter(({ id }) =>
    ids.has(id)
  );
  const parentProjects = new Set(
    fundingSources.map(({ projectNumber }) => projectNumber).filter(Boolean)
  );
  const appointments = session.draft.appointments
    .filter((appointment) =>
      appointment.sourceProjectNumbers.some((parent) =>
        parentProjects.has(parent)
      )
    )
    .map((appointment) => ({
      ...appointment,
      allocations: appointment.allocations.filter(
        ({ fundingSourceId }) =>
          fundingSourceId === null || ids.has(fundingSourceId)
      ),
    }));
  return changed(session, { ...session.draft, appointments, fundingSources });
}
