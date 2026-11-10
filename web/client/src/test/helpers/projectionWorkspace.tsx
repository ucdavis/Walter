import { createRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import { ProjectionSessionProvider } from '@/components/projections/ProjectionSession.tsx';
import {
  ProjectionWorkspace,
  type ProjectionWorkspaceHandle,
} from '@/components/projections/ProjectionWorkspace.tsx';
import {
  projectionLookupsQueryOptions,
  type Projection,
} from '@/queries/projections.ts';
import { createAppointmentLookupsExample } from '@/test/fixtures/projections.ts';
import { createProjectionPersistenceDouble } from '@/test/helpers/projectionPersistence.ts';

/** Mount production components with explicit test-owned state and navigation. */
export function createProjectionWorkspaceHarness({
  history,
  plan,
  server = createProjectionPersistenceDouble(plan),
}: {
  history: RouterHistory;
  plan: Projection;
  server?: ReturnType<typeof createProjectionPersistenceDouble>;
}) {
  const workspaceRef = createRef<ProjectionWorkspaceHandle>();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    projectionLookupsQueryOptions().queryKey,
    createAppointmentLookupsExample()
  );
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const planRoute = createRoute({
    component: Workspace,
    getParentRoute: () => rootRoute,
    path: '/projections/TEST-PI/1',
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([
      planRoute,
      createRoute({
        component: () => <h1>Plans</h1>,
        getParentRoute: () => rootRoute,
        path: '/projections/TEST-PI',
      }),
    ]),
  });

  function Workspace() {
    const search = planRoute.useSearch();
    const [initialPlan] = useState(() => server.read().stored!);
    return (
      <ProjectionSessionProvider initialPlan={initialPlan} persistence={server}>
        <ProjectionWorkspace
          onNavigate={(location, replace = false) => {
            void router.navigate({
              replace,
              search: () => ({ ...location }),
              to: '/projections/TEST-PI/1',
            });
          }}
          planPath="/projections/TEST-PI/1"
          ref={workspaceRef}
          search={search}
        />
      </ProjectionSessionProvider>
    );
  }

  return { read: () => workspaceRef.current!.read(), router, server };
}
