import { type ReactNode, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChartBarIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { ProjectExpenditureProgressCategories } from '@/components/project/ProjectExpenditureProgress.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import {
  useProjectProjectionQuery,
  type ProjectProjectionCategory,
} from '@/queries/projectProjection.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { useExpandableOverlay } from '@/shared/hooks/useExpandableOverlay.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

export interface ExpenditureCategoryFilters {
  activity?: string;
  dept?: string;
  fund?: string;
  program?: string;
  task?: string;
}

interface ExpenditureCategoryRow {
  balance: number;
  budget: number;
  commitments: number;
  expenditureCategoryName: string;
  expenses: number;
}

interface ExpenditureCategoryBreakdownProps {
  filters?: ExpenditureCategoryFilters;
  progressEnabled?: boolean;
  projectNumber: string;
  records: ProjectRecord[];
}

const columnHelper = createColumnHelper<ExpenditureCategoryRow>();

const csvColumns = [
  { header: 'Expenditure Category', key: 'expenditureCategoryName' as const },
  { format: 'currency' as const, header: 'Budget', key: 'budget' as const },
  { format: 'currency' as const, header: 'Expenses', key: 'expenses' as const },
  {
    format: 'currency' as const,
    header: 'Commitments',
    key: 'commitments' as const,
  },
  { format: 'currency' as const, header: 'Balance', key: 'balance' as const },
];

const personnelCategoryPattern = /salaries|wages|fringe/i;

