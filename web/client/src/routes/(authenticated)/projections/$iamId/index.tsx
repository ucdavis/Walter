import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  type ErrorComponentProps,
  useNavigate,
} from '@tanstack/react-router';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { CurrentProjectBalances } from '@/components/projections/CurrentProjectBalances.tsx';
import { ProjectionPlanCard } from '@/components/projections/ProjectionPlanCard.tsx';
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

      <CurrentProjectBalances iamId={iamId} />

      <section aria-label="Saved plans" className="section-margin mt-8">
        <h2 className="mb-4 text-2xl font-semibold">Saved plans</h2>
        {projections.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projections.map((projection) => (
              <ProjectionPlanCard
                iamId={iamId}
                key={projection.id}
                onCreated={openCreated}
                summary={projection}
              />
            ))}
          </div>
        ) : (
          <p>No saved plans yet. Start with New plan.</p>
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
