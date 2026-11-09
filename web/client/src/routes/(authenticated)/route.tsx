import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { meQueryOptions } from '../../queries/user.ts';
import { UserProvider, useUser } from '@/shared/auth/UserContext.tsx';
import Header from '@/components/project/Header.tsx';
import { CommandPaletteProvider } from '@/components/search/CommandPaletteProvider.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { ErrorPageActions } from '@/components/states/ErrorPageActions.tsx';
import { checkPresentationContext, HttpError } from '@/lib/api.ts';
import { PresentationControls } from '@/components/demo/PresentationControls.tsx';

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <PresentationControls />
      <CommandPaletteProvider>
        <Header />
        {children}
      </CommandPaletteProvider>
    </UserProvider>
  );
}

function AuthenticatedErrorBoundary({ error, reset }: ErrorComponentProps) {
  return (
    <AuthenticatedLayout>
      <div className="container py-8">
        <AuthenticatedErrorContent error={error} onRetry={() => reset()} />
      </div>
    </AuthenticatedLayout>
  );
}

function AuthenticatedErrorContent({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const user = useUser();
  const isForbiddenProjectPortfolio =
    error instanceof HttpError &&
    error.status === 403 &&
    /^\/api\/project\/by-iam\/[^/]+$/.test(error.url);

  const presentation = getErrorPresentation(
    error,
    isForbiddenProjectPortfolio
      ? {
          403: {
            message:
              'Walter can only show project portfolios you are allowed to open.',
            title: 'You do not have access to this portfolio',
          },
        }
      : {}
  );

  const actions = isForbiddenProjectPortfolio ? (
    <>
      <button className="btn btn-primary" onClick={onRetry} type="button">
        Try again
      </button>
      <Link
        className="btn btn-outline"
        params={{ iamId: user.iamId }}
        to="/projects/$iamId"
      >
        Open your projects
      </Link>
    </>
  ) : (
    <ErrorPageActions onRetry={onRetry} />
  );

  return (
    <PageError
      actions={actions}
      detail={presentation.detail}
      message={presentation.message}
      statusCode={presentation.statusCode}
      title={presentation.title}
    />
  );
}

export const Route = createFileRoute('/(authenticated)')({
  beforeLoad: async ({ context, location }) => {
    if (checkPresentationContext()) {
      throw new HttpError(409, '/api/user/me', {
        code: 'presentation_context_changed',
      });
    }
    const user = await context.queryClient.ensureQueryData(meQueryOptions());
    if (checkPresentationContext()) {
      throw new HttpError(409, '/api/user/me', {
        code: 'presentation_context_changed',
      });
    }
    if (
      user.isPresentation &&
      /^\/(admin|accruals|reports|projections)(\/|$)/.test(location.pathname)
    ) {
      throw redirect({ to: '/' });
    }
  },
  component: () => (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  ),
  errorComponent: AuthenticatedErrorBoundary,
});
