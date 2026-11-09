import { useEffect, useRef, useState } from 'react';
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
  createBookedSalaryExample,
  createAppointmentLookupsExample,
  createDateBoundaryExample,
  createFeeExample,
  createFutureHireExample,
  createSalaryExample,
} from '@/dev/projections/fixture.ts';
import { PreviewControls } from '@/dev/projections/PreviewControls.tsx';
import {
  createProjectionPreviewServer,
  type ProjectionPreviewServer,
} from '@/dev/projections/server.ts';
import {
  projectionLookupsQueryOptions,
  type Projection,
} from '@/queries/projections.ts';

interface ProjectionPreviewHandle extends ProjectionWorkspaceHandle {
  server: ProjectionPreviewServer;
}

declare global {
  interface Window {
    walterProjectionPreview?: ProjectionPreviewHandle;
  }
}

/** Separate entry tree keeps synthetic data and unauthenticated preview out of the app. */
export function createProjectionPreviewRouter({
  example,
  history,
  plan = example === 'booked'
    ? createBookedSalaryExample()
    : example === 'dates'
      ? createDateBoundaryExample()
      : example === 'future-hire'
        ? createFutureHireExample()
        : example === 'fees'
          ? createFeeExample()
          : createSalaryExample(),
  server = createProjectionPreviewServer(plan),
}: {
  example?: 'booked' | 'dates' | 'future-hire' | 'fees';
  history?: RouterHistory;
  plan?: Projection;
  server?: ProjectionPreviewServer;
} = {}) {
  const exampleSearch = example ? { example } : {};
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    projectionLookupsQueryOptions().queryKey,
    createAppointmentLookupsExample()
  );
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <main>
          <div className="bg-warning/15 px-4 py-3 text-center text-sm">
            Synthetic local preview. No real people or projects. The saved copy
            lives in this tab; a full page reload resets everything.
          </div>
          <PreviewControls
            onLeave={() => {
              void router.navigate({ to: '/projections-preview-away.html' });
            }}
            server={server}
          />
          <Outlet />
        </main>
      </QueryClientProvider>
    ),
  });
  const previewRoute = createRoute({
    component: Preview,
    getParentRoute: () => rootRoute,
    path: '/projections-preview.html',
    validateSearch: (search: Record<string, unknown>) => search,
  });
  const router = createRouter({
    history,
    routeTree: rootRoute.addChildren([
      previewRoute,
      createRoute({
        component: () => (
          <section className="mx-auto max-w-6xl p-8">
            <h1 className="text-2xl font-bold">Outside the plan</h1>
            <button
              className="btn btn-primary mt-4"
              onClick={() => {
                void router.navigate({
                  search: () => ({ ...exampleSearch, section: 'staffing' }),
                  to: '/projections-preview.html',
                });
              }}
              type="button"
            >
              Return to saved plan
            </button>
          </section>
        ),
        getParentRoute: () => rootRoute,
        path: '/projections-preview-away.html',
      }),
    ]),
  });

  function Preview() {
    const [initialPlan] = useState(() => server.read().stored);
    if (!initialPlan) {
      return (
        <p className="p-8" role="alert">
          The saved preview plan was deleted. Reload the page to start a fresh
          example.
        </p>
      );
    }
    return (
      <ProjectionSessionProvider initialPlan={initialPlan} persistence={server}>
        <Workspace />
      </ProjectionSessionProvider>
    );
  }

  function Workspace() {
    const search = previewRoute.useSearch();
    const workspaceRef = useRef<ProjectionWorkspaceHandle>(null);
    useEffect(() => {
      const handle: ProjectionPreviewHandle = {
        read: () => workspaceRef.current!.read(),
        server,
      };
      window.walterProjectionPreview = handle;
      return () => {
        if (window.walterProjectionPreview === handle) {
          delete window.walterProjectionPreview;
        }
      };
    }, []);
    return (
      <ProjectionWorkspace
        onNavigate={(location, replace = false) => {
          void router.navigate({
            replace,
            search: () => ({ ...exampleSearch, ...location }),
            to: '/projections-preview.html',
          });
        }}
        planPath="/projections-preview.html"
        ref={workspaceRef}
        search={search}
      />
    );
  }
  return router;
}
