import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TaskName } from '@/components/project/NicknamedName.tsx';
import { TableExportActions } from '@/components/TableExportActions.tsx';
import { type CsvColumn, insertCsvColumnAfter } from '@/lib/csv.ts';
import { formatCurrency } from '@/lib/currency.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { useProjectNicknames } from '@/queries/projectNicknames.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface AggregatedProject {
  displayName: string;
  pi: string | null;
  pm: string | null;
  projectName: string;
  /** Empty when the project has no nickname. */
  projectNickname: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectStatusCode: string;
  taskName: string;
  /** Empty when the task has no nickname. */
  taskNickname: string;
  taskNum: string;
  taskStatus: string;
  totalBalance: number;
  totalBudget: number;
  totalEncumbrance: number;
  totalExpense: number;
}

function isInactiveTask(row: AggregatedProject): boolean {
  return row.taskStatus === 'Inactive';
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
        projectNickname: '',
        projectNumber: p.projectNumber,
        projectOwningOrg: p.projectOwningOrg,
        projectStatusCode: p.projectStatusCode,
        taskName: p.taskName,
        taskNickname: '',
        taskNum: p.taskNum,
        taskStatus: p.taskStatus,
        totalBalance: p.balance,
        totalBudget: p.budget,
        totalEncumbrance: p.commitments,
        totalExpense: p.expenses,
      });
    }
  }

  return Array.from(projectsMap.values());
}

const baseCsvColumns: CsvColumn<AggregatedProject>[] = [
  { header: 'Project Number', key: 'projectNumber' as const },
  { header: 'Project', key: 'displayName' as const },
  { header: 'Task', key: 'taskNum' as const },
  { header: 'Task Name', key: 'taskName' as const },
  { header: 'Status', key: 'projectStatusCode' as const },
  { header: 'Owning Org', key: 'projectOwningOrg' as const },
  { header: 'PI', key: 'pi' as const },
  { header: 'PM', key: 'pm' as const },
  {
    format: 'currency' as const,
    header: 'Budget',
    key: 'totalBudget' as const,
  },
  {
    format: 'currency' as const,
    header: 'Expense',
    key: 'totalExpense' as const,
  },
  {
    format: 'currency' as const,
    header: 'Commitment',
    key: 'totalEncumbrance' as const,
  },
  {
    format: 'currency' as const,
    header: 'Balance',
    key: 'totalBalance' as const,
  },
];

interface InternalProjectsTableProps {
  discrepancies?: Set<string>;
  iamId: string;
  records: ProjectRecord[];
}

