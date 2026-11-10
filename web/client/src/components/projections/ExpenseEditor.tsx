import type { ProjectionForecastWindow } from '@/lib/piProjection.ts';
import { useImperativeHandle, useState, type Ref } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/shared/forms/formContext.tsx';
import { ProjectionDialog } from '@/components/projections/ProjectionDialog.tsx';
import { sourceLabel } from '@/lib/projectionSources.ts';
import {
  computeExpenseForecast,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import {
  validateExpenseInputs,
  type ExpenseInputs,
} from '@/lib/projectionExpenses.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { PendingExpenseEditor } from '@/lib/projectionWorkspace.ts';
import type {
  ProjectionExpense,
  ProjectionFundingSource,
} from '@/queries/projections.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';

export interface ExpenseEditorHandle {
  read: () => PendingExpenseEditor;
}

export function ExpenseEditor({
  categories,
  expense,
  forecastWindow,
  lookupFailed,
  onApply,
  onClose,
  onRetryCategories,
  ref,
  source,
}: {
  categories: string[];
  expense?: ProjectionExpense;
  forecastWindow: ProjectionForecastWindow;
  lookupFailed: boolean;
  onApply: (
    inputs: ExpenseInputs
  ) => { error: string; ok: false } | { ok: true };
  onClose: () => void;
  onRetryCategories: () => void;
  ref?: Ref<ExpenseEditorHandle>;
  source: ProjectionFundingSource;
}) {
  const window = getSourceForecastWindow(source, forecastWindow);
  const [initial] = useState(() => ({
    amount: expense?.amount.toFixed(2) ?? '',
    category: expense?.expenditureCategory ?? '',
    description: expense?.description ?? '',
    end:
      expense?.endMonth?.slice(0, 7) ??
      source.endDate?.slice(0, 7) ??
      window.endMonth,
    endMode: expense?.endMonth ? ('fixed' as const) : ('source' as const),
    kind: expense?.kind ?? 'Monthly',
    preciseAmount: expense?.amount ?? null,
    start:
      expense?.startMonth?.slice(0, 7) ??
      [window.startMonth, source.startDate?.slice(0, 7) ?? window.startMonth]
        .sort()
        .at(-1)!,
  }));
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: {
      amount: initial.amount,
      category: initial.category,
      description: initial.description,
      end: initial.end,
      endMode: initial.endMode as 'source' | 'fixed',
      kind: initial.kind,
      start: initial.start,
    },
    onSubmit: () => {
      if (validationMessage) {
        return;
      }
      const result = onApply(inputs);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    },
  });
  const formState = useStore(form.store, (state) => state);
  const values = formState.values;
  const inputs: ExpenseInputs = {
    amount:
      values.amount === initial.amount && initial.preciseAmount !== null
        ? initial.preciseAmount
        : Number(values.amount),
    description: values.description,
    endMonth:
      values.kind === 'OneTime' || values.endMode === 'source'
        ? null
        : values.end
          ? `${values.end}-01`
          : '',
    expenditureCategory: values.category,
    kind: values.kind,
    startMonth: values.start ? `${values.start}-01` : '',
  };
  const amountError =
    !values.amount.trim() || !/^-?\d+(\.\d{1,2})?$/.test(values.amount.trim())
      ? 'Enter an amount, including zero or a negative amount, with up to two decimal places.'
      : null;
  const validationMessage = amountError ?? validateExpenseInputs(inputs);
  const amountMeta = formState.fieldMeta.amount;
  const showValidation =
    formState.submissionAttempts > 0 ||
    (amountError
      ? amountMeta?.isTouched || amountMeta?.isDirty
      : formState.isTouched || formState.isDirty);
  const visibleValidationMessage = showValidation ? validationMessage : null;
  const forecast = validationMessage
    ? null
    : computeExpenseForecast(source, inputs, forecastWindow);
  useImperativeHandle(ref, () => ({
    read: () => ({
      expenditureCategory: null,
      expenseId: expense?.id ?? null,
      fundingSourceId: source.id,
      hasChanges: form.state.isDirty,
      kind: 'expense',
      validationMessage,
    }),
  }));
  return (
    <ProjectionDialog
      onClose={onClose}
      title={expense ? `Edit expense: ${expense.description}` : 'Add expense'}
    >
      <p className="mt-2 text-sm text-base-content/80">
        <span className="font-medium">Charge to:</span> {sourceLabel(source)}
      </p>
      {source.projectNumber && (
        <p className="mt-1 text-sm text-base-content/80">
          {[source.projectName, `Project ${source.projectNumber}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <form
        className="mt-4 space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="description">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Expense name
              <input
                className="input input-bordered w-full"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Category
              <select
                className="select select-bordered w-full"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value}
              >
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        {lookupFailed && (
          <p className="text-sm text-base-content/80">
            The category lookup is unavailable; captured categories are still
            listed.{' '}
            <button className="link" onClick={onRetryCategories} type="button">
              Retry categories
            </button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="kind">
            {(field) => (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Frequency
                <select
                  className="select select-bordered w-full"
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value as 'Monthly' | 'OneTime'
                    )
                  }
                  value={field.state.value}
                >
                  <option value="Monthly">Monthly</option>
                  <option value="OneTime">One time</option>
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="amount">
            {(field) => (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {values.kind === 'Monthly' ? 'Monthly amount' : 'Amount'}
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
        </div>
        <p className="text-sm text-base-content/80">
          A negative amount reduces forecast costs. Zero is allowed.
        </p>
        <form.Field name="start">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {values.kind === 'Monthly' ? 'Start month' : 'Expense month'}
              <input
                className="input input-bordered w-full"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                type="month"
                value={field.state.value}
              />
            </label>
          )}
        </form.Field>
        {values.kind === 'Monthly' && (
          <>
            <form.Field name="endMode">
              {(field) => (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  End condition
                  <select
                    className="select select-bordered w-full"
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as 'source' | 'fixed'
                      )
                    }
                    value={field.state.value}
                  >
                    <option value="source">
                      {source.endDate
                        ? 'Through source end'
                        : 'Through forecast end'}
                    </option>
                    <option value="fixed">Specific end month</option>
                  </select>
                </label>
              )}
            </form.Field>
            {values.endMode === 'fixed' ? (
              <form.Field name="end">
                {(field) => (
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    End month
                    <input
                      className="input input-bordered w-full"
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      type="month"
                      value={field.state.value}
                    />
                  </label>
                )}
              </form.Field>
            ) : (
              <p className="text-sm text-base-content/80">
                {source.endDate
                  ? `Through source end: ${source.endDate}. This follows changes to the source end date.`
                  : `Through forecast end: ${fundingMonthLabel(window.endMonth)}. This follows the source's forecast period.`}
              </p>
            )}
          </>
        )}
        {forecast && (
          <p className="text-sm text-base-content/80">
            Forecast total: {formatCurrency(forecast.total)}
            {inputs.amount !== 0 && !forecast.hasEligibleDates
              ? '. These dates fall outside the source forecast period, so this expense adds no forecast cost.'
              : ''}
          </p>
        )}
        {(visibleValidationMessage || error) && (
          <p className="text-error" role="alert">
            {error ?? visibleValidationMessage}
          </p>
        )}
        <div className="modal-action border-t border-main-border pt-4">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={Boolean(validationMessage)}
            type="submit"
          >
            Apply expense
          </button>
        </div>
      </form>
    </ProjectionDialog>
  );
}
