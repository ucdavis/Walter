import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';
import { useQuery } from '@tanstack/react-query';
import { SourceBudgetEditor } from '@/components/projections/SourceBudgetEditor.tsx';
import { updateSourceBudget } from '@/lib/projectionBudgets.ts';
import { buildSourceFundingBalance } from '@/lib/projectionFundingBalances.ts';
import { computePiProjection } from '@/lib/piProjection.ts';
import {
  projectionLookupsQueryOptions,
  type CategoryBudgetAdjustment,
} from '@/queries/projections.ts';
import { getSourceFundingBasis } from '@/lib/projectionFundingBalances.ts';
import {
  ArrowPathIcon,
  CheckIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
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
  type PlannedSourceInputs,
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
  onApply: (
    inputs: PlannedSourceInputs,
    categories: string[]
  ) => SourceOperationResult<T>;
  onClose: () => void;
  ref?: Ref<SourceEditorHandle>;
  session: ProjectionSession<T>;
  source?: ProjectionFundingSource;
}) {
  const lookup = useQuery(projectionLookupsQueryOptions());
  const categories = [
    ...new Set([
      ...(lookup.data?.expenditureCategories ?? []),
      ...(source
        ? [
            ...source.budgets,
            ...source.categoryAdjustments,
            ...source.actuals,
            ...source.runRates,
          ].map((row) => row.expenditureCategory)
        : []),
    ]),
  ].sort();
  const [budgetSource, setBudgetSource] = useState(source);
  const [initialCategories, setInitialCategories] = useState<
    CategoryBudgetAdjustment[]
  >([]);
  const [budgetPending, setBudgetPending] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const budgetHeadingRef = useRef<HTMLDivElement>(null);
  const initialBalance = source ? sourcePlanningBalance(source) : null;
  const initialDisplay = initialBalance?.toFixed(2) ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const form = useAppForm({
    defaultValues: {
      balance: initialDisplay,
      endDate: source?.endDate ?? '',
      name: source?.name ?? '',
      plannedBudgetMode:
        source?.plannedBudgetMode ??
        ('GeneralPool' as 'GeneralPool' | 'Categories'),
      startDate: source?.startDate ?? '',
    },
    onSubmit: ({ value }) => {
      const result = onApply(inputsFrom(value), categories);
      if (result.ok) {
        onClose();
      }
    },
  });
  const values = useStore(form.store, (state) => state.values);
  const categoryMode = source
    ? getSourceFundingBasis(source) === 'categories'
    : values.plannedBudgetMode === 'Categories';
  function inputsFrom(value: typeof values): PlannedSourceInputs {
    const amount = value.balance.trim() ? Number(value.balance) : Number.NaN;
    return {
      balance: categoryMode
        ? budgetSource
          ? sourcePlanningBalance(budgetSource)
          : initialCategories.reduce((sum, row) => sum + row.amount, 0)
        : initialBalance !== null && amount === Number(initialDisplay)
          ? initialBalance
          : amount,
      categoryAdjustments: budgetSource?.categoryAdjustments,
      endDate: value.endDate || null,
      initialCategoryBudgets:
        value.plannedBudgetMode === 'Categories' ? initialCategories : [],
      name: value.name,
      plannedBudgetMode: value.plannedBudgetMode,
      startDate: value.startDate || null,
    };
  }
  const validation = source
    ? editProjectionSource(session, source.id, inputsFrom(values), categories)
    : addPlannedSource(session, inputsFrom(values), categories);
  const validationMessage = budgetPending
    ? 'Finish or cancel the budget action before applying source changes.'
    : (budgetError ?? (validation.ok ? null : validation.error));
  const previewDraft = validation.ok ? validation.session.draft : session.draft;
  const previewSource = validation.ok
    ? source
      ? previewDraft.content.fundingSources.find(
          (candidate) => candidate.id === source.id
        )
      : previewDraft.content.fundingSources.at(-1)
    : budgetSource;
  const balances = previewSource
    ? buildSourceFundingBalance(
        previewSource,
        validation.ok ? computePiProjection(previewDraft).rows : []
      )
    : null;
  const budgetRows = source
    ? (balances?.categories
        .filter((row) => !row.isBalanceAdjustment)
        .map((row) => ({
          category: row.expenditureCategory,
          change: row.adjustment,
          initial: row.capturedAvailable,
          initialRecorded: row.budgetRecorded,
          remaining: row.endRemaining,
          revised: row.revisedAvailable,
        })) ?? [])
    : initialCategories.map((row) => ({
        category: row.expenditureCategory,
        change: 0,
        initial: row.amount,
        remaining:
          balances?.categories.find(
            (category) =>
              category.expenditureCategory === row.expenditureCategory
          )?.endRemaining ?? null,
        revised: row.amount,
      }));
  function changeBudget(change: Parameters<typeof updateSourceBudget>[1]) {
    if (budgetSource) {
      const result = updateSourceBudget(budgetSource, change, categories);
      setBudgetError(result.ok ? null : result.error);
      if (result.ok) {
        setBudgetSource(result.source);
      }
    } else {
      if (change.kind === 'reset') {
        setInitialCategories([]);
        return;
      }
      const next = new Map(
        initialCategories.map((row) => [row.expenditureCategory, row.amount])
      );
      const add = (category: string, amount: number) =>
        next.set(
          category,
          Math.round(((next.get(category) ?? 0) + amount) * 100) / 100
        );
      if (change.kind === 'move') {
        add(change.from, -change.amount);
        add(change.to, change.amount);
      } else {
        add(change.expenditureCategory, change.amount);
      }
      setInitialCategories(
        [...next].map(([expenditureCategory, amount]) => ({
          amount,
          expenditureCategory,
        }))
      );
    }
  }
  function resetBudget() {
    if (categoryMode) {
      changeBudget({ kind: 'reset' });
    } else if (source) {
      const result = updateSourceBudget(source, { kind: 'reset' }, categories);
      if (result.ok) {
        form.setFieldValue(
          'balance',
          String(sourcePlanningBalance(result.source))
        );
      }
    }
  }
  useImperativeHandle(ref, () => ({
    read: () => ({
      fundingSourceId: source?.id ?? null,
      hasChanges:
        form.state.isDirty ||
        budgetPending ||
        JSON.stringify(budgetSource?.categoryAdjustments) !==
          JSON.stringify(source?.categoryAdjustments) ||
        initialCategories.length > 0,
      kind: 'source',
      validationMessage,
    }),
  }));
  useEffect(() => {
    if (source && getSourceFundingBasis(source) === 'categories') {
      budgetHeadingRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [source]);

  const capturedStart = source?.capturedStartDate;
  const capturedEnd = source?.capturedEndDate;
  const planned = !source || source.sourceKind === 'Planned';
  return (
    <ProjectionDialog
      header={(titleId) => (
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold break-words" id={titleId}>
            {source ? `Edit ${sourceLabel(source)}` : 'Add planned funding'}
          </h2>
          <button
            aria-label="Close funding editor"
            className="btn btn-ghost btn-sm btn-square shrink-0"
            onClick={onClose}
            type="button"
          >
            <XMarkIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
      onClose={onClose}
      title={source ? `Edit ${sourceLabel(source)}` : 'Add planned funding'}
      wide={categoryMode}
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
        {!source && (
          <form.Field name="plannedBudgetMode">
            {(field) => (
              <div className="flex flex-col gap-2 text-sm">
                <SourceTypeLabel />
                <select
                  aria-label="Source type"
                  className="select w-full"
                  disabled={budgetPending}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value as 'GeneralPool' | 'Categories'
                    )
                  }
                  value={field.state.value}
                >
                  <option value="GeneralPool">Internal</option>
                  <option value="Categories">Sponsored</option>
                </select>
                <span className="text-base-content/60">
                  The source type is fixed when this planned source is created.
                </span>
              </div>
            )}
          </form.Field>
        )}
        {source?.sourceKind === 'Planned' && (
          <div className="text-sm">
            <SourceTypeLabel />
            <p className="mt-1 font-medium">
              {categoryMode ? 'Sponsored' : 'Internal'}
            </p>
            <p className="mt-1 text-base-content/60">
              The source type was fixed when this planned source was created.
            </p>
          </div>
        )}
        {categoryMode ? (
          <div ref={budgetHeadingRef} tabIndex={-1}>
            <SourceBudgetEditor
              categories={categories}
              initialPlanned={planned}
              onAdjust={(expenditureCategory, amount) =>
                changeBudget({ amount, expenditureCategory, kind: 'adjust' })
              }
              onMove={(from, to, amount) =>
                changeBudget({ amount, from, kind: 'move', to })
              }
              onPendingChange={setBudgetPending}
              onReset={resetBudget}
              rows={budgetRows}
            />
            {lookup.isPending && (
              <p className="mt-2 text-sm">Loading budget categories…</p>
            )}
            {lookup.isError && (
              <p className="mt-2 text-sm text-error">
                Budget categories could not be loaded. Try again before changing
                the budget.
              </p>
            )}
          </div>
        ) : (
          <>
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
            {planned && (
              <p className="text-sm text-base-content/70">
                {source
                  ? `Initial planned funding: ${formatCurrency(source.initialPlannedBalance)}. Reset budget changes restores this amount.`
                  : 'This amount becomes the initial planned funding and reset baseline.'}
              </p>
            )}
            {source && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={resetBudget}
                type="button"
              >
                <ArrowPathIcon aria-hidden="true" className="size-4" />
                Reset budget changes
              </button>
            )}
          </>
        )}
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
                  form.setFieldValue('startDate', capturedStart ?? '');
                  form.setFieldValue('endDate', capturedEnd ?? '');
                }}
                type="button"
              >
                <ArrowPathIcon aria-hidden="true" className="size-4" />
                Reset dates
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

function SourceTypeLabel() {
  return (
    <div className="flex items-center gap-1.5">
      <span>Source type</span>
      <TooltipLabel
        asChild
        clickToOpen
        label={
          <button
            aria-label="About source types"
            className="inline-flex rounded-sm text-base-content/60 hover:text-base-content focus-visible:outline-2 focus-visible:outline-primary"
            type="button"
          >
            <InformationCircleIcon aria-hidden="true" className="size-4" />
          </button>
        }
        tooltip={tooltipDefinitions.plannedSourceType}
      />
    </div>
  );
}
