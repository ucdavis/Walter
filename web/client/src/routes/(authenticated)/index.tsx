import { useState } from 'react';
import { ProjectAlerts } from '@/components/alerts/ProjectAlerts.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import {
  useManagedPisQuery,
  useProjectsDetailQuery,
} from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link } from '@tanstack/react-router';

type Tab = 'pis' | 'reports';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

const formatPercent = (balance: number, budget: number) => {
  if (budget === 0) {
    return '—';
  }
  const percent = (balance / budget) * 100;
  return `${percent.toFixed(0)}%`;
};

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<Tab>('pis');
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
  );
  const userProjectsQuery = useProjectsDetailQuery(user.employeeId);

  if (isPending || userProjectsQuery.isPending) {
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

  if (userProjectsQuery.isError) {
    return (
      <div className="alert alert-error">
        <span>Unable to load projects: {userProjectsQuery.error?.message}</span>
      </div>
    );
  }

  const isProjectManager = managedPis && managedPis.length > 0;

  // Aggregate projects by project_number, summing balances
  const projectsRaw = userProjectsQuery.data ?? [];
  const projectsMap = new Map<
    string,
    {
      award_end_date: string | null;
      project_name: string;
      project_number: string;
      totalBalance: number;
    }
  >();
  for (const p of projectsRaw) {
    const existing = projectsMap.get(p.project_number);
    if (existing) {
      existing.totalBalance += p.cat_bud_bal;
    } else {
      projectsMap.set(p.project_number, {
        award_end_date: p.award_end_date,
        project_name: p.project_name,
        project_number: p.project_number,
        totalBalance: p.cat_bud_bal,
      });
    }
  }
  const now = new Date();
  const projects = Array.from(projectsMap.values())
    .filter((p) => !p.award_end_date || new Date(p.award_end_date) >= now)
    .sort((a, b) => {
      if (!a.award_end_date && !b.award_end_date) {
        return 0;
      }
      if (!a.award_end_date) {
        return -1;
      }
      if (!b.award_end_date) {
        return 1;
      }
      return (
        new Date(a.award_end_date).getTime() -
        new Date(b.award_end_date).getTime()
      );
    });

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
          {isProjectManager ? 'Principal Investigators' : 'Projects'}
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
        <div aria-labelledby="tab-pis" id="panel-pis" role="tabpanel">
          {isProjectManager ? (
            <table className="walter-table table mt-8">
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
          ) : (
            <table className="walter-table table mt-8">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th className="text-right">End Date</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.project_number}>
                    <td>
                      <Link
                        className="link link-hover link-primary"
                        params={{
                          employeeId: user.employeeId,
                          projectNumber: project.project_number,
                        }}
                        to="/projects/$employeeId/$projectNumber/"
                      >
                        {project.project_name}
                      </Link>
                    </td>
                    <td className="text-right">
                      {formatDate(project.award_end_date)}
                    </td>
                    <td className="text-right">
                      {formatCurrency(project.totalBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div aria-labelledby="tab-reports" id="panel-reports" role="tabpanel">
          <ul className="mt-8">
            <li>
              <Link
                className="text-xl link link-hover link-primary"
                to="/accruals"
              >
                Employee Vacation Accruals
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
