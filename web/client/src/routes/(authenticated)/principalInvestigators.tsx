import { createFileRoute, redirect } from '@tanstack/react-router';
import { PrincipalInvestigatorsTable } from '@/components/project/PrincipalInvestigatorsTable.tsx';
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
  UsersIcon,
} from '@heroicons/react/24/outline';

export const Route = createFileRoute('/(authenticated)/principalInvestigators')(
  {
    beforeLoad: async ({ context }: { context: RouterContext }) => {
      const user = await context.queryClient.ensureQueryData(meQueryOptions());

      if (!canAccessPrincipalInvestigatorsNav(user.roles)) {
        throw redirect({ to: '/' });
      }
    },
    component: RouteComponent,
  }
);

function RouteComponent() {
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
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

  if (managedPis.length === 0) {
    return (
      <PageEmpty message="Looks like you don't have any principal investigators for Walter to fetch..." />
    );
  }

  const totalProjects = managedPis.reduce(
    (sum, investigator) => sum + investigator.projectCount,
    0
  );

  return (
    <div className="container">
      <h1 className="h1 mt-8">Managed Principal Investigators</h1>
      <h3 className="subtitle">
        {managedPis.length} investigators across {totalProjects} projects
      </h3>

      <div className="fancy-data">
        <dl className="grid items-stretch gap-6 md:gap-8 grid-cols-1 md:grid-cols-2">
          <div>
            <UsersIcon className="w-4 h-4" />
            <dt className="stat-label">Principal Investigators</dt>
            <dd className="stat-value">{managedPis.length}</dd>
          </div>
          <div>
            <ClipboardDocumentListIcon className="w-4 h-4" />
            <dt className="stat-label">Projects</dt>
            <dd className="stat-value">{totalProjects}</dd>
          </div>
        </dl>
      </div>

      <PrincipalInvestigatorsTable pis={managedPis} />
    </div>
  );
}