function buildRows(
  records: ProjectRecord[],
  filters: ExpenditureCategoryFilters = {}
): ExpenditureCategoryRow[] {
  const filtered = records.filter((r) => {
    if (filters.task && (r.taskNum ?? '') !== filters.task) {
      return false;
    }
    if (filters.fund && (r.fundCode ?? '') !== filters.fund) {
      return false;
    }
    if (filters.program && (r.programCode ?? '') !== filters.program) {
      return false;
    }
    if (filters.activity && (r.activityCode ?? '') !== filters.activity) {
      return false;
    }
    if (filters.dept && (r.projectOwningOrgCode ?? '') !== filters.dept) {
      return false;
    }
    return true;
  });

  const map = new Map<string, ExpenditureCategoryRow>();
  for (const r of filtered) {
    const category = r.expenditureCategoryName ?? '';
    const existing = map.get(category);
    if (existing) {
      existing.budget += r.budget;
      existing.expenses += r.expenses;
      existing.commitments += r.commitments;
      existing.balance += r.balance;
    } else {
      map.set(category, {
        balance: r.balance,
        budget: r.budget,
        commitments: r.commitments,
        expenditureCategoryName: category,
        expenses: r.expenses,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.expenditureCategoryName.localeCompare(b.expenditureCategoryName)
  );
}

function buildProgressCategories(
  rows: ExpenditureCategoryRow[]
): ProjectProjectionCategory[] {
  return rows.map((row) => ({
    budget: row.budget,
    committed: row.commitments,
    expenditureCategory: row.expenditureCategoryName || 'Uncategorized',
    isPersonnel: personnelCategoryPattern.test(row.expenditureCategoryName)
      ? 1
      : 0,
    remainingNow: row.balance,
    spentToDate: row.expenses,
  }));
}

function ExpandableProgressView({
  children,
  leadingActions,
  trailingActions,
}: {
  children: ReactNode;
  leadingActions: ReactNode;
  trailingActions: ReactNode;
}) {
  const {
    canAnimateRect,
    closeExpanded,
    containerRef,
    expandButtonRef,
    handleContainerTransitionEnd,
    isOverlayActive,
    overlayStyle,
    placeholderHeight,
    placeholderRef,
    prefersReducedMotion,
    toggleExpanded,
  } = useExpandableOverlay({
    enabled: true,
  });

  return (
    <>
      {isOverlayActive ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-90"
          data-testid="expenditure-progress-backdrop"
          onClick={closeExpanded}
        />
      ) : null}

      {isOverlayActive ? (
        <div
          aria-hidden="true"
          ref={placeholderRef}
          style={{ height: placeholderHeight ?? undefined }}
        />
      ) : null}

      <div
        className={[
          'flex flex-col gap-4 w-full',
          isOverlayActive
            ? [
                'fixed z-100 bg-base-100 rounded-box shadow-xl p-4 min-h-0',
                prefersReducedMotion || !canAnimateRect
                  ? 'transition-none'
                  : 'transition-[top,left,width,height] duration-300 ease-in-out',
              ].join(' ')
            : '',
        ].join(' ')}
        onTransitionEnd={handleContainerTransitionEnd}
        ref={containerRef}
        style={overlayStyle}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">{leadingActions}</div>
          <div className="flex items-center gap-2">
            {trailingActions}
            <button
              aria-label={isOverlayActive ? 'Collapse graph' : 'Expand graph'}
              className="btn btn-sm btn-square"
              onClick={toggleExpanded}
              ref={expandButtonRef}
              title={isOverlayActive ? 'Collapse graph' : 'Expand graph'}
              type="button"
            >
              {isOverlayActive ? (
                <ArrowsPointingInIcon className="h-5 w-5" />
              ) : (
                <ArrowsPointingOutIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div
          className={
            isOverlayActive ? 'flex-1 min-h-0 overflow-auto' : 'overflow-x-auto'
          }
        >
          {children}
        </div>
      </div>
    </>
  );
}

export function ExpenditureCategoryBreakdown({
  filters,
  progressEnabled = false,
  projectNumber,
  records,
}: ExpenditureCategoryBreakdownProps) {
  const [selectedView, setSelectedView] = useState<
    'progress' | 'table' | null
  >(null);
  const view = progressEnabled ? (selectedView ?? 'progress') : 'table';
  const rows = useMemo(() => buildRows(records, filters), [filters, records]);
  const fallbackProgressCategories = useMemo(
    () => buildProgressCategories(rows),
    [rows]
  );
  const projectionQuery = useProjectProjectionQuery(
    projectNumber,
    progressEnabled
  );
  const progressCategories =
    projectionQuery.isSuccess && projectionQuery.data.categories.length > 0
      ? projectionQuery.data.categories
      : fallbackProgressCategories;

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          balance: acc.balance + r.balance,
          budget: acc.budget + r.budget,
          commitments: acc.commitments + r.commitments,
          expenses: acc.expenses + r.expenses,
        }),
        { balance: 0, budget: 0, commitments: 0, expenses: 0 }
      ),
    [rows]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('expenditureCategoryName', {
        cell: (info) => <span>{info.getValue() || '-'}</span>,
        footer: () => 'Totals',
        header: () => (
          <TooltipLabel
            label="Expenditure Category"
            placement="bottom"
            tooltip={tooltipDefinitions.expenditureCategory}
          />
        ),
        minSize: 200,
      }),
      columnHelper.accessor('budget', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.budget)}
          </span>
        ),
        header: () => <span className="flex justify-end">Budget</span>,
      }),
      columnHelper.accessor('expenses', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.expenses)}
          </span>
        ),
        header: () => <span className="flex justify-end">Expenses</span>,
      }),
      columnHelper.accessor('commitments', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.commitments)}
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">
            <TooltipLabel
              label="Commitments"
              placement="bottom"
              tooltip={tooltipDefinitions.commitment}
            />
          </span>
        ),
      }),
      columnHelper.accessor('balance', {
        cell: (info) => {
          const value = info.getValue();
          return (
            <span
              className={`flex justify-end ${value < 0 ? 'text-error' : ''}`}
            >
              {formatCurrency(value)}
            </span>
          );
        },
        footer: () => (
          <span
            className={`flex justify-end ${totals.balance < 0 ? 'text-error' : ''}`}
          >
            {formatCurrency(totals.balance)}
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">
            <TooltipLabel
              label="Balance"
              placement="bottom"
              tooltip={tooltipDefinitions.balance}
            />
          </span>
        ),
      }),
    ],
    [totals.balance, totals.budget, totals.commitments, totals.expenses]
  );

  if (rows.length === 0) {
    return (
      <p className="text-base-content/70 mt-4">
        No expenditure category data found.
      </p>
    );
  }

  const exportButton = (
    <ExportDataButton
      columns={csvColumns}
      data={rows}
      filename={`expenditure-categories-${projectNumber}.csv`}
    />
  );

  const tableViewButton = progressEnabled ? (
    <button
      className="btn btn-sm"
      onClick={() => setSelectedView('table')}
      type="button"
    >
      <TableCellsIcon className="h-4 w-4" />
      Table View
    </button>
  ) : null;

  const graphViewButton = progressEnabled ? (
    <button
      className="btn btn-sm"
      onClick={() => setSelectedView('progress')}
      type="button"
    >
      <ChartBarIcon className="h-4 w-4" />
      Graph View
    </button>
  ) : null;

  if (progressEnabled && view === 'progress') {
    return (
      <ExpandableProgressView
        leadingActions={tableViewButton}
        trailingActions={exportButton}
      >
        <ProjectExpenditureProgressCategories categories={progressCategories} />
      </ExpandableProgressView>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      footerRowClassName="totaltr"
      globalFilter="none"
      tableActions={exportButton}
      tableLeadingActions={graphViewButton}
    />
  );
}
