import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import {
  Cog6ToothIcon,
  ListBulletIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { projectionHistoryTooltip } from '@/shared/tooltips.ts';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import { ProjectionExpensesTable } from '@/components/projections/ProjectionExpensesTable.tsx';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ExpenseEditor,
  type ExpenseEditorHandle,
} from '@/components/projections/ExpenseEditor.tsx';
import {
  HistoricalExpenseEditor,
  type HistoricalExpenseEditorHandle,
} from '@/components/projections/HistoricalExpenseEditor.tsx';
import {
  HistoryWindowEditor,
  type HistoryWindowEditorHandle,
} from '@/components/projections/HistoryWindowEditor.tsx';
import {
  computeExpenseForecast,
  getProjectionForecastWindow,
  getSourceForecastWindow,
} from '@/lib/piProjection.ts';
import {
  addProjectionExpense,
  changeProjectionHistoryMonths,
  editProjectionExpense,
  getHistoricalExpenseRows,
  isManualExpenseCategory,
  removeProjectionExpense,
  restoreHistoricalExpense,
  setHistoricalExpenseOverride,
  type ExpenseOperation,
  type ExpenseOperationResult,
} from '@/lib/projectionExpenses.ts';
import { isSponsoredProject, sourceLabel } from '@/lib/projectionSources.ts';
import type {
  PendingExpenseEditor,
  PendingHistoryEditor,
  ProjectionSession,
} from '@/lib/projectionWorkspace.ts';
import {
  projectionLookupsQueryOptions,
  type ProjectionDraft,
} from '@/queries/projections.ts';

export interface ExpensesEditorHandle {
  read: () => PendingExpenseEditor | PendingHistoryEditor | null;
}
type EditorTarget =
  | { kind: 'history' }
  | { id: number | 'new'; kind: 'expense'; sourceId: number | null }
  | { category: string; kind: 'historical'; sourceId: number };

