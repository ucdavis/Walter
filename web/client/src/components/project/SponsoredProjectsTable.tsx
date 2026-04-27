import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { TableExportActions } from '@/components/TableExportActions.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { ProjectRecord } from '@/queries/project.ts';
import { DataTable } from '@/shared/DataTable.tsx';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface AggregatedProject {
  awardEndDate: string | null;
  awardNumber: string | null;
  awardStartDate: string | null;
  awardStatus: string | null;
  awardType: string | null;
  displayName: string;
  pi: string | null;
  pm: string | null;
  primarySponsorName: string | null;
  projectName: string;
  projectNumber: string;
  projectOwningOrg: string;
  projectStatusCode: string;
  projectType: string;
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
      existing.totalBudget += p.budget;
      existing.totalExpense += p.expenses;
      existing.totalEncumbrance += p.commitments;
      existing.totalBalance += p.balance;
      if (
        p.awardStartDate &&
        (!existing.awardStartDate || p.awardStartDate < existing.awardStartDate)
      ) {
        existing.awardStartDate = p.awardStartDate;
      }
      if (
        p.awardEndDate &&
        (!existing.awardEndDate || p.awardEndDate > existing.awardEndDate)
      ) {
        existing.awardEndDate = p.awardEndDate;
      }
    } else {
      projectsMap.set(p.projectNumber, {
        awardEndDate: p.awardEndDate,
        awardNumber: p.awardNumber,
        awardStartDate: p.awardStartDate,
        awardStatus: p.awardStatus,
        awardType: p.awardType,
        displayName: p.displayName,
        pi: p.pi,
        pm: p.pm,
        primarySponsorName: p.primarySponsorName,
        projectName: p.projectName,
        projectNumber: p.projectNumber,
        projectOwningOrg: p.projectOwningOrg,
        projectStatusCode: p.projectStatusCode,
        projectType: p.projectType,
        totalBalance: p.balance,
        totalBudget: p.budget,
        totalEncumbrance: p.commitments,
        totalExpense: p.expenses,
      });
    }
  }

  return Array.from(projectsMap.values());
}

function isExpired(project: AggregatedProject): boolean {
  if (!project.awardEndDate) return false;
  return new Date(project.awardEndDate) < new Date();
}

function sortByEndDate(projects: AggregatedProject[]): AggregatedProject[] {
  return [...projects].sort((a, b) => {
    if (!a.awardEndDate && !b.awardEndDate) return 0;
    if (!a.awardEndDate) return -1;
    if (!b.awardEndDate) return 1;
    return new Date(a.awardEndDate).getTime() - new Date(b.awardEndDate).getTime();
  });
}

const csvColumns = [
  { header: 'Project Number', key: 'projectNumber' as const },
  { header: 'Project Name', key: 'displayName' as const },
  { header: 'Type', key: 'projectType' as const },
  { header: 'Status', key: 'projectStatusCode' as const },
  { header: 'Owning Org', key: 'projectOwningOrg' as const },
  { header: 'PI', key: 'pi' as const },
  { header: 'PM', key: 'pm' as const },
  { header: 'Sponsor', key: 'primarySponsorName' as const },
  { header: 'Award Number', key: 'awardNumber' as const },
  { header: 'Award Type', key: 'awardType' as const },
  { header: 'Award Status', key: 'awardStatus' as const },
  { format: 'date' as const, header: 'Effective Date', key: 'awardStartDate' as const },
  { format: 'date' as const, header: 'End Date', key: 'awardEndDate' as const },
  { format: 'currency' as const, header: 'Budget', key: 'totalBudget' as const },
  { format: 'currency' as const, header: 'Expense', key: 'totalExpense' as const },
  { format: 'currency' as const, header: 'Commitment', key: 'totalEncumbrance' as const },
  { format: 'currency' as const, header: 'Balance', key: 'totalBalance' as const },
];

interface SponsoredProjectsTableProps {
  employeeId: string;
  records: ProjectRecord[];
}

export function SponsoredProjectsTable({
  employeeId,
  records,
}: SponsoredProjectsTableProps) {
  const [showExpired, setShowExpired] = useState(false);

  const allProjects = useMemo(() => {
    const aggregated = aggregateProjects(records);
    return sortByEndDate(aggregated);
  }, [records]);

  const expiredCount = useMemo(
    () => allProjects.filter(isExpired).length,
    [allProjects]
  );

  const projects = useMemo(
    () => (showExpired ? allProjects : allProjects.filter((p) => !isExpired(p))),
    [allProjects, showExpired]
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
        { totalBalance: 0, totalBudget: 0, totalEncumbrance: 0, totalExpense: 0 }
      ),
    [projects]
  );

  const columns = useMemo(
    () => [
      // Accessor concatenates name + number so the global filter matches on
      // either — the cell visibly renders both, but TanStack only filters
      // accessor values, not rendered output.
      columnHelper.accessor((row) => `${row.displayName} ${row.projectNumber}`, {
        cell: (info) => {
          const { displayName: name, projectNumber } = info.row.original;
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
            </Link>
          );
        },
        footer: () => 'Totals',
        header: 'Project',
        id: 'displayName',
        minSize: 250,
        size: 300,
      }),
      columnHelper.accessor('awardStartDate', {
        cell: (info) => (
          <span className="flex justify-end">
            {formatDate(info.getValue())}
          </span>
        ),
        header: () => <span className="flex justify-end">Eff. Date</span>,
      }),
      columnHelper.accessor('awardEndDate', {
        cell: (info) => {
          const value = info.getValue();
          let colorClass = '';
          if (value) {
            const endDate = new Date(value);
            const now = new Date();
            if (endDate < now) {
              colorClass = 'text-error';
            } else {
              const ninetyDaysFromNow = new Date();
              ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
              if (endDate <= ninetyDaysFromNow) {
                colorClass = 'text-warning';
              }
            }
          }
          return (
            <span className={`flex justify-end ${colorClass}`}>
              {formatDate(value)}
            </span>
          );
        },
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
    [employeeId, totals.totalBalance, totals.totalBudget, totals.totalEncumbrance, totals.totalExpense]
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
        globalFilter="left"
        initialState={{ pagination: { pageSize: 25 } }}
        tableActions={(table) =>
          (
            <div className="flex flex-wrap items-center gap-2">
              {expiredCount > 0 && (
                <button
                  className={`btn btn-sm ${showExpired ? 'btn-active' : 'btn-default'}`}
                  onClick={() => setShowExpired((current) => !current)}
                  type="button"
                >
                  {showExpired ? 'Hide' : 'Show'} expired ({expiredCount})
                </button>
              )}
              <TableExportActions
                baseFilename="projects"
                columns={csvColumns}
                data={projects}
                table={table}
                toRows={(rows) => rows}
              />
            </div>
          )
        }
      />
    </div>
  );
}
