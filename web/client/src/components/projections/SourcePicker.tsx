import { PlusIcon } from '@heroicons/react/24/outline';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { SourceSelectionRows } from '@/components/projections/SourceSelectionRows.tsx';
import type { SourceEditorHandle } from '@/components/projections/SourceEditor.tsx';
import {
  addImportedSources,
  sourcesOverlap,
  type SourceOperation,
  type SourceOperationResult,
} from '@/lib/projectionSources.ts';
import type { ProjectionSession } from '@/lib/projectionWorkspace.ts';
import {
  importProjectionSources,
  projectionSourceCatalogQueryOptions,
  type ProjectionDraft,
} from '@/queries/projections.ts';

export function SourcePicker<T extends ProjectionDraft>({
  iamId,
  onApply,
  onClose,
  ref,
  session,
}: {
  iamId: string;
  onApply: (operation: SourceOperation) => SourceOperationResult<T>;
  onClose: () => void;
  ref?: Ref<SourceEditorHandle>;
  session: ProjectionSession<T>;
}) {
  const catalog = useQuery(projectionSourceCatalogQueryOptions(iamId));
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const selectedKeys = new Set(selected);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useImperativeHandle(ref, () => ({
    read: () => ({
      fundingSourceId: null,
      hasChanges: selected.length > 0 || pending,
      kind: 'source',
      validationMessage: error,
    }),
  }));
  const choices = (catalog.data ?? []).map((source) => ({
    balance: source.availableBalance,
    disabled: session.draft.content.fundingSources.some((existing) =>
      sourcesOverlap(existing, source)
    ),
    key: JSON.stringify([source.projectNumber, source.taskNumber]),
    label: [
      source.projectName,
      source.taskNumber && `Task ${source.taskNumber}`,
      source.taskName,
    ]
      .filter(Boolean)
      .join(' · '),
    projectName: source.projectName,
    projectNumber: source.projectNumber,
    projectType: source.projectType,
    taskName: source.taskName,
    taskNumber: source.taskNumber,
  }));
  async function add() {
    if (busy.current) {
      return;
    }
    const sources = (catalog.data ?? [])
      .filter((source) =>
        selectedKeys.has(
          JSON.stringify([source.projectNumber, source.taskNumber])
        )
      )
      .map(({ projectNumber, taskNumber }) => ({ projectNumber, taskNumber }));
    if (sources.length === 0) {
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const captured = await importProjectionSources(iamId, sources);
      if (!mounted.current) {
        return;
      }
      const result = onApply((current) =>
        addImportedSources(current, captured)
      );
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      if (mounted.current) {
        setError(
          'These sources could not be added. Your selections are still here. Try again.'
        );
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
      }
    }
  }
  return (
    <ProjectionDialog onClose={onClose} title="Add funding sources" wide>
      <p className="mt-3 text-sm text-base-content/70">
        Pick the projects and tasks this projection should cover. Employee
        allocations stay unchanged.
      </p>
      <div className="mt-4" inert={pending}>
        {catalog.isPending ? (
          <p className="mt-4" role="status">
            Loading available sources...
          </p>
        ) : catalog.isError ? (
          <div className="mt-4">
            <p role="alert">Available sources could not be loaded.</p>
            <button
              className="btn btn-primary mt-2"
              onClick={() => void catalog.refetch()}
              type="button"
            >
              Retry source search
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <SourceSelectionRows
              choices={choices}
              onChange={setSelected}
              selected={selected}
            />
          </div>
        )}
      </div>
      {error && (
        <p className="mt-4 text-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-action">
        <button className="btn btn-ghost" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || selected.length === 0}
          onClick={() => void add()}
          type="button"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          {pending
            ? 'Adding sources...'
            : `Add ${selected.length} ${selected.length === 1 ? 'source' : 'sources'}`}
        </button>
      </div>
    </ProjectionDialog>
  );
}
