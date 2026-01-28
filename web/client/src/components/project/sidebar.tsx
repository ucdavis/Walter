import { formatDate } from '@/lib/date.ts';
import {
  projectsDetailQueryOptions,
  ProjectRecord,
} from '@/queries/project.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

interface ProjectSummary {
  awardEndDate: string | null;
  projectName: string;
  projectNumber: string;
  projectStatusCode: string;
  totalCatBudBal: number;
}

function groupProjects(records: ProjectRecord[]): ProjectSummary[] {
  const map: Record<string, ProjectSummary> = {};

  for (const rec of records) {
    const key = rec.projectNumber;

    if (!map[key]) {
      map[key] = {
        awardEndDate: rec.awardEndDate,
        projectName: rec.projectName,
        projectNumber: rec.projectNumber,
        projectStatusCode: rec.projectStatusCode,
        totalCatBudBal: 0,
      };
    }

    // add catBudBal
    map[key].totalCatBudBal += rec.catBudBal;

    // pick latest awardEndDate (YYYY-MM-DD string compare works)
    if (rec.awardEndDate) {
      const current = map[key].awardEndDate;
      if (!current || rec.awardEndDate > current) {
        map[key].awardEndDate = rec.awardEndDate;
      }
    }
  }

  return Object.values(map);
}

const linkClasses = (isActive: boolean, isActiveStatus: boolean) =>
  [
    'block mb-0 text-left px-3 py-2 transition-colors border-b border-main-border',
    isActive
      ? 'bg-primary-color/10'
      : isActiveStatus
        ? 'bg-base-100'
        : 'hover:bg-primary-color/10',
  ].join(' ');

export function ProjectsSidebar() {
  const { employeeId, projectNumber } = useParams({ strict: false });
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(employeeId)
  );

  if (!projects?.length) {
    return null;
  }

  // we want to group projects by projectNumber
  const groupedProjects = groupProjects(projects);
  const totalOverviewBalance = groupedProjects.reduce(
    (total, project) => total + project.totalCatBudBal,
    0
  );

  const isAllProjectsActive = !projectNumber;

  return (
    <aside className="w-72 shrink-0">
      <div className="sticky top-24">
        <div className="bg-white rounded-sm border border-main-border">
          <div className="bg-light-bg-200 border-b border-main-border">
            <div className="px-4 py-2 border-b border-main-border">
              <h2 className="text-primary-font text-sm uppercase">
                My Projects
              </h2>
            </div>
            <div className="px-4 py-1">
              <input
                className="w-full h-9"
                placeholder="Search..."
                type="text"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[650px] overflow-y-auto">
            <Link
              className={linkClasses(isAllProjectsActive, false)}
              params={{ employeeId }}
              to="/projects/$employeeId"
              viewTransition={{ types: ['slide-right'] }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-base">All Projects</span>
              </div>
              <div className="flex justify-between text-sm items-center text-dark-font/70">
                <Currency value={totalOverviewBalance} />
                <span>total proj #</span>
              </div>
            </Link>
            {groupedProjects.map((project, index) => (
              <Link
                className={linkClasses(
                  projectNumber === project.projectNumber,
                  project.projectStatusCode === 'ACTIVE'
                )}
                key={index}
                params={{ employeeId, projectNumber: project.projectNumber }}
                to="/projects/$employeeId/$projectNumber"
                viewTransition={{ types: ['slide-left'] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-base">{project.projectName}</span>
                </div>
                <div className="flex text-sm justify-between items-center text-dark-font/70">
                  <Currency value={project.totalCatBudBal} />
                  <span>{formatDate(project.awardEndDate, 'No end date')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
