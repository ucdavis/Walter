import { createFileRoute, redirect } from '@tanstack/react-router';
import { SpendAnalysisWorkbench } from '@/components/reports/SpendAnalysisWorkbench.tsx';
import { RouterContext } from '@/main.tsx';
import { meQueryOptions } from '@/queries/user.ts';
import { canAccessReportsNav } from '@/shared/auth/roleAccess.ts';

export const Route = createFileRoute('/(authenticated)/reports/spend-analysis')(
  {
    beforeLoad: async ({ context }: { context: RouterContext }) => {
      const user = await context.queryClient.ensureQueryData(meQueryOptions());

      if (!canAccessReportsNav(user.roles)) {
        throw redirect({ to: '/' });
      }
    },
    component: RouteComponent,
  }
);

function RouteComponent() {
  return (
    <div className="container">
      <SpendAnalysisWorkbench />
    </div>
  );
}
