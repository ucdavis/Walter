import { PlusIcon } from '@heroicons/react/24/outline';
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
import {
  ProjectionSessionNotice,
  ProjectionUnavailable,
} from '@/components/projections/ProjectionAvailability.tsx';
import {
  featureFlagsQueryOptions,
  useFeatureFlagsQuery,
} from '@/queries/featureFlags.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  projectionListQueryOptions,
  type Projection,
} from '@/queries/projections.ts';

export const Route = createFileRoute('/(authenticated)/projections/$iamId/')({
  component: RouteComponent,
  errorComponent: ProjectionsErrorBoundary,
  loader: async ({ context: { queryClient }, params: { iamId } }) => {
    const user = await queryClient.ensureQueryData(meQueryOptions());
    const flags = await queryClient.fetchQuery(
      featureFlagsQueryOptions(user.id)
    );
    if (flags.projectionsEnabled) {
      await queryClient.ensureQueryData(projectionListQueryOptions(iamId));
    }
  },
  pendingComponent: () => <PageLoading message="Fetching projections..." />,
});

function RouteComponent() {
  const { iamId } = Route.useParams();
  const user = useUser();
  return <ProjectionDashboard iamId={iamId} key={`${user.id}:${iamId}`} />;
}

function ProjectionDashboard({ iamId }: { iamId: string }) {
  const { data: flags } = useFeatureFlagsQuery();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [savedName, setSavedName] = useState<string>();

  const openCreated = async (saved: Projection) => {
    if (!flags?.projectionsEnabled) {
      setSavedName(saved.name);
      setCreating(false);
      return;
    }
    await navigate({
      ignoreBlocker: true,
      params: { iamId, projectionId: String(saved.id) },
      to: '/projections/$iamId/$projectionId',
    });
  };

  if (creating) {
    return (
      <main className="container">
        {!flags?.projectionsEnabled && <ProjectionSessionNotice />}
        <NewProjectionWizard
          iamId={iamId}
          onCancel={() => setCreating(false)}
          onCreated={openCreated}
          openWorkspaceAfterCreate={!!flags?.projectionsEnabled}
        />
      </main>
    );
  }

  if (!flags?.projectionsEnabled) {
    return (
      <>
        {savedName && (
          <p className="alert alert-success" role="status">
            {savedName} was saved.
          </p>
        )}
        <ProjectionUnavailable iamId={iamId} />
      </>
    );
  }

  return <ProjectionList iamId={iamId} onCreate={() => setCreating(true)} />;
}

function ProjectionList({
  iamId,
  onCreate,
}: {
  iamId: string;
  onCreate: () => void;
}) {
  const { data: projections } = useSuspenseQuery(
    projectionListQueryOptions(iamId)
  );
  return (
    <main className="container">
      <header className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="h1">Projections</h1>
        <button className="btn btn-primary" onClick={onCreate} type="button">
          <PlusIcon aria-hidden="true" className="size-5" />
          New plan
        </button>
      </header>

      <CurrentProjectBalances iamId={iamId} />

      <section aria-label="Your plans" className="section-margin mt-8">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-2xl font-semibold">Your plans</h2>
          <span
            aria-label={`${projections.length} plans`}
            className="badge badge-neutral badge-soft"
          >
            {projections.length}
          </span>
        </div>
        {projections.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {projections.map((projection) => (
              <ProjectionPlanCard
                iamId={iamId}
                key={projection.id}
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
