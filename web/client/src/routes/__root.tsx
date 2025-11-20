import {
  type ErrorComponentProps,
  createRootRouteWithContext,
  Outlet,
} from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterContext } from '../main.tsx';
import { HttpError } from '../lib/api.ts';

const RootLayout = () => (
  <>
    <Outlet />
    <ReactQueryDevtools buttonPosition="top-right" />
    <TanStackRouterDevtools position="bottom-right" />
  </>
);

const RootErrorBoundary = ({ error, reset }: ErrorComponentProps) => {
  const httpError = error instanceof HttpError ? error : undefined;
  const message =
    httpError?.message ??
    error.message ??
    'An unexpected error occurred while rendering this page.';
  const detail =
    httpError?.body &&
    typeof httpError.body === 'object' &&
    httpError.body !== null &&
    'message' in httpError.body
      ? String(
          (httpError.body as { message?: string | number }).message ?? ''
        ).trim()
      : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 p-6">
      <div className="max-w-xl rounded-box bg-base-100 p-8 text-center shadow-lg">
        <p className="text-sm font-semibold uppercase text-error">Error</p>
        <h1 className="mt-2 text-2xl font-bold text-base-content">
          {httpError
            ? 'We could not reach the server'
            : 'Something went wrong'}
        </h1>
        <p className="mt-4 text-base-content/80">{message}</p>
        {detail ? (
          <p className="mt-2 text-sm text-base-content/60">{detail}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: () => <div>404 - Not Found!</div>,
});
