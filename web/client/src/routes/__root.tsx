import {
  type ErrorComponentProps,
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { RouterContext } from '../main.tsx';
import Footer from '@/components/project/Footer.tsx';
import { Walter404 } from '@/shared/Walter404.tsx';
import { AnalyticsListener } from '@/components/AnalyticsListener.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { ErrorPageActions } from '@/components/states/ErrorPageActions.tsx';

const RootLayout = () => (
  <>
    <div className="min-h-screen flex flex-col">
      <div className="flex-1" role="main">
        <AnalyticsListener />
        <Outlet />
      </div>

      <Footer />
      <ReactQueryDevtools buttonPosition="bottom-right" />
      <TanStackRouterDevtools position="bottom-left" />
    </div>
  </>
);

const RootErrorBoundary = ({ error, reset }: ErrorComponentProps) => {
  const presentation = getErrorPresentation(error);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1" role="main">
        <div className="container py-8">
          <PageError
            actions={<ErrorPageActions onRetry={() => reset()} />}
            detail={presentation.detail}
            message={presentation.message}
            statusCode={presentation.statusCode}
            title={presentation.title}
          />
        </div>
      </div>
      <Footer />
    </div>
  );
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: () => (
    <div className="container">
      <div className="mx-auto text-center mt-20">
        <Walter404 />
        <p className="mt-4 text-lg my-4">
          Walter ran into a 404 and had trouble fetching that...
        </p>
        <Link className="btn btn-outline" to="/">
          Return home
        </Link>
      </div>
    </div>
  ),
});
