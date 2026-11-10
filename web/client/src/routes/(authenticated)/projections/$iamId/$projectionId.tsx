import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import { ProjectionWorkspace } from '@/components/projections/ProjectionWorkspace.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { HttpError } from '@/lib/api.ts';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  projectionListQueryOptions,
  projectionQueryOptions,
  useSaveProjection,
  type ProjectionSummary,
} from '@/queries/projections.ts';

export const Route = createFileRoute(
  '/(authenticated)/projections/$iamId/$projectionId'
)({
  component: RouteComponent,
  errorComponent: ProjectionErrorBoundary,
  // Section and stable source/appointment targets belong to the URL, not the loader identity.
  validateSearch: (search: Record<string, unknown>) => search,
  // Validate and load on entry, without letting background route errors unmount an active draft.
  gcTime: 0,
  loader: async ({
    context: { queryClient },
    params: { iamId, projectionId },
  }) => {
    if (
      !/^[1-9]\d*$/.test(projectionId) ||
      !Number.isSafeInteger(Number(projectionId))
    ) {
      throw new HttpError(404, '/api/projections');
    }
    const [list, projection] = await Promise.all([
      queryClient.fetchQuery(projectionListQueryOptions(iamId)),
      queryClient.fetchQuery(projectionQueryOptions(Number(projectionId))),
    ]);
    // The PI-scoped endpoint resolves IAM to Employee ID using the server's portfolio access rule.
    if (!list.some(({ id }: ProjectionSummary) => id === projection.id)) {
      throw new HttpError(404, '/api/projections');
    }
  },
  pendingComponent: () => <PageLoading message="Fetching projection..." />,
  staleTime: Infinity,
});

function RouteComponent() {
  const { iamId, projectionId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const options = projectionQueryOptions(Number(projectionId));
  const { data: projection } = useSuspenseQuery({
    ...options,
    refetchOnMount: false,
  });
  const save = useSaveProjection(Number(projectionId));

  return (
    <ProjectionSessionProvider
      initialPlan={projection}
      key={`${iamId}:${projectionId}`}
      persistence={{
        reload: async () => {
          await queryClient.cancelQueries({
            exact: true,
            queryKey: options.queryKey,
          });
          return queryClient.fetchQuery({
            ...options,
            retry: false,
            staleTime: 0,
          });
        },
        save: save.mutateAsync,
      }}
    >
      <main>
        <div className="mx-auto w-full max-w-[96rem] px-4 pt-4 sm:px-8">
          <Link
            className="btn btn-outline btn-sm gap-2 border-base-300 bg-base-100"
            params={{ iamId }}
            to="/projections/$iamId"
          >
            <ArrowTrendingUpIcon aria-hidden="true" className="size-4" />
            Projections dashboard
          </Link>
        </div>
        <ProjectionWorkspace
          iamId={iamId}
          onDeleted={async () => {
            await navigate({
              params: { iamId },
              search: {},
              to: '/projections/$iamId',
            });
            // Remove only after the detail observer has left, avoiding a deleted-plan refetch.
            queryClient.removeQueries({
              exact: true,
              queryKey: options.queryKey,
            });
          }}
          onDuplicated={async (saved) => {
            await navigate({
              params: { iamId, projectionId: String(saved.id) },
              search: {},
              to: '/projections/$iamId/$projectionId',
            });
          }}
          onNavigate={(location, replace = false) => {
            void navigate({
              replace,
              // Source selection focuses its forecast card; do not reset that scroll to the page top.
              resetScroll: !(
                location.section === 'overview' && location.source !== undefined
              ),
              search: () => location,
            });
          }}
          planPath={`/projections/${encodeURIComponent(iamId)}/${projectionId}`}
          search={search}
        />
      </main>
    </ProjectionSessionProvider>
  );
}

function ProjectionErrorBoundary({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    403: {
      message: 'Walter can only open plans for portfolios you can access.',
      title: 'You do not have access to this plan',
    },
    404: {
      message: 'This plan does not exist in the requested portfolio.',
      title: 'This plan could not be found',
    },
  });
  return (
    <main className="container">
      <PageError
        {...presentation}
        actions={
          <button className="btn btn-primary" onClick={reset} type="button">
            Try again
          </button>
        }
      />
    </main>
  );
}
