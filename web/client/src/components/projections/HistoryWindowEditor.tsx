import { useImperativeHandle, useState, type Ref } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import type { PendingHistoryEditor } from '@/lib/projectionWorkspace.ts';

export interface HistoryWindowEditorHandle {
  read: () => PendingHistoryEditor;
}

export function HistoryWindowEditor({
  historyMonths,
  onApply,
  onClose,
  ref,
}: {
  historyMonths: number;
  onApply: (months: number) => { error: string; ok: false } | { ok: true };
  onClose: () => void;
  ref?: Ref<HistoryWindowEditorHandle>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { historyMonths },
    onSubmit: ({ value }) => {
      const result = onApply(value.historyMonths);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    },
  });
  const months = useStore(form.store, (state) => state.values.historyMonths);
  const validationMessage = [3, 6, 12].includes(months)
    ? null
    : 'Choose 3, 6, or 12 months.';
  useImperativeHandle(ref, () => ({
    read: () => ({
      hasChanges: form.state.isDirty,
      kind: 'history',
      validationMessage,
    }),
  }));
  return (
    <ProjectionDialog onClose={onClose} title="Change spending history">
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validationMessage) {
            void form.handleSubmit();
          }
        }}
      >
        <form.Field name="historyMonths">
          {(field) => (
            <label className="flex flex-col gap-2">
              Averaging window
              <select
                className="select select-bordered w-full"
                onChange={(event) =>
                  field.handleChange(Number(event.target.value))
                }
                value={field.state.value}
              >
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
            </label>
          )}
        </form.Field>
        <p className="text-sm text-base-content/80">
          Uses the spending captured with each funding source. Custom monthly
          amounts and added expenses stay unchanged. This does not refresh
          balances or staffing.
        </p>
        {(validationMessage || error) && (
          <p className="text-error" role="alert">
            {validationMessage ?? error}
          </p>
        )}
        <div className="modal-action border-t border-base-300 pt-4">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={Boolean(validationMessage)}
            type="submit"
          >
            Apply history window
          </button>
        </div>
      </form>
    </ProjectionDialog>
  );
}
