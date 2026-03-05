import { PageLoading } from '@/components/states/PageLoading.tsx';
import { HttpError } from '@/lib/api.ts';
import { useResolveProjectPiQuery } from '@/queries/search.ts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

export const Route = createFileRoute(
  '/(authenticated)/projects/by-number/$projectNumber'
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectNumber } = Route.useParams();
  const navigate = useNavigate();

  const resolvePiQuery = useResolveProjectPiQuery({
    enabled: Boolean(projectNumber),
    projectNumber,
  });

  useEffect(() => {
    const employeeId = resolvePiQuery.data?.employeeId;
    if (!employeeId) {
      return;
    }

    navigate({
      params: {
        employeeId,
        projectNumber,
      },
      replace: true,
      to: '/projects/$employeeId/$projectNumber/',
    });
  }, [navigate, projectNumber, resolvePiQuery.data?.employeeId]);

  if (resolvePiQuery.isPending) {
    return <PageLoading message={`Finding project owner for ${projectNumber}...`} />;
  }

  if (resolvePiQuery.isError) {
    const isNotFound =
      resolvePiQuery.error instanceof HttpError &&
      resolvePiQuery.error.status === 404;

    return (
      <main className="container mt-8">
        <section className="card p-4 max-w-prose">
          <h1 className="text-2xl font-semibold mb-3">Project not found</h1>
          {isNotFound ? (
            <p>
              We found project <span className="font-mono">{projectNumber}</span>{' '}
              but could not resolve a principal investigator employee ID.
            </p>
          ) : (
            <p>
              We could not load project{' '}
              <span className="font-mono">{projectNumber}</span> right now.
              Please try again.
            </p>
          )}
        </section>
      </main>
    );
  }

  return <PageLoading message={`Opening ${projectNumber}...`} />;
}
