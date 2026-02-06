import { useMemo, useState } from 'react';
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

type Tab = 'pis' | 'personnel' | 'reports';

export const Route = createFileRoute('/(authenticated)/')({
  component: RouteComponent,
});

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

      {activeTab === 'personnel' && (
        <div
          aria-labelledby="tab-personnel"
          id="panel-personnel"
          role="tabpanel"
        >
          {projectCodes.length === 0 && (
            <p className="text-base-content/70 mt-8">
              No projects found. Personnel will appear here once you have
              projects.
            </p>
          )}
          {projectCodes.length > 0 && personnelQuery.isPending && (
            <div className="flex min-h-[20vh] items-center justify-center">
              <div className="loading loading-spinner loading-lg" />
            </div>
          )}
          {projectCodes.length > 0 && personnelQuery.isError && (
            <div className="alert alert-error mt-8">
              <span>
                Unable to load personnel: {personnelQuery.error?.message}
              </span>
            </div>
          )}
          {projectCodes.length > 0 && personnelQuery.isSuccess && (
            <div className="mt-8">
              <PersonnelTable data={personnelQuery.data ?? []} />
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
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
