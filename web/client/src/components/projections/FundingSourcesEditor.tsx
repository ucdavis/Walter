import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { SourceChecklist } from '@/components/projections/SourceChecklist.tsx';
import {
  SourceEditor,
  type SourceEditorHandle,
} from '@/components/projections/SourceEditor.tsx';
import { SourcePicker } from '@/components/projections/SourcePicker.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  addPlannedSource,
  editProjectionSource,
  removeProjectionSource,
  sourceCapturedBalance,
  sourceLabel,
  sourcePlanningBalance,
  type SourceOperation,
  type SourceOperationResult,
} from '@/lib/projectionSources.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';
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
  initialSelection?: { ids: number[]; onChange: (ids: number[]) => void };
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
  const selectedIds = new Set(initialSelection?.ids ?? []);
  const editingSourceId = sourceTarget ? sourceTarget.id : editing;
  const source = draft.content.fundingSources.find(
    ({ id }) => id === editingSourceId
  );
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
    <div className="mt-5">
      <p className="text-sm">Each task keeps its own balance and forecast.</p>
      {initialSelection && (
        <div className="mt-4">
          <SourceChecklist
            choices={draft.content.fundingSources.map((source) => ({
              key: String(source.id),
              label: sourceLabel(source),
              projectName: source.projectName,
              projectNumber: source.projectNumber,
            }))}
            onChange={(keys) => initialSelection.onChange(keys.map(Number))}
            selected={initialSelection.ids.map(String)}
          />
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {draft.content.fundingSources
          .filter((source) => !initialSelection || selectedIds.has(source.id))
          .map((source) => (
            <article
              className="rounded-box border border-base-300 p-5"
              key={source.id}
            >
              <h3 className="text-lg font-bold">{sourceLabel(source)}</h3>
              <p className="mt-1 text-sm">
                {source.sourceKind === 'Planned'
                  ? 'Planned funding'
                  : `Captured ${source.capturedAt.slice(0, 10)}`}
              </p>
              <p className="mt-1 text-sm">
                {source.startDate ?? 'No start date'} to{' '}
                {source.endDate ?? 'No end date'}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                {source.sourceKind !== 'Planned' && (
                  <div className="flex justify-between gap-3">
                    <dt>Captured balance</dt>
                    <dd>{formatCurrency(sourceCapturedBalance(source))}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Planning balance</dt>
                  <dd>{formatCurrency(sourcePlanningBalance(source))}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    sourceTarget
                      ? sourceTarget.onChange(source.id)
                      : setEditing(source.id)
                  }
                  type="button"
                >
                  Edit {sourceLabel(source)}
                </button>
                {!initialSelection && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRemoving(source.id)}
                    type="button"
                  >
                    Remove {sourceLabel(source)}
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {draft.content.fundingSources.length === 0 && (
        <p className="mt-4">No funding sources in this plan.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {iamId && (
          <button
            className="btn btn-outline"
            onClick={() => setEditing('import')}
            type="button"
          >
            Add funding source
          </button>
        )}
        <button
          className="btn btn-outline"
          onClick={() => setEditing('planned')}
          type="button"
        >
          Add planned source
        </button>
      </div>
      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
      {(source || editing === 'planned') && (
        <SourceEditor
          key={source?.id ?? 'planned'}
          onApply={(inputs) =>
            apply((current) =>
              source
                ? editProjectionSource(current, source.id, inputs)
                : addPlannedSource(current, inputs)
            )
          }
          onClose={() =>
            source && sourceTarget
              ? sourceTarget.onChange(null)
              : setEditing(null)
          }
          ref={editorRef}
          session={session}
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
            Employees stay in the plan, and those funding shares become
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
