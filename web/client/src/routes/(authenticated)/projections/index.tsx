import { createFileRoute, redirect } from '@tanstack/react-router';
import { PrincipalInvestigatorsTable } from '@/components/project/PrincipalInvestigatorsTable.tsx';
import { PageEmpty } from '@/components/states/PageEmpty.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';
import {
  managedPisQueryOptions,
  useManagedPisQuery,
} from '@/queries/project.ts';
import { ProjectionUnavailable } from '@/components/projections/ProjectionAvailability.tsx';
import {
  featureFlagsQueryOptions,
  useFeatureFlagsQuery,
} from '@/queries/featureFlags.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessPrincipalInvestigatorsNav } from '@/shared/auth/roleAccess.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';

export const Route = createFileRoute('/(authenticated)/projections/')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());
    const flags = await context.queryClient.fetchQuery(
      featureFlagsQueryOptions(user.id)
    );
    if (!flags.projectionsEnabled) {
      return;
    }
    if (!canAccessPrincipalInvestigatorsNav(user.roles)) {
      const managed = await context.queryClient.ensureQueryData(
        managedPisQueryOptions(user.iamId)
      );
      if (managed.pis.length === 0) {
        throw redirect({
          params: { iamId: user.iamId },
          to: '/projections/$iamId',
        });
      }
    }
  },
  component: ProjectionsEntry,
});

function ProjectionsEntry() {
  const user = useUser();
  const { data: flags } = useFeatureFlagsQuery();
  if (!flags?.projectionsEnabled) {
    return <ProjectionUnavailable iamId={user.iamId} />;
  }
  return <PrincipalInvestigatorChooser />;
}

function PrincipalInvestigatorChooser() {
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.iamId
  );

  return (
    <main className="container py-8">
      <h1 className="h1">Projections</h1>
      <p className="subtitle mb-6">
        Choose a principal investigator to view their projections.
      </p>
      {isPending ? (
        <PageLoading message="Fetching principal investigators..." />
      ) : isError ? (
        <PageError
          {...getErrorPresentation(error)}
          title="Unable to load principal investigators"
        />
      ) : managedPis.length === 0 ? (
        <PageEmpty message="You don't have any managed principal investigators to view yet." />
      ) : (
        <PrincipalInvestigatorsTable
          pis={managedPis}
          to="/projections/$iamId"
        />
      )}
    </main>
  );
}
