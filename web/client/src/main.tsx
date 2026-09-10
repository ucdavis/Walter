import { StrictMode, type ComponentType } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './main.css';

// Import the generated route tree
import { routeTree } from './routeTree.gen.ts';
import { bootstrapRum } from '@/lib/rum.ts';

const queryClient = new QueryClient();

export type RouterContext = { queryClient: QueryClient };

// Create a new router instance
const router = createRouter({
  context: { queryClient },
  defaultPreload: 'intent',
  routeTree,
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

async function renderApp() {
  try {
    let DemoControls: ComponentType | null = null;
    if (import.meta.env.DEV && import.meta.env.MODE === 'demo') {
      const demo = await import('./demo/start.ts');
      DemoControls = await demo.startDemo();
    }

    // Render the app
    const rootElement = document.getElementById('root')!;
    if (!rootElement.innerHTML) {
      if (!DemoControls) {
        void bootstrapRum().catch((error: unknown) => {
          // eslint-disable-next-line no-console -- Keep telemetry startup failures diagnosable.
          console.error('Failed to bootstrap RUM', error);
        });
      }

      const root = ReactDOM.createRoot(rootElement);
      root.render(
        <StrictMode>
          {DemoControls && <DemoControls />}
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </StrictMode>
      );
    }
  } catch (error) {
    const root = document.getElementById('root');
    if (root) {
      root.setAttribute('role', 'alert');
      root.textContent = `Unable to start Walter. ${error instanceof Error ? error.message : 'Please reload to try again.'}`;
    }
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- Keep startup compatible with Vite's browser build target.
void renderApp();