export function InternalProjectsTable({
  discrepancies,
  iamId,
  records,
}: InternalProjectsTableProps) {
  const [showInactive, setShowInactive] = useState(false);
  const nicknames = useProjectNicknames();
  const allProjects = useMemo(
    () =>
      aggregateProjects(records).map((p) => ({
        ...p,
        projectNickname: nicknames.project(p.projectNumber) ?? '',
        taskNickname: nicknames.task(p.projectNumber, p.taskNum) ?? '',
      })),
    [nicknames, records]
  );
  const csvColumns = useMemo(
    () =>
      nicknames.enabled
        ? insertCsvColumnAfter(
            insertCsvColumnAfter(baseCsvColumns, 'displayName', {
              header: 'Project Nickname',
              key: 'projectNickname',
            }),
            'taskName',
            { header: 'Task Nickname', key: 'taskNickname' }
          )
        : baseCsvColumns,
    [nicknames.enabled]
  );
  const inactiveCount = useMemo(
    () => allProjects.filter(isInactiveTask).length,
    [allProjects]
  );
  const projects = useMemo(
    () =>
      showInactive
        ? allProjects
        : allProjects.filter((p) => !isInactiveTask(p)),
    [allProjects, showInactive]
  );

  const totals = useMemo(
    () =>
      projects.reduce(
        (acc, p) => ({
          totalBalance: acc.totalBalance + p.totalBalance,
          totalBudget: acc.totalBudget + p.totalBudget,
          totalEncumbrance: acc.totalEncumbrance + p.totalEncumbrance,
          totalExpense: acc.totalExpense + p.totalExpense,
        }),
        {
          totalBalance: 0,
          totalBudget: 0,
          totalEncumbrance: 0,
          totalExpense: 0,
        }
      ),
    [projects]
  );

  const columns = useMemo(
    () => [
      // Accessor concatenates name + number so the global filter matches on
      // either — the cell visibly renders both, but TanStack only filters
      // accessor values, not rendered output.
      columnHelper.accessor(
        (row) =>
          `${row.projectNickname} ${row.displayName} ${row.projectNumber}`.trim(),
        {
          cell: (info) => {
            const {
              displayName: name,
              projectNickname,
              projectNumber,
            } = info.row.original;
            return (
              <div className="flex flex-wrap items-start gap-x-1">
                <TooltipLabel
                  asChild
                  label={
                    <Link
                      className="link no-underline min-w-0"
                      params={{ iamId, projectNumber }}
                      to="/projects/$iamId/$projectNumber/"
                    >
                      {projectNumber}
                    </Link>
                  }
                  tooltip={name}
                />
                {discrepancies?.has(projectNumber) && (
                  <TooltipLabel
                    asChild
                    label={
                      <Link
                        aria-label={
                          tooltipDefinitions.reconciliationDiscrepancy
                        }
                        params={{ projectNumber }}
                        to="/reports/reconciliation/$projectNumber/"
                      >
                        <ExclamationTriangleIcon
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0 text-warning self-end"
                        />
                      </Link>
                    }
                    tooltip={tooltipDefinitions.reconciliationDiscrepancy}
                  />
                )}
                {projectNickname && (
                  <div className="w-full text-xs text-base-content/80">
                    {projectNickname}
                  </div>
                )}
              </div>
            );
          },
          footer: () => 'Totals',
          header: 'Project',
          id: 'displayName',
        }
      ),
      columnHelper.accessor(
        (row) => [row.taskNum, row.taskNickname, row.taskName].join(' '),
        {
          cell: (info) => (
            <div>
              <div>{info.row.original.taskNum}</div>
              {(info.row.original.taskName ||
                info.row.original.taskNickname) && (
                <div className="text-xs text-base-content/80">
                  <TaskName
                    name={info.row.original.taskName || null}
                    projectNumber={info.row.original.projectNumber}
                    taskNumber={info.row.original.taskNum}
                  />
                </div>
              )}
            </div>
          ),
          footer: () => '',
          header: 'Task',
          id: 'taskNum',
          minSize: 200,
        }
      ),
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
        header: () => (
          <span className="flex justify-end w-full">
            <TooltipLabel
              label="Commitment"
              placement="bottom"
              tooltip={tooltipDefinitions.commitment}
            />
          </span>
        ),
      }),
      columnHelper.accessor('totalBalance', {
        cell: (info) => {
          const value = info.getValue();
          return (
            <span
              className={`flex justify-end w-full ${value < 0 ? 'text-error' : ''}`}
            >
              {formatCurrency(value)}
            </span>
          );
        },
        footer: () => (
          <span
            className={`flex justify-end w-full ${totals.totalBalance < 0 ? 'text-error' : ''}`}
          >
            {formatCurrency(totals.totalBalance)}
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Balance</span>,
      }),
    ],
    [
      discrepancies,
      iamId,
      totals.totalBalance,
      totals.totalBudget,
      totals.totalEncumbrance,
      totals.totalExpense,
    ]
  );

  if (allProjects.length === 0) {
    return <p className="text-base-content/70 mt-8">No projects found.</p>;
  }

  return (
    <div className="mt-4">
      <DataTable
        columns={columns}
        data={projects}
        footerRowClassName="totaltr"
        getRowProps={(row) =>
          isInactiveTask(row.original) ? { className: 'bg-base-300/80' } : {}
        }
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
        tableActions={(table) => (
          <div className="flex flex-wrap items-center gap-2">
            {inactiveCount > 0 && (
              <button
                className={`btn btn-sm${showInactive ? ' btn-active' : ''}`}
                onClick={() => setShowInactive((current) => !current)}
                type="button"
              >
                {`${showInactive ? 'Hide' : 'Show'} inactive tasks (${inactiveCount})`}
              </button>
            )}
            <TableExportActions
              baseFilename="internal-projects"
              columns={csvColumns}
              data={projects}
              table={table}
              toRows={(rows) => rows}
            />
          </div>
        )}
      />
    </div>
  );
}
