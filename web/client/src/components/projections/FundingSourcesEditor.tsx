import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { FundingSourceList } from '@/components/projections/FundingSourceList.tsx';
import {
  SourceEditor,
  type SourceEditorHandle,
} from '@/components/projections/SourceEditor.tsx';
import { SourcePicker } from '@/components/projections/SourcePicker.tsx';
import {
  addPlannedSource,
  editProjectionSource,
  removeProjectionSource,
  sourceLabel,
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
      <FundingSourceList
        initialSelection={initialSelection}
        onEdit={(id) =>
          sourceTarget ? sourceTarget.onChange(id) : setEditing(id)
        }
        onRemove={setRemoving}
        sources={draft.content.fundingSources}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        {iamId && !initialSelection && (
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
