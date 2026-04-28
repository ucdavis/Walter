import { useMemo, useState } from 'react';
import {
  PiProjectAlerts,
  usePiProjectAlerts,
} from '@/components/alerts/PiProjectAlerts.tsx';
import { AlertCard } from '@/components/alerts/ProjectAlerts.tsx';
import { NotificationBanner } from '@/components/NotificationBanner.tsx';
import { PrincipalInvestigatorsTable } from '@/components/project/PrincipalInvestigatorsTable.tsx';
import { InternalProjectsTable } from '@/components/project/InternalProjectsTable.tsx';
import { SponsoredProjectsTable } from '@/components/project/SponsoredProjectsTable.tsx';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { getProjectListAlerts } from '@/lib/projectAlerts.ts';
import {
  useManagedPisQuery,
  projectsDetailQueryOptions,
  useProjectDiscrepancies,
} from '@/queries/project.ts';
import { useUser } from '@/shared/auth/UserContext.tsx';
import { createFileRoute } from '@tanstack/react-router';
import { PageLoading } from '@/components/states/PageLoading.tsx';
import { PageError } from '@/components/states/PageError.tsx';
import { useQuery } from '@tanstack/react-query';
import { getErrorPresentation } from '@/lib/errorPresentation.ts';

type Tab = 'pis' | 'projects' | 'alerts';

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

  const { alerts: pmAlerts, isLoading: alertsLoading } = usePiProjectAlerts(
    managedPis,
    user.employeeId
  );

  const sponsoredProjects = useMemo(
    () =>
      (userProjectsQuery.data ?? []).filter(
        (p) => p.projectType !== 'Internal'
      ),
    [userProjectsQuery.data]
  );

  const internalProjects = useMemo(
    () =>
      (userProjectsQuery.data ?? []).filter(
        (p) => p.projectType === 'Internal'
      ),
    [userProjectsQuery.data]
  );

  const internalProjectNumbers = useMemo(
    () => [...new Set(internalProjects.map((p) => p.projectNumber))],
    [internalProjects]
  );

  const discrepancies = useProjectDiscrepancies(internalProjectNumbers);

  const piAlerts = useMemo(() => {
    if (!isPrincipalInvestigator || !userProjectsQuery.data) return [];
    const piOnlyProjects = userProjectsQuery.data.filter(
      (p) => p.pmEmployeeId !== user.employeeId
    );
    return getProjectListAlerts(piOnlyProjects, user.employeeId);
  }, [isPrincipalInvestigator, userProjectsQuery.data, user.employeeId]);

  const allAlerts = isProjectManager ? pmAlerts : piAlerts;

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
    if (showPiTab || showProjectsTab) {
      base.push({ id: 'alerts', label: 'Alerts' });
    }
    return base;
  }, [showPiTab, showProjectsTab]);

  const preferredTab: Tab = showPiTab
    ? 'pis'
    : showProjectsTab
      ? 'projects'
      : 'alerts';

  const selectedTab = tabs.some((t) => t.id === activeTab)
    ? activeTab
    : preferredTab;

  if (isPending) {
    return <PageLoading message="Fetching dashboard…" />;
  }

  if (isError) {
    const presentation = getErrorPresentation(error);
    return (
      <PageError
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title="Unable to load managed investigators"
      />
    );
  }

  if (!isProjectManager && userProjectsQuery.isPending) {
    return <PageLoading message="Fetching dashboard…" />;
  }

  if (!isProjectManager && userProjectsQuery.isError) {
    const presentation = getErrorPresentation(userProjectsQuery.error);
    return (
      <PageError
        detail={presentation.detail}
        message={presentation.message}
        statusCode={presentation.statusCode}
        title="Unable to load projects"
      />
    );
  }

  return (
    <>
      <NotificationBanner />
      <div className="container">
        <div className="pt-10 pb-5 mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
          <h1 className="text-2xl font-proxima-bold">W.A.L.T.E.R.</h1>
          <p className="uppercase">
            warehouse analytics and ledger tools for enterprise reporting
          </p>
        </div>

        <div className="home-search relative mx-auto w-full sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
          <SearchButton className="w-full" />
        </div>

        {tabs.length > 0 && (
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
                  {tab.id === 'alerts' && alertsLoading && (
                    <span className="loading loading-spinner loading-xs ms-2" />
                  )}
                  {tab.id === 'alerts' &&
                    !alertsLoading &&
                    allAlerts.length > 0 && (
                      <span className="badge badge-sm badge-warning ms-2">
                        {allAlerts.length}
                      </span>
                    )}
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
            {sponsoredProjects.length > 0 && (
              <div className="mt-4">
                <h2 className="h2">Sponsored Projects</h2>
                <SponsoredProjectsTable
                  employeeId={user.employeeId}
                  records={sponsoredProjects}
                />
              </div>
            )}
            {internalProjects.length > 0 && (
              <div className="mt-4">
                <h2 className="h2">Internal Projects</h2>
                <p className="text-sm text-base-content/70 mt-1">
                  Totals for internal projects do not reflect transactions that
                  have occurred since the latest data refresh or manual updates
                  that are needed. Contact your fiscal officer with any questions.
                </p>
                <InternalProjectsTable
                  discrepancies={discrepancies}
                  employeeId={user.employeeId}
                  records={internalProjects}
                />
              </div>
            )}
          </div>
        )}

        {selectedTab === 'alerts' && (
          <div aria-labelledby="tab-alerts" id="panel-alerts" role="tabpanel">
            {isProjectManager && (
              <PiProjectAlerts
                managedPis={managedPis}
                pmEmployeeId={user.employeeId}
              />
            )}
            {isPrincipalInvestigator && piAlerts.length > 0 && (
              <div className="mt-4 flex flex-col gap-4">
                {piAlerts.map((alert) => (
                  <AlertCard
                    alert={alert}
                    balance={alert.balance}
                    key={alert.id}
                    linkParams={{
                      employeeId: alert.piEmployeeId,
                      projectNumber: alert.projectNumber,
                    }}
                  />
                ))}
              </div>
            )}
            {isPrincipalInvestigator && piAlerts.length === 0 && (
              <p className="mt-4 text-base-content/60">No alerts</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
