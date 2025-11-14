import { allProjectsQueryOptions, ProjectRecord } from '@/queries/project.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';

interface ProjectSummary {
  award_end_date: string | null;
  project_name: string;
  project_number: string;
  project_status_code: string;
  total_cat_bud_bal: number;
}

function groupProjects(records: ProjectRecord[]): ProjectSummary[] {
  const map: Record<string, ProjectSummary> = {};

  for (const rec of records) {
    const key = rec.project_number;

    if (!map[key]) {
      map[key] = {
        award_end_date: rec.award_end_date,
        project_name: rec.project_name,
        project_number: rec.project_number,
        project_status_code: rec.project_status_code,
        total_cat_bud_bal: 0,
      };
    }

    // add cat_bud_bal
    map[key].total_cat_bud_bal += rec.cat_bud_bal;

    // pick latest award_end_date (YYYY-MM-DD string compare works)
    if (rec.award_end_date) {
      const current = map[key].award_end_date;
      if (!current || rec.award_end_date > current) {
        map[key].award_end_date = rec.award_end_date;
      }
    }
  }

  return Object.values(map);
}

const linkClasses = (isActive: boolean, isActiveStatus: boolean) =>
  [
    'block text-left px-3 py-2 rounded-md transition-colors border border-transparent',
    isActive
      ? 'bg-blue-50 text-blue-700 border-blue-100'
      : isActiveStatus
        ? 'bg-gray-100'
        : 'hover:bg-gray-50',
  ].join(' ');

export function ProjectsSidebar() {
  const { data: projects } = useSuspenseQuery(allProjectsQueryOptions());
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // we want to group projects by project_number
  const groupedProjects = groupProjects(projects);
  const totalOverviewBalance = groupedProjects.reduce(
    (total, project) => total + project.total_cat_bud_bal,
    0
  );

  const isAllProjectsActive =
    pathname === '/projects' || pathname === '/projects/';

  return (
    <aside className="w-72 shrink-0">
      <div className="sticky top-24">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-4">
            <h2 className="text-gray-500 text-xs mb-3">MY PROJECTS</h2>

            <div className="relative">
              <input
                className="pl-9 h-9 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search..."
                type="text"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            <Link
              className={linkClasses(isAllProjectsActive, true)}
              to="/projects"
              viewTransition={{ types: ['slide-right'] }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm">All Projects</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                <Currency value={totalOverviewBalance} />
                <span>Overview</span>
              </div>
            </Link>
            {groupedProjects.map((project, index) => (
              <Link
                className={linkClasses(
                  pathname.startsWith(`/projects/${project.project_number}`),
                  project.project_status_code === 'ACTIVE'
                )}
                key={index}
                params={{ projectNumber: project.project_number }}
                to="/projects/$projectNumber"
                viewTransition={{ types: ['slide-left'] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm">{project.project_name}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <Currency value={project.total_cat_bud_bal} />
                  <span>{project.award_end_date ?? 'No end date'}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
