import { BanknotesIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import {
  SourceEditor,
  type SourceEditorHandle,
} from '@/components/projections/SourceEditor.tsx';
import { SourceSelectionRows } from '@/components/projections/SourceSelectionRows.tsx';
import { SourcePicker } from '@/components/projections/SourcePicker.tsx';
import {
  getProjectionForecastWindow,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import {
  addPlannedSource,
  editProjectionSource,
  removeProjectionSource,
  sourceLabel,
  sourcePlanningBalance,
  type SourceOperation,
  type SourceOperationResult,
} from '@/lib/projectionSources.ts';
import type {
  ProjectionDraft,
  ProjectionAppointment,
  ProjectionFundingSource,
  ProjectionRosterEntry,
} from '@/queries/projections.ts';
import type {
  PendingSourceEditor,
  ProjectionSession,
} from '@/lib/projectionWorkspace.ts';

export interface FundingSourcesEditorHandle {
  read: () => PendingSourceEditor | null;
}

export function FundingSourcesEditor<T extends ProjectionDraft>({
  iamId,
  initialSelection,
  onOperation,
  ref,
  session,
  sourceTarget,
}: {
  iamId?: string;
  initialSelection?: {
    appointments?: ProjectionAppointment[];
    ids: number[];
    onChange: (ids: number[]) => void;
    roster?: ProjectionRosterEntry[];
    sources?: ProjectionFundingSource[];
  };
  onOperation: (operation: SourceOperation) => SourceOperationResult<T>;
  ref?: Ref<FundingSourcesEditorHandle>;
  session: ProjectionSession<T>;
  sourceTarget?: { id: number | null; onChange: (id: number | null) => void };
}) {
  const [editing, setEditing] = useState<number | 'planned' | 'import' | null>(
    null
  );
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<SourceEditorHandle>(null);
  const { draft } = session;
  const forecastWindow = getProjectionForecastWindow(draft);
  const choices = initialSelection?.sources ?? draft.content.fundingSources;
  const editingSourceId = sourceTarget ? sourceTarget.id : editing;
  const source = choices.find(({ id }) => id === editingSourceId);
  const removed = draft.content.fundingSources.find(
    ({ id }) => id === removing
  );
  useImperativeHandle(ref, () => ({
    read: () => editorRef.current?.read() ?? null,
  }));
  function apply(operation: SourceOperation) {
    const result = onOperation(operation);
    setError(result.ok ? null : result.error);
    return result;
  }
  return (
    <div className={initialSelection ? 'mt-8' : undefined}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <BanknotesIcon aria-hidden="true" className="size-5" />
            Your funding sources
          </h2>
          {!initialSelection && (
            <p className="mt-1 text-sm leading-relaxed text-base-content/80">
              Review your funding sources and add planned funding. Each task
              keeps its own balance and forecast.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {iamId && !initialSelection && (
            <button
              className="btn"
              onClick={() => setEditing('import')}
              type="button"
            >
              <PlusIcon aria-hidden="true" className="size-5" />
              Add funding source
            </button>
          )}
          {!initialSelection && (
            <button
              className="btn"
              onClick={() => setEditing('planned')}
              type="button"
            >
              <PlusIcon aria-hidden="true" className="size-5" />
              Add planned source
            </button>
          )}
        </div>
      </div>
      <SourceSelectionRows
        choices={choices.map((source) => ({
          balance: sourcePlanningBalance(source),
          key: String(source.id),
          label: sourceLabel(source),
          personnelIds: (
            initialSelection?.appointments ?? draft.content.appointments
          )
            .filter(
              (appointment) =>
                appointment.allocations.some(
                  ({ fundingSourceId }) => fundingSourceId === source.id
                ) ||
                initialSelection?.roster?.some(
                  (entry) =>
                    entry.appointmentId === appointment.id &&
                    entry.fundingSourceIds.includes(source.id)
                )
            )
            .map(
              (appointment) =>
                appointment.employeeId ?? `appointment:${appointment.id}`
            ),
          projectName: source.projectName,
          projectNumber: source.projectNumber,
          projectType: source.projectType,
          searchText: [source.awardName, source.awardNumber, source.projectType]
            .filter(Boolean)
            .join(' '),
          taskName:
            source.name !== source.projectName ? source.name : source.taskName,
          taskNumber: source.taskNumber,
        }))}
        onChange={(keys) => initialSelection?.onChange(keys.map(Number))}
        renderDetails={(choice) => {
          const source = choices.find(({ id }) => String(id) === choice.key)!;
          const window = getSourceForecastWindow(source, forecastWindow);
          return (
            <>
              {(window.isBeyondForecast ||
                window.startMonth > window.endMonth) && (
                <span className="text-xs text-base-content/80">
                  Outside this forecast
                </span>
              )}
              <button
                aria-haspopup="dialog"
                aria-label={`Edit ${sourceLabel(source)}`}
                className="btn btn-ghost btn-sm text-primary"
                onClick={() =>
                  sourceTarget
                    ? sourceTarget.onChange(source.id)
                    : setEditing(source.id)
                }
                type="button"
              >
                Edit details
              </button>
            </>
          );
        }}
        selectable={Boolean(initialSelection)}
        selected={initialSelection?.ids.map(String) ?? []}
      />
      {initialSelection && (
        <button
          className="btn mt-4"
          onClick={() => setEditing('planned')}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="size-5" />
          Add New Funding Source
        </button>
      )}
      <p className="mt-5 text-sm text-base-content/80">
        Balances already account for recorded expenses and commitments. Your
        changes apply to this plan only.
      </p>
      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
      {((source && removing === null) || editing === 'planned') && (
        <SourceEditor
          key={source?.id ?? 'planned'}
          onApply={(inputs, categories) =>
            apply((current) =>
              source
                ? editProjectionSource(current, source.id, inputs, categories)
                : addPlannedSource(current, inputs, categories)
            )
          }
          onClose={() =>
            source && sourceTarget
              ? sourceTarget.onChange(null)
              : setEditing(null)
          }
          onRemove={
            source
              ? () => {
                  if (initialSelection) {
                    initialSelection.onChange(
                      initialSelection.ids.filter((id) => id !== source.id)
                    );
                    if (sourceTarget) {
                      sourceTarget.onChange(null);
                    } else {
                      setEditing(null);
                    }
                  } else {
                    setRemoving(source.id);
                  }
                }
              : undefined
          }
          ref={editorRef}
          session={
            initialSelection
              ? {
                  ...session,
                  draft: {
                    ...draft,
                    content: { ...draft.content, fundingSources: choices },
                  },
                }
              : session
          }
          source={source}
        />
      )}
      {editing === 'import' && iamId && (
        <SourcePicker
          iamId={iamId}
          onApply={apply}
          onClose={() => setEditing(null)}
          ref={editorRef}
          session={session}
        />
      )}
      {removed && (
        <ProjectionDialog
          onClose={() => setRemoving(null)}
          title="Remove funding source?"
        >
          <p className="mt-4">
            Remove {sourceLabel(removed)} and its expenses and allocations?
            Appointments stay in the plan, and those funding shares become
            unallocated. Adding this source again captures fresh data.
          </p>
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              onClick={() => setRemoving(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const result = apply((current) =>
                  removeProjectionSource(current, removed.id)
                );
                if (result.ok) {
                  setRemoving(null);
                }
              }}
              type="button"
            >
              Remove
            </button>
          </div>
        </ProjectionDialog>
      )}
    </div>
  );
}
