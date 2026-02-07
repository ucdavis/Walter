import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/dataTable.tsx';

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

function filterExpired(projects: AggregatedProject[]): AggregatedProject[] {
  const now = new Date();
  return projects.filter(
    (p) => !p.awardEndDate || new Date(p.awardEndDate) >= now
  );
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
  employeeId: string;
  records: ProjectRecord[];
}

export function ProjectsTable({ employeeId, records }: ProjectsTableProps) {
  const projects = useMemo(() => {
    const aggregated = aggregateProjects(records);
    const active = filterExpired(aggregated);
    return sortByEndDate(active);
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
        cell: (info) => (
          <Link
            className="link link-hover underline"
            params={{
              employeeId,
              projectNumber: info.row.original.projectNumber,
            }}
            to="/projects/$employeeId/$projectNumber/"
          >
            {info.getValue()}
          </Link>
        ),
        footer: () => 'Totals',
        header: 'Project Name',
      }),
      columnHelper.accessor('awardStartDate', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatDate(info.getValue())}
          </span>
        ),
        header: () => (
          <span className="flex justify-end w-full">Effective Date</span>
        ),
      }),
      columnHelper.accessor('awardEndDate', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatDate(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end w-full">End Date</span>,
      }),
      columnHelper.accessor('totalBudget', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            {formatCurrency(totals.totalBudget)}
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Budget</span>,
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
          <span className="flex justify-end w-full">Encumbrance</span>
        ),
      }),
      columnHelper.accessor('totalBalance', {
        cell: (info) => (
          <span className="flex justify-end w-full">
            {formatCurrency(info.getValue())}
          </span>
        ),
        footer: () => (
          <span className="flex justify-end w-full">
            {formatCurrency(totals.totalBalance)}
          </span>
        ),
        header: () => <span className="flex justify-end w-full">Balance</span>,
      }),
    ],
    [
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
      <div className="flex justify-end mb-2">
        <ExportDataButton
          columns={csvColumns}
          data={projects}
          filename="projects.csv"
        />
      </div>
      <DataTable
        columns={columns}
        data={projects}
        footerRowClassName="totaltr"
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
      />
    </div>
  );
}
