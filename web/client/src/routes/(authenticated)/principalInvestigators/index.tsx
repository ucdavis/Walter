import { useMemo } from 'react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { PiReconciliationTable } from '@/components/project/PiReconciliationTable.tsx';
import { usePiReconciliation } from '@/components/project/usePiReconciliation.ts';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import { RouterContext } from '@/main.tsx';
import { useManagedPisQuery } from '@/queries/project.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessPrincipalInvestigatorsNav } from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

export const Route = createFileRoute(
  '/(authenticated)/principalInvestigators/'
)({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!canAccessPrincipalInvestigatorsNav(user.roles)) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const user = useUser();
  return <ManagedPisView iamId={user.iamId} />;
}

export function ManagedPisView({ iamId }: { iamId: string }) {
  const {
    error,
    isError,
    isPending,
    managedPis,
    projectManagerEmployeeId,
    projectManagerName,
  } = useManagedPisQuery(iamId);

  // PIs without an IAM ID can't be fetched, so they aren't shown or counted.
  const shownPis = useMemo(
    () =>
      managedPis
        .filter((pi) => Boolean(pi.iamId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [managedPis]
  );
  const { byPi, totalIssueCount } = usePiReconciliation(
    shownPis,
    projectManagerEmployeeId
  );

  if (isPending) {
    return <PageLoading message="Fetching principal investigators..." />;
  }

  if (isError) {
    const presentation = getErrorPresentation(error);
    return (
      <PageError
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title="Unable to load principal investigators"
      />
    );
  }

  if (shownPis.length === 0) {
    return (
      <PageEmpty message="Looks like there aren't any principal investigators for Walter to fetch..." />
    );
  }

  const totalProjects = shownPis.reduce(
    (sum, investigator) => sum + investigator.projectCount,
    0
  );

  const heading = projectManagerName
    ? `Principal Investigators managed by ${projectManagerName}`
    : 'Managed Principal Investigators';

  return (
    <div className="container">
      <h1 className="h1 mt-8">{heading}</h1>
      <h3 className="subtitle">
        {shownPis.length} investigators across {totalProjects} projects
      </h3>

      <div className="fancy-data">
        <dl className="grid items-stretch gap-6 md:gap-8 grid-cols-1 md:grid-cols-3">
          <div>
            <UsersIcon className="w-4 h-4" />
            <dt className="stat-label">Principal Investigators</dt>
            <dd className="stat-value">{shownPis.length}</dd>
          </div>
          <div>
            <ClipboardDocumentListIcon className="w-4 h-4" />
            <dt className="stat-label">Projects</dt>
            <dd className="stat-value">{totalProjects}</dd>
          </div>
          <div>
            <ExclamationTriangleIcon className="w-4 h-4" />
            <dt className="stat-label">Reconciliation issues</dt>
            <dd className="stat-value">{totalIssueCount ?? '-'}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-sm text-base-content/70">
        {
          "GL and PPM balances can differ from the UCD PPM to GL Non-Sponsored Projects Reconciliation Report; see any project's reconciliation page for details."
        }
      </p>

      <PiReconciliationTable byPi={byPi} pis={shownPis} />
    </div>
  );
}