export function ExpensesEditor<T extends ProjectionDraft>({
  onOperation,
  ref,
  session,
  sourceTarget,
}: {
  onOperation: (operation: ExpenseOperation) => ExpenseOperationResult<T>;
  ref?: Ref<ExpensesEditorHandle>;
  session: ProjectionSession<T>;
  sourceTarget?: { id: number | null; onChange: (id: number | null) => void };
}) {
  const { draft } = session;
  const forecastWindow = getProjectionForecastWindow(draft);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manualRef = useRef<ExpenseEditorHandle>(null);
  const historicalRef = useRef<HistoricalExpenseEditorHandle>(null);
  const historyRef = useRef<HistoryWindowEditorHandle>(null);
  const lookup = useQuery(projectionLookupsQueryOptions());
  const selectedSource = draft.content.fundingSources.find(
    ({ id }) => id === (sourceTarget ? sourceTarget.id : selectedId)
  );
  const visibleSources = selectedSource
    ? [selectedSource]
    : draft.content.fundingSources;
  const selectSource = (id: number | null) => {
    if (sourceTarget) {
      sourceTarget.onChange(id);
    } else {
      setSelectedId(id);
    }
  };
  const editingSource =
    editing && editing.kind !== 'history'
      ? draft.content.fundingSources.find(({ id }) => id === editing.sourceId)
      : undefined;
  const expense =
    editing?.kind === 'expense' && editing.id !== 'new'
      ? editingSource?.expenses.find(({ id }) => id === editing.id)
      : undefined;
  const editingHistorical =
    editing?.kind === 'historical' && editingSource
      ? getHistoricalExpenseRows(
          editingSource,
          draft.content.historyMonths
        ).find(
          ({ expenditureCategory }) => expenditureCategory === editing.category
        )
      : undefined;
  const categories = [
    ...new Set([
      ...(lookup.data?.expenditureCategories ?? []),
      ...draft.content.fundingSources.flatMap((source) =>
        [
          ...source.budgets,
          ...source.categoryAdjustments,
          ...source.actuals,
          ...source.runRates,
          ...source.expenses,
          ...source.historicalExpenseOverrides,
        ].map(({ expenditureCategory }) => expenditureCategory)
      ),
    ]),
  ]
    .filter(isManualExpenseCategory)
    .sort();
  useImperativeHandle(ref, () => ({
    read: () =>
      manualRef.current?.read() ??
      historicalRef.current?.read() ??
      historyRef.current?.read() ??
      null,
  }));
  function apply(operation: ExpenseOperation) {
    const result = onOperation(operation);
    setError(result.ok ? null : result.error);
    return result;
  }
  function openNewExpense() {
    setEditing({
      id: 'new',
      kind: 'expense',
      sourceId:
        selectedSource?.id ??
        (draft.content.fundingSources.length === 1
          ? draft.content.fundingSources[0].id
          : null),
    });
  }
  const window = selectedSource
    ? getSourceForecastWindow(selectedSource, forecastWindow)
    : null;
  const historicalTotal = visibleSources.reduce(
    (total, source) =>
      total +
      getHistoricalExpenseRows(source, draft.content.historyMonths).reduce(
        (sourceTotal, row) =>
          sourceTotal +
          computeExpenseForecast(
            source,
            {
              amount: row.effectiveAmount,
              endMonth: null,
              kind: 'Monthly',
              startMonth: null,
            },
            forecastWindow
          ).total,
        0
      ),
    0
  );
  const addedTotal = (kind: 'Monthly' | 'OneTime') =>
    visibleSources.reduce(
      (total, source) =>
        total +
        source.expenses
          .filter((item) => item.kind === kind)
          .reduce(
            (sourceTotal, item) =>
              sourceTotal +
              computeExpenseForecast(source, item, forecastWindow).total,
            0
          ),
      0
    );
  const addedMonthlyTotal = addedTotal('Monthly');
  const oneTimeTotal = addedTotal('OneTime');
  const oneTimeCount = visibleSources.reduce(
    (count, source) =>
      count + source.expenses.filter(({ kind }) => kind === 'OneTime').length,
    0
  );
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <ListBulletIcon aria-hidden="true" className="size-5 shrink-0" />
            Expenses
          </h2>
          <p className="mt-1 text-sm text-base-content/80">
            Review projected costs and add planned expenses.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            className="btn"
            disabled={!draft.content.fundingSources.length}
            onClick={openNewExpense}
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-5 shrink-0" />
            Add new expense
          </button>
          <TooltipLabel
            asChild
            label={
              <button
                aria-label="Change history window"
                className="btn btn-ghost btn-square btn-sm text-base-content/80"
                onClick={() => setEditing({ kind: 'history' })}
                type="button"
              >
                <Cog6ToothIcon aria-hidden="true" className="size-5" />
              </button>
            }
            tooltip={projectionHistoryTooltip(draft.content.historyMonths)}
          />
        </div>
      </div>
      {draft.content.fundingSources.length > 0 && (
        <label className="mb-5 grid w-full min-w-0 gap-1.5 text-sm font-medium sm:max-w-3xl">
          View expenses for
          <select
            className="select w-full min-w-0 truncate pr-10"
            onChange={(event) =>
              selectSource(
                event.target.value === '' ? null : Number(event.target.value)
              )
            }
            value={selectedSource?.id ?? ''}
          >
            <option value="">All funding sources</option>
            {draft.content.fundingSources.map((source) => (
              <option key={source.id} value={source.id}>
                {isSponsoredProject(source) ? source.name : sourceLabel(source)}
              </option>
            ))}
          </select>
        </label>
      )}
      {draft.content.fundingSources.length ? (
        <>
          {window?.isBeyondForecast && (
            <p className="mb-4 text-sm text-base-content/80">
              This source starts after the forecast period. Its expenses add no
              costs within this plan period.
            </p>
          )}
          <div className="overflow-hidden rounded-lg border border-main-border">
            <dl className="grid border-b border-main-border sm:grid-cols-3">
              <div className="bg-base-200 p-5">
                <dt className="text-sm text-base-content/80">
                  Projected monthly expenses
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(historicalTotal + addedMonthlyTotal)}
                </dd>
                <dd className="mt-1 text-sm text-base-content/80">
                  {addedMonthlyTotal === 0
                    ? `From the ${draft.content.historyMonths}-month spending average`
                    : `${formatCurrency(historicalTotal)} from spending average + ${formatCurrency(addedMonthlyTotal)} added`}
                </dd>
              </div>
              <div className="border-t border-main-border bg-base-200 p-5 sm:border-t-0 sm:border-l">
                <dt className="text-sm text-base-content/80">
                  One-time expenses
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                  {formatCurrency(oneTimeTotal)}
                </dd>
                <dd className="mt-1 text-sm text-base-content/80">
                  {oneTimeCount === 0
                    ? 'None added'
                    : `${oneTimeCount} planned ${oneTimeCount === 1 ? 'purchase' : 'purchases'}`}
                </dd>
              </div>
              <div className="border-t border-main-border p-5 sm:border-t-0 sm:border-l">
                <dt className="text-sm font-semibold">
                  Total planned spending
                </dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCurrency(
                    historicalTotal + addedMonthlyTotal + oneTimeTotal
                  )}
                </dd>
                <dd className="mt-1 text-sm text-base-content/80">
                  {fundingMonthLabel(forecastWindow.startMonth)} through{' '}
                  {fundingMonthLabel(forecastWindow.endMonth)}
                </dd>
              </div>
            </dl>
            <ProjectionExpensesTable
              forecastWindow={forecastWindow}
              historyMonths={draft.content.historyMonths}
              onEdit={(sourceId, id) =>
                setEditing({ id, kind: 'expense', sourceId })
              }
              onEditHistorical={(sourceId, category) =>
                setEditing({ category, kind: 'historical', sourceId })
              }
              onRemove={(sourceId, id) =>
                apply((current) =>
                  removeProjectionExpense(current, sourceId, id)
                )
              }
              onRestore={(sourceId, category) =>
                apply((current) =>
                  restoreHistoricalExpense(current, sourceId, category)
                )
              }
              onSelectSource={selectSource}
              sources={visibleSources}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm leading-relaxed text-base-content/80">
              Projected expenses repeat the {draft.content.historyMonths}-month
              spending average each month. Added expenses are extra costs you
              enter for this plan.
            </p>
            <button
              className="btn ml-auto"
              onClick={openNewExpense}
              type="button"
            >
              <PlusIcon aria-hidden="true" className="size-5 shrink-0" />
              Add new expense
            </button>
          </div>
        </>
      ) : (
        <p>
          No funding sources in this plan. Add a source before assigning
          expenses.
        </p>
      )}
      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}
      {editing?.kind === 'history' && (
        <HistoryWindowEditor
          historyMonths={draft.content.historyMonths}
          onApply={(months) =>
            apply((current) => changeProjectionHistoryMonths(current, months))
          }
          onClose={() => setEditing(null)}
          ref={historyRef}
        />
      )}
      {editing?.kind === 'historical' && editingSource && editingHistorical && (
        <HistoricalExpenseEditor
          baselineAmount={editingHistorical.baselineAmount}
          category={editing.category}
          hasCapturedAmount={editingSource.runRates.some(
            (rate) =>
              rate.expenditureCategory === editing.category &&
              rate.historyMonths === draft.content.historyMonths
          )}
          historyMonths={draft.content.historyMonths}
          key={`${editingSource.id}:${editing.category}`}
          monthlyAmount={editingHistorical.effectiveAmount}
          onApply={(amount, forceZero) =>
            apply((current) =>
              setHistoricalExpenseOverride(
                current,
                editingSource.id,
                editing.category,
                amount,
                { force: forceZero }
              )
            )
          }
          onClose={() => setEditing(null)}
          ref={historicalRef}
          source={editingSource}
        />
      )}
      {editing?.kind === 'expense' && (editing.id === 'new' || expense) && (
        <ExpenseEditor
          categories={categories}
          expense={expense}
          forecastWindow={forecastWindow}
          key={`${editing.sourceId ?? 'all'}:${editing.id}`}
          lookupFailed={lookup.isError}
          onApply={(inputs, sourceId) =>
            apply((current) =>
              editing.id === 'new'
                ? addProjectionExpense(current, sourceId, inputs)
                : editProjectionExpense(current, sourceId, editing.id, inputs)
            )
          }
          onClose={() => setEditing(null)}
          onRetryCategories={() => {
            void lookup.refetch();
          }}
          ref={manualRef}
          source={editingSource}
          sources={draft.content.fundingSources}
        />
      )}
    </div>
  );
}
