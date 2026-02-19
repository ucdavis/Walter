import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';

interface AggregatedProject {
  awardEndDate: string | null;
  awardStartDate: string | null;
  displayName: string;
  projectName: string;
  projectNumber: string;
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

    if (existing) {
      existing.totalBudget += p.catBudget;
      existing.totalExpense += p.catItdExp;
      existing.totalEncumbrance += p.catCommitments;
      existing.totalBalance += p.catBudBal;
      // Pick earliest start date
      if (
        p.awardStartDate &&
        (!existing.awardStartDate || p.awardStartDate < existing.awardStartDate)
      ) {
        existing.awardStartDate = p.awardStartDate;
      }
      // Pick latest end date
      if (
        p.awardEndDate &&
        (!existing.awardEndDate || p.awardEndDate > existing.awardEndDate)
      ) {
        existing.awardEndDate = p.awardEndDate;
      }
    } else {
      projectsMap.set(p.projectNumber, {
        awardEndDate: p.awardEndDate,
        awardStartDate: p.awardStartDate,
        displayName: p.displayName,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        totalBalance: p.catBudBal,
        totalBudget: p.catBudget,
        totalEncumbrance: p.catCommitments,
        totalExpense: p.catItdExp,
      });
    }
  }

  return Array.from(projectsMap.values());
}

function sortByEndDate(projects: AggregatedProject[]): AggregatedProject[] {
  return [...projects].sort((a, b) => {
    if (!a.awardEndDate && !b.awardEndDate) {
      return 0;
    }
    if (!a.awardEndDate) {
      return -1;
    }
    if (!b.awardEndDate) {
      return 1;
    }
    return (
      new Date(a.awardEndDate).getTime() - new Date(b.awardEndDate).getTime()
    );
  });
}

const csvColumns = [
  { header: 'Project', key: 'displayName' as const },
  { header: 'Effective Date', key: 'awardStartDate' as const },
  { header: 'End Date', key: 'awardEndDate' as const },
  { header: 'Budget', key: 'totalBudget' as const },
  { header: 'Expense', key: 'totalExpense' as const },
  { header: 'Encumbrance', key: 'totalEncumbrance' as const },
  { header: 'Balance', key: 'totalBalance' as const },
];

interface ProjectsTableProps {
  discrepancies?: Set<string>;
  employeeId: string;
  records: ProjectRecord[];
}

export function ProjectsTable({
  discrepancies,
  employeeId,
  records,
}: ProjectsTableProps) {
  const projects = useMemo(() => {
    const aggregated = aggregateProjects(records);
    return sortByEndDate(aggregated);
  }, [records]);

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
      columnHelper.accessor('displayName', {
        cell: (info) => {
          const name = info.getValue();
          const { projectNumber } = info.row.original;

          return (
            <Link
              className="link no-underline flex items-start gap-1"
              params={{
                employeeId,
                projectNumber,
              }}
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
      columnHelper.accessor('awardStartDate', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatDate(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">Effective Date</span>,
      }),
      columnHelper.accessor('awardEndDate', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatDate(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">End Date</span>,
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
        header: () => <span className="flex justify-end">Encumbrance</span>,
      }),
      columnHelper.accessor('totalBalance', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end">
            {formatCurrency(totals.totalBalance)}
          </span>
        ),
        header: () => <span className="flex justify-end">Balance</span>,
      }),
    ],
    [
      discrepancies,
      employeeId,
      totals.totalBalance,
      totals.totalBudget,
      totals.totalEncumbrance,
      totals.totalExpense,
    ]
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
          <ExportDataButton
            columns={csvColumns}
            data={projects}
            filename="projects.csv"
          />
        }
      />
    </div>
  );
}
