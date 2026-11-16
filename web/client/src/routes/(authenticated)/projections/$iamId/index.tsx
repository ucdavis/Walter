import { PlusIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { managedPisQueryOptions } from '@/queries/project.ts';
import {
  createFileRoute,
  type ErrorComponentProps,
  useNavigate,
} from '@tanstack/react-router';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { CurrentProjectBalances } from '@/components/projections/CurrentProjectBalances.tsx';
import { ProjectionPlanCard } from '@/components/projections/ProjectionPlanCard.tsx';
import { ProjectionPlansSidebar } from '@/components/projections/ProjectionPlansSidebar.tsx';
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
  const user = useUser();
  const { data: managed } = useQuery({
    ...managedPisQueryOptions(user.iamId),
    enabled: user.iamId !== iamId,
  });
  const ownerName =
    user.iamId === iamId
      ? user.name
      : managed?.pis.find((pi) => pi.iamId === iamId)?.name;
  const ownerDisplayName = ownerName?.includes(',')
    ? `${ownerName.slice(ownerName.indexOf(',') + 1).trim()} ${ownerName.slice(0, ownerName.indexOf(',')).trim()}`
    : ownerName;
  return (
    <main className="container scroll-mt-24 bg-base-100 text-base leading-normal text-base-content [&_button:enabled]:cursor-pointer">
      <div className="flex flex-col gap-6 pt-6 pb-12 md:flex-row md:gap-8">
        <ProjectionPlansSidebar iamId={iamId} plans={projections} />
        <div className="@container min-w-0 flex-1 py-6">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4 md:items-center">
            <div>
              <h1 className="h1">
                {ownerDisplayName
                  ? `${ownerDisplayName}’s portfolio projections`
                  : 'Portfolio projections'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-base-content/80">
                New plans exclude inactive internal tasks and expired awards.
                Each task keeps its own balance and forecast.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={onCreate}
              type="button"
            >
              <PlusIcon aria-hidden="true" className="size-5" />
              New plan
            </button>
          </header>

          <CurrentProjectBalances iamId={iamId} />

          <section aria-label="Your plans">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="h2">
                Your plans{' '}
                <span
                  aria-hidden="true"
                  aria-label={`${projections.length} plans`}
                  className="ms-2 rounded bg-base-200 px-2 py-0.5 text-sm font-medium"
                >
                  {projections.length}
                </span>
              </h2>
              <span className="hidden text-sm text-base-content/80 sm:block">
                Separate assumptions for each plan
              </span>
            </div>
            {projections.length ? (
              <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
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
        </div>
      </div>
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
