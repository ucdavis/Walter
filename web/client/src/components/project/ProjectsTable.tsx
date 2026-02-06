import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { ExportCsvButton } from '@/components/ExportCsvButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { ProjectRecord } from '@/queries/project.ts';

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

  if (projects.length === 0) {
    return <p className="text-base-content/70 mt-8">No projects found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex justify-end mb-2">
        <ExportCsvButton
          columns={csvColumns}
          data={projects}
          filename="projects.csv"
        />
      </div>
      <table className="table walter-table">
        <thead>
          <tr>
            <th>Project Name</th>
            <th className="text-right">Effective Date</th>
            <th className="text-right">End Date</th>
            <th className="text-right">Budget</th>
            <th className="text-right">Expense</th>
            <th className="text-right">Encumbrance</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.projectNumber}>
              <td>
                <Link
                  className="link link-hover underline"
                  params={{
                    employeeId,
                    projectNumber: project.projectNumber,
                  }}
                  to="/projects/$employeeId/$projectNumber/"
                >
                  {project.displayName}
                </Link>
              </td>
              <td className="text-right">
                {formatDate(project.awardStartDate)}
              </td>
              <td className="text-right">{formatDate(project.awardEndDate)}</td>
              <td className="text-right">
                {formatCurrency(project.totalBudget)}
              </td>
              <td className="text-right">
                {formatCurrency(project.totalExpense)}
              </td>
              <td className="text-right">
                {formatCurrency(project.totalEncumbrance)}
              </td>
              <td className="text-right">
                {formatCurrency(project.totalBalance)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="totaltr">
            <td colSpan={3}>Totals</td>
            <td className="text-right">{formatCurrency(totals.totalBudget)}</td>
            <td className="text-right">
              {formatCurrency(totals.totalExpense)}
            </td>
            <td className="text-right">
              {formatCurrency(totals.totalEncumbrance)}
            </td>
            <td className="text-right">
              {formatCurrency(totals.totalBalance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
