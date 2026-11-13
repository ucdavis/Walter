import { useImperativeHandle, useState, type Ref } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { sourceLabel } from '@/lib/projectionSources.ts';
import type { ProjectionFundingSource } from '@/queries/projections.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { PendingExpenseEditor } from '@/lib/projectionWorkspace.ts';

export interface HistoricalExpenseEditorHandle {
  read: () => PendingExpenseEditor;
}

export function HistoricalExpenseEditor({
  baselineAmount,
  category,
  hasCapturedAmount,
  historyMonths,
  monthlyAmount,
  onApply,
  onClose,
  ref,
  source,
}: {
  baselineAmount: number;
  category: string;
  hasCapturedAmount: boolean;
  historyMonths: number;
  monthlyAmount: number;
  onApply: (
    amount: number,
    forceZero: boolean
  ) => { error: string; ok: false } | { ok: true };
  onClose: () => void;
  ref?: Ref<HistoricalExpenseEditorHandle>;
  source: ProjectionFundingSource;
}) {
  const [initial] = useState(() => ({
    amount: monthlyAmount.toFixed(2),
    preciseAmount: monthlyAmount,
  }));
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { amount: initial.amount, forceZero: false },
    onSubmit: () => {
      const result = onApply(
        amount,
        form.state.values.forceZero && amount === 0
      );
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    },
  });
  const { amount: text, forceZero } = useStore(
    form.store,
    (state) => state.values
  );
  const amount =
    forceZero && Number(text) === 0
      ? 0
      : text === initial.amount
        ? initial.preciseAmount
        : Number(text);
  const validationMessage =
    !text.trim() ||
    !/^-?\d+(\.\d{1,2})?$/.test(text.trim()) ||
    !Number.isFinite(amount)
      ? 'Enter a monthly amount, including zero or a negative amount, with up to two decimal places.'
      : null;
  useImperativeHandle(ref, () => ({
    read: () => ({
      expenditureCategory: category,
      expenseId: null,
      fundingSourceId: source.id,
      hasChanges: form.state.isDirty,
      kind: 'historicalExpense',
      validationMessage,
    }),
  }));
  return (
    <ProjectionDialog
      onClose={onClose}
      title={`Edit historical amount: ${category}`}
    >
      <p className="mt-2 text-sm text-base-content/80">
        <span className="font-medium">Charge to:</span> {sourceLabel(source)}
      </p>
      {(source.projectNumber || source.taskNumber) && (
        <p className="mt-1 text-sm text-base-content/80">
          {[
            source.projectNumber && `Project ${source.projectNumber}`,
            source.taskNumber && `Task ${source.taskNumber}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <p className="mt-3 text-sm">
        {hasCapturedAmount
          ? `Captured ${historyMonths}-month average: ${formatCurrency(baselineAmount)} per month.`
          : 'No costs captured in this window. The historical amount is $0.00 per month.'}
      </p>
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
        <form.Field name="amount">
          {(field) => (
            <label className="flex flex-col gap-2">
              Monthly amount
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
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            form.setFieldValue('amount', '0.00');
            form.setFieldValue('forceZero', true);
          }}
          type="button"
        >
          Turn off estimate
        </button>
        {forceZero && amount === 0 && (
          <p className="text-sm text-base-content/80">
            This estimate will stay off when the history window changes.
          </p>
        )}
        <p className="text-sm text-base-content/80">
          Use Turn off estimate to keep it at zero across history windows. A
          negative amount reduces forecast costs. A custom amount stays in place
          when the history window changes; Use historical amount restores the
          selected history average.
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
            Apply amount
          </button>
        </div>
      </form>
    </ProjectionDialog>
  );
}
