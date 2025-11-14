import { allProjectsQueryOptions, ProjectRecord } from '@/queries/project.ts';
import { Currency } from '@/shared/Currency.tsx';
import { useSuspenseQuery } from '@tanstack/react-query';

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

export function ProjectsSidebar() {
  const { data: projects } = useSuspenseQuery(allProjectsQueryOptions());

  // we want to group projects by project_number
  const groupedProjects = groupProjects(projects);

  return (
    <aside className="w-72 shrink-0">
      <div className="sticky top-24">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-4">
            <h2 className="text-gray-500 text-xs mb-3">MY PROJECTS</h2>
            <div className="flex items-center justify-between mb-3">
              <span>All Projects Dashboard</span>
              <button className="p-1 hover:bg-gray-100 rounded">
                {/* <Grid className="w-4 h-4" /> */}
                btn
              </button>
            </div>
            <div className="relative">
              <input
                className="pl-9 h-9 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search..."
                type="text"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {groupedProjects.map((project, index) => (
              <button
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  project.project_status_code === 'ACTIVE'
                    ? 'bg-gray-100'
                    : 'hover:bg-gray-50'
                }`}
                key={index}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm">{project.project_name}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <Currency value={project.total_cat_bud_bal} />
                  <span>{project.award_end_date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
