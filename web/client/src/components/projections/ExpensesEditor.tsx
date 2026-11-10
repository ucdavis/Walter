import { HistoricalExpensesTable } from '@/components/projections/HistoricalExpensesTable.tsx';
import { AddedExpensesTable } from '@/components/projections/AddedExpensesTable.tsx';
import { useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
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
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import {
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
import { sourceLabel } from '@/lib/projectionSources.ts';
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
  | { id: number | 'new'; kind: 'expense'; sourceId: number }
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
  sourceTarget?: { id: number | null; onChange: (id: number) => void };
}) {
  const { draft } = session;
  const sourceHelpId = useId();
  const forecastWindow = getProjectionForecastWindow(draft);
  const [selectedId, setSelectedId] = useState<number | null>(
    draft.content.fundingSources[0]?.id ?? null
  );
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manualRef = useRef<ExpenseEditorHandle>(null);
  const historicalRef = useRef<HistoricalExpenseEditorHandle>(null);
  const historyRef = useRef<HistoryWindowEditorHandle>(null);
  const lookup = useQuery(projectionLookupsQueryOptions());
  const selectedSource =
    draft.content.fundingSources.find(
      ({ id }) => id === (sourceTarget ? sourceTarget.id : selectedId)
    ) ?? draft.content.fundingSources[0];
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
  const window = selectedSource
    ? getSourceForecastWindow(selectedSource, forecastWindow)
    : null;
  return (
    <div className="mt-5 space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p>Spending history: {draft.content.historyMonths} months</p>
        <button
          aria-label="Change history window"
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing({ kind: 'history' })}
          type="button"
        >
          Change
        </button>
      </div>
      {selectedSource ? (
        <>
          <label className="flex max-w-xl flex-col gap-2">
            View expenses for
            <select
              aria-describedby={sourceHelpId}
              className="select select-bordered w-full"
              onChange={(event) => {
                const id = Number(event.target.value);
                if (sourceTarget) {
                  sourceTarget.onChange(id);
                } else {
                  setSelectedId(id);
                }
              }}
              value={selectedSource.id}
            >
              {draft.content.fundingSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {sourceLabel(source)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm" id={sourceHelpId}>
            Historical estimates and added expenses below belong to this source.
            New expenses are charged here.
          </p>
          <p className="text-sm">
            Captured {selectedSource.capturedAt.slice(0, 10)}. Forecast through{' '}
            {fundingMonthLabel(window!.endMonth)}.
          </p>
          {window!.isBeyondForecast && (
            <p className="text-sm">
              This source starts after the forecast period. Its expenses add no
              costs within this plan period.
            </p>
          )}
          <HistoricalExpensesTable
            forecastWindow={forecastWindow}
            historyMonths={draft.content.historyMonths}
            onEdit={(category) =>
              setEditing({
                category,
                kind: 'historical',
                sourceId: selectedSource.id,
              })
            }
            onRestore={(category) =>
              apply((current) =>
                restoreHistoricalExpense(current, selectedSource.id, category)
              )
            }
            source={selectedSource}
          />
          <AddedExpensesTable
            forecastWindow={forecastWindow}
            onAdd={() =>
              setEditing({
                id: 'new',
                kind: 'expense',
                sourceId: selectedSource.id,
              })
            }
            onEdit={(id) =>
              setEditing({ id, kind: 'expense', sourceId: selectedSource.id })
            }
            onRemove={(id) =>
              apply((current) =>
                removeProjectionExpense(current, selectedSource.id, id)
              )
            }
            source={selectedSource}
          />
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
          sourceId={editingSource.id}
        />
      )}
      {editing?.kind === 'expense' &&
        editingSource &&
        (editing.id === 'new' || expense) && (
          <ExpenseEditor
            categories={categories}
            expense={expense}
            forecastWindow={forecastWindow}
            key={`${editingSource.id}:${editing.id}`}
            lookupFailed={lookup.isError}
            onApply={(inputs) =>
              apply((current) =>
                editing.id === 'new'
                  ? addProjectionExpense(current, editingSource.id, inputs)
                  : editProjectionExpense(
                      current,
                      editingSource.id,
                      editing.id,
                      inputs
                    )
              )
            }
            onClose={() => setEditing(null)}
            onRetryCategories={() => {
              void lookup.refetch();
            }}
            ref={manualRef}
            source={editingSource}
          />
        )}
    </div>
  );
}
