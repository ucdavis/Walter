import { useMemo } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  ExpenditureCategoryBreakdown,
  type ExpenditureCategoryFilters,
} from '@/components/project/ExpenditureCategoryBreakdown.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';

type SearchParams = ExpenditureCategoryFilters;

export const Route = createFileRoute(
  '/(authenticated)/projects/$iamId/$projectNumber/expenditure-categories'
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    activity: (search.activity as string) ?? undefined,
    dept: (search.dept as string) ?? undefined,
    fund: (search.fund as string) ?? undefined,
    program: (search.program as string) ?? undefined,
    task: (search.task as string) ?? undefined,
  }),
});

function RouteComponent() {
  const { iamId, projectNumber } = Route.useParams();
  const search = Route.useSearch();

  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );

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
          projectNumber={projectNumber}
          records={projectRecords}
        />
      </section>
    </main>
  );
}
