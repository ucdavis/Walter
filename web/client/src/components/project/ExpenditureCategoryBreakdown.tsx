import { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
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

function buildRows(
  records: ProjectRecord[],
  filters: ExpenditureCategoryFilters = {}
): ExpenditureCategoryRow[] {
  const filtered = records.filter((r) => {
    if (filters.task && (r.taskNum ?? '') !== filters.task) return false;
    if (filters.fund && (r.fundCode ?? '') !== filters.fund) return false;
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

export function ExpenditureCategoryBreakdown({
  filters,
  projectNumber,
  records,
}: ExpenditureCategoryBreakdownProps) {
  const rows = useMemo(() => buildRows(records, filters), [filters, records]);

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

  return (
    <DataTable
      columns={columns}
      data={rows}
      footerRowClassName="totaltr"
      globalFilter="left"
      tableActions={
        <ExportDataButton
          columns={csvColumns}
          data={rows}
          filename={`expenditure-categories-${projectNumber}.csv`}
        />
      }
    />
  );
}
