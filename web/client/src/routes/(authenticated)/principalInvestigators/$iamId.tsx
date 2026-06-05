import { createFileRoute, redirect } from '@tanstack/react-router';
import { ManagedPisView } from '@/routes/(authenticated)/principalInvestigators/index.tsx';
import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { ROLE_NAMES } from '@/shared/auth/roleAccess.ts';

export const Route = createFileRoute(
  '/(authenticated)/principalInvestigators/$iamId'
)({
  beforeLoad: async ({
    context,
    params: { iamId },
  }: {
    context: RouterContext;
    params: { iamId: string };
  }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());
    const isFinancialViewer = user.roles.includes(ROLE_NAMES.financialViewer);
    const isSelf = iamId === user.iamId;

    if (!isFinancialViewer && !isSelf) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { iamId } = Route.useParams();
  return <ManagedPisView iamId={iamId} />;
}
