import {
  getSourceFundingBasis,
  validateCategoryBudgets,
} from '@/lib/projectionBudgets.ts';
import type {
  CategoryBudgetAdjustment,
  ProjectionDraft,
  ProjectionFundingSource,
  ProjectionRosterEntry,
} from '@/queries/projections.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
import { isPlanningDate } from '@/lib/date.ts';
export interface SourceInputs {
  balance: number;
  categoryAdjustments?: CategoryBudgetAdjustment[];
  endDate: string | null;
  name: string;
  startDate: string | null;
}

export interface PlannedSourceInputs extends SourceInputs {
  initialCategoryBudgets: CategoryBudgetAdjustment[];
  plannedBudgetMode: 'GeneralPool' | 'Categories';
}

export type SourceOperationResult<T extends ProjectionDraft = ProjectionDraft> =

    | { error: string; ok: false }
    | { fundingSourceId?: number; ok: true; session: ProjectionSession<T> };

export type SourceOperation = <T extends ProjectionDraft>(
  session: ProjectionSession<T>
) => SourceOperationResult<T>;

export const sourceCapturedBalance = (source: ProjectionFundingSource) =>
  source.budgets.reduce(
    (total, row) => total + row.budget - row.spentToDate - row.committed,
    0
  );

export const sourcePlanningBalance = (source: ProjectionFundingSource) =>
  sourceCapturedBalance(source) +
  source.initialPlannedBalance +
  source.balanceAdjustment +
  source.categoryAdjustments.reduce((sum, row) => sum + row.amount, 0);

export const sourceLabel = (source: ProjectionFundingSource) =>
  [
    source.name,
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

function validation(inputs: SourceInputs, planned: boolean) {
  if (!inputs.name.trim() || inputs.name.trim().length > 200) {
    return 'Enter a funding source name of 1 to 200 characters.';
  }
  if (!Number.isFinite(inputs.balance)) {
    return 'Enter a finite available balance.';
  }
  if (
    (inputs.startDate !== null && !isPlanningDate(inputs.startDate)) ||
    (inputs.endDate !== null && !isPlanningDate(inputs.endDate)) ||
    (inputs.startDate && inputs.endDate && inputs.startDate > inputs.endDate) ||
    (planned && !inputs.startDate)
  ) {
    return 'Choose valid dates with the end on or after the start.';
  }
  return null;
}

function changed<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  draft: T
): SourceOperationResult<T> {
  return {
    ok: true,
    session: { ...session, draft, revision: session.revision + 1 },
  };
}

function nextId(session: ProjectionSession<ProjectionDraft>) {
  return (
    Math.max(0, ...session.draft.content.fundingSources.map(({ id }) => id)) + 1
  );
}

export function editProjectionSource<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  fundingSourceId: number,
  inputs: SourceInputs,
  financialCategories: string[] = []
): SourceOperationResult<T> {
  const source = session.draft.content.fundingSources.find(
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
  const categoryAdjustments =
    inputs.categoryAdjustments ?? source.categoryAdjustments;
  if (inputs.categoryAdjustments) {
    const budgetError = validateCategoryBudgets(
      categoryAdjustments,
      financialCategories
    );
    if (budgetError) {
      return { error: budgetError, ok: false };
    }
  }
  const categoryBasis = getSourceFundingBasis(source) === 'categories';
  if (!categoryBasis && categoryAdjustments.length > 0) {
    return {
      error: 'Category budget changes require category-based funding.',
      ok: false,
    };
  }
  const revisedCategoryTotal =
    sourceCapturedBalance(source) +
    source.initialPlannedBalance +
    categoryAdjustments.reduce((sum, row) => sum + row.amount, 0);
  if (categoryBasis && inputs.balance !== revisedCategoryTotal) {
    return {
      error: 'Adjust a financial category to change this source total.',
      ok: false,
    };
  }
  const balanceAdjustment = categoryBasis
    ? 0
    : inputs.balance - revisedCategoryTotal;
  if (!Number.isFinite(balanceAdjustment)) {
    return { error: 'Enter a finite available balance.', ok: false };
  }
  if (
    inputs.name.trim() === source.name &&
    inputs.startDate === source.startDate &&
    inputs.endDate === source.endDate &&
    balanceAdjustment === source.balanceAdjustment &&
    JSON.stringify(categoryAdjustments) ===
      JSON.stringify(source.categoryAdjustments)
  ) {
    return { ok: true, session };
  }
  return changed(session, {
    ...session.draft,
    content: {
      ...session.draft.content,
      fundingSources: session.draft.content.fundingSources.map((candidate) =>
        candidate.id === fundingSourceId
          ? {
              ...candidate,
              balanceAdjustment,
              categoryAdjustments: structuredClone(categoryAdjustments),
              endDate: inputs.endDate,
              name: inputs.name.trim(),
              startDate: inputs.startDate,
            }
          : candidate
      ),
    },
  });
}

export function addPlannedSource<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  inputs: PlannedSourceInputs,
  financialCategories: string[] = []
): SourceOperationResult<T> {
  const error = validation(inputs, true);
  if (error) {
    return { error, ok: false };
  }
  if (!['GeneralPool', 'Categories'].includes(inputs.plannedBudgetMode)) {
    return { error: 'Choose a planned funding budget mode.', ok: false };
  }
  const budgetError = validateCategoryBudgets(
    inputs.initialCategoryBudgets,
    financialCategories
  );
  if (budgetError) {
    return { error: budgetError, ok: false };
  }
  if (
    inputs.plannedBudgetMode === 'GeneralPool' &&
    inputs.initialCategoryBudgets.length > 0
  ) {
    return {
      error: 'General-pool funding cannot have category budgets.',
      ok: false,
    };
  }
  const initialTotal = inputs.initialCategoryBudgets.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  if (
    inputs.plannedBudgetMode === 'Categories' &&
    inputs.balance !== initialTotal
  ) {
    return {
      error: 'The planned total must equal its category budgets.',
      ok: false,
    };
  }
  const id = nextId(session);
  const source: ProjectionFundingSource = {
    actuals: [],
    awardName: null,
    awardNumber: null,
    balanceAdjustment: 0,
    budgets: inputs.initialCategoryBudgets.map(
      ({ amount, expenditureCategory }) => ({
        budget: amount,
        committed: 0,
        expenditureCategory,
        spentToDate: 0,
      })
    ),
    capturedAt: session.draft.seededAt,
    capturedEndDate: null,
    capturedStartDate: null,
    categoryAdjustments: [],
    endDate: inputs.endDate,
    expenses: [],
    historicalExpenseOverrides: [],
    id,
    initialPlannedBalance:
      inputs.plannedBudgetMode === 'GeneralPool' ? inputs.balance : 0,
    name: inputs.name.trim(),
    plannedBudgetMode: inputs.plannedBudgetMode,
    projectName: null,
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
        content: {
          ...session.draft.content,
          fundingSources: [...session.draft.content.fundingSources, source],
        },
      },
      revision: session.revision + 1,
    },
  };
}

