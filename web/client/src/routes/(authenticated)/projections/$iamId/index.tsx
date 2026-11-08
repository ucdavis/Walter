import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  useNavigate,
} from '@tanstack/react-router';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { DuplicateProjectionButton } from '@/components/projections/DuplicateProjectionButton.tsx';
import { NewProjectionWizard } from '@/components/projections/NewProjectionWizard.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  projectionListQueryOptions,
  type Projection,
} from '@/queries/projections.ts';

export const Route = createFileRoute('/(authenticated)/projections/$iamId/')({
  component: RouteComponent,
  errorComponent: ProjectionsErrorBoundary,
  loader: ({ context: { queryClient }, params: { iamId } }) =>
    queryClient.ensureQueryData(projectionListQueryOptions(iamId)),
  pendingComponent: () => <PageLoading message="Fetching projections..." />,
});

function RouteComponent() {
  const { iamId } = Route.useParams();
  return <ProjectionList iamId={iamId} key={iamId} />;
}

function ProjectionList({ iamId }: { iamId: string }) {
  const { data: projections } = useSuspenseQuery(
    projectionListQueryOptions(iamId)
  );
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const openCreated = async (saved: Projection) => {
    await navigate({
      ignoreBlocker: true,
      params: { iamId, projectionId: String(saved.id) },
      to: '/projections/$iamId/$projectionId',
    });
  };

  if (creating) {
    return (
      <main className="container">
        <NewProjectionWizard
          iamId={iamId}
          onCancel={() => setCreating(false)}
          onCreated={openCreated}
        />
      </main>
    );
  }

  return (
    <main className="container">
      <header className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="h1">Projections</h1>
        <button
          className="btn btn-primary"
          onClick={() => setCreating(true)}
          type="button"
        >
          New plan
        </button>
      </header>

      <section className="section-margin">
        {projections.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Data as of</th>
                <th>Last updated</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      className="link"
                      params={{ iamId, projectionId: String(p.id) }}
                      to="/projections/$iamId/$projectionId"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td>{new Date(p.seededAt).toLocaleDateString()}</td>
                  <td>
                    {new Date(p.updatedAt).toLocaleString()}
                    {p.updatedBy ? ` by ${p.updatedBy}` : ''}
                  </td>
                  <td>
                    <DuplicateProjectionButton
                      iamId={iamId}
                      onCreated={openCreated}
                      projection={p}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No projections yet.</p>
        )}
      </section>
    </main>
  );
}

function ProjectionsErrorBoundary({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    403: {
      message: 'Walter can only show projections for portfolios you can open.',
      title: 'You do not have access to these projections',
    },
  });

  return (
    <main className="container">
      <PageError
        actions={
          <button
            className="btn btn-primary"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
        }
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title={presentation.title}
      />
    </main>
  );
}
