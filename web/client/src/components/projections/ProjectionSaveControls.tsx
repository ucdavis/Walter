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
    <div className="flex items-center gap-3">
      <p className="badge badge-outline p-3" role="status">
        {dirty ? 'Unsaved changes' : 'No changes'}
      </p>
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
    overwrite,
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
              ? 'Another edit was saved. Overwrite replaces the saved plan with your current applied draft. Discard loads the saved plan and discards your changes.'
              : conflict === 'snapshotChanged'
                ? 'Your draft uses an earlier snapshot and cannot overwrite this reset. Discard loads the saved snapshot. Close keeps your draft here.'
                : 'This saved plan no longer exists. Your draft is still here, but it cannot be saved to the deleted plan.'}
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
                className="btn btn-outline"
                disabled={reloading}
                onClick={async () => {
                  const saved = await discardSaved();
                  if (
                    saved &&
                    readProjectionLocation(search, saved).issues.length > 0
                  ) {
                    onNavigate({ section: 'overview' }, true);
                  }
                }}
                type="button"
              >
                {reloading ? 'Loading saved plan…' : 'Discard'}
              </button>
            )}
            {conflict === 'conflict' && (
              <button
                className="btn btn-primary"
                disabled={reloading}
                onClick={() => void overwrite()}
                type="button"
              >
                Overwrite
              </button>
            )}
          </div>
        </ProjectionDialog>
      )}
    </>
  );
}
