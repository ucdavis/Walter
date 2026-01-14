import {
  projectsDetailQueryOptions,
  ProjectRecord,
} from '@/queries/project.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

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
    'block mb-0 text-left px-3 py-2 transition-colors border-b border-main-border',
    isActive
      ? 'bg-primary-color/10'
      : isActiveStatus
        ? 'bg-primary-color/20'
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

  // we want to group projects by project_number
  const groupedProjects = groupProjects(projects);
  const totalOverviewBalance = groupedProjects.reduce(
    (total, project) => total + project.total_cat_bud_bal,
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
                  projectNumber === project.project_number,
                  project.project_status_code === 'ACTIVE'
                )}
                key={index}
                params={{ employeeId, projectNumber: project.project_number }}
                to="/projects/$employeeId/$projectNumber"
                viewTransition={{ types: ['slide-left'] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-base">{project.project_name}</span>
                </div>
                <div className="flex text-sm justify-between items-center text-dark-font/70">
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
