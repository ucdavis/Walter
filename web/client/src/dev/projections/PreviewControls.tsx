import { useSyncExternalStore } from 'react';
import { formatCurrency } from '@/lib/currency.ts';
import type {
  PreviewSaveOutcome,
  ProjectionPreviewServer,
} from '@/dev/projections/server.ts';

export function PreviewControls({
  onLeave,
  server,
}: {
  onLeave: () => void;
  server: ProjectionPreviewServer;
}) {
  const status = useSyncExternalStore(server.subscribe, server.getStatus);
  return (
    <details
      className="mx-auto max-w-6xl rounded-box border border-base-300 p-4"
      open
    >
      <summary className="cursor-pointer font-semibold">
        Synthetic save scenarios
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2">
          <input
            checked={status.hold}
            className="checkbox checkbox-sm"
            onChange={(event) => server.setHold(event.target.checked)}
            type="checkbox"
          />
          Hold save requests
        </label>
        <button
          className="btn btn-sm"
          disabled={!status.pending}
          onClick={server.finishNextSave}
          type="button"
        >
          Finish pending save
        </button>
        <label className="flex flex-col gap-1 text-sm">
          Next save result
          <select
            className="select select-sm"
            onChange={(event) =>
              server.setOutcome(event.target.value as PreviewSaveOutcome)
            }
            value={status.outcome}
          >
            <option value="success">Success</option>
            <option value="failure">Fail before saving</option>
            <option value="lost-response">Save, then lose response</option>
          </select>
        </label>
        <button
          className="btn btn-sm"
          onClick={server.editRemotely}
          type="button"
        >
          Another user saves
        </button>
        <button
          className="btn btn-sm"
          onClick={server.resetRemotely}
          type="button"
        >
          Reset saved snapshot
        </button>
        <button
          className="btn btn-sm"
          onClick={server.deleteRemotely}
          type="button"
        >
          Delete saved plan
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={onLeave}
          type="button"
        >
          Leave preview
        </button>
      </div>
      <p className="mt-3 text-sm">
        Server copy:{' '}
        {status.updatedAt === 'Deleted'
          ? 'deleted'
          : `${formatCurrency((status.storedSalary ?? 0) * 12)} annual salary`}
        {' · '}
        {status.requests} save requests · {status.reloads} reloads
      </p>
    </details>
  );
}
