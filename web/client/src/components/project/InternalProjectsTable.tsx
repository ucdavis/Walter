import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface AggregatedProject {
  displayName: string;
  pi: string | null;
  pm: string | null;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectStatusCode: string;
  taskName: string;
  taskNum: string;
  totalBalance: number;
  totalBudget: number;
  totalEncumbrance: number;
  totalExpense: number;
}

const columnHelper = createColumnHelper<AggregatedProject>();

function aggregateProjects(records: ProjectRecord[]): AggregatedProject[] {
  const projectsMap = new Map<string, AggregatedProject>();

  for (const p of records) {
    const key = `${p.projectNumber}|${p.taskNum}`;
    const existing = projectsMap.get(key);

    if (existing) {
      existing.totalBudget += p.budget;
      existing.totalExpense += p.expenses;
      existing.totalEncumbrance += p.commitments;
      existing.totalBalance += p.balance;
    } else {
      projectsMap.set(key, {
        displayName: p.displayName,
        pi: p.pi,
        pm: p.pm,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        projectOwningOrg: p.projectOwningOrg,
        projectStatusCode: p.projectStatusCode,
        taskName: p.taskName,
        taskNum: p.taskNum,
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
  { header: 'Project Number', key: 'projectNumber' as const },
  { header: 'Project', key: 'displayName' as const },
  { header: 'Task', key: 'taskNum' as const },
  { header: 'Task Name', key: 'taskName' as const },
  { header: 'Status', key: 'projectStatusCode' as const },
  { header: 'Owning Org', key: 'projectOwningOrg' as const },
  { header: 'PI', key: 'pi' as const },
  { header: 'PM', key: 'pm' as const },
  { format: 'currency' as const, header: 'Budget', key: 'totalBudget' as const },
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
  const projects = useMemo(() => aggregateProjects(records), [records]);

  const totals = useMemo(
    () =>
      projects.reduce(
        (acc, p) => ({
          totalBalance: acc.totalBalance + p.totalBalance,
          totalBudget: acc.totalBudget + p.totalBudget,
          totalEncumbrance: acc.totalEncumbrance + p.totalEncumbrance,
          totalExpense: acc.totalExpense + p.totalExpense,
        }),
        { totalBalance: 0, totalBudget: 0, totalEncumbrance: 0, totalExpense: 0 }
      ),
    [projects]
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('displayName', {
        cell: (info) => {
          const name = info.getValue();
          const { projectNumber } = info.row.original;
          return (
            <div className="flex items-start gap-1">
              <Link
                className="link no-underline min-w-0"
                params={{ employeeId, projectNumber }}
                title={name}
                to="/projects/$employeeId/$projectNumber/"
              >
                {projectNumber}
              </Link>
              {discrepancies?.has(projectNumber) && (
                <Link
                  params={{ projectNumber }}
                  to="/reports/reconciliation/$projectNumber/"
                >
                  <ExclamationTriangleIcon
                    className="h-5 w-5 shrink-0 text-warning self-end"
                    title="GL/PPM reconciliation discrepancy"
                  />
                </Link>
              )}
            </div>
          );
        },
        footer: () => 'Totals',
        header: 'Project',
      }),
      columnHelper.accessor('taskNum', {
        cell: (info) => (
          <div>
            <div>{info.getValue()}</div>
            {info.row.original.taskName && (
              <div className="text-xs text-base-content/80">
                {info.row.original.taskName}
              </div>
            )}
          </div>
        ),
        footer: () => '',
        header: 'Task',
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
        header: () => <span className="flex justify-end">Budget</span>,
      }),
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
    [discrepancies, employeeId, totals.totalBalance, totals.totalBudget, totals.totalEncumbrance, totals.totalExpense]
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