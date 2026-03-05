import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { ProjectsSidebar } from '@/components/project/ProjectsSidebar.tsx';
import { projectsDetailQueryOptions } from '@/queries/project.ts';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/projects/$employeeId')({
  component: RouteComponent,
  errorComponent: ProjectsErrorBoundary,
  loader: ({ context: { queryClient }, params: { employeeId } }) =>
    queryClient.ensureQueryData(projectsDetailQueryOptions(employeeId)),
  pendingComponent: () => <PageLoading message="Fetching projects..." />,
});

function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="flex flex-col md:flex-row gap-0 md:gap-8">
        <ProjectsSidebar />
        {children}
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <ProjectsLayout>
      <Outlet />
    </ProjectsLayout>
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
    <ProjectsLayout>
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
                params={{ employeeId: user.employeeId }}
                to="/projects/$employeeId"
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
    </ProjectsLayout>
  );
}
