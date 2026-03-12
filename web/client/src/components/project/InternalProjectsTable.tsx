import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface AggregatedProject {
  beginningBalance: number;
  displayName: string;
  projectName: string;
  projectNumber: string;
  revenue: number;
  totalBalance: number;
  totalBudget: number;
  totalEncumbrance: number;
  totalExpense: number;
}

const columnHelper = createColumnHelper<AggregatedProject>();

function aggregateProjects(records: ProjectRecord[]): AggregatedProject[] {
  const projectsMap = new Map<string, AggregatedProject>();

  for (const p of records) {
    const existing = projectsMap.get(p.projectNumber);

    const begBal = p.glBeginningBalance ?? 0;
    const rev = p.glRevenue ?? 0;

    if (existing) {
      existing.beginningBalance += begBal;
      existing.revenue += rev;
      existing.totalBudget += p.budget;
      existing.totalExpense += p.expenses;
      existing.totalEncumbrance += p.commitments;
      existing.totalBalance += p.balance;
    } else {
      projectsMap.set(p.projectNumber, {
        beginningBalance: begBal,
        displayName: p.displayName,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        revenue: rev,
        totalBalance: p.balance,
        totalBudget: p.budget,
        totalEncumbrance: p.commitments,
        totalExpense: p.expenses,
      });
    }
  }

  return Array.from(projectsMap.values());
}

const csvColumns = [
  { header: 'Project', key: 'displayName' as const },
  { format: 'currency' as const, header: 'Budget', key: 'totalBudget' as const },
  { format: 'currency' as const, header: 'Beg. Balance', key: 'beginningBalance' as const },
  { format: 'currency' as const, header: 'Revenue', key: 'revenue' as const },
  { format: 'currency' as const, header: 'Expense', key: 'totalExpense' as const },
  { format: 'currency' as const, header: 'Commitment', key: 'totalEncumbrance' as const },
  { format: 'currency' as const, header: 'Balance', key: 'totalBalance' as const },
];

interface InternalProjectsTableProps {
  discrepancies?: Set<string>;
  employeeId: string;
  records: ProjectRecord[];
}

export function InternalProjectsTable({
  discrepancies,
  employeeId,
  records,
}: InternalProjectsTableProps) {
  const [showBudgetDetails, setShowBudgetDetails] = useState(false);
  const projects = useMemo(() => aggregateProjects(records), [records]);

  const totals = useMemo(
    () =>
      projects.reduce(
        (acc, p) => ({
          beginningBalance: acc.beginningBalance + p.beginningBalance,
          revenue: acc.revenue + p.revenue,
          totalBalance: acc.totalBalance + p.totalBalance,
          totalBudget: acc.totalBudget + p.totalBudget,
          totalEncumbrance: acc.totalEncumbrance + p.totalEncumbrance,
          totalExpense: acc.totalExpense + p.totalExpense,
        }),
        { beginningBalance: 0, revenue: 0, totalBalance: 0, totalBudget: 0, totalEncumbrance: 0, totalExpense: 0 }
      ),
    [projects]
  );

  const budgetDetailColumns = showBudgetDetails
    ? [
        columnHelper.accessor('beginningBalance', {
          cell: (info) => (
            <span className="flex justify-end">
              {formatCurrency(info.getValue())}
            </span>
          ),
          footer: () => (
            <span className="flex justify-end">
              {formatCurrency(totals.beginningBalance)}
            </span>
          ),
          header: () => <span className="flex justify-end">Beg. Balance</span>,
        }),
        columnHelper.accessor('revenue', {
          cell: (info) => (
            <span className="flex justify-end">
              {formatCurrency(info.getValue())}
            </span>
          ),
          footer: () => (
            <span className="flex justify-end">
              {formatCurrency(totals.revenue)}
            </span>
          ),
          header: () => <span className="flex justify-end">Revenue</span>,
        }),
      ]
    : [];

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayName', {
        cell: (info) => {
          const name = info.getValue();
          const { projectNumber } = info.row.original;
          return (
            <Link
              className="link no-underline flex items-start gap-1"
              params={{ employeeId, projectNumber }}
              to="/projects/$employeeId/$projectNumber/"
            >
              <div className="min-w-0">
                <div className="text-xs text-base-content/70 no-underline">
                  {projectNumber}
                </div>
                <div className="truncate underline" title={name}>
                  {name}
                </div>
              </div>
              {discrepancies?.has(projectNumber) && (
                <ExclamationTriangleIcon
                  className="h-5 w-5 shrink-0 text-warning self-end"
                  title="GL/PPM reconciliation discrepancy"
                />
              )}
            </Link>
          );
        },
        footer: () => 'Totals',
        header: 'Project Name',
        minSize: 250,
        size: 300,
      }),
      columnHelper.accessor('totalBudget', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.totalBudget)}
          </span>
        ),
        header: () => (
          <button
            className="flex justify-end items-center gap-1 w-full cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setShowBudgetDetails((v) => !v);
            }}
            title={showBudgetDetails ? 'Hide budget breakdown' : 'Show budget breakdown'}
            type="button"
          >
            <ChevronRightIcon
              className={`h-3 w-3 transition-transform ${showBudgetDetails ? 'rotate-90' : ''}`}
            />
            Budget
          </button>
        ),
      }),
      ...budgetDetailColumns,
      columnHelper.accessor('totalExpense', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            {formatCurrency(totals.totalExpense)}
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Expense</span>,
      }),
      columnHelper.accessor('totalEncumbrance', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            {formatCurrency(totals.totalEncumbrance)}
          </span>
        ),
        header: () => <span className="flex justify-end">Commitment</span>,
      }),
      columnHelper.accessor('totalBalance', {
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={`flex justify-end ${value < 0 ? 'text-error' : ''}`}>
              {formatCurrency(value)}
            </span>
          );
        },
        footer: () => (
          <span className={`flex justify-end ${totals.totalBalance < 0 ? 'text-error' : ''}`}>
            {formatCurrency(totals.totalBalance)}
          </span>
        ),
        header: () => <span className="flex justify-end">Balance</span>,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [discrepancies, employeeId, showBudgetDetails, totals.beginningBalance, totals.revenue, totals.totalBalance, totals.totalBudget, totals.totalEncumbrance, totals.totalExpense]
  );

  if (projects.length === 0) {
    return <p className="text-base-content/70 mt-8">No projects found.</p>;
  }

  return (
    <div className="mt-4">
      <DataTable
        columns={columns}
        data={projects}
        footerRowClassName="totaltr"
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
        tableActions={
          <ExportDataButton columns={csvColumns} data={projects} filename="internal-projects.csv" />
        }
      />
    </div>
  );
}