/** Adds captured financial inputs only; employee assumptions and allocations are unchanged. */
export function addImportedSources<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  sources: ProjectionFundingSource[]
): SourceOperationResult<T> {
  if (sources.length === 0) {
    return { ok: true, session };
  }
  const fundingSources = [...session.draft.content.fundingSources];
  let id = nextId(session);
  for (const source of sources) {
    const error = validation(
      {
        balance: sourcePlanningBalance(source),
        endDate: source.endDate,
        name: source.name,
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
      draft: {
        ...session.draft,
        content: {
          ...session.draft.content,
          fundingSources,
        },
      },
      revision: session.revision + 1,
    },
  };
}

/** Removing a source leaves its former staffing share unallocated; it does not invent outside funding. */
export function removeProjectionSource<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  fundingSourceId: number
): SourceOperationResult<T> {
  if (
    !session.draft.content.fundingSources.some(
      ({ id }) => id === fundingSourceId
    )
  ) {
    return {
      error: 'This funding source is no longer in the plan.',
      ok: false,
    };
  }
  return changed(session, {
    ...session.draft,
    content: {
      ...session.draft.content,
      appointments: session.draft.content.appointments.map((appointment) => ({
        ...appointment,
        allocations: appointment.allocations.filter(
          (allocation) => allocation.fundingSourceId !== fundingSourceId
        ),
      })),
      fundingSources: session.draft.content.fundingSources.filter(
        ({ id }) => id !== fundingSourceId
      ),
    },
  });
}

/** Selects the initial roster by captured task provenance once. Later removals must retain the roster. */
export function selectInitialSources<T extends ProjectionDraft>(
  session: ProjectionSession<T>,
  fundingSourceIds: number[],
  roster: ProjectionRosterEntry[]
): SourceOperationResult<T> {
  const ids = new Set(fundingSourceIds);
  if (
    fundingSourceIds.some(
      (id) =>
        !session.draft.content.fundingSources.some((source) => source.id === id)
    )
  ) {
    return {
      error: 'A selected funding source is no longer available.',
      ok: false,
    };
  }
  const fundingSources = session.draft.content.fundingSources.filter(({ id }) =>
    ids.has(id)
  );
  const rosterSources = new Map(
    roster.map((entry) => [entry.appointmentId, entry.fundingSourceIds])
  );
  const appointments = session.draft.content.appointments
    .filter((appointment) =>
      rosterSources.get(appointment.id)?.some((sourceId) => ids.has(sourceId))
    )
    .map((appointment) => ({
      ...appointment,
      allocations: appointment.allocations.filter(
        ({ fundingSourceId }) =>
          fundingSourceId === null || ids.has(fundingSourceId)
      ),
    }));
  return changed(session, {
    ...session.draft,
    content: {
      ...session.draft.content,
      appointments,
      fundingSources,
    },
  });
}
