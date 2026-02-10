import { useMemo, useState } from 'react';
import { PiProjectAlerts } from '@/components/alerts/PiProjectAlerts.tsx';
import { PrincipalInvestigatorsTable } from '@/components/project/PrincipalInvestigatorsTable.tsx';
import { ProjectsTable } from '@/components/project/ProjectsTable.tsx';
import { Reports } from '@/components/reports/Reports.tsx';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import {
  useManagedPisQuery,
  projectsDetailQueryOptions,
} from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute } from '@tanstack/react-router';
import { PageLoading } from '@/components/states/pageLoading.tsx';
import { PageError } from '@/components/states/pageError.tsx';
import { useQuery } from '@tanstack/react-query';

type Tab = 'pis' | 'projects' | 'reports';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<Tab>('pis');
  const user = useUser();
  const { error, isError, isPending, managedPis } = useManagedPisQuery(
    user.employeeId
  );

  const isProjectManager = managedPis.length > 0;

  const userProjectsQuery = useQuery({
    ...projectsDetailQueryOptions(user.employeeId),
    enabled:
      Boolean(user.employeeId) && !isPending && !isError && !isProjectManager,
  });

  const isPrincipalInvestigator =
    !isProjectManager && (userProjectsQuery.data?.length ?? 0) > 0;

  const showPiTab = isProjectManager;
  const showProjectsTab = isPrincipalInvestigator;

  const tabs = useMemo(() => {
    const base: Array<{ id: Tab; label: string }> = [];
    if (showPiTab) {
      base.push({ id: 'pis', label: 'Principal Investigators' });
    }
    if (showProjectsTab) {
      base.push({ id: 'projects', label: 'Projects' });
    }
    base.push({ id: 'reports', label: 'Reports' });
    return base;
  }, [showPiTab, showProjectsTab]);

  const preferredTab: Tab = showPiTab
    ? 'pis'
    : showProjectsTab
      ? 'projects'
      : 'reports';

  const selectedTab = tabs.some((t) => t.id === activeTab)
    ? activeTab
    : preferredTab;

  if (isPending) {
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

  if (!isProjectManager && userProjectsQuery.isPending) {
    return <PageLoading message="Fetching dashboard…" />;
  }

  if (!isProjectManager && userProjectsQuery.isError) {
    return (
      <PageError>
        <p className="text-lg">
          Unable to load projects: {userProjectsQuery.error?.message}
        </p>
      </PageError>
    );
  }

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

      {isProjectManager && <PiProjectAlerts managedPis={managedPis} />}

      {tabs.length > 1 && (
        <div className="tabs mt-16" role="tablist">
          {tabs.map((tab, index) => {
            const tabId = `tab-${tab.id}`;
            const panelId = `panel-${tab.id}`;
            return (
              <button
                aria-controls={panelId}
                aria-selected={selectedTab === tab.id}
                className={`text-2xl tab ${index === 0 ? 'ps-0' : ''} ${selectedTab === tab.id ? 'tab-active' : ''}`}
                id={tabId}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {showPiTab && selectedTab === 'pis' && (
        <div aria-labelledby="tab-pis" id="panel-pis" role="tabpanel">
          <PrincipalInvestigatorsTable pis={managedPis} />
        </div>
      )}

      {showProjectsTab && selectedTab === 'projects' && (
        <div aria-labelledby="tab-projects" id="panel-projects" role="tabpanel">
          <div className="mt-4">
            <ProjectsTable
              employeeId={user.employeeId}
              records={userProjectsQuery.data ?? []}
            />
          </div>
        </div>
      )}

      {tabs.length > 1 && selectedTab === 'reports' && (
        <div aria-labelledby="tab-reports" id="panel-reports" role="tabpanel">
          <Reports />
        </div>
      )}

      {tabs.length === 1 && (
        <div className="mt-16">
          <h2 className="h2">Reports</h2>
          <Reports />
        </div>
      )}
    </div>
  );
}
