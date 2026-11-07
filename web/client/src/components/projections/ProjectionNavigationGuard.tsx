import { useBlocker } from '@tanstack/react-router';
import { useProjectionSession } from '@/components/projections/ProjectionSession.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import {
  isProjectionDirty,
  type PendingSalaryEditor,
} from '@/lib/projectionWorkspace.ts';

export function ProjectionNavigationGuard({
  pendingEditor,
  planPath,
}: {
  pendingEditor: () => PendingSalaryEditor | null;
  planPath: string;
}) {
  const { conflict, error, reloading, saving, session } =
    useProjectionSession();
  const hasWork = () =>
    saving ||
    reloading ||
    Boolean(error || conflict) ||
    isProjectionDirty(session) ||
    Boolean(pendingEditor()?.hasChanges);
  const blocker = useBlocker({
    enableBeforeUnload: hasWork,
    shouldBlockFn: ({ next }) =>
      next.pathname.replace(/\/$/, '') !== planPath.replace(/\/$/, '') &&
      hasWork(),
    withResolver: true,
  });
  if (blocker.status !== 'blocked') {
    return null;
  }
  return (
    <ProjectionDialog
      onClose={blocker.reset}
      title={saving ? 'Leave while saving?' : 'Leave this plan?'}
    >
      <p className="mt-4">
        {saving
          ? 'The save request may still complete if you leave. Newer unsaved edits and unapplied typing will be lost.'
          : 'Your unsaved changes and unapplied typing will be discarded if you leave.'}
      </p>
      <div className="modal-action">
        <button className="btn btn-ghost" onClick={blocker.reset} type="button">
          Stay
        </button>
        <button
          className="btn btn-primary"
          onClick={blocker.proceed}
          type="button"
        >
          {saving ? 'Leave anyway' : 'Discard'}
        </button>
      </div>
    </ProjectionDialog>
  );
}
