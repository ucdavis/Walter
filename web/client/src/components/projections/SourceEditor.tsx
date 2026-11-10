import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import {
  addPlannedSource,
  editProjectionSource,
  sourceCapturedBalance,
  sourceLabel,
  sourcePlanningBalance,
  type SourceInputs,
  type SourceOperationResult,
} from '@/lib/projectionSources.ts';
import type {
  PendingSourceEditor,
  ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionDraft,
  ProjectionFundingSource,
} from '@/queries/projections.ts';

export interface SourceEditorHandle {
  read: () => PendingSourceEditor;
}

export function SourceEditor<T extends ProjectionDraft>({
  onApply,
  onClose,
  ref,
  session,
  source,
}: {
  onApply: (inputs: SourceInputs) => SourceOperationResult<T>;
  onClose: () => void;
  ref?: Ref<SourceEditorHandle>;
  session: ProjectionSession<T>;
  source?: ProjectionFundingSource;
}) {
  const initialBalance = source ? sourcePlanningBalance(source) : null;
  const initialDisplay = initialBalance?.toFixed(2) ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: {
      balance: initialDisplay,
      endDate: source?.endDate ?? '',
      name: source?.name ?? '',
      startDate: source?.startDate ?? '',
    },
    onSubmit: ({ value }) => {
      const result = onApply(inputsFrom(value));
      if (result.ok) {
        onClose();
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  function inputsFrom(value: typeof values): SourceInputs {
    const amount = value.balance.trim() ? Number(value.balance) : Number.NaN;
    return {
      balance:
        initialBalance !== null && amount === Number(initialDisplay)
          ? initialBalance
          : amount,
      endDate: value.endDate || null,
      name: value.name,
      startDate: value.startDate || null,
    };
  }
  const validation = source
    ? editProjectionSource(session, source.id, inputsFrom(values))
    : addPlannedSource(session, inputsFrom(values));
  const validationMessage = validation.ok ? null : validation.error;
  useImperativeHandle(ref, () => ({
    read: () => ({
      fundingSourceId: source?.id ?? null,
      hasChanges: form.state.isDirty,
      kind: 'source',
      validationMessage,
    }),
  }));
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const capturedStart = source?.capturedStartDate;
  const capturedEnd = source?.capturedEndDate;
  const planned = !source || source.sourceKind === 'Planned';
  return (
    <ProjectionDialog
      onClose={onClose}
      title={source ? `Edit ${sourceLabel(source)}` : 'Add planned funding'}
    >
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
            <label className="flex flex-col gap-2 text-sm">
              Source name
              <input
                className="input input-bordered w-full"
                maxLength={200}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                ref={inputRef}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="balance">
          {(field) => (
            <label className="flex flex-col gap-2 text-sm">
              Planning balance
              <input
                className="input input-bordered w-full"
                inputMode="decimal"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="startDate">
            {(field) => (
              <label className="flex flex-col gap-2 text-sm">
                Start date
                <input
                  className="input input-bordered w-full"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="date"
                  value={field.state.value}
                />
              </label>
            )}
          </form.Field>
          <form.Field name="endDate">
            {(field) => (
              <label className="flex flex-col gap-2 text-sm">
                End date
                <input
                  className="input input-bordered w-full"
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="date"
                  value={field.state.value}
                />
              </label>
            )}
          </form.Field>
        </div>
        {planned ? (
          <p className="text-sm">
            Planned funding becomes available in full on its start date.
          </p>
        ) : (
          source && (
            <div className="rounded-lg border border-main-border bg-base-200/40 p-4 text-sm text-base-content/80">
              <p>
                Captured balance:{' '}
                {formatCurrency(sourceCapturedBalance(source))}
              </p>
              <p>
                Captured dates: {capturedStart ?? 'No start date'} to{' '}
                {capturedEnd ?? 'No end date'}
              </p>
              <button
                className="btn btn-ghost btn-sm mt-2"
                onClick={() => {
                  form.setFieldValue(
                    'balance',
                    String(sourceCapturedBalance(source))
                  );
                  form.setFieldValue('startDate', capturedStart ?? '');
                  form.setFieldValue('endDate', capturedEnd ?? '');
                }}
                type="button"
              >
                <ArrowPathIcon aria-hidden="true" className="size-4" />
                Reset balance and dates
              </button>
            </div>
          )
        )}
        {validationMessage && (
          <p className="text-sm text-error" role="alert">
            {validationMessage}
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
            <CheckIcon aria-hidden="true" className="size-4" />
            Apply
          </button>
        </div>
      </form>
    </ProjectionDialog>
  );
}
