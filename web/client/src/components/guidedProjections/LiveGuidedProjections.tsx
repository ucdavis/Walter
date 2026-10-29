import { useCallback, useState } from 'react';
import {
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import {
  useBlocker,
  useNavigate,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import GuidedProjections from '@/components/guidedProjections/GuidedProjections.tsx';
import type { PlanView } from '@/components/guidedProjections/navigation.ts';
import {
  fromServerProjection,
  toServerProjection,
} from '@/components/guidedProjections/serverPlan.ts';
import type { ProjectionPlan } from '@/components/guidedProjections/planModel.ts';
import { PageError } from '@/components/states/PageError.tsx';
import { HttpError } from '@/lib/api.ts';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  createProjection,
  projectionListQueryOptions,
  projectionLookupsQueryOptions,
  projectionQueryOptions,
  projectionSeedQueryOptions,
  saveProjection,
} from '@/queries/projections.ts';

export const guidedWorkspaceQueryOptions = (
  iamId: string,
  queryClient: QueryClient
) => ({
  queryFn: async () => {
    const [seedResult, summariesResult, lookupResult] =
      await Promise.allSettled([
        queryClient.fetchQuery(projectionSeedQueryOptions(iamId)),
        queryClient.fetchQuery(projectionListQueryOptions(iamId)),
        queryClient.ensureQueryData(projectionLookupsQueryOptions()),
      ]);
    // The saved portfolio remains usable during a datamart outage. Access failures
    // still fail the route through the independently authorized saved-list request.
    if (summariesResult.status === 'rejected') {
      throw summariesResult.reason;
    }
    const plans = await Promise.all(
      summariesResult.value.map((summary) =>
        queryClient.fetchQuery(projectionQueryOptions(summary.id))
      )
    );
    if (!plans.length && seedResult.status === 'rejected') {
      throw seedResult.reason;
    }
    return {
      lookups:
        lookupResult.status === 'fulfilled' ? lookupResult.value : undefined,
      plans,
      seed: seedResult.status === 'fulfilled' ? seedResult.value : null,
    };
  },
  queryKey: ['projections', 'workspace', iamId] as const,
  // Refresh when reopening the route; never replace an editor's active draft on focus.
  refetchOnWindowFocus: false,
  staleTime: Infinity,
});

export async function loadGuidedWorkspace(
  queryClient: QueryClient,
  iamId: string,
  projectionId?: string
) {
  const data = await queryClient.fetchQuery({
    ...guidedWorkspaceQueryOptions(iamId, queryClient),
    staleTime: 0,
  });
  // A URL must not pair one PI's navigation with another PI's saved projection.
  if (
    projectionId &&
    !data.plans.some((plan) => String(plan.id) === projectionId)
  ) {
    throw new HttpError(404, `/api/projections/${projectionId}`);
  }
}

export default function LiveGuidedProjections({
  iamId,
  projectionId,
  view,
}: {
  iamId: string;
  projectionId?: string;
  view: PlanView;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(
    guidedWorkspaceQueryOptions(iamId, queryClient)
  );
  const [dirty, setDirty] = useState(false);
  const [inWorkspace, setInWorkspace] = useState(false);
  const onDirtyChange = useCallback(
    (isDirty: boolean, isWorkspace: boolean) => {
      setDirty(isDirty);
      setInWorkspace(isWorkspace);
    },
    []
  );
  useBlocker({
    enableBeforeUnload: dirty,
    shouldBlockFn: ({ current, next }) => {
      // View changes keep the mounted draft. Leaving the plan discards it.
      if (
        inWorkspace &&
        current.pathname === next.pathname &&
        current.search.plan === next.search.plan
      ) {
        return false;
      }
      return dirty && !window.confirm('Discard your unsaved plan changes?');
    },
  });

  async function save(plan: ProjectionPlan, isNew: boolean) {
    const projection = toServerProjection(plan);
    const saved = isNew
      ? await createProjection(iamId, {
          draft: {
            jobs: projection.jobs,
            projects: projection.projects,
            seededAt: projection.seededAt,
            settings: projection.settings,
          },
          historyMonths: projection.historyMonths,
          name: projection.name,
        })
      : await saveProjection(projection.id, {
          historyMonths: projection.historyMonths,
          jobs: projection.jobs,
          name: projection.name,
          preserveProjectedExpenses: true,
          projects: projection.projects,
          settings: projection.settings,
        });
    queryClient.setQueryData(projectionQueryOptions(saved.id).queryKey, saved);
    queryClient.setQueryData(
      guidedWorkspaceQueryOptions(iamId, queryClient).queryKey,
      {
        ...data,
        plans: [
          ...data.plans.filter((existing) => existing.id !== saved.id),
          saved,
        ],
      }
    );
    void queryClient.invalidateQueries({
      queryKey: projectionListQueryOptions(iamId).queryKey,
    });
    return fromServerProjection(saved);
  }

  return (
    <GuidedProjections
      remote={{
        baseline: data.seed
          ? { ...fromServerProjection(data.seed), name: 'Default plan' }
          : undefined,
        initialPlanId: projectionId,
        lookups: data.lookups,
        onDirtyChange,
        onNavigate: (id) => {
          if (id === projectionId) {
            return;
          }
          // The editor already confirmed discarding changes or completed its save.
          if (id && id !== 'walter-default-plan') {
            void navigate({
              ignoreBlocker: true,
              params: { iamId, projectionId: id },
              to: '/projections/$iamId/$projectionId',
            });
          } else {
            void navigate({
              ignoreBlocker: true,
              params: { iamId },
              search: { plan: id ? 'default' : undefined },
              to: '/projections/$iamId',
            });
          }
        },
        onViewChange: (nextView) => {
          if (
            nextView.project === view.project &&
            nextView.section === view.section
          ) {
            return;
          }
          void navigate({
            resetScroll: false,
            search: (previous: PlanView & { plan?: 'default' }) => ({
              ...previous,
              project: nextView.project,
              section: nextView.section,
            }),
            to: '.',
          });
        },
        plans: data.plans.map(fromServerProjection),
        save,
        view,
      }}
    />
  );
}

export function GuidedProjectionsError({ error, reset }: ErrorComponentProps) {
  const presentation = getErrorPresentation(error, {
    403: {
      message: 'Walter can only show projections for portfolios you can open.',
      title: 'You do not have access to these projections',
    },
    404: {
      message: 'This projection or portfolio could not be found.',
      title: 'Projection unavailable',
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
