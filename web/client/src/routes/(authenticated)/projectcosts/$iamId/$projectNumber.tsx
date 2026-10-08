import { ProjectCostsTable } from '@/components/project/ProjectCostsTable.tsx';
import { hasProjectCostCategory } from '@/components/project/projectCostCategories.ts';
import { ProjectPortfolioLayout } from '@/components/project/ProjectPortfolioLayout.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { isAwardExpired } from '@/lib/date.ts';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { featureFlagsQueryOptions } from '@/queries/featureFlags.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import {
  ClipboardDocumentListIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from '@tanstack/react-router';

interface ProjectCostsSearch {
  category?: string;
}

function parseCategory(value: unknown) {
  const category = typeof value === 'string' ? value.trim() : '';

  return category && hasProjectCostCategory(category) ? category : undefined;
}

export const Route = createFileRoute(
  '/(authenticated)/projectcosts/$iamId/$projectNumber'
)({
  component: RouteComponent,
  errorComponent: ProjectCostsErrorBoundary,
  validateSearch: (search: Record<string, unknown>): ProjectCostsSearch => ({
    category: parseCategory(search.category),
  }),
  // Keep validation ahead of the loader so TanStack Router infers the search type.
  loader: async ({ context: { queryClient }, params: { iamId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(projectsDetailQueryOptions(iamId)),
      queryClient.ensureQueryData(featureFlagsQueryOptions()),
    ]);
  },
  pendingComponent: () => <PageLoading message="Fetching project costs..." />,
});

const ProjectNotFound = ({ projectNumber }: { projectNumber: string }) => (
  <main className="flex-1">
    <section className="card p-4 mt-8 max-w-prose">
      <h1 className="text-2xl font-semibold mb-3">Project not found</h1>
      <p className="mb-6">
        We couldn&apos;t find any data for project{' '}
        <span className="font-mono">{projectNumber}</span>.<br /> It may have
        been archived or you might not have access.
      </p>
    </section>
  </main>
);

function RouteComponent() {
  const { iamId, projectNumber } = Route.useParams();
  const { category } = Route.useSearch();
  const { data: projects } = useSuspenseQuery(
    projectsDetailQueryOptions(iamId)
  );
  const { data: featureFlags } = useSuspenseQuery(featureFlagsQueryOptions());
  const summary = summarizeProjectByNumber(projects, projectNumber);

  if (!summary) {
    return (
      <ProjectPortfolioLayout>
        <ProjectNotFound projectNumber={projectNumber} />
      </ProjectPortfolioLayout>
    );
  }

  const burndownAvailable =
    !summary.isInternal &&
    featureFlags.burndownEnabled &&
    !isAwardExpired(summary.awardEndDate);

  return (
    <ProjectPortfolioLayout>
      <main className="flex-1 min-w-0">
        <section className="mt-8 mb-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              className="btn btn-sm"
              params={{ iamId, projectNumber: summary.projectNumber }}
              to="/projects/$iamId/$projectNumber"
            >
              <ClipboardDocumentListIcon className="h-4 w-4" />
              Project Details
            </Link>
            {burndownAvailable ? (
              <Link
                className="btn btn-sm"
                params={{ iamId, projectNumber: summary.projectNumber }}
                to="/projectburndown/$iamId/$projectNumber"
              >
                <PresentationChartLineIcon className="h-4 w-4" />
                Project Burndown
              </Link>
            ) : null}
          </div>

          <h1 className="h1">Project Costs</h1>
          <h2 className="subtitle max-w-5xl">{summary.displayName}</h2>
        </section>

        {featureFlags.projectCostsEnabled ? (
          <section className="section-margin">
            <ProjectCostsTable category={category} key={category ?? 'all'} />
          </section>
        ) : (
          <PageEmpty message="Project costs are not available in this environment." />
        )}
      </main>
    </ProjectPortfolioLayout>
  );
}

function ProjectCostsErrorBoundary({ error, reset }: ErrorComponentProps) {
  const user = useUser();
  const presentation = getErrorPresentation(error, {
    403: {
      message: 'Walter can only show project costs you are allowed to open.',
      title: 'You do not have access to this project',
    },
  });

  return (
    <ProjectPortfolioLayout>
      <main className="flex-1 min-w-0">
        <PageError
          actions={
            <>
              <button
                className="btn btn-primary"
                onClick={() => reset()}
                type="button"
              >
                Try again
              </button>
              <Link
                className="btn btn-outline"
                params={{ iamId: user.iamId }}
                to="/projects/$iamId"
              >
                Open your projects
              </Link>
            </>
          }
          detail={presentation.detail}
          message={presentation.message}
          statusCode={presentation.statusCode}
          title={presentation.title}
        />
      </main>
    </ProjectPortfolioLayout>
  );
}
