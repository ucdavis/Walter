import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { useProjectionSession } from '@/components/projections/ProjectionSession.tsx';
import {
  isProjectionDirty,
  readProjectionLocation,
  type ProjectionNavigation,
} from '@/lib/projectionWorkspace.ts';

export function ProjectionSaveControls() {
  const {
    canSave,
    conflict,
    error,
    reloading,
    save,
    saveStatus,
    saving,
    session,
    validationMessage,
  } = useProjectionSession();
  const dirty = isProjectionDirty(session);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSave && (
        <button
          className="btn btn-primary"
          disabled={
            saving ||
            reloading ||
            Boolean(validationMessage) ||
            (!dirty && !conflict && !error)
          }
          onClick={() => void save()}
          type="button"
        >
          {saving
            ? 'Saving…'
            : saveStatus === 'saved' && !dirty
              ? '✓ Saved'
              : 'Save plan'}
        </button>
      )}
    </div>
  );
}

export function ProjectionSaveFeedback({
  onNavigate,
  search,
}: {
  onNavigate: (location: ProjectionNavigation, replace?: boolean) => void;
  search: Record<string, unknown>;
}) {
  const {
    conflict,
    conflictOpen,
    discardSaved,
    dismissConflict,
    error,
    reloading,
    saveStatus,
    session,
    validationMessage,
  } = useProjectionSession();
  return (
    <>
      {validationMessage && (
        <p className="mt-3 text-error" role="alert">
          {validationMessage}
        </p>
      )}
      {saveStatus === 'saved' && isProjectionDirty(session) && (
        <p className="mt-3 text-sm" role="status">
          Submitted changes were saved. Newer edits are still unsaved.
        </p>
      )}
      {error && !conflictOpen && (
        <p className="mt-3 text-error" role="alert">
          {error}
        </p>
      )}
      {conflictOpen && (
        <ProjectionDialog
          onClose={() => {
            if (!reloading) {
              dismissConflict();
            }
          }}
          title={
            conflict === 'snapshotChanged'
              ? 'This plan was reset'
              : conflict === 'deleted'
                ? 'This plan was deleted'
                : 'This plan has changed'
          }
        >
          <p className="mt-4">
            {conflict === 'conflict'
              ? 'Another edit was saved. Reload the saved plan to save again. Close keeps your draft here.'
              : conflict === 'snapshotChanged'
                ? 'The saved plan has a new snapshot. Reload it to save again. Close keeps your draft here.'
                : 'This saved plan no longer exists. Close keeps your draft here.'}
          </p>
          {error && (
            <p className="mt-3 text-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              disabled={reloading}
              onClick={dismissConflict}
              type="button"
            >
              Close
            </button>
            {conflict !== 'deleted' && (
              <button
                className="btn"
                disabled={reloading}
                onClick={async () => {
                  const { baseline } = session;
                  const saved = await discardSaved();
                  if (!saved) {
                    return;
                  }
                  const previous = readProjectionLocation(search, baseline);
                  const hasRowTarget =
                    previous.appointmentId !== null ||
                    previous.fundingSourceId !== null;
                  if (
                    previous.issues.length > 0 ||
                    (hasRowTarget && baseline.seededAt !== saved.seededAt) ||
                    readProjectionLocation(search, saved).issues.length > 0
                  ) {
                    onNavigate({ section: 'overview' }, true);
                  }
                }}
                type="button"
              >
                {reloading ? 'Loading saved plan…' : 'Discard and reload'}
              </button>
            )}
          </div>
        </ProjectionDialog>
      )}
    </>
  );
}
