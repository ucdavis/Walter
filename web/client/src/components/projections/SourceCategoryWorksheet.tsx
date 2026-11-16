import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/DataTable.tsx';
import { formatProjectionCurrency as money } from '@/components/projections/projectionFormatting.ts';
import { fundingMonthLabel } from '@/components/projections/fundingTimelineDates.ts';
import { getSourceForecastWindow } from '@/lib/piProjection.ts';
import {
  buildSourceFundingBalance,
  type SourceCategoryBalance,
} from '@/lib/projectionFundingBalances.ts';
import type { SourceOutlook } from '@/lib/projectionOutlook.ts';
import type { ProjectionResults } from '@/lib/projectionWorkspace.ts';

function Amount({
  balance = false,
  value,
}: {
  balance?: boolean;
  value: number | null;
}) {
  return (
    <span
      className={`block text-right whitespace-nowrap tabular-nums ${balance && value !== null && value < 0 ? 'font-semibold text-error' : ''}`}
    >
      {value === null ? '—' : money(value)}
    </span>
  );
}

export function SourceCategoryWorksheet({
  outlook,
  results,
}: {
  outlook: SourceOutlook;
  results: ProjectionResults;
}) {
  const [mode, setMode] = useState<'costs' | 'balances'>('costs');
  const [expanded, setExpanded] = useState(false);
  const balance = buildSourceFundingBalance(outlook.source, results.rows);
  const categorical = balance.basis === 'categories';
  const balances = categorical && mode === 'balances';
  const window = getSourceForecastWindow(
    outlook.source,
    results.forecastWindow
  );
  const months: string[] = [];
  const date = new Date(`${results.forecastWindow.startMonth}-01T00:00:00Z`);
  while (date.toISOString().slice(0, 7) <= results.forecastWindow.endMonth) {
    months.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  const rowsByCategory = new Map<
    string,
    Map<string, ProjectionResults['rows'][number]>
  >();
  for (const row of results.rows) {
    if (row.fundingSourceId !== outlook.source.id) {
      continue;
    }
    const rows = rowsByCategory.get(row.expenditureCategory) ?? new Map();
    rows.set(row.month, row);
    rowsByCategory.set(row.expenditureCategory, rows);
  }
  const totals = new Map(outlook.months.map((month) => [month.month, month]));
  const columns: ColumnDef<SourceCategoryBalance>[] = [
    {
      cell: ({ row: { original: row } }) => (
        <div className="min-w-28 max-w-32 whitespace-normal break-words sm:min-w-44 sm:max-w-60">
          <span className="font-medium">
            {row.isBalanceAdjustment
              ? outlook.source.plannedBudgetMode === 'GeneralPool'
                ? 'Initial planned funding and adjustments'
                : 'Planning balance adjustment'
              : row.expenditureCategory}
          </span>
          {categorical && !row.hasBudget && !row.isBalanceAdjustment && (
            <span className="mt-1 block text-xs text-base-content/70">
              No budget recorded
            </span>
          )}
        </div>
      ),
      footer: 'Source overall',
      header: 'Category',
      id: 'category',
      size: 240,
    },
    ...(categorical
      ? [
          {
            cell: ({ row: { original: row } }) => (
              <Amount
                balance
                value={
                  row.hasBudget || row.isBalanceAdjustment
                    ? row.revisedAvailable
                    : null
                }
              />
            ),
            footer: () => <Amount balance value={outlook.planningBalance} />,
            header: 'Starting available',
            id: 'starting',
            size: 135,
          } satisfies ColumnDef<SourceCategoryBalance>,
        ]
      : []),
    ...months.map(
      (month): ColumnDef<SourceCategoryBalance> => ({
        cell: ({ row: { original: category } }) => {
          const row = rowsByCategory
            .get(category.expenditureCategory)
            ?.get(month);
          // Never carry a later snapshot balance backward into earlier plan months.
          const eligible = month >= window.startMonth && totals.has(month);
          const value = !eligible
            ? null
            : balances
              ? !category.hasBudget &&
                !category.isBalanceAdjustment &&
                (!row || row.remaining === 0)
                ? null
                : (row?.remaining ?? category.revisedAvailable)
              : (row?.projectedAmount ?? 0);
          return <Amount balance={balances} value={value} />;
        },
        footer: () => (
          <>
            <Amount
              balance={balances}
              value={
                balances
                  ? (totals.get(month)?.remaining ?? null)
                  : (totals.get(month)?.forecast ?? null)
              }
            />
            {!categorical && (
              <span className="mt-1 block text-right text-xs whitespace-nowrap">
                Balance{' '}
                <Amount balance value={totals.get(month)?.remaining ?? null} />
              </span>
            )}
          </>
        ),
        header: fundingMonthLabel(month),
        id: month,
        size: 115,
      })
    ),
    {
      cell: ({ row }) => <Amount value={row.original.forecast} />,
      footer: () => <Amount value={outlook.forecast} />,
      header: 'Net forecast costs',
      id: 'forecast',
      size: 140,
    },
    ...(categorical
      ? [
          {
            cell: ({ row: { original: row } }) => (
              <Amount
                balance
                value={
                  !row.hasBudget &&
                  !row.isBalanceAdjustment &&
                  row.endRemaining === 0
                    ? null
                    : row.endRemaining
                }
              />
            ),
            footer: () => <Amount balance value={outlook.endBalance} />,
            header: 'Ending balance',
            id: 'ending',
            size: 135,
          } satisfies ColumnDef<SourceCategoryBalance>,
        ]
      : []),
  ];
  return (
    <section aria-label="Category and month worksheet" className="space-y-3">
      <h4 className="font-semibold">Category and month worksheet</h4>
      {outlook.outside || outlook.months.length === 0 ? (
        <p className="text-sm text-base-content/70">
          No category costs or monthly balances in this forecast period. This
          source’s saved funding remains available in its details.
        </p>
      ) : (
        <>
          <p className="text-sm text-base-content/70">
            {categorical
              ? 'Starting available includes budget adjustments. Month-end balances use each category’s own funding.'
              : balance.basis === 'unknown'
                ? 'Funding basis is unknown. Category restrictions cannot be determined; costs and the source overall balance remain available.'
                : 'Categories show costs paid from the source overall. They do not have separate funding limits.'}{' '}
            Months before this source’s capture or availability show a dash.
            Balances after its end date carry forward.
          </p>
          <DataTable
            caption={`${outlook.label} category worksheet: ${balances ? 'Month-end balances' : 'Net forecast costs'}`}
            columns={columns}
            data={balance.categories}
            footerRowClassName="font-semibold"
            globalFilter="none"
            onOverlayActiveChange={setExpanded}
            pagination="off"
            rowHeaderColumnId="category"
            tableClassName="table-sm [&_th]:align-top [&_thead_th]:text-right [&_th:first-child]:text-left [&_tr>:first-child]:w-32! [&_tr>:first-child]:min-w-32 [&_tr>:first-child]:max-w-32 sm:[&_tr>:first-child]:w-60! sm:[&_tr>:first-child]:max-w-60 [&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:z-10 [&_tr>:first-child]:bg-base-100 [&_tfoot_td]:bg-base-200"
            tableLeadingActions={
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {expanded && (
                  <p className="w-full min-w-0 text-sm break-words">
                    <span className="font-semibold">{outlook.label}</span> ·
                    Category worksheet
                  </p>
                )}
                {categorical ? (
                  <div
                    aria-label="Worksheet values"
                    className="flex min-w-0 flex-wrap gap-1"
                    role="group"
                  >
                    <button
                      aria-pressed={!balances}
                      className={`btn btn-sm ${!balances ? 'btn-active' : ''}`}
                      onClick={() => setMode('costs')}
                      type="button"
                    >
                      Net forecast costs
                    </button>
                    <button
                      aria-pressed={balances}
                      className={`btn btn-sm ${balances ? 'btn-active' : ''}`}
                      onClick={() => setMode('balances')}
                      type="button"
                    >
                      Month-end balances
                    </button>
                  </div>
                ) : (
                  <span className="font-medium text-sm">
                    Net forecast costs
                  </span>
                )}
              </div>
            }
          />
          {!categorical && (
            <p className="text-sm">
              Source overall starting available{' '}
              <strong>{money(outlook.planningBalance)}</strong> · Ending balance{' '}
              <strong
                className={
                  outlook.endBalance !== null && outlook.endBalance < 0
                    ? 'text-error'
                    : ''
                }
              >
                {money(outlook.endBalance)}
              </strong>
            </p>
          )}
        </>
      )}
    </section>
  );
}
