import { useEffect, useRef } from 'react';
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
import { createSalaryExample } from '@/dev/projections/fixture.ts';
import type { Projection } from '@/queries/projections.ts';

declare global {
  interface Window {
    walterProjectionPreview?: ProjectionWorkspaceHandle;
  }
}

/** Separate entry tree keeps synthetic data and unauthenticated preview out of the app. */
export function createProjectionPreviewRouter({
  history,
  plan = createSalaryExample(),
}: { history?: RouterHistory; plan?: Projection } = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <ProjectionSessionProvider initialPlan={plan}>
        <main>
          <div className="bg-warning/15 px-4 py-3 text-center text-sm">
            Synthetic local preview. No real people or projects. Changes stay in
            this tab and are lost on reload. Saving comes in a later stage.
          </div>
          <Outlet />
        </main>
      </ProjectionSessionProvider>
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
    routeTree: rootRoute.addChildren([previewRoute]),
  });

  function Preview() {
    const search = previewRoute.useSearch();
    const workspaceRef = useRef<ProjectionWorkspaceHandle>(null);
    useEffect(() => {
      const handle: ProjectionWorkspaceHandle = {
        read: () => workspaceRef.current!.read(),
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
            search: () => location,
            to: '/projections-preview.html',
          });
        }}
        ref={workspaceRef}
        search={search}
      />
    );
  }
  return router;
}
