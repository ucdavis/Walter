import { ProjectExpenditureProgressSection } from '@/components/project/ProjectExpenditureProgress.tsx';
import { ProjectPortfolioLayout } from '@/components/project/ProjectPortfolioLayout.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { summarizeProjectByNumber } from '@/lib/projectSummary.ts';
import { featureFlagsQueryOptions } from '@/queries/featureFlags.ts';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
} from '@tanstack/react-router';

export const Route = createFileRoute(
  '/(authenticated)/expenditureprogress/$iamId/$projectNumber'
)({
  component: RouteComponent,
  errorComponent: ProjectionsErrorBoundary,
  loader: async ({ context: { queryClient }, params: { iamId } }) => {
    await Promise.all([
      queryClient.ensureQueryData(projectsDetailQueryOptions(iamId)),
      queryClient.ensureQueryData(featureFlagsQueryOptions()),
    ]);
  },
  pendingComponent: () => <PageLoading message="Fetching projections..." />,
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

  const projectionsAvailable =
    !summary.isInternal && featureFlags.projectionsEnabled;

  return (
    <ProjectPortfolioLayout>
      <main className="flex-1 min-w-0">
        <section className="mt-8 mb-6">
          <Link
            className="btn btn-sm mb-4"
            params={{ iamId, projectNumber: summary.projectNumber }}
            to="/projects/$iamId/$projectNumber"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Project Details
          </Link>

          <h1 className="h1">Expenditure Progress</h1>
          <h2 className="subtitle max-w-5xl">{summary.displayName}</h2>
        </section>

        {projectionsAvailable ? (
          <ProjectExpenditureProgressSection
            awardEndDate={summary.awardEndDate}
            awardStartDate={summary.awardStartDate}
            projectNumber={summary.projectNumber}
          />
        ) : (
          <PageEmpty message="Projections are not available for this project." />
        )}
      </main>
    </ProjectPortfolioLayout>
  );
}

function ProjectionsErrorBoundary({ error, reset }: ErrorComponentProps) {
  const user = useUser();
  const presentation = getErrorPresentation(error, {
    403: {
      message:
        'Walter can only show project projections you are allowed to open.',
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
