import { useState, type Ref } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatProjectionCurrency as formatCurrency } from '@/components/projections/projectionFormatting.ts';
import { FRINGE_CATEGORY, SALARY_CATEGORY } from '@/lib/piProjection.ts';
import type {
  SourceCategoryBalance,
  SourceFundingBalance,
} from '@/lib/projectionFundingBalances.ts';
import { DataTable } from '@/shared/DataTable.tsx';

export function SourceCategoryBudgets({
  balance,
  headingRef,
  initialPlanned = false,
  onEdit,
  sourceIdentity,
}: {
  balance: SourceFundingBalance;
  headingRef?: Ref<HTMLHeadingElement>;
  initialPlanned?: boolean;
  onEdit?: () => void;
  sourceIdentity?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (balance.basis === 'unknown') {
    return (
      <p className="rounded-box border border-base-300 p-3 text-sm">
        Funding basis unknown. Salary and fringe budget restrictions cannot be
        determined from this source’s project type. Overall balances and
        forecast costs remain available.
      </p>
    );
  }
  if (balance.basis !== 'categories') {
    return null;
  }
  const total = balance.categories.reduce(
    (sum, row) => ({
      adjustment: sum.adjustment + row.adjustment,
      captured: sum.captured + row.capturedAvailable,
      remaining: sum.remaining + (row.endRemaining ?? 0),
      revised: sum.revised + row.revisedAvailable,
    }),
    { adjustment: 0, captured: 0, remaining: 0, revised: 0 }
  );
  const numericCell = (value: number | null) => (
    <span
      className={`block text-right whitespace-nowrap ${value !== null && value < 0 ? 'font-semibold text-error' : ''}`}
    >
      {value === null ? '—' : formatCurrency(value)}
    </span>
  );
  const columns: ColumnDef<SourceCategoryBalance>[] = [
    {
      cell: ({ row: { original: row } }) => {
        const personnel =
          row.expenditureCategory === SALARY_CATEGORY
            ? 'salary'
            : row.expenditureCategory === FRINGE_CATEGORY
              ? 'fringe'
              : null;
        return (
          <>
            {row.isBalanceAdjustment
              ? 'Planning balance adjustment'
              : row.expenditureCategory}
            {!row.hasBudget &&
              !row.isBalanceAdjustment &&
              personnel &&
              row.hasCharges && (
                <span className="mt-1 block font-normal text-error">
                  No {personnel} budget recorded
                </span>
              )}
          </>
        );
      },
      footer: 'Source overall',
      header: 'Category',
      id: 'category',
      size: 240,
    },
    {
      cell: ({ row: { original: row } }) =>
        numericCell(
          !row.budgetRecorded && !row.isBalanceAdjustment
            ? null
            : row.capturedAvailable
        ),
      footer: () => numericCell(total.captured),
      header: () => (
        <span className="block text-right">
          {initialPlanned ? 'Initial planned funding' : 'Captured available'}
        </span>
      ),
      id: 'capturedAvailable',
      size: 180,
    },
    {
      cell: ({ row }) => (
        <span className="block text-right whitespace-nowrap">
          {row.original.adjustment > 0 ? '+' : ''}
          {formatCurrency(row.original.adjustment)}
        </span>
      ),
      footer: () => numericCell(total.adjustment),
      header: () => <span className="block text-right">Net change</span>,
      id: 'adjustment',
      size: 150,
    },
    {
      cell: ({ row }) => numericCell(row.original.revisedAvailable),
      footer: () => numericCell(total.revised),
      header: () => <span className="block text-right">Revised available</span>,
      id: 'revisedAvailable',
      size: 180,
    },
    {
      cell: ({ row: { original: row } }) =>
        numericCell(
          !row.hasBudget && !row.isBalanceAdjustment && row.endRemaining === 0
            ? null
            : row.endRemaining
        ),
      footer: () => numericCell(balance.months.size ? total.remaining : null),
      header: () => (
        <span className="block text-right">Remaining at plan end</span>
      ),
      id: 'endRemaining',
      size: 200,
    },
  ];
  return (
    <section aria-label="Category budget balances">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4
          className="scroll-mt-24 font-semibold"
          ref={headingRef}
          tabIndex={-1}
        >
          Category budget balances
        </h4>
        {onEdit && (
          <button
            className="btn btn-outline btn-sm"
            onClick={onEdit}
            type="button"
          >
            Edit budget
          </button>
        )}
      </div>
      {sourceIdentity && (
        <p className="mt-1 text-sm font-medium break-words">{sourceIdentity}</p>
      )}
      <p className="mt-2 text-sm text-base-content/70">
        Salary and fringe have separate budgets. A positive source overall
        balance does not cover a shortfall in either category. Net changes apply
        to this plan only.
      </p>
      <div className="mt-3">
        <DataTable
          caption={
            initialPlanned
              ? 'Initial planned category budgets and remaining balances at plan end'
              : 'Captured category budgets and remaining balances at plan end'
          }
          columns={columns}
          data={balance.categories}
          globalFilter="none"
          onOverlayActiveChange={setExpanded}
          pagination="off"
          rowHeaderColumnId="category"
          tableClassName="table-sm [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-base-100 [&_th:first-child]:z-10"
          tableLeadingActions={
            expanded ? (
              <div className="min-w-0 text-sm">
                <p className="font-semibold">Category budget balances</p>
                {sourceIdentity && (
                  <p className="break-words">{sourceIdentity}</p>
                )}
              </div>
            ) : undefined
          }
        />
      </div>
    </section>
  );
}
