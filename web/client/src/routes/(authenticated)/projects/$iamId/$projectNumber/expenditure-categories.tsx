import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  ExpenditureCategoryBreakdown,
  type ExpenditureCategoryFilters,
} from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { useFeatureFlagsQuery } from '@/queries/featureFlags.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';

type SearchParams = ExpenditureCategoryFilters;

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

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const { data: featureFlags } = useFeatureFlagsQuery();

  const projectRecords = useMemo(
    () => projects.filter((p) => p.projectNumber === projectNumber),
    [projects, projectNumber]
  );

  const keyLabel = [
    search.task,
    search.dept,
    search.fund,
    search.program,
    search.activity,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <main className="flex-1 min-w-0">
      <section className="mt-8 mb-6">
        <Link
          className="btn btn-sm mb-4"
          params={{ iamId, projectNumber }}
          to="/projects/$iamId/$projectNumber/"
        >
          Back to Project
        </Link>
        <h1 className="h1">Expenditure Category Breakdown</h1>
        <h3 className="subtitle">
          Data source: Faculty Department Portfolio Report (PPM)
        </h3>
        {keyLabel && <p className="subtitle">{keyLabel}</p>}
      </section>

      <section className="mb-8">
        <ExpenditureCategoryBreakdown
          filters={search}
          iamId={iamId}
          projectCostsEnabled={featureFlags?.projectCostsEnabled}
          projectNumber={projectNumber}
          records={projectRecords}
        />
      </section>
    </main>
  );
}
