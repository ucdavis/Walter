import { useState } from 'react';
import { ProjectAlerts } from '@/components/alerts/ProjectAlerts.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { useManagedPisQuery } from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link, Navigate } from '@tanstack/react-router';

type Tab = 'pis' | 'reports';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

const formatPercent = (balance: number, budget: number) => {
  if (budget === 0) return '—';
  const percent = (balance / budget) * 100;
  return `${percent.toFixed(0)}%`;
};

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<Tab>('pis');
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

      <div className="relative mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <input
          className="input input-bordered w-full pl-10"
          placeholder="Search PIs, Projects, Personnel..."
          type="text"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-base-content/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </div>

      <ProjectAlerts managedPis={managedPis} />

      <div className="tabs mt-16" role="tablist">
        <button
          aria-controls="panel-pis"
          aria-selected={activeTab === 'pis'}
          className={`text-2xl tab ps-0 ${activeTab === 'pis' ? 'tab-active' : ''}`}
          id="tab-pis"
          onClick={() => setActiveTab('pis')}
          role="tab"
          type="button"
        >
          Principal Investigators
        </button>
        <button
          aria-controls="panel-reports"
          aria-selected={activeTab === 'reports'}
          className={`text-2xl tab ${activeTab === 'reports' ? 'tab-active' : ''}`}
          id="tab-reports"
          onClick={() => setActiveTab('reports')}
          role="tab"
          type="button"
        >
          Reports
        </button>
      </div>

      {activeTab === 'pis' && (
        <div
          aria-labelledby="tab-pis"
          id="panel-pis"
          role="tabpanel"
        >
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
      )}

      {activeTab === 'reports' && (
        <div
          aria-labelledby="tab-reports"
          id="panel-reports"
          role="tabpanel"
        >
          <ul className="mt-8">
            <li>
              <Link className="text-xl link link-hover link-primary" to="/accruals">
                Employee Vacation Accruals
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
