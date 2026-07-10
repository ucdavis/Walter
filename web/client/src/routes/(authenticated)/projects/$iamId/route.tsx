import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { ProjectPortfolioLayout } from '@/components/project/ProjectPortfolioLayout.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/projects/$iamId')({
  component: RouteComponent,
  errorComponent: ProjectsErrorBoundary,
  loader: ({ context: { queryClient }, params: { iamId } }) =>
    queryClient.ensureQueryData(projectsDetailQueryOptions(iamId)),
  pendingComponent: () => <PageLoading message="Fetching projects..." />,
});

function RouteComponent() {
  return (
    <ProjectPortfolioLayout>
      <Outlet />
    </ProjectPortfolioLayout>
  );
}

function ProjectsErrorBoundary({ error, reset }: ErrorComponentProps) {
  const user = useUser();
  const presentation = getErrorPresentation(error, {
    403: {
      message:
        'Walter can only show project portfolios you are allowed to open.',
      title: 'You do not have access to this portfolio',
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
