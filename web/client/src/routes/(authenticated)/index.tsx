import { useEffect, useMemo, useState } from 'react';
import { PiProjectAlerts } from '@/components/alerts/PiProjectAlerts.tsx';
import { ExportCsvButton } from '@/components/ExportCsvButton.tsx';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { formatCurrency } from '@/lib/currency.ts';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import {
  useManagedPisQuery,
  useProjectsDetailQuery,
} from '@/queries/project.ts';
import { useHasRole, useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link } from '@tanstack/react-router';

const piCsvColumns = [
  { header: 'PI Name', key: 'name' as const },
  { header: 'Projects', key: 'projectCount' as const },
  { header: 'Balance', key: 'totalBalance' as const },
  { header: 'Budget', key: 'totalBudget' as const },
];

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
  const canViewAccruals = useHasRole('AccrualViewer');
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
  );
  const userProjectsQuery = useProjectsDetailQuery(user.employeeId);
  const projectCodes = useMemo(() => {
    const projects = userProjectsQuery.data ?? [];
    return [...new Set(projects.map((p) => p.projectNumber))];
  }, [userProjectsQuery.data]);
  const personnelQuery = usePersonnelQuery(projectCodes);

  // Wait for all queries to resolve before showing content
  const isLoading = isPending || userProjectsQuery.isPending || (projectCodes.length > 0 && personnelQuery.isPending);

  // Compute tab visibility flags
  const isProjectManager = managedPis && managedPis.length > 0;
  const hasProjects = projectCodes.length > 0;
  const showPisTab = isProjectManager || hasProjects;
  const showPersonnelTab = personnelQuery.isSuccess && (personnelQuery.data?.length ?? 0) > 0;
  const showReportsTab = canViewAccruals;

  // Set active tab to first available if current tab is not visible
  useEffect(() => {
    if (isLoading) return;

    const availableTabs: Tab[] = [];
    if (showPisTab) availableTabs.push('pis');
    if (showPersonnelTab) availableTabs.push('personnel');
    if (showReportsTab) availableTabs.push('reports');

    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, showPisTab, showPersonnelTab, showReportsTab, isLoading]);

  if (isLoading) {
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

  const projectRecords = userProjectsQuery.data ?? [];

  return (
    <div className="container">
      <div className="pt-10 pb-5 mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
        <p className="uppercase">
          warehouse analytics and ledger tools for enterprise reporting
        </p>
      </div>

      <div className="home-search relative mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <SearchButton
          className="w-full"
          placeholder="Search PIs, Projects, Personnel..."
        />
      </div>

      <PiProjectAlerts managedPis={managedPis} />

      <div className="tabs mt-16" role="tablist">
        {showPisTab && (
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
        )}
        {showPersonnelTab && (
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
        )}
        {showReportsTab && (
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
        )}
      </div>

      {activeTab === 'pis' && showPisTab && (
        <div aria-labelledby="tab-pis" id="panel-pis" role="tabpanel">
          {isProjectManager ? (
            <>
              <div className="flex justify-end">
                <ExportCsvButton
                  columns={piCsvColumns}
                  data={managedPis.map((pi) => ({
                    name: pi.name,
                    projectCount: pi.projectCount,
                    totalBalance: pi.totalBalance,
                    totalBudget: pi.totalBudget,
                  }))}
                  filename="principal-investigators.csv"
                />
              </div>
              <table className="walter-table table">
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
            </>
          ) : (
            <div className="mt-4">
              <ProjectsTable
                employeeId={user.employeeId}
                records={projectRecords}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'personnel' && showPersonnelTab && (
        <div
          aria-labelledby="tab-personnel"
          id="panel-personnel"
          role="tabpanel"
        >
          <div className="mt-8">
            <PersonnelTable data={personnelQuery.data ?? []} />
          </div>
        </div>
      )}

      {activeTab === 'reports' && showReportsTab && (
        <div aria-labelledby="tab-reports" id="panel-reports" role="tabpanel">
          <ul className="mt-8">
            {canViewAccruals && (
              <li>
                <Link
                  className="text-xl link link-hover link-primary"
                  to="/accruals"
                >
                  Employee Vacation Accruals
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
