import { ProjectAlerts } from '@/components/alerts/ProjectAlerts.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { useManagedPisQuery } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

const formatPercent = (balance: number, budget: number) => {
  if (budget === 0) return '—';
  const percent = (balance / budget) * 100;
  return `${percent.toFixed(0)}%`;
};

function RouteComponent() {
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
  );

  if (isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load managed investigators: {error?.message}</span>
      </div>
    );
  }

  if (!managedPis?.length) {
    return (
      <Navigate
        params={{ employeeId: user.employeeId }}
        to="/projects/$employeeId/"
      />
    );
  }

  return (
    <div className="container">
      <div className="py-10 mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
        <p className="uppercase">
          warehouse analytics and ledger tools for enterprise reporting
        </p>
      </div>

      <ProjectAlerts managedPis={managedPis} />

      <div className="tabs mt-16" role="tablist">
        <a className="text-2xl tab tab-active ps-0" role="tab">
          Principal Investigators
        </a>
        <a className="text-2xl tab" role="tab">
          Personnel
        </a>
        <a className="text-2xl tab" role="tab">
          Expenditures
        </a>
      </div>

      <table className="table mt-8">
        <thead>
          <tr>
            <th>PI Name</th>
            <th className="text-right">Projects</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {managedPis.map((pi) => (
            <tr key={pi.employeeId}>
              <td>
                <Link
                  className="link link-hover link-primary"
                  params={{ employeeId: pi.employeeId }}
                  to="/projects/$employeeId/"
                >
                  {pi.name}
                </Link>
              </td>
              <td className="text-right">{pi.projectCount}</td>
              <td className="text-right">
                {formatCurrency(pi.totalBalance)}{' '}
                <span className="text-base-content/60">
                  ({formatPercent(pi.totalBalance, pi.totalBudget)})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
