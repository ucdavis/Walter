import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { type ProjectRecord, projectsDetailQueryOptions } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipIconButton } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface SearchParams {
  activity?: string;
  dept?: string;
  fund?: string;
  program?: string;
  task?: string;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$employeeId/$projectNumber/expenditure-categories'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: (search.activity as string) ?? undefined,
    dept: (search.dept as string) ?? undefined,
    fund: (search.fund as string) ?? undefined,
    program: (search.program as string) ?? undefined,
    task: (search.task as string) ?? undefined,
  }),
});

interface ExpenditureCategoryRow {
  balance: number;
  budget: number;
  commitments: number;
  expenditureCategoryName: string;
  expenses: number;
}

function buildRows(
  records: ProjectRecord[],
  projectNumber: string,
  search: SearchParams
): ExpenditureCategoryRow[] {
  const filtered = records.filter((r) => {
    if (r.projectNumber !== projectNumber) {
      return false;
    }

    if (search.task && (r.taskNum ?? '') !== search.task) {
      return false;
    }

    if (search.fund && (r.fundCode ?? '') !== search.fund) {
      return false;
    }

    if (search.program && (r.programCode ?? '') !== search.program) {
      return false;
    }

    if (search.activity && (r.activityCode ?? '') !== search.activity) {
      return false;
    }

    if (search.dept && (r.projectOwningOrgCode ?? '') !== search.dept) {
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

  return Array.from(map.values());
}

const columnHelper = createColumnHelper<ExpenditureCategoryRow>();

const csvColumns = [
  { header: 'Expenditure Category', key: 'expenditureCategoryName' as const },
  { format: 'currency' as const, header: 'Budget', key: 'budget' as const },
  { format: 'currency' as const, header: 'Expenses', key: 'expenses' as const },
  { format: 'currency' as const, header: 'Commitments', key: 'commitments' as const },
  { format: 'currency' as const, header: 'Balance', key: 'balance' as const },
];

function RouteComponent() {
  const { employeeId, projectNumber } = Route.useParams();
  const search = Route.useSearch();

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );

  const rows = useMemo(
    () => buildRows(projects, projectNumber, search),
    [projects, projectNumber, search]
  );

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
          <span className="flex items-center gap-1">
            <span>Expenditure Category</span>
            <TooltipIconButton
              drawerStyle="compact"
              label="Expenditure Category"
              tooltip={tooltipDefinitions.expenditureCategory}
            />
          </span>
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
          <span className="flex justify-end items-center gap-1 w-full">
            <span>Commitments</span>
            <TooltipIconButton
              drawerStyle="compact"
              label="Commitments"
              tooltip={tooltipDefinitions.commitment}
            />
          </span>
        ),
      }),
      columnHelper.accessor('balance', {
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className={`flex justify-end ${value < 0 ? 'text-error' : ''}`}>
              {formatCurrency(value)}
            </span>
          );
        },
        footer: () => (
          <span className={`flex justify-end ${totals.balance < 0 ? 'text-error' : ''}`}>
            {formatCurrency(totals.balance)}
          </span>
        ),
        header: () => (
          <span className="flex justify-end items-center gap-1 w-full">
            <span>Balance</span>
            <TooltipIconButton
              drawerStyle="compact"
              label="Balance"
              tooltip={tooltipDefinitions.balance}
            />
          </span>
        ),
      }),
    ],
    [totals.balance, totals.budget, totals.commitments, totals.expenses]
  );

  const keyLabel = [search.task, search.dept, search.fund, search.program, search.activity]
    .filter(Boolean)
    .join(' / ');

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-6">
        <Link
          className="btn btn-sm mb-4"
          params={{ employeeId, projectNumber }}
          to="/projects/$employeeId/$projectNumber/"
        >
          Back to Project
        </Link>
        <h1 className="h1">Expenditure Category Breakdown</h1>
        <h3 className="subtitle">Data source: Faculty Department Portfolio Report (PPM)</h3>
        {keyLabel && <p className="subtitle">{keyLabel}</p>}
      </section>

      {rows.length === 0 ? (
        <p className="text-base-content/70 mt-4">No expenditure category data found.</p>
      ) : (
        <section className="mb-8">
          <DataTable
            columns={columns}
            data={rows}
            footerRowClassName="totaltr"
            tableActions={
              <ExportDataButton
                columns={csvColumns}
                data={rows}
                filename={`expenditure-categories-${projectNumber}.csv`}
              />
            }
          />
        </section>
      )}
    </main>
  );
}
