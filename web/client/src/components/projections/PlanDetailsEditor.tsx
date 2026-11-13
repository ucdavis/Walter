import { DeleteProjectionDialog } from '@/components/projections/DeleteProjectionDialog.tsx';
import { useImperativeHandle, useState, type Ref } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import {
  PlanDurationField,
  PlanNotesField,
} from '@/components/projections/PlanDetailsFields.tsx';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { getProjectionForecastWindow } from '@/lib/piProjection.ts';
import {
  MAX_PLAN_NAME_LENGTH,
  validatePlanDetails,
  type PlanDetailsInputs,
} from '@/lib/projectionDetails.ts';
import type { PendingPlanDetailsEditor } from '@/lib/projectionWorkspace.ts';
import type { ProjectionDraft } from '@/queries/projections.ts';

export interface PlanDetailsEditorHandle {
  read: () => PendingPlanDetailsEditor;
}

export function PlanDetailsEditor({
  deleteDisabled = false,
  iamId,
  onApply,
  onClose,
  onDeleted,
  plan,
  ref,
}: {
  deleteDisabled?: boolean;
  iamId?: string;
  onApply: (
    inputs: PlanDetailsInputs
  ) => { ok: true } | { error: string; ok: false };
  onClose: () => void;
  onDeleted?: () => Promise<void>;
  plan: ProjectionDraft;
  ref?: Ref<PlanDetailsEditorHandle>;
}) {
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: {
      forecastMonths: plan.content.forecastMonths,
      name: plan.name,
      notes: plan.content.notes ?? '',
    },
    onSubmit: ({ value }) => {
      const result = onApply({ ...value, notes: value.notes || null });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const validationMessage = validatePlanDetails(values, plan.seededAt);
  const window = validationMessage
    ? null
    : getProjectionForecastWindow({
        ...plan,
        content: { ...plan.content, forecastMonths: values.forecastMonths },
      });
  useImperativeHandle(ref, () => ({
    read: () => ({
      hasChanges: confirmDelete || form.state.isDirty,
      kind: 'details',
      validationMessage,
    }),
  }));
  if (confirmDelete && iamId && onDeleted) {
    return (
      <DeleteProjectionDialog
        conflict={deleteConflict}
        iamId={iamId}
        onClose={() => setConfirmDelete(false)}
        onConflict={() => setDeleteConflict(true)}
        onDeleted={onDeleted}
        onReloaded={onClose}
      />
    );
  }
  return (
    <ProjectionDialog onClose={onClose} title="Edit plan details">
      <form
        className="mt-4 space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validationMessage) {
            void form.handleSubmit();
          }
        }}
      >
        <form.Field name="name">
          {(field) => (
            <label className="flex flex-col gap-2">
              Plan name
              <input
                className="input input-bordered w-full"
                maxLength={MAX_PLAN_NAME_LENGTH}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="forecastMonths">
          {(field) => (
            <PlanDurationField
              onChange={field.handleChange}
              value={field.state.value}
            />
          )}
        </form.Field>
        {window && (
          <p className="text-sm">
            Forecast from {fundingMonthLabel(window.startMonth)} through{' '}
            {fundingMonthLabel(window.endMonth)}.
          </p>
        )}
        <form.Field name="notes">
          {(field) => (
            <PlanNotesField
              onChange={field.handleChange}
              value={field.state.value}
            />
          )}
        </form.Field>
        {(validationMessage || error) && (
          <p className="text-error" role="alert">
            {validationMessage ?? error}
          </p>
        )}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={Boolean(validationMessage)}
            type="submit"
          >
            Apply plan details
          </button>
        </div>
      </form>
      {iamId && onDeleted && (
        <div className="mt-6 border-t border-base-300 pt-4">
          <button
            className="btn btn-outline btn-error btn-sm"
            disabled={deleteDisabled}
            onClick={() => setConfirmDelete(true)}
            type="button"
          >
            Delete plan
          </button>
        </div>
      )}
    </ProjectionDialog>
  );
}
