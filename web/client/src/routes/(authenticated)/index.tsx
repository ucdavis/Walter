import { useEffect, useMemo, useState } from 'react';
import { PiProjectAlerts } from '@/components/alerts/PiProjectAlerts.tsx';
import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { PrincipalInvestigatorsTable } from '@/components/project/PrincipalInvestigatorsTable.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';
import {
  useManagedPisQuery,
  useProjectsDetailQuery,
} from '@/queries/project.ts';
import { useHasRole, useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageLoading } from '@/components/states/pageLoading.tsx';
import { PageError } from '@/components/states/pageError.tsx';

type Tab = 'pis' | 'personnel' | 'reports';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

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
    return <PageLoading message="Fetching dashboard…" />;
  }

  if (isError) {
    return (
      <PageError>
        <p className="text-lg">
          {' '}
          Unable to load managed investigators: {error?.message}
        </p>
      </PageError>
    );
  }

  if (userProjectsQuery.isError) {
    return (
      <PageError>
        <p className="text-lg">
          Unable to load projects: {userProjectsQuery.error?.message}
        </p>
      </PageError>
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
            <PrincipalInvestigatorsTable pis={managedPis} />
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
                  className="text-xl link link-hover underline"
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
