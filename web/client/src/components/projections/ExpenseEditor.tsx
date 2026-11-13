import type { ProjectionForecastWindow } from '@/lib/piProjection.ts';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
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

function defaultExpenseDates(
  source: ProjectionFundingSource | undefined,
  forecastWindow: ProjectionForecastWindow
) {
  const window = source
    ? getSourceForecastWindow(source, forecastWindow)
    : forecastWindow;
  return {
    end: source?.endDate?.slice(0, 7) ?? window.endMonth,
    start: [
      window.startMonth,
      source?.startDate?.slice(0, 7) ?? window.startMonth,
    ]
      .sort()
      .at(-1)!,
  };
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
  source: initialSource,
  sources,
}: {
  categories: string[];
  expense?: ProjectionExpense;
  forecastWindow: ProjectionForecastWindow;
  lookupFailed: boolean;
  onApply: (
    inputs: ExpenseInputs,
    sourceId: number
  ) => { error: string; ok: false } | { ok: true };
  onClose: () => void;
  onRetryCategories: () => void;
  ref?: Ref<ExpenseEditorHandle>;
  source?: ProjectionFundingSource;
  sources: ProjectionFundingSource[];
}) {
  const defaults = defaultExpenseDates(initialSource, forecastWindow);
  const nameRef = useRef<HTMLInputElement>(null);
  const chargeRef = useRef<HTMLSelectElement>(null);
  const explicitStart = useRef(false);
  const explicitEnd = useRef(false);
  const [initial] = useState(() => ({
    amount: expense?.amount.toFixed(2) ?? '',
    category: expense?.expenditureCategory ?? '',
    description: expense?.description ?? '',
    end: expense?.endMonth?.slice(0, 7) ?? defaults.end,
    endMode: expense?.endMonth ? ('fixed' as const) : ('source' as const),
    focusExpenseName: Boolean(initialSource || expense),
    kind: expense?.kind ?? 'Monthly',
    preciseAmount: expense?.amount ?? null,
    start: expense?.startMonth?.slice(0, 7) ?? defaults.start,
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
      sourceId: initialSource ? String(initialSource.id) : '',
      start: initial.start,
    },
    onSubmit: () => {
      if (validationMessage || !source) {
        return;
      }
      const result = onApply(inputs, source.id);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    },
  });
  const formState = useStore(form.store, (state) => state);
  const values = formState.values;
  const source = expense
    ? sources.find(({ id }) => id === initialSource?.id)
    : sources.find(({ id }) => String(id) === values.sourceId);
  const window = source
    ? getSourceForecastWindow(source, forecastWindow)
    : forecastWindow;
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
  const validationMessage = !source
    ? 'Choose a funding source to charge this expense to.'
    : (amountError ?? validateExpenseInputs(inputs));
  const amountMeta = formState.fieldMeta.amount;
  const showValidation =
    formState.submissionAttempts > 0 ||
    (amountError
      ? amountMeta?.isTouched || amountMeta?.isDirty
      : formState.isTouched || formState.isDirty);
  const visibleValidationMessage = showValidation ? validationMessage : null;
  const forecast =
    validationMessage || !source
      ? null
      : computeExpenseForecast(source, inputs, forecastWindow);
  useImperativeHandle(ref, () => ({
    read: () => ({
      expenditureCategory: null,
      expenseId: expense?.id ?? null,
      fundingSourceId: source?.id ?? null,
      hasChanges: form.state.isDirty,
      kind: 'expense',
      validationMessage,
    }),
  }));
  return (
    <ProjectionDialog
      initialFocusRef={initial.focusExpenseName ? nameRef : chargeRef}
      onClose={onClose}
      title={expense ? `Edit expense: ${expense.description}` : 'Add expense'}
    >
      {expense && source && (
        <p className="mt-2 text-sm text-base-content/80">
          <span className="font-medium">Charge to:</span> {sourceLabel(source)}
        </p>
      )}
      {expense && source && (source.projectNumber || source.taskNumber) && (
        <p className="mt-1 text-sm text-base-content/80">
          {[
            source.projectNumber && `Project ${source.projectNumber}`,
            source.taskNumber && `Task ${source.taskNumber}`,
          ]
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
        {!expense && (
          <form.Field name="sourceId">
            {(field) => (
              <div>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Charge to
                  <select
                    className="select select-bordered w-full"
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      const nextSource = sources.find(
                        ({ id }) => String(id) === event.target.value
                      );
                      const nextDates = defaultExpenseDates(
                        nextSource,
                        forecastWindow
                      );
                      field.handleChange(event.target.value);
                      // Source defaults follow the charge target until the user chooses explicit dates.
                      if (!explicitStart.current) {
                        form.setFieldValue('start', nextDates.start);
                      }
                      if (!explicitEnd.current) {
                        form.setFieldValue('end', nextDates.end);
                      }
                      setError(null);
                    }}
                    ref={chargeRef}
                    required
                    value={field.state.value}
                  >
                    <option value="">Choose a funding source</option>
                    {sources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {sourceLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>
                {source && (source.projectNumber || source.taskNumber) && (
                  <p className="mt-1 text-sm text-base-content/80">
                    {[
                      source.projectNumber && `Project ${source.projectNumber}`,
                      source.taskNumber && `Task ${source.taskNumber}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            )}
          </form.Field>
        )}
        <form.Field name="description">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Expense name
              <input
                className="input input-bordered w-full"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                ref={nameRef}
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
                onChange={(event) => {
                  explicitStart.current = true;
                  field.handleChange(event.target.value);
                }}
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
                      {source?.endDate
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
                      onChange={(event) => {
                        explicitEnd.current = true;
                        field.handleChange(event.target.value);
                      }}
                      type="month"
                      value={field.state.value}
                    />
                  </label>
                )}
              </form.Field>
            ) : (
              <p className="text-sm text-base-content/80">
                {source?.endDate
                  ? `Through source end: ${source?.endDate}. This follows changes to the source end date.`
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
