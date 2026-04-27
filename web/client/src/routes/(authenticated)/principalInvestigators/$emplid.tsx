import { createFileRoute, redirect } from '@tanstack/react-router';
import { ManagedPisView } from '@/routes/(authenticated)/principalInvestigators.tsx';
import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { ROLE_NAMES } from '@/shared/auth/roleAccess.ts';

export const Route = createFileRoute(
  '/(authenticated)/principalInvestigators/$emplid'
)({
  beforeLoad: async ({
    context,
    params: { emplid },
  }: {
    context: RouterContext;
    params: { emplid: string };
  }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());
    const isFinancialViewer = user.roles.includes(ROLE_NAMES.financialViewer);
    const isSelf = emplid === user.employeeId;

    if (!isFinancialViewer && !isSelf) {
      throw redirect({ to: '/' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { emplid } = Route.useParams();
  return <ManagedPisView employeeId={emplid} />;
}
