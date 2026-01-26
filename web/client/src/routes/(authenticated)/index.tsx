import { useState } from 'react';
import { PiProjectAlerts } from '@/components/alerts/PiProjectAlerts.tsx';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import {
  useManagedPisQuery,
  useProjectsDetailQuery,
} from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link } from '@tanstack/react-router';

type Tab = 'pis' | 'personnel' | 'reports';

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

const EmptyWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="container">
    <div className="mt-16">{children}</div>
  </div>
);

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<Tab>('pis');
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
  );
  const userProjectsQuery = useProjectsDetailQuery(user.employeeId);
  const personnelQuery = usePersonnelQuery();

  if (isPending || userProjectsQuery.isPending) {
    return (
      <EmptyWrapper>
        <div className="text-center">
          <div className="loading loading-spinner loading-lg mb-2" />
          <div className="mb-4 text-lg">Loading dashboard...</div>
        </div>
      </EmptyWrapper>
    );
  }

  if (isError) {
    return (
      <EmptyWrapper>
        <div className="alert alert-error">
          <span>Unable to load managed investigators: {error?.message}</span>
        </div>
      </EmptyWrapper>
    );
  }

  if (userProjectsQuery.isError) {
    return (
      <EmptyWrapper>
        <div className="alert alert-error">
          <span>
            Unable to load projects: {userProjectsQuery.error?.message}
          </span>
        </div>
      </EmptyWrapper>
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
      <div className="pt-10 pb-5 mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
        <p className="uppercase">
          warehouse analytics and ledger tools for enterprise reporting
        </p>
      </div>

      <div className="relative mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <SearchButton
          className="w-full"
          placeholder="Search PIs, Projects, Personnel..."
        />
      </div>

      <PiProjectAlerts managedPis={managedPis} />

      <div className="tabs mt-16" role="tablist">
        <button
          aria-controls="panel-pis"
          aria-selected={activeTab === 'pis'}
          className={`text-2xl tab -ms-4 ${activeTab === 'pis' ? 'tab-active' : ''}`}
          id="tab-pis"
          onClick={() => setActiveTab('pis')}
          role="tab"
          type="button"
        >
          {isProjectManager ? 'Principal Investigators' : 'Projects'}
        </button>
        <button
          aria-controls="panel-personnel"
          aria-selected={activeTab === 'personnel'}
          className={`text-2xl tab ${activeTab === 'personnel' ? 'tab-active' : ''}`}
          id="tab-personnel"
          onClick={() => setActiveTab('personnel')}
          role="tab"
          type="button"
        >
          Personnel
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

      {activeTab === 'personnel' && (
        <div
          aria-labelledby="tab-personnel"
          id="panel-personnel"
          role="tabpanel"
        >
          {personnelQuery.isPending && (
            <div className="flex min-h-[20vh] items-center justify-center">
              <div className="loading loading-spinner loading-lg" />
            </div>
          )}
          {personnelQuery.isError && (
            <div className="alert alert-error mt-8">
              <span>
                Unable to load personnel: {personnelQuery.error?.message}
              </span>
            </div>
          )}
          {personnelQuery.isSuccess && (
            <div className="mt-8">
              <PersonnelTable data={personnelQuery.data ?? []} />
            </div>
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
