import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { RouterContext } from '../../main.tsx';
import { meQueryOptions } from '../../queries/user.ts';
import { UserProvider, useUser } from '@/shared/auth/UserContext.tsx';
import Header from '@/components/project/Header.tsx';
import { CommandPaletteProvider } from '@/components/search/CommandPaletteProvider.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { ErrorPageActions } from '@/components/states/ErrorPageActions.tsx';
import { HttpError } from '@/lib/api.ts';

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
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
    /^\/api\/project\/[^/]+$/.test(error.url);

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
        params={{ employeeId: user.employeeId }}
        to="/projects/$employeeId"
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
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    await context.queryClient.ensureQueryData(meQueryOptions());
  },
  component: () => (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  ),
  errorComponent: AuthenticatedErrorBoundary,
});
