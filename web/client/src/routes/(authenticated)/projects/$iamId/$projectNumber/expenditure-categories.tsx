import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import {
  ExpenditureCategoryBreakdown,
  type ExpenditureCategoryFilters,
} from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';

type SearchParams = ExpenditureCategoryFilters;

const filterKeys = ['task', 'dept', 'fund', 'program', 'activity'] as const;

// Blank is a real filter value: it selects rows with no code for that segment.
function parseFilter(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export const Route = createFileRoute(
  '/(authenticated)/projects/$iamId/$projectNumber/expenditure-categories'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: parseFilter(search.activity),
    dept: parseFilter(search.dept),
    fund: parseFilter(search.fund),
    program: parseFilter(search.program),
    task: parseFilter(search.task),
  }),
});

function RouteComponent() {
  const { iamId, projectNumber } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const { data: featureFlags } = useFeatureFlagsQuery();

  const projectRecords = useMemo(
    () => projects.filter((p) => p.projectNumber === projectNumber),
    [projects, projectNumber]
  );

  const taskOptions = useMemo(() => {
    const options = new Map<
      string,
      { filters: Required<ExpenditureCategoryFilters>; label: string }
    >();

    for (const record of projectRecords) {
      const filters = {
        activity: record.activityCode ?? '',
        dept: record.projectOwningOrgCode ?? '',
        fund: record.fundCode ?? '',
        program: record.programCode ?? '',
        task: record.taskNum ?? '',
      };
      const key = JSON.stringify(filters);
      const taskLabel = [filters.task || 'No task', record.taskName]
        .filter(Boolean)
        .join(' – ');

      options.set(key, {
        filters,
        label: [
          taskLabel,
          filters.dept || '—',
          filters.fund || '—',
          filters.program || '—',
          filters.activity || '—',
        ].join(' / '),
      });
    }

    return Array.from(options, ([value, option]) => ({ value, ...option }));
  }, [projectRecords]);

  const hasFilters = filterKeys.some((key) => search[key] !== undefined);
  const selectedTask = hasFilters
    ? taskOptions.find(({ filters }) =>
        filterKeys.every((key) => filters[key] === search[key])
      )
    : taskOptions[0];
  const filters = selectedTask?.filters ?? search;

  const keyLabel = [
    filters.task,
    filters.dept,
    filters.fund,
    filters.program,
    filters.activity,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            className="btn btn-sm"
            params={{ iamId, projectNumber }}
            to="/projects/$iamId/$projectNumber/"
          >
            <ClipboardDocumentListIcon className="h-4 w-4" />
            Project Details
          </Link>
        </div>
        <h1 className="h1">Expenditure Category Breakdown</h1>
        <h3 className="subtitle">
          Data source: Faculty Department Portfolio Report (PPM)
        </h3>
        {keyLabel && <p className="subtitle">{keyLabel}</p>}
      </section>

      <section className="mb-8">
        <ExpenditureCategoryBreakdown
          filters={filters}
          iamId={iamId}
          projectCostsEnabled={featureFlags?.projectCostsEnabled}
          projectNumber={projectNumber}
          records={projectRecords}
          tableLeadingActions={
            <label className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-semibold">Task</span>
              <select
                className="select select-sm min-w-0 w-full max-w-xl"
                onChange={(event) => {
                  const option = taskOptions.find(
                    ({ value }) => value === event.target.value
                  );
                  if (option) {
                    void navigate({ search: option.filters });
                  }
                }}
                value={selectedTask?.value ?? ''}
              >
                {!selectedTask && (
                  <option disabled value="">
                    Choose a task
                  </option>
                )}
                {taskOptions.map(({ label, value }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      </section>
    </main>
  );
}